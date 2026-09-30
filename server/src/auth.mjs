import { randomUUID } from 'node:crypto';
import { parseCookie, stringifySetCookie } from 'cookie';
import { rows, transaction } from './db.mjs';
import { config } from './config.mjs';
import { assert, digest, token, publicUser, verifyPassword, hashPassword, passwordValid, stamp } from './security.mjs';
import { loginSchema } from './validation.mjs';

const cookieName = 'wb_session';
const dummyHash = await hashPassword('invalid-user-placeholder');
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: config.production, path: '/api' };
export async function audit(actor, action, target = null, connection) {
  await rows('INSERT INTO wb_audit (id,actor_id,action,target_id,created_at) VALUES (?,?,?,?,?)', [randomUUID(), actor || null, action, target, stamp()], connection);
}
export function originGuard(req, _res, next) {
  const origin = req.headers.origin;
  assert(!origin || config.origins.includes(origin), 403, '请求来源不受信任', 'ORIGIN_DENIED');
  next();
}
export async function authenticate(req, _res, next) {
  const value = parseCookie(req.headers.cookie || '')[cookieName];
  assert(value && /^[a-f0-9]{64}$/.test(value), 401, '请先登录', 'UNAUTHORIZED');
  const [session] = await rows('SELECT s.csrf,s.token_hash,u.* FROM wb_sessions s JOIN wb_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1 AND u.deleted_at IS NULL', [digest(value), stamp()]);
  assert(session, 401, '登录已失效，请重新登录', 'UNAUTHORIZED');
  req.user = publicUser(session);
  req.session = session;
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) assert(req.headers['x-csrf-token'] === session.csrf, 403, '安全校验失败，请刷新页面', 'CSRF_FAILED');
  next();
}
export function requireChangedPassword(req, _res, next) {
  assert(!req.user.mustChangePassword, 428, '首次登录需要修改密码', 'PASSWORD_CHANGE_REQUIRED'); next();
}
export function requireAdmin(req, _res, next) {
  assert(req.user.access === '管理员', 403, '仅管理员可执行此操作', 'FORBIDDEN'); next();
}
export async function login(req, res) {
  const value = loginSchema.parse(req.body);
  const [person] = await rows('SELECT * FROM wb_users WHERE username=? AND deleted_at IS NULL', [value.username.toLowerCase()]);
  const valid = await verifyPassword(value.password, person?.password_hash || dummyHash);
  assert(person?.active && valid, 401, '用户名或密码不正确', 'BAD_CREDENTIALS');
  const sessionToken = token();
  const csrf = token();
  await transaction(async connection => {
    const [current] = await rows('SELECT active,password_hash,deleted_at FROM wb_users WHERE id=? FOR UPDATE', [person.id], connection);
    assert(current?.active && !current.deleted_at && current.password_hash === person.password_hash, 401, '账号状态已变化，请重新登录');
    await rows('INSERT INTO wb_sessions (token_hash,user_id,csrf,expires_at) VALUES (?,?,?,?)', [digest(sessionToken), person.id, csrf, stamp(new Date(Date.now() + 8 * 3600000))], connection);
    await audit(person.id, 'login', person.id, connection);
  });
  res.setHeader('Set-Cookie', stringifySetCookie({ name: cookieName, value: sessionToken, ...cookieOptions, maxAge: 8 * 3600 }));
  res.json({ user: publicUser(person), csrf });
}
export async function logout(req, res) {
  await rows('DELETE FROM wb_sessions WHERE token_hash=?', [req.session.token_hash]);
  res.setHeader('Set-Cookie', stringifySetCookie({ name: cookieName, value: '', ...cookieOptions, maxAge: 0 }));
  res.json({ ok: true });
}
export async function changePassword(req, res) {
  const { oldPassword, newPassword } = req.body || {};
  assert(typeof oldPassword === 'string' && oldPassword.length <= 128 && passwordValid(newPassword), 400, '密码至少 12 位，且包含字母和数字');
  assert(oldPassword !== newPassword, 400, '新密码不能与旧密码相同');
  const hash = await hashPassword(newPassword);
  await transaction(async connection => {
    const [person] = await rows('SELECT * FROM wb_users WHERE id=? FOR UPDATE', [req.user.id], connection);
    assert(await verifyPassword(oldPassword, person.password_hash), 400, '原密码不正确');
    await rows('UPDATE wb_users SET password_hash=?,must_change_password=0 WHERE id=?', [hash, person.id], connection);
    await rows('DELETE FROM wb_sessions WHERE user_id=? AND token_hash<>?', [person.id, req.session.token_hash], connection);
    await audit(person.id, 'password-change', person.id, connection);
  });
  res.json({ ok: true });
}
