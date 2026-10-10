import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, serverRoot } from './config.mjs';
import { createDatabase, rows, transaction, pool } from './db.mjs';
import { hashPassword, stamp } from './security.mjs';

export async function migrate() {
  await createDatabase();
  for (const file of (await readdir(resolve(serverRoot, 'migrations'))).filter(name => /^\d+-[a-z-]+\.sql$/.test(name)).sort()) {
    const sql = await readFile(resolve(serverRoot, 'migrations', file), 'utf8');
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await pool.query(statement);
  }
  await transaction(async connection => {
    await rows("SELECT next_value FROM wb_sequences WHERE kind='admin-lock' FOR UPDATE", [], connection);
    const existing = await rows('SELECT id FROM wb_users LIMIT 1', [], connection);
    if (existing.length) return;
    const password = randomBytes(24).toString('base64url') + 'A7';
    const id = randomUUID();
    await rows('INSERT INTO wb_users (id,username,name,role,access,password_hash,created_at) VALUES (?,?,?,?,?,?,?)', [id, config.bootstrapUsername, config.bootstrapName, '产品', '管理员', await hashPassword(password), stamp()], connection);
    await mkdir(dirname(config.bootstrapPasswordFile), { recursive: true, mode: 0o700 });
    await writeFile(config.bootstrapPasswordFile, `用户名：${config.bootstrapUsername}\n临时密码：${password}\n首次登录必须修改密码。\n`, { mode: 0o600 });
    for (const [index, name] of ['CertCloud', '移动端', '管理后台', '开放平台', '支付中心'].entries()) await rows('INSERT INTO wb_platforms (id,name,description,sort) VALUES (?,?,?,?)', [randomUUID(), name, '', index + 1], connection);
    for (const [group, names] of Object.entries({ requirementType: ['优化', '新功能'], requirementSource: ['产品', '研发', '售后', '客户'], taskSource: ['产品', '研发', '测试', '售后'] })) {
      for (const [index, name] of names.entries()) await rows('INSERT INTO wb_dictionary (id,group_key,name,sort) VALUES (?,?,?,?)', [randomUUID(), group, name, index + 1], connection);
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { await migrate(); console.log(`Database ready: ${config.database}. Initial credentials: ${config.bootstrapPasswordFile}`); }
  finally { await pool.end(); }
}
