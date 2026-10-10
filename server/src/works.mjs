import { randomUUID } from 'node:crypto';
import { rows, transaction } from './db.mjs';
import { assert, canEdit, canContribute, isAdmin, json, stamp } from './security.mjs';
import { audit } from './auth.mjs';
import { requirementSchema, taskSchema, normalizeDocument, changesBetween } from './validation.mjs';

const placeholders = values => values.map(() => '?').join(',');
const iso = value => value?.replace(' ', 'T');
export const fileView = file => ({ id: file.id, name: file.name, size: file.size, mime: file.mime, dataUrl: `/api/files/${file.id}` });
export async function hydrateWorks(records, connection) {
  if (!records.length) return [];
  const ids = records.map(item => item.id);
  const participants = await rows(`SELECT work_id,user_id FROM wb_participants WHERE work_id IN (${placeholders(ids)}) ORDER BY user_id`, ids, connection);
  const files = await rows(`SELECT id,work_id,zone,name,mime,size FROM wb_files WHERE work_id IN (${placeholders(ids)}) ORDER BY created_at,id`, ids, connection);
  return records.map(row => ({ ...json(row.document), id: row.id, code: row.code, title: row.title, status: row.status, priority: row.priority, platformId: row.platform_id, ownerId: row.owner_id, createdBy: row.created_by, requirementId: row.kind === 'task' ? row.requirement_id || undefined : undefined, participantIds: participants.filter(item => item.work_id === row.id).map(item => item.user_id), manualFocus: Boolean(row.manual_focus), archived: Boolean(row.archived), revision: row.revision, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), attachments: files.filter(file => file.work_id === row.id && file.zone === 'attachment').map(fileView), descriptionImages: files.filter(file => file.work_id === row.id && file.zone === 'description').map(fileView) }));
}
export async function findWork(kind, id, connection, lock = false) {
  const [record] = await rows(`SELECT * FROM wb_works WHERE id=? AND kind=? AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`, [id, kind], connection);
  assert(record, 404, '事项不存在或已删除', 'NOT_FOUND');
  return (await hydrateWorks([record], connection))[0];
}
export async function activity(connection, actor, kind, workId, text, changes = {}) {
  await rows('INSERT INTO wb_activities (id,kind,work_id,actor_id,text,changes,created_at) VALUES (?,?,?,?,?,?,?)', [randomUUID(), kind, workId, actor, text, JSON.stringify(changes), stamp()], connection);
}
export async function notify(connection, kind, work, recipients, title, text, level = 'info', dedupe) {
  for (const recipient of new Set(recipients.filter(Boolean))) {
    await rows('INSERT IGNORE INTO wb_notices (id,kind,work_id,recipient_id,title,text,level,dedupe_key,created_at) SELECT ?,?,?,?,?,?,?,?,? FROM wb_users WHERE id=? AND active=1 AND deleted_at IS NULL', [randomUUID(), kind, work.id, recipient, title, text, level, dedupe ? `${dedupe}:${recipient}` : null, stamp(), recipient], connection);
  }
}
async function validateReferences(connection, kind, value, existing) {
  await rows("SELECT next_value FROM wb_sequences WHERE kind='settings-lock' FOR UPDATE", [], connection);
  const [platform] = await rows('SELECT active FROM wb_platforms WHERE id=?', [value.platformId], connection);
  assert(platform && (platform.active || existing?.platformId === value.platformId), 400, '请选择启用的平台');
  for (const personId of [value.ownerId, ...value.participantIds]) {
    const [person] = await rows('SELECT active,deleted_at FROM wb_users WHERE id=?', [personId], connection);
    const previouslyAssigned = existing && [existing.ownerId, ...existing.participantIds].includes(personId);
    assert(person && !person.deleted_at && (person.active || previouslyAssigned), 400, '不能分派给不存在或停用的成员');
  }
  if (kind === 'task' && value.requirementId && value.requirementId !== existing?.requirementId) {
    const [requirement] = await rows("SELECT id FROM wb_works WHERE id=? AND kind='requirement' AND archived=0 AND deleted_at IS NULL FOR UPDATE", [value.requirementId], connection);
    assert(requirement, 400, '关联需求不存在或已归档');
  }
  for (const [field, group] of [['type','requirementType'], ['source',kind === 'task' ? 'taskSource' : 'requirementSource']]) {
    if (!value[field] || value[field] === existing?.[field]) continue;
    const [option] = await rows('SELECT id FROM wb_dictionary WHERE group_key=? AND name=? AND active=1', [group, value[field]], connection);
    assert(option, 400, '请选择启用的字典选项');
  }
}
async function bindFiles(connection, user, workId, value) {
  const all = [...value.attachments, ...value.descriptionImages].map(file => file.id);
  assert(new Set(all).size === all.length, 400, '附件不能重复关联');
  for (const [field, zone] of [['attachments','attachment'], ['descriptionImages','description']]) for (const { id } of value[field]) {
    const [file] = await rows('SELECT work_id,uploader_id,mime FROM wb_files WHERE id=? FOR UPDATE', [id], connection);
    assert(file && (file.work_id === workId || (!file.work_id && file.uploader_id === user.id)), 403, '附件不存在或不属于当前事项');
    assert(zone !== 'description' || /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.mime), 400, '描述仅支持图片');
    await rows('UPDATE wb_files SET work_id=?,zone=? WHERE id=?', [workId, zone, id], connection);
  }
  await rows(`DELETE FROM wb_files WHERE work_id=?${all.length ? ` AND id NOT IN (${placeholders(all)})` : ''}`, [workId, ...all], connection);
}
export async function saveWork(user, kind, raw, id, sharedConnection) {
  assert(['requirement','task'].includes(kind), 400, '事项类型无效');
  const parsed = normalizeDocument((kind === 'task' ? taskSchema : requirementSchema).parse(raw));
  const save = async connection => {
    await rows("SELECT next_value FROM wb_sequences WHERE kind='settings-lock' FOR UPDATE", [], connection);
    const existing = id ? await findWork(kind, id, connection, true) : undefined;
    if (existing) {
      assert(!existing.archived, 409, '归档事项需要先恢复');
      assert(canContribute(user, existing), 403, '你无权编辑该事项', 'FORBIDDEN');
      assert(parsed.revision === existing.revision, 409, '事项已被其他人更新，请刷新后重新编辑', 'VERSION_CONFLICT');
    }
    const value = { ...parsed };
    delete value.revision;
    if (kind === 'task') value.completedAt = value.status === '已完成' ? existing?.completedAt || iso(stamp()) : undefined;
    else value.launchedAt = value.status === '已上线' ? existing?.launchedAt || iso(stamp()) : undefined;
    if (value.milestones) assert(new Set(value.milestones.map(item => item.id)).size === value.milestones.length, 400, '里程碑编号重复');
    const comparable = existing ? (kind === 'task' ? taskSchema : requirementSchema).parse(existing) : {};
    const changes = changesBetween(normalizeDocument({ ...comparable, participantIds: comparable.participantIds || [], ownerId: comparable.ownerId }), value);
    if (existing && !canEdit(user, existing)) assert(Object.keys(changes).every(key => ['status','note','attachments','descriptionImages','completedAt','launchedAt'].includes(key)), 403, '参与人只能更新状态、备注和附件', 'FORBIDDEN');
    await validateReferences(connection, kind, value, existing);
    const workId = id || randomUUID();
    let code = existing?.code;
    if (!existing) {
      const [sequence] = await rows('SELECT next_value FROM wb_sequences WHERE kind=? FOR UPDATE', [kind], connection);
      code = `${kind === 'task' ? 'T' : 'R'}${String(sequence.next_value).padStart(5,'0')}`;
      await rows('UPDATE wb_sequences SET next_value=next_value+1 WHERE kind=?', [kind], connection);
    }
    const document = { ...value };
    for (const field of ['platformId','ownerId','participantIds','title','status','priority','manualFocus','requirementId','attachments','descriptionImages']) delete document[field];
    const dueAt = kind === 'task' ? value.dueAt : value.targetAt;
    const time = stamp();
    if (existing) await rows('UPDATE wb_works SET title=?,status=?,priority=?,platform_id=?,owner_id=?,requirement_id=?,manual_focus=?,due_at=?,started_at=?,document=?,revision=revision+1,updated_at=? WHERE id=?', [value.title, value.status, value.priority, value.platformId, value.ownerId, value.requirementId || null, value.manualFocus, dueAt?.replace('T',' ') || null, value.startedAt?.replace('T',' ') || null, JSON.stringify(document), time, workId], connection);
    else await rows('INSERT INTO wb_works (id,kind,code,title,status,priority,platform_id,owner_id,created_by,requirement_id,manual_focus,due_at,started_at,document,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [workId, kind, code, value.title, value.status, value.priority, value.platformId, value.ownerId, user.id, value.requirementId || null, value.manualFocus, dueAt?.replace('T',' ') || null, value.startedAt?.replace('T',' ') || null, JSON.stringify(document), time, time], connection);
    await rows('DELETE FROM wb_participants WHERE work_id=?', [workId], connection);
    for (const participant of value.participantIds) await rows('INSERT INTO wb_participants VALUES (?,?)', [workId, participant], connection);
    await bindFiles(connection, user, workId, value);
    await activity(connection, user.id, kind, workId, existing ? '更新了事项信息' : '创建了事项', changes);
    const saved = await findWork(kind, workId, connection);
    const targets = [value.ownerId, ...value.participantIds, existing?.ownerId, ...(existing?.participantIds || [])].filter(person => person !== user.id);
    await notify(connection, kind, saved, targets, existing ? '事项信息已更新' : '新事项已分派', `${code} · ${value.title}${existing ? '的信息或分派已更新。' : '已分派给你。'}`);
    return saved;
  };
  return sharedConnection ? save(sharedConnection) : transaction(save);
}
export async function archiveWork(user, kind, id, archived) {
  assert(isAdmin(user), 403, '仅管理员可归档或恢复事项');
  return transaction(async connection => {
    await rows("SELECT next_value FROM wb_sequences WHERE kind='settings-lock' FOR UPDATE", [], connection);
    await findWork(kind, id, connection, true);
    await rows('UPDATE wb_works SET archived=?,revision=revision+1,updated_at=? WHERE id=?', [archived, stamp(), id], connection);
    await activity(connection, user.id, kind, id, archived ? '归档了事项' : '恢复了事项', { archived });
    return findWork(kind, id, connection);
  });
}
export async function deleteWork(user, kind, id) {
  assert(isAdmin(user), 403, '仅管理员可删除事项');
  return transaction(async connection => {
    await rows("SELECT next_value FROM wb_sequences WHERE kind='settings-lock' FOR UPDATE", [], connection);
    await findWork(kind, id, connection, true);
    if (kind === 'requirement') {
      const tasks = await rows('SELECT id FROM wb_works WHERE requirement_id=? AND deleted_at IS NULL FOR UPDATE', [id], connection);
      await rows('UPDATE wb_works SET requirement_id=NULL,updated_at=?,revision=revision+1 WHERE requirement_id=?', [stamp(), id], connection);
      for (const task of tasks) await activity(connection, user.id, 'task', task.id, '关联需求已删除，任务保留', { requirementId: { before: id, after: null } });
    }
    await rows('UPDATE wb_works SET deleted_at=?,revision=revision+1 WHERE id=?', [stamp(), id], connection);
    await rows('DELETE FROM wb_notices WHERE work_id=?', [id], connection);
    await activity(connection, user.id, kind, id, '删除了事项');
    await audit(user.id, 'work-delete', id, connection);
    return { ok: true };
  });
}
export async function milestone(user, id, milestoneId, completed, revision) {
  return transaction(async connection => {
    await rows("SELECT next_value FROM wb_sequences WHERE kind='settings-lock' FOR UPDATE", [], connection);
    const work = await findWork('task', id, connection, true);
    assert(canContribute(user, work) && !work.archived, 403, '你无权更新该里程碑');
    assert(work.revision === revision, 409, '事项已被更新，请刷新', 'VERSION_CONFLICT');
    const item = work.milestones.find(value => value.id === milestoneId);
    assert(item && typeof completed === 'boolean', 400, '里程碑不存在或完成状态无效');
    const next = work.milestones.map(value => value.id === milestoneId ? { ...value, completedAt: completed ? iso(stamp()) : undefined } : value);
    await rows('UPDATE wb_works SET document=JSON_SET(document,\'$.milestones\',CAST(? AS JSON)),updated_at=?,revision=revision+1 WHERE id=?', [JSON.stringify(next), stamp(), id], connection);
    await activity(connection, user.id, 'task', id, completed ? '完成了里程碑' : '取消了里程碑完成状态', { milestoneId, completed });
    await notify(connection, 'task', work, [work.ownerId,...work.participantIds].filter(person => person !== user.id), '里程碑状态已更新', `${work.code} · ${item.name}${completed ? '已完成' : '已取消完成'}。`);
    return findWork('task', id, connection);
  });
}
