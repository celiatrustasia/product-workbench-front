import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

export const aiProviders = {
  deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  qwen: { name: '通义千问（阿里云百炼）', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
};
export const aiSettingsSchema = z.object({
  provider: z.enum(['deepseek', 'qwen', 'openai']),
  baseUrl: z.string().url().max(300),
  model: z.string().trim().regex(/^[a-zA-Z0-9._:/-]{1,100}$/),
  apiKey: z.string().trim().min(8).max(4096).regex(/^[^\s]+$/),
}).superRefine((value, ctx) => {
  const url = new URL(value.baseUrl);
  const deepseek = url.hostname === 'api.deepseek.com' && ['', '/', '/v1', '/v1/'].includes(url.pathname);
  const qwen = (['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com'].includes(url.hostname)
    || /^[a-zA-Z0-9-]+\.(cn-beijing|ap-southeast-1|us-east-1|eu-central-1)\.maas\.aliyuncs\.com$/.test(url.hostname))
    && ['/compatible-mode/v1', '/compatible-mode/v1/'].includes(url.pathname);
  const openai = url.hostname === 'api.openai.com' && ['/v1', '/v1/'].includes(url.pathname);
  const allowedEndpoint = { deepseek, qwen, openai }[value.provider];
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !allowedEndpoint) {
    ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: '请使用所选服务商的官方 HTTPS 接口地址' });
  }
});

export function createAiSettings(file, environment = {}) {
  const envConfigured = Boolean(environment.AI_API_KEY);
  async function load() {
    if (envConfigured) return aiSettingsSchema.parse({
      provider: environment.AI_PROVIDER || 'deepseek',
      baseUrl: environment.AI_BASE_URL || aiProviders[environment.AI_PROVIDER || 'deepseek']?.baseUrl,
      model: environment.AI_MODEL || aiProviders[environment.AI_PROVIDER || 'deepseek']?.model,
      apiKey: environment.AI_API_KEY,
    });
    try { return aiSettingsSchema.parse(JSON.parse(await readFile(file, 'utf8'))); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  async function status() {
    const current = await load();
    return { configured: Boolean(current), managedByEnvironment: envConfigured,
      provider: current?.provider || 'deepseek', model: current?.model || aiProviders.deepseek.model,
      baseUrl: current?.baseUrl || aiProviders.deepseek.baseUrl, providers: aiProviders };
  }
  async function save(value) {
    if (envConfigured) throw Object.assign(new Error('模型由服务器环境变量管理，请在服务器更新配置'), { status: 409, code: 'AI_ENV_MANAGED' });
    const validated = aiSettingsSchema.parse(value);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(validated), { mode: 0o600, flag: 'wx' });
    await rename(temp, file);
    return status();
  }
  return { load, status, save };
}
