import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  const [scheme, salt, key] = (encoded || '').split('$');
  if (scheme !== 'scrypt' || !salt || !key || key.length !== 128) return false;
  const actual = await scrypt(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}
export const passwordValid = value => typeof value === 'string' && value.length >= 12 && value.length <= 128 && /[A-Za-z]/.test(value) && /\d/.test(value);
export class ApiError extends Error { constructor(status, message, code = 'REQUEST_FAILED') { super(message); this.status = status; this.code = code; } }
export const assert = (condition, status, message, code) => { if (!condition) throw new ApiError(status, message, code); };
export const isAdmin = user => user.access === '管理员';
export const canEdit = (user, work) => isAdmin(user) || work.createdBy === user.id || work.ownerId === user.id;
export const canContribute = (user, work) => canEdit(user, work) || work.participantIds.includes(user.id);
export const publicUser = row => ({ id: row.id, name: row.name, username: row.username, role: row.role, access: row.access, active: Boolean(row.active), color: row.color, mustChangePassword: Boolean(row.must_change_password) });
export const stamp = (date = new Date()) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ');
export const json = value => typeof value === 'string' ? JSON.parse(value) : value;
