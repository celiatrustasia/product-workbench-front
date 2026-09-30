import { randomBytes } from 'node:crypto';
import { readFile,writeFile,unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const metaFile=resolve('.runtime/browser-fixture.json');
if(process.argv[2]==='stop'){
  const meta=JSON.parse(await readFile(metaFile,'utf8'));
  if(!/^friend_workbench_ui_\d+_[a-f0-9]{8}$/.test(meta.database))throw new Error('Unsafe test database');
  process.env.MYSQL_DATABASE=meta.database;
  const {pool}=await import('../src/db.mjs');
  try{process.kill(meta.pid,'SIGTERM');}catch{}
  await pool.query(`DROP DATABASE \`${meta.database}\``);await pool.end();
  await unlink(metaFile);await unlink(resolve('.runtime',`${meta.database}.txt`));
  console.log('本轮独立 UI 测试数据已清理');
}else{
  const database=`friend_workbench_ui_${Date.now()}_${randomBytes(4).toString('hex')}`;
  process.env.MYSQL_DATABASE=database;
  process.env.BOOTSTRAP_PASSWORD_FILE=`.runtime/${database}.txt`;
  const {migrate}=await import('../src/migrate.mjs');
  const {rows,pool}=await import('../src/db.mjs');
  const {hashPassword,publicUser,stamp}=await import('../src/security.mjs');
  const {saveSetting}=await import('../src/management.mjs');
  const {saveWork}=await import('../src/works.mjs');
  await migrate();
  const password=randomBytes(18).toString('base64url')+'U7';
  await rows('UPDATE wb_users SET must_change_password=0,password_hash=?',[await hashPassword(password)]);
  const admin=publicUser((await rows('SELECT * FROM wb_users LIMIT 1'))[0]);
  const person=(await saveSetting(admin,'people',{name:'陈一',username:'chenyi',role:'研发',access:'普通成员',active:true,color:'green'})).person;
  const platform=(await rows('SELECT id FROM wb_platforms ORDER BY sort LIMIT 1'))[0];
  for(let index=0;index<9;index++){
    const date=stamp(new Date(Date.now()+(index-2)*86400000)).replace(' ','T');
    const requirement=await saveWork(admin,'requirement',{title:['消息中心改版','计费套餐升级','海外登录流程适配','客户线索导出'][index%4]+(index>3 ? ` ${index}` : ''),platformId:platform.id,ownerId:admin.id,participantIds:[person.id],priority:'P2',status:['待评估','设计中','研发中','测试中'][index%4],manualFocus:true,targetAt:date,description:'为产品团队提供可追踪的需求过程。'});
    await saveWork(admin,'task',{title:`联调与验收 ${index+1}`,platformId:platform.id,ownerId:admin.id,participantIds:[person.id],priority:'P1',status:['待处理','进行中','阻塞'][index%3],manualFocus:true,requirementId:requirement.id,dueAt:date,milestones:[{id:`m${index}`,name:'验收',plannedAt:date}]});
  }
  const child=spawn(process.execPath,[resolve('src/main.mjs')],{cwd:process.cwd(),env:{...process.env,PORT:'3002',HOST:'127.0.0.1',APP_ORIGINS:'http://127.0.0.1:3002',STATIC_DIR:'../dist'},detached:true,stdio:'ignore'});child.unref();
  await writeFile(metaFile,JSON.stringify({database,pid:child.pid,username:'celia',password}),{mode:0o600});
  await pool.end();console.log('独立 UI 测试服务：http://127.0.0.1:3002/');
}
