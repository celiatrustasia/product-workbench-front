import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAiSettings, aiSettingsSchema, aiProviders } from '../src/ai-settings.mjs';
import { completeJson, prepareAssistantWorks } from '../src/ai-engine.mjs';

const settings = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-only-secret' };
const openaiSettings = { ...aiProviders.openai, provider: 'openai', apiKey: 'openai-test-only-secret' };
const kimiSettings = { ...aiProviders.kimi, provider: 'kimi', apiKey: 'kimi-test-only-secret' };
const context = { currentUser: { id: 'me' }, platforms: [{ id: 'p', name: 'CertCloud' }], people: [{ id: 'me' }, { id: 'other' }], dictionary: [{ group: 'requirementType', name: '优化' }], requirements: [{ id: 'existing' }] };
const plan = works => ({ action: 'create', reply: '按你的信息创建。', works });

test('AI settings stay private, redact keys and respect environment management', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-ai-test-'));
  try {
    const file = join(directory, 'ai.json');
    const store = createAiSettings(file);
    assert.equal((await store.status()).configured, false);
    const status = await store.save(settings);
    assert.equal(status.configured, true);
    assert.equal(JSON.stringify(status).includes(settings.apiKey), false);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal(JSON.parse(await readFile(file, 'utf8')).apiKey, settings.apiKey);
    const envStore = createAiSettings(file, { AI_API_KEY: 'environment-test-secret' });
    assert.equal((await envStore.status()).managedByEnvironment, true);
    assert.equal((await envStore.load()).apiKey, 'environment-test-secret');
    await assert.rejects(envStore.save(settings), /环境变量管理/);
    const openaiStatus = await store.save(openaiSettings);
    assert.equal(openaiStatus.provider, 'openai');
    assert.equal(openaiStatus.providers.openai.baseUrl, 'https://api.openai.com/v1');
    assert.equal(JSON.stringify(openaiStatus).includes(openaiSettings.apiKey), false);
    assert.equal((await store.load()).provider, 'openai');
    const openaiEnv = createAiSettings(file, { AI_PROVIDER: 'openai', AI_API_KEY: 'openai-environment-test' });
    assert.equal((await openaiEnv.load()).model, aiProviders.openai.model);
    assert.equal((await openaiEnv.load()).baseUrl, aiProviders.openai.baseUrl);
    await assert.rejects(store.save({ ...openaiSettings, baseUrl: 'https://evil.example/v1' }));
    assert.equal((await store.load()).apiKey, openaiSettings.apiKey);
    const configured = { ...openaiSettings, model: 'gpt-5.5', baseUrl: 'https://sub2api.trustasia.cn/v1' };
    await store.save(configured);
    const reopened = await createAiSettings(file).status();
    assert.equal(reopened.model, configured.model);
    assert.equal(reopened.baseUrl, configured.baseUrl);
    assert.equal(reopened.provider, 'openai');
    assert.equal(reopened.configured, true);
    assert.equal('apiKey' in reopened, false);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('model endpoints reject key forwarding to untrusted hosts and URL credentials', () => {
  for (const baseUrl of ['http://api.deepseek.com', 'https://api.deepseek.com.evil.example', 'https://127.0.0.1', 'https://user@api.deepseek.com', 'https://api.deepseek.com?redirect=evil', 'https://api.deepseek.com/redirect']) {
    assert.equal(aiSettingsSchema.safeParse({ ...settings, baseUrl }).success, false);
  }
  assert.equal(aiSettingsSchema.safeParse({ ...settings, provider: 'qwen', baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' }).success, true);
  for (const baseUrl of ['https://api.openai.com/v1', 'https://api.openai.com/v1/', 'https://sub2api.trustasia.cn/v1', 'https://sub2api.trustasia.cn/v1/']) {
    assert.equal(aiSettingsSchema.safeParse({ ...openaiSettings, baseUrl }).success, true);
  }
  for (const baseUrl of ['http://api.openai.com/v1', 'https://api.openai.com.evil.example/v1', 'https://user@api.openai.com/v1', 'https://api.openai.com', 'https://api.openai.com/v1/responses', 'https://api.openai.com/v1?redirect=evil', 'https://api.openai.com/v1#fragment', 'http://sub2api.trustasia.cn/v1', 'https://sub2api.trustasia.cn.evil.example/v1', 'https://sub2api.trustasia.cn:444/v1', 'https://user@sub2api.trustasia.cn/v1', 'https://sub2api.trustasia.cn/v1?key=secret', 'https://sub2api.trustasia.cn/other', settings.baseUrl]) {
    assert.equal(aiSettingsSchema.safeParse({ ...openaiSettings, baseUrl }).success, false);
  }
  assert.equal(aiSettingsSchema.safeParse({ ...settings, baseUrl: openaiSettings.baseUrl }).success, false);
});

test('Kimi configuration survives reopening, redacts keys and supports environment defaults', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workbench-kimi-test-'));
  try {
    const file = join(directory, 'ai.json');
    const store = createAiSettings(file);
    await store.save(kimiSettings);
    const status = await createAiSettings(file).status();
    assert.equal(status.provider, 'kimi');
    assert.equal(status.model, 'kimi-k2.6');
    assert.equal(status.baseUrl, 'https://api.moonshot.cn/v1');
    assert.equal(status.providers.kimi.name, 'Kimi（月之暗面）');
    assert.equal(JSON.stringify(status).includes(kimiSettings.apiKey), false);
    assert.equal((await store.load()).apiKey, kimiSettings.apiKey);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const envStore = createAiSettings(file, { AI_PROVIDER: 'kimi', AI_API_KEY: 'kimi-environment-test-secret' });
    assert.deepEqual(await envStore.load(), { provider: 'kimi', model: aiProviders.kimi.model, baseUrl: aiProviders.kimi.baseUrl, apiKey: 'kimi-environment-test-secret' });
    await assert.rejects(envStore.save(kimiSettings), /环境变量管理/);
    await assert.rejects(store.save({ ...kimiSettings, baseUrl: 'https://evil.example/v1' }));
    assert.equal((await store.load()).apiKey, kimiSettings.apiKey);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Kimi only accepts official regional endpoints, never other providers or credential-bearing URLs', () => {
  for (const baseUrl of ['https://api.moonshot.cn/v1', 'https://api.moonshot.cn/v1/', 'https://api.moonshot.ai/v1', 'https://api.moonshot.ai/v1/']) {
    assert.equal(aiSettingsSchema.safeParse({ ...kimiSettings, baseUrl }).success, true);
    assert.equal(aiSettingsSchema.safeParse({ ...openaiSettings, baseUrl }).success, false);
  }
  for (const baseUrl of ['http://api.moonshot.cn/v1', 'https://api.moonshot.cn.evil.example/v1', 'https://user@api.moonshot.cn/v1', 'https://api.moonshot.cn:444/v1', 'https://api.moonshot.cn/v1?key=secret', 'https://api.moonshot.cn/v1#fragment', 'https://api.moonshot.cn', 'https://api.moonshot.cn/v1/chat/completions', 'https://127.0.0.1/v1', openaiSettings.baseUrl]) {
    assert.equal(aiSettingsSchema.safeParse({ ...kimiSettings, baseUrl }).success, false);
  }
});

test('Kimi JSON transport handles model-specific options and validates requirement/task plans', async () => {
  const messages = [{ role: 'system', content: '仅输出 JSON。' }, { role: 'user', content: '创建一个需求及其关联任务' }];
  const expected = plan([
    { kind: 'requirement', title: '优化证书搜索', platformId: 'p', description: '增加证书筛选。' },
    { kind: 'task', title: '实现证书筛选', platformId: 'p', requirementIndex: 0, participantIds: ['other'] },
  ]);
  for (const model of ['kimi-k2.5', 'kimi-k2.6', 'kimi-k3', 'moonshot-v1-8k', 'kimi-k2-turbo-preview']) {
    const result = await completeJson({ ...kimiSettings, baseUrl: 'https://api.moonshot.cn/v1/', model }, messages, async (url, options) => {
      assert.equal(url, 'https://api.moonshot.cn/v1/chat/completions');
      assert.equal(options.headers.Authorization, `Bearer ${kimiSettings.apiKey}`);
      assert.equal(options.redirect, 'error');
      const body = JSON.parse(options.body);
      assert.equal(body.model, model);
      assert.deepEqual(body.messages, messages);
      assert.deepEqual(body.response_format, { type: 'json_object' });
      assert.equal(body.max_tokens, 4096);
      assert.equal(body.stream, false);
      for (const field of ['input', 'text', 'enable_thinking', 'temperature', 'top_p']) assert.equal(field in body, false);
      if (['kimi-k2.5', 'kimi-k2.6'].includes(model)) assert.deepEqual(body.thinking, { type: 'disabled' });
      else assert.equal('thinking' in body, false);
      if (model === 'kimi-k3') assert.equal(body.reasoning_effort, 'low');
      else assert.equal('reasoning_effort' in body, false);
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(expected), reasoning_content: 'This is not the JSON response.' } }] });
    });
    const prepared = prepareAssistantWorks(result, context);
    assert.deepEqual(prepared.issues, []);
    assert.equal(prepared.prepared[0].kind, 'requirement');
    assert.equal(prepared.prepared[0].value.ownerId, 'me');
    assert.equal(prepared.prepared[0].value.priority, 'P2');
    assert.equal(prepared.prepared[1].kind, 'task');
    assert.equal(prepared.prepared[1].requirementIndex, 0);
    assert.deepEqual(prepared.prepared[1].value.participantIds, ['other']);
  }
  await completeJson({ ...kimiSettings, baseUrl: 'https://api.moonshot.ai/v1' }, messages, async url => {
    assert.equal(url, 'https://api.moonshot.ai/v1/chat/completions');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] });
  });
});

test('Kimi rejects incomplete or malformed output and hides secrets in provider errors', async () => {
  const content = JSON.stringify(plan([{ kind: 'task', title: '不应创建', platformId: 'p' }]));
  for (const result of [
    { choices: [{ finish_reason: 'length', message: { content } }] },
    { choices: [{ finish_reason: 'content_filter', message: { content } }] },
    { choices: [{ finish_reason: 'tool_calls', message: { content } }] },
    { choices: [{ finish_reason: 'stop', message: { content: '', reasoning_content: content } }] },
    { choices: [{ finish_reason: 'stop', message: { content: 'invalid JSON' } }] },
    { choices: [] },
  ]) {
    await assert.rejects(completeJson(kimiSettings, [], async () => Response.json(result)), { code: 'AI_BAD_RESPONSE' });
  }
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(completeJson(kimiSettings, [], async () => Response.json({ error: { message: kimiSettings.apiKey } }, { status })), error => error.code === 'AI_PROVIDER_ERROR' && !error.message.includes(kimiSettings.apiKey));
  }
  await assert.rejects(completeJson(kimiSettings, [], async () => { throw new Error(kimiSettings.apiKey); }), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes(kimiSettings.apiKey));
});

test('Qwen keeps its own thinking parameter when Kimi is added', async () => {
  await completeJson({ ...aiProviders.qwen, provider: 'qwen', apiKey: 'qwen-test-only-secret' }, [{ role: 'user', content: '输出 JSON' }], async (url, options) => {
    assert.equal(url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    const body = JSON.parse(options.body);
    assert.equal(body.enable_thinking, false);
    assert.equal('thinking' in body, false);
    assert.equal('reasoning_effort' in body, false);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] });
  });
});

test('authorized Responses gateway retains transport and secret protections', async () => {
  const gateway = { ...openaiSettings, baseUrl: 'https://sub2api.trustasia.cn/v1', model: 'gpt-5.5' };
  const result = await completeJson(gateway, [{ role: 'user', content: '仅输出 JSON' }], async (url, options) => {
    assert.equal(url, 'https://sub2api.trustasia.cn/v1/responses');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${gateway.apiKey}`);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.5');
    assert.deepEqual(body.reasoning, { effort: 'low' });
    assert.equal(body.store, false);
    assert.deepEqual(body.text.format, { type: 'json_object' });
    return Response.json({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"ok":true}' }] }] });
  });
  assert.deepEqual(result, { ok: true });
});

test('model transport uses JSON mode and does not expose provider errors or keys', async () => {
  const result = await completeJson(settings, [{ role: 'user', content: '创建任务' }], async (url, options) => {
    assert.equal(url, 'https://api.deepseek.com/chat/completions');
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.response_format, { type: 'json_object' });
    return Response.json({ choices: [{ message: { content: JSON.stringify({ action: 'reply', reply: '哪个平台？' }) } }] });
  });
  assert.equal(result.action, 'reply');
  await assert.rejects(completeJson(settings, [], async () => Response.json({ detail: settings.apiKey }, { status: 401 })), error => error.code === 'AI_PROVIDER_ERROR' && !error.message.includes(settings.apiKey));
  await assert.rejects(completeJson(settings, [], async () => { throw new Error(settings.apiKey); }), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes(settings.apiKey));
  await assert.rejects(completeJson(settings, [], async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] })), { code: 'AI_BAD_RESPONSE' });
});

test('OpenAI Responses transport parses assistant output and preserves existing creation validation', async () => {
  const messages = [{ role: 'system', content: 'Output JSON.' }, { role: 'user', content: '创建 CertCloud 任务' }];
  const expected = plan([{ kind: 'task', title: '整理评审材料', platformId: 'p', participantIds: ['other'] }]);
  const result = await completeJson({ ...openaiSettings, baseUrl: `${openaiSettings.baseUrl}/` }, messages, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, `Bearer ${openaiSettings.apiKey}`);
    assert.equal(options.redirect, 'error');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.input, messages);
    assert.deepEqual(body.text.format, { type: 'json_object' });
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 4096);
    for (const field of ['messages', 'response_format', 'max_tokens', 'thinking', 'enable_thinking']) assert.equal(field in body, false);
    const text = JSON.stringify(expected);
    return Response.json({ status: 'completed', output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: text.slice(0, 20) }, { type: 'output_text', text: text.slice(20) }] },
    ] });
  });
  const prepared = prepareAssistantWorks(result, context);
  assert.deepEqual(prepared.issues, []);
  assert.equal(prepared.prepared[0].value.title, '整理评审材料');
  assert.equal(prepared.prepared[0].value.ownerId, 'me');
  assert.deepEqual(prepared.prepared[0].value.participantIds, ['other']);
});

test('OpenAI rejects incomplete, refused, malformed and failed responses without exposing secrets', async () => {
  const message = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{}' }] };
  for (const result of [
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [message] },
    { status: 'failed', output: [message] },
    { status: 'completed', output: [{ ...message, content: [...message.content, { type: 'refusal', refusal: openaiSettings.apiKey }] }] },
    { status: 'completed', output: [{ ...message, content: [{ type: 'output_text', text: 'invalid JSON' }] }] },
    { status: 'completed', output: [{ type: 'reasoning' }] },
    { status: 'completed', output: [{ ...message, role: 'user' }] },
  ]) {
    await assert.rejects(completeJson(openaiSettings, [], async () => Response.json(result)), error => error.code === 'AI_BAD_RESPONSE' && !error.message.includes(openaiSettings.apiKey));
  }
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(completeJson(openaiSettings, [], async () => Response.json({ error: { message: openaiSettings.apiKey } }, { status })), error => error.code === 'AI_PROVIDER_ERROR' && !error.message.includes(openaiSettings.apiKey));
  }
  await assert.rejects(completeJson(openaiSettings, [], async () => { throw new Error(openaiSettings.apiKey); }), error => error.code === 'AI_UNAVAILABLE' && !error.message.includes(openaiSettings.apiKey));
});

test('assistant plans validate catalogs, default fields and linked batch creation', () => {
  const result = prepareAssistantWorks(plan([
    { kind: 'task', title: '实现预览', platformId: 'p', requirementIndex: 1, participantIds: ['other'] },
    { kind: 'requirement', title: '证书预览', platformId: 'p', type: '优化', createdBy: 'forged', code: 'R99999' },
  ]), context);
  assert.deepEqual(result.issues, []);
  assert.equal(result.prepared[0].requirementIndex, 1);
  assert.equal(result.prepared[0].value.status, '待处理');
  assert.equal(result.prepared[1].value.ownerId, 'me');
  assert.equal(result.prepared[1].value.priority, 'P2');
  assert.equal(result.prepared[1].value.createdBy, undefined);
  assert.equal(result.prepared[1].value.code, undefined);
  assert.deepEqual(result.prepared[0].value.attachments, []);
  assert.ok(prepareAssistantWorks(plan([{ kind: 'task', title: 'bad', platformId: 'missing', participantIds: ['unknown'], requirementId: 'absent' }]), context).issues.length >= 3);
  assert.ok(prepareAssistantWorks(plan([{ kind: 'task', title: 'bad date', platformId: 'p', startedAt: '2026-10-20T17:00:00+08:00', dueAt: '2026-10-19T17:00:00+08:00' }]), context).issues.length > 0);
  assert.ok(prepareAssistantWorks(plan([{ kind: 'task', title: 'wrong link', platformId: 'p', requirementIndex: 0 }]), context).issues.length > 0);
  assert.deepEqual(prepareAssistantWorks({ action: 'reply', reply: '请补充平台。' }, context).prepared, []);
  assert.throws(() => prepareAssistantWorks(plan(Array(11).fill({ kind: 'task', title: 'too many' })), context));
});

test('valid creation data survives empty explanatory replies without relaxing work validation', () => {
  for (const reply of ['', '  \n ', undefined, null]) {
    const result = prepareAssistantWorks({ action: 'create', reply, works: [{ kind: 'requirement', title: '【电子签】PIN码隐藏', platformId: 'p', description: '应契约锁需求，PIN码设置隐藏。' }] }, context);
    assert.deepEqual(result.issues, []);
    assert.ok(result.plan.reply.trim());
    assert.equal(result.prepared[0].value.title, '【电子签】PIN码隐藏');
    assert.equal(result.prepared[0].value.ownerId, 'me');
  }
  const incomplete = prepareAssistantWorks({ action: 'create', reply: '', works: [{ kind: 'task', title: '仍需要明确平台' }] }, context);
  assert.ok(incomplete.issues.some(issue => issue.includes('平台')));
});

test('invalid model plans produce a readable error before any creation', () => {
  for (const value of [
    { action: 'reply', reply: '' }, { action: 'reply', reply: '  ' }, { action: 'reply' },
    { action: 'create', reply: 123, works: [] }, { action: 'create', reply: '', works: [{ kind: 'task', title: '' }] },
    { action: 'delete', reply: 'remove', works: [] },
  ]) {
    assert.throws(() => prepareAssistantWorks(value, context), error => error.status === 422 && error.code === 'AI_BAD_RESPONSE' && !error.message.includes('Too small'));
  }
});
