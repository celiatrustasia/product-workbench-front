import { z } from 'zod';
export const id = z.string().min(1).max(64);
const optionalText = limit => z.string().max(limit).optional();
const validDate = value => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [year,month,day,hour,minute] = match.slice(1,6).map(Number);
  const second = Number(match[6] || 0);
  const calendar = new Date(Date.UTC(year,month-1,day));
  return year>=1000 && calendar.getUTCFullYear()===year && calendar.getUTCMonth()===month-1 && calendar.getUTCDate()===day && hour<24 && minute<60 && Number(second)<60;
};
const date = z.string().max(40).refine(validDate, '日期无效').optional();
const files = z.array(z.object({ id })).max(12).default([]);
const base = {
  title: z.string().trim().min(1).max(100), platformId: id, ownerId: id,
  priority: z.enum(['P1','P2','P3','P4']), description: z.string().max(2000).default(''),
  participantIds: z.array(id).max(50).default([]), note: z.string().max(1000).default(''),
  manualFocus: z.boolean().default(false), attachments: files, descriptionImages: files,
  revision: z.number().int().positive().optional(), source: optionalText(80),
};
export const requirementSchema = z.object({ ...base, status: z.enum(['待评估','设计中','研发中','测试中','已上线']), type: optionalText(80), proposer: optionalText(100), proposedAt: date, targetAt: date, launchedAt: date });
export const taskSchema = z.object({ ...base, status: z.enum(['待处理','进行中','阻塞','已完成','挂起']), requirementId: id.optional(), startedAt: date, dueAt: date, completedAt: date, milestones: z.array(z.object({ id, name: z.string().trim().min(1).max(100), plannedAt: date.refine(Boolean, '请选择里程碑时间'), completedAt: date })).max(50).default([]) }).refine(value => !value.startedAt || !value.dueAt || Date.parse(value.dueAt) >= Date.parse(value.startedAt), '截止时间不能早于开始时间');
export const loginSchema = z.object({ username: z.string().trim().min(1).max(64), password: z.string().min(1).max(128) });
export const personSchema = z.object({ name: z.string().trim().min(1).max(80), username: z.string().regex(/^[a-zA-Z0-9._-]{1,64}$/).transform(value => value.toLowerCase()), role: z.enum(['产品','研发','测试']), access: z.enum(['管理员','普通成员']), active: z.boolean(), color: z.enum(['blue','green','violet','amber','gray']).default('blue') });
export const platformSchema = z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(400).default(''), active: z.boolean().default(true) });
export const dictionarySchema = z.object({ name: z.string().trim().min(1).max(80), group: z.enum(['requirementType','requirementSource','taskSource']), active: z.boolean().default(true) });
export const orderSchema = z.object({ ids: z.array(id).max(500) });
export const normalizeDocument = value => {
  const result = { ...value, participantIds: [...new Set(value.participantIds)].filter(person => person !== value.ownerId) };
  for (const key of ['proposedAt','targetAt','launchedAt','startedAt','dueAt','completedAt']) if (result[key]) result[key] = new Date(new Date(result[key]).getTime() + 8 * 3600000).toISOString().slice(0,19);
  if (result.milestones) result.milestones = result.milestones.map(item => ({ ...item, plannedAt: new Date(Date.parse(item.plannedAt) + 8 * 3600000).toISOString().slice(0,19), completedAt: item.completedAt ? new Date(Date.parse(item.completedAt) + 8 * 3600000).toISOString().slice(0,19) : undefined }));
  return result;
};
export function changesBetween(before, after) {
  const changes = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'revision') continue;
    const clean = value => ['attachments','descriptionImages'].includes(key) ? (value || []).map(file => file.id) : value;
    if (JSON.stringify(clean(before[key])) !== JSON.stringify(clean(after[key]))) changes[key] = { before: clean(before[key]) ?? null, after: clean(after[key]) ?? null };
  }
  return changes;
}
