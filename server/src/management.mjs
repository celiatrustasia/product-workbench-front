import { randomUUID, randomBytes } from 'node:crypto';
import { rows, transaction } from './db.mjs';
import { assert, isAdmin, publicUser, hashPassword, stamp } from './security.mjs';
import { audit } from './auth.mjs';
import { platformSchema, personSchema, dictionarySchema } from './validation.mjs';

export async function settingsLock(connection) {
  await rows("SELECT next_value FROM wb_sequences WHERE kind='settings-lock' FOR UPDATE", [], connection);
}
export async function adminLock(connection) {
  await rows("SELECT next_value FROM wb_sequences WHERE kind='admin-lock' FOR UPDATE", [], connection);
}
export const temporaryPassword = () => randomBytes(18).toString('base64url') + 'A7';
async function keepAdmin(connection, existing, value, user) {
  if (!existing || (value.active && value.access === '管理员')) return;
  assert(existing.id !== user.id, 400, '不能停用当前登录账号或移除自己的管理员权限');
  if (existing.active && existing.access === '管理员') {
    const [count] = await rows("SELECT COUNT(*) AS total FROM wb_users WHERE active=1 AND access='管理员' AND deleted_at IS NULL", [], connection);
    assert(count.total > 1, 400, '至少需要保留一位启用的管理员');
  }
}
export async function saveSetting(user, kind, raw, id) {
  assert(isAdmin(user), 403, '仅管理员可管理基础数据');
  const value = (kind === 'people' ? personSchema : kind === 'platforms' ? platformSchema : dictionarySchema).parse(raw);
  return transaction(async connection => {
    await adminLock(connection); await settingsLock(connection);
    const table = kind === 'people' ? 'wb_users' : kind === 'platforms' ? 'wb_platforms' : 'wb_dictionary';
    const [existing] = id ? await rows(`SELECT * FROM ${table} WHERE id=?${kind === 'people' ? ' AND deleted_at IS NULL' : ''} FOR UPDATE`, [id], connection) : [];
    assert(!id || existing, 404, '记录不存在');
    const recordId = id || randomUUID();
    if (kind === 'people') {
      await keepAdmin(connection, existing, value, user);
      assert(!existing || existing.username === value.username, 400, '登录用户名不可修改');
      if (existing) {
        await rows('UPDATE wb_users SET name=?,role=?,access=?,active=?,color=? WHERE id=?', [value.name, value.role, value.access, value.active, value.color, recordId], connection);
        if (!value.active || value.access !== existing.access) await rows('DELETE FROM wb_sessions WHERE user_id=?', [recordId], connection);
      } else {
        const password = temporaryPassword();
        await rows('INSERT INTO wb_users (id,username,name,role,access,active,color,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [recordId, value.username, value.name, value.role, value.access, value.active, value.color, await hashPassword(password), stamp()], connection);
        await audit(user.id, 'person-create', recordId, connection);
        return { person: publicUser((await rows('SELECT * FROM wb_users WHERE id=?',[recordId],connection))[0]), temporaryPassword: password };
      }
    } else if (kind === 'platforms') {
      if (existing) await rows('UPDATE wb_platforms SET name=?,description=?,active=? WHERE id=?', [value.name,value.description,value.active,recordId], connection);
      else await rows('INSERT INTO wb_platforms (id,name,description,active,sort) SELECT ?,?,?,?,COALESCE(MAX(sort),0)+1 FROM (SELECT sort FROM wb_platforms) AS current_items', [recordId,value.name,value.description,value.active], connection);
    } else {
      assert(!existing || existing.group_key === value.group, 400, '字典分类不可修改');
      if (existing) {
        await rows('UPDATE wb_dictionary SET name=?,active=? WHERE id=?', [value.name,value.active,recordId], connection);
        if (existing.name !== value.name) {
          const field = value.group === 'requirementType' ? 'type' : 'source';
          const workKind = value.group === 'taskSource' ? 'task' : 'requirement';
          await rows(`UPDATE wb_works SET document=JSON_SET(document,'$.${field}',?),revision=revision+1,updated_at=? WHERE kind=? AND JSON_UNQUOTE(JSON_EXTRACT(document,'$.${field}'))=?`, [value.name,stamp(),workKind,existing.name], connection);
        }
      } else await rows('INSERT INTO wb_dictionary (id,group_key,name,active,sort) SELECT ?,?,?,?,COALESCE(MAX(sort),0)+1 FROM (SELECT sort FROM wb_dictionary WHERE group_key=?) AS current_items', [recordId,value.group,value.name,value.active,value.group], connection);
    }
    await audit(user.id, `${kind}-${existing ? 'update' : 'create'}`, recordId, connection);
    return { id: recordId };
  });
}
export async function deleteSetting(user, kind, id) {
  assert(isAdmin(user), 403, '仅管理员可管理基础数据');
  return transaction(async connection => {
    await adminLock(connection); await settingsLock(connection);
    const table = kind === 'people' ? 'wb_users' : kind === 'platforms' ? 'wb_platforms' : 'wb_dictionary';
    const [item] = await rows(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`, [id], connection);
    assert(item, 404, '记录不存在');
    if (kind === 'people') {
      assert(item.id !== user.id, 400, '不能删除当前登录账号');
      await keepAdmin(connection,item,{active:false},user);
      const [related] = await rows('SELECT COUNT(*) AS total FROM wb_works WHERE owner_id=? OR created_by=? OR id IN (SELECT work_id FROM wb_participants WHERE user_id=?)', [id,id,id], connection);
      assert(!related.total, 409, '成员仍关联事项，请使用停用功能');
      await rows('UPDATE wb_users SET active=0,deleted_at=? WHERE id=?',[stamp(),id],connection);
      await rows('DELETE FROM wb_sessions WHERE user_id=?',[id],connection);
    } else if (kind === 'platforms') {
      const [related] = await rows('SELECT COUNT(*) AS total FROM wb_works WHERE platform_id=?',[id],connection);
      assert(!related.total,409,'平台仍被事项引用，请使用停用功能');
      await rows('DELETE FROM wb_platforms WHERE id=?',[id],connection);
    } else {
      const field = item.group_key === 'requirementType' ? 'type' : 'source';
      const workKind = item.group_key === 'taskSource' ? 'task' : 'requirement';
      const [related] = await rows(`SELECT COUNT(*) AS total FROM wb_works WHERE kind=? AND JSON_UNQUOTE(JSON_EXTRACT(document,'$.${field}'))=?`,[workKind,item.name],connection);
      assert(!related.total,409,'字典选项仍被事项引用，请使用停用功能');
      await rows('DELETE FROM wb_dictionary WHERE id=?',[id],connection);
    }
    await audit(user.id,`${kind}-delete`,id,connection);
    return { ok:true };
  });
}
export async function reorder(user, kind, ids, group) {
  assert(isAdmin(user),403,'仅管理员可排序');
  return transaction(async connection => {
    await settingsLock(connection);
    const table = kind === 'platforms' ? 'wb_platforms' : 'wb_dictionary';
    const items = await rows(`SELECT id FROM ${table}${group ? ' WHERE group_key=?' : ''} ORDER BY sort,id FOR UPDATE`,group ? [group] : [],connection);
    const known = new Set(items.map(item=>item.id));
    assert(ids.every(id=>known.has(id)) && new Set(ids).size===ids.length,400,'排序包含无效或重复记录');
    const next = [...ids,...items.map(item=>item.id).filter(id=>!ids.includes(id))];
    for (const [index,id] of next.entries()) await rows(`UPDATE ${table} SET sort=? WHERE id=?`,[index+1,id],connection);
    await audit(user.id,`${kind}-reorder`,null,connection);
    return { ok:true };
  });
}
export async function resetPassword(user,id) {
  assert(isAdmin(user),403,'仅管理员可重置密码');
  assert(id!==user.id,400,'请使用个人修改密码功能');
  const password=temporaryPassword();
  await transaction(async connection=>{
    await adminLock(connection);
    const result=await rows('UPDATE wb_users SET password_hash=?,must_change_password=1 WHERE id=? AND deleted_at IS NULL',[await hashPassword(password),id],connection);
    assert(result.affectedRows,404,'成员不存在');
    await rows('DELETE FROM wb_sessions WHERE user_id=?',[id],connection);
    await audit(user.id,'password-reset',id,connection);
  });
  return { temporaryPassword:password };
}
