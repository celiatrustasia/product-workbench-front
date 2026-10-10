import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAiSettings, aiSettingsSchema } from '../src/ai-settings.mjs';
import { completeJson, prepareAssistantWorks } from '../src/ai-engine.mjs';

const settings = { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-only-secret' };
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
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('model endpoints reject key forwarding to untrusted hosts and URL credentials', () => {
  for (const baseUrl of ['http://api.deepseek.com', 'https://api.deepseek.com.evil.example', 'https://127.0.0.1', 'https://user@api.deepseek.com', 'https://api.deepseek.com?redirect=evil', 'https://api.deepseek.com/redirect']) {
    assert.equal(aiSettingsSchema.safeParse({ ...settings, baseUrl }).success, false);
  }
  assert.equal(aiSettingsSchema.safeParse({ ...settings, provider: 'qwen', baseUrl: 'https://workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1' }).success, true);
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
