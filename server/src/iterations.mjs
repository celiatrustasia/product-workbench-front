import { randomUUID } from 'node:crypto';
import { rows, transaction } from './db.mjs';
import { assert, isAdmin, canEdit, stamp } from './security.mjs';
import { audit } from './auth.mjs';
import { settingsLock } from './management.mjs';
import { iterationSchema, iterationMembersSchema } from './validation.mjs';
import { findWork, activity, notify } from './works.mjs';

const canManage = (user, item) => isAdmin(user) || item.ownerId === user.id || item.createdBy === user.id;
export const iterationView = row => ({ id: row.id, name: row.name, goal: row.goal, startDate: row.start_date, endDate: row.end_date, ownerId: row.owner_id, status: row.status, createdBy: row.created_by, createdAt: row.created_at.replace(' ', 'T'), revision: row.revision });
export const listIterations = async () => (await rows('SELECT * FROM wb_iterations ORDER BY start_date DESC,created_at DESC,id')).map(iterationView);
async function findIteration(connection, id) {
  const [record] = await rows('SELECT * FROM wb_iterations WHERE id=? FOR UPDATE', [id], connection);
  assert(record, 404, '迭代不存在');
  return iterationView(record);
}
export async function saveIteration(user, raw, id) {
  const value = iterationSchema.parse(raw);
  return transaction(async connection => {
    await settingsLock(connection);
    const existing = id ? await findIteration(connection, id) : undefined;
    if (existing) {
      assert(canManage(user, existing), 403, '仅管理员、创建人或迭代负责人可管理迭代');
      assert(existing.revision === value.revision, 409, '迭代已更新，请刷新后重试', 'VERSION_CONFLICT');
    }
    assert(existing || value.status === '待开始', 400, '新迭代必须从待开始状态创建');
    assert(!existing || existing.status !== '待开始' || value.status !== '已完成', 400, '请先开始迭代再完成');
    const [owner] = await rows('SELECT active,deleted_at FROM wb_users WHERE id=?', [value.ownerId], connection);
    assert(owner && !owner.deleted_at && (owner.active || existing?.ownerId === value.ownerId), 400, '请选择启用的迭代负责人');
    const recordId = id || randomUUID();
    if (existing) await rows('UPDATE wb_iterations SET name=?,goal=?,start_date=?,end_date=?,owner_id=?,status=?,revision=revision+1,updated_at=? WHERE id=?', [value.name,value.goal,value.startDate,value.endDate,value.ownerId,value.status,stamp(),recordId], connection);
    else await rows('INSERT INTO wb_iterations (id,name,goal,start_date,end_date,owner_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)', [recordId,value.name,value.goal,value.startDate,value.endDate,value.ownerId,value.status,user.id,stamp(),stamp()], connection);
    await audit(user.id, existing ? 'iteration-update' : 'iteration-create', recordId, connection);
    return findIteration(connection, recordId);
  });
}
export async function changeIterationMembers(user, id, raw) {
  const value = iterationMembersSchema.parse(raw);
  assert(new Set(value.items.map(item => item.id)).size === value.items.length, 400, '事项不能重复');
  return transaction(async connection => {
    await settingsLock(connection);
    const target = await findIteration(connection, id);
    assert(canManage(user, target), 403, '你无权管理该迭代');
    assert(target.status !== '已完成', 409, '已完成迭代需重新打开后才能调整范围');
    const works = [];
    for (const item of value.items) {
      const work = await findWork(item.kind, item.id, connection, true);
      assert(canEdit(user, work), 403, '只能移入或移出有编辑权限的事项');
      assert(!work.archived, 409, '不能移动已归档事项');
      assert(work.revision === item.revision, 409, '事项已更新，请刷新后重试', 'VERSION_CONFLICT');
      if (value.remove) assert(work.iterationId === id, 409, '事项已不在此迭代');
      if (work.iterationId && work.iterationId !== id) {
        const source = await findIteration(connection, work.iterationId);
        assert(source.status !== '已完成', 409, '事项所属迭代已完成，请先重新打开');
        assert(canManage(user, source), 403, '你无权移出事项所属的迭代');
      }
      works.push({ ...work, kind: item.kind });
    }
    for (const work of works) {
      if (!value.remove && work.iterationId === id) continue;
      await rows('DELETE FROM wb_iteration_items WHERE work_id=?', [work.id], connection);
      if (!value.remove) await rows('INSERT INTO wb_iteration_items (work_id,iteration_id) VALUES (?,?)', [work.id,id], connection);
      await rows('UPDATE wb_works SET revision=revision+1,updated_at=? WHERE id=?', [stamp(),work.id], connection);
      const text = `${value.remove ? '移出了' : '移入了'}迭代「${target.name}」`;
      await activity(connection, user.id, work.kind, work.id, text, { iterationId: { before: work.iterationId || null, after: value.remove ? null : id } });
      await notify(connection, work.kind, work, [work.ownerId,...work.participantIds].filter(person => person !== user.id), '迭代安排已更新', `${work.code} · ${work.title}${text}。`);
    }
    await audit(user.id, value.remove ? 'iteration-remove-items' : 'iteration-add-items', id, connection);
    return { ok: true };
  });
}
export async function deleteIteration(user, id) {
  return transaction(async connection => {
    await settingsLock(connection);
    const iteration = await findIteration(connection, id);
    assert(canManage(user, iteration), 403, '你无权删除该迭代');
    const works = await rows('SELECT w.id,w.kind FROM wb_works w JOIN wb_iteration_items i ON i.work_id=w.id WHERE i.iteration_id=?', [id], connection);
    for (const work of works) {
      await rows('UPDATE wb_works SET revision=revision+1,updated_at=? WHERE id=?', [stamp(),work.id], connection);
      await activity(connection, user.id, work.kind, work.id, `删除了迭代「${iteration.name}」，事项保留`);
    }
    await rows('DELETE FROM wb_iterations WHERE id=?', [id], connection);
    await audit(user.id, 'iteration-delete', id, connection);
    return { ok: true };
  });
}
