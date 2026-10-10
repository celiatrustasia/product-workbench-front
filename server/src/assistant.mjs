import { rateLimit } from 'express-rate-limit';
import { rows, transaction } from './db.mjs';
import { config } from './config.mjs';
import { assert, digest, json, stamp } from './security.mjs';
import { requireAdmin, audit } from './auth.mjs';
import { saveWork, activity } from './works.mjs';
import { createAiSettings, aiSettingsSchema } from './ai-settings.mjs';
import { assistantInputSchema, assistantPrompt, completeJson, prepareAssistantWorks } from './ai-engine.mjs';

async function catalog(user) {
  return {
    currentTime: `${stamp().replace(' ', 'T')}+08:00`, currentUser: { id: user.id, name: user.name, username: user.username },
    platforms: await rows('SELECT id,name FROM wb_platforms WHERE active=1 ORDER BY sort,id LIMIT 500'),
    people: await rows('SELECT id,name,username FROM wb_users WHERE active=1 AND deleted_at IS NULL ORDER BY name,id LIMIT 500'),
    dictionary: (await rows('SELECT name,group_key FROM wb_dictionary WHERE active=1 ORDER BY group_key,sort,id LIMIT 500')).map(item => ({ name: item.name, group: item.group_key })),
    requirements: await rows("SELECT id,code,title FROM wb_works WHERE kind='requirement' AND archived=0 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500"),
  };
}

export function registerAssistant(app, { assistantGenerate } = {}) {
  const settings = createAiSettings(config.aiConfigFile, process.env);
  const limit = rateLimit({ windowMs: 60000, limit: 10, keyGenerator: req => req.user.id, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: { code: 'AI_RATE_LIMIT', message: '助手请求较多，请稍后重试' } }) });
  app.get('/api/assistant/config', async (_req, res) => res.json(await settings.status()));
  app.put('/api/assistant/config', requireAdmin, limit, async (req, res) => {
    const current = await settings.load();
    const candidate = aiSettingsSchema.parse({ ...req.body, apiKey: req.body.apiKey || (current?.provider === req.body.provider ? current.apiKey : undefined) });
    assert(!(await settings.status()).managedByEnvironment, 409, '模型由服务器环境变量管理，请在服务器更新配置');
    await completeJson(candidate, [{ role: 'user', content: '请仅输出 JSON 对象：{"ok":true}' }]);
    const status = await settings.save(candidate);
    await audit(req.user.id, 'assistant-config', candidate.provider);
    res.json(status);
  });
  app.post('/api/assistant/messages', limit, async (req, res) => {
    const input = assistantInputSchema.parse(req.body);
    const inputHash = digest(JSON.stringify({ message: input.message, history: input.history }));
    const reservation = await transaction(async connection => {
      await rows('INSERT IGNORE INTO wb_assistant_requests (user_id,request_id,input_hash,state,updated_at) VALUES (?,?,?,?,?)', [req.user.id, input.requestId, inputHash, 'new', stamp()], connection);
      const [record] = await rows('SELECT * FROM wb_assistant_requests WHERE user_id=? AND request_id=? FOR UPDATE', [req.user.id, input.requestId], connection);
      assert(record.input_hash === inputHash, 409, '这次请求编号已用于其他消息，请重新发送', 'AI_REQUEST_CONFLICT');
      if (record.state === 'complete') return { response: json(record.response) };
      assert(record.state !== 'pending' || Date.now() - Date.parse(record.updated_at) > 90000, 409, '这条消息仍在处理中，请稍后重试，不会重复创建', 'AI_PENDING');
      await rows("UPDATE wb_assistant_requests SET state='pending',updated_at=? WHERE user_id=? AND request_id=?", [stamp(), req.user.id, input.requestId], connection);
      return {};
    });
    if (reservation.response) return res.json(reservation.response);
    try {
      const model = await settings.load();
      assert(model || assistantGenerate, 503, 'AI 模型尚未配置，请管理员打开助手右上角的模型设置', 'AI_NOT_CONFIGURED');
      const context = await catalog(req.user);
      const messages = [{ role: 'system', content: assistantPrompt(context) }, ...input.history, { role: 'user', content: input.message }];
      const raw = assistantGenerate ? await assistantGenerate(messages, context) : await completeJson(model, messages);
      const { plan, prepared, issues } = prepareAssistantWorks(raw, context);
      const result = await transaction(async connection => {
        const [record] = await rows('SELECT state FROM wb_assistant_requests WHERE user_id=? AND request_id=? FOR UPDATE', [req.user.id, input.requestId], connection);
        assert(record?.state === 'pending', 409, '请求状态已变化，请重试');
        // Revalidate the session immediately before any model-triggered write.
        const [actor] = await rows('SELECT active,deleted_at FROM wb_users WHERE id=? FOR UPDATE', [req.user.id], connection);
        const [session] = await rows('SELECT user_id FROM wb_sessions WHERE token_hash=? AND expires_at>?', [req.session.token_hash, stamp()], connection);
        assert(actor?.active && !actor.deleted_at && session?.user_id === req.user.id, 401, '登录已失效，请重新登录');
        const created = [];
        const savedByIndex = new Map();
        if (plan.action === 'create' && !issues.length) {
          for (const draft of [...prepared].sort((a, b) => Number(a.kind === 'task') - Number(b.kind === 'task'))) {
            const value = { ...draft.value };
            if (draft.requirementIndex != null) value.requirementId = savedByIndex.get(draft.requirementIndex)?.id;
            const saved = await saveWork(req.user, draft.kind, value, undefined, connection);
            await activity(connection, req.user.id, draft.kind, saved.id, '通过 AI 助手创建了事项');
            savedByIndex.set(draft.index, saved);
            created.push({ index: draft.index, kind: draft.kind, id: saved.id, code: saved.code, title: saved.title,
              status: saved.status, priority: saved.priority, platformId: saved.platformId, ownerId: saved.ownerId,
              participantIds: saved.participantIds, manualFocus: saved.manualFocus, dueAt: saved.dueAt || saved.targetAt });
          }
        }
        const response = { reply: created.length ? `已创建 ${created.length} 条事项。${plan.reply}` : issues.length ? `还需要补充这些信息：\n${issues.join('\n')}` : plan.reply,
          created: created.sort((a, b) => a.index - b.index).map(({ index, ...item }) => item) };
        await rows("UPDATE wb_assistant_requests SET state='complete',response=?,updated_at=? WHERE user_id=? AND request_id=?", [JSON.stringify(response), stamp(), req.user.id, input.requestId], connection);
        return response;
      });
      res.json(result);
    } catch (error) {
      await rows("UPDATE wb_assistant_requests SET state='failed',updated_at=? WHERE user_id=? AND request_id=? AND state='pending'", [stamp(), req.user.id, input.requestId]).catch(() => {});
      throw error;
    }
  });
}
