import type { Attachment } from '../types';

export const isApiMode = () => location.protocol !== 'file:' && import.meta.env.VITE_DATA_MODE !== 'preview';
let csrf = '';
export const setCsrf = (value: string) => { csrf = value; };
export class RequestError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}
export async function request<T>(path: string, method = 'GET', body?: unknown, timeoutMs = 20000): Promise<T> {
  const form = body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: { ...(form ? {} : { 'Content-Type': 'application/json' }), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) }, body: body === undefined ? undefined : form ? body : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  } catch { throw new RequestError(path.startsWith('/assistant/') ? '助手连接中断，可重试同一消息，系统会防止重复创建。' : '无法连接后端服务，请检查本地服务和数据库隧道', 0, 'OFFLINE'); }
  const value = await response.json().catch(() => ({ error: { message: '后端服务响应异常', code: 'BAD_RESPONSE' } }));
  if (!response.ok) {
    if (response.status === 401 && path !== '/auth/login') window.dispatchEvent(new Event('workbench-session-expired'));
    throw new RequestError(value.error?.message || '请求失败', response.status, value.error?.code || 'REQUEST_FAILED');
  }
  return value as T;
}
export async function uploadFile(file: File): Promise<Attachment> {
  const form = new FormData(); form.append('file', file, file.name || `image-${Date.now()}.png`);
  return request<Attachment>('/files', 'POST', form);
}
