import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {once} from 'node:events';
import {createRequire} from 'node:module';
process.env.MYSQL_PASSWORD ||= 'unit-test-not-connected';
const {hashPassword,verifyPassword,passwordValid}=await import('../src/security.mjs');
const {normalizeDocument,taskSchema}=await import('../src/validation.mjs');
const {reminderFor}=await import('../src/reminders.mjs');
const {config}=await import('../src/config.mjs');

test('passwords are salted, verifiable and require sufficient strength',async()=>{
  const first=await hashPassword('UnitTest-Password123');
  assert.notEqual(first,await hashPassword('UnitTest-Password123'));
  assert.equal(await verifyPassword('UnitTest-Password123',first),true);
  assert.equal(await verifyPassword('wrong',first),false);
  assert.equal(passwordValid('demo1234'),false);
});
test('Shanghai dates, participant deduplication and deadline validation',()=>{
  const value=normalizeDocument({participantIds:['owner','other','other'],ownerId:'owner',dueAt:'2026-09-29T17:00:00'});
  assert.equal(value.dueAt,'2026-09-29T17:00:00');
  assert.deepEqual(value.participantIds,['other']);
  assert.equal(taskSchema.safeParse({title:'task',platformId:'p',ownerId:'o',priority:'P2',status:'进行中',startedAt:'2026-10-01T17:00:00',dueAt:'2026-09-29T17:00:00'}).success,false);
  const base={title:'task',platformId:'p',ownerId:'o',priority:'P2',status:'进行中'};
  assert.equal(taskSchema.safeParse({...base,dueAt:'2026-02-30T17:00:00'}).success,false);
  assert.equal(taskSchema.safeParse({...base,dueAt:'2026-09-29T17:00'}).success,true);
});
test('reminders cover overdue, today, three days, milestones and ignore completed work',()=>{
  const task={id:'t',code:'T00001',title:'task',status:'进行中',dueAt:'2026-10-02T17:00:00',milestones:[]};
  assert.equal(reminderFor(task,'2026-09-29').level,'warning');
  assert.equal(reminderFor(task,'2026-09-30'),undefined);
  assert.equal(reminderFor(task,'2026-10-01'),undefined);
  assert.equal(reminderFor(task,'2026-10-03').level,'danger');
  assert.equal(reminderFor({...task,status:'已完成'},'2026-10-03'),undefined);
  assert.match(reminderFor({...task,milestones:[{name:'评审',plannedAt:'2026-09-29T10:00:00'}]},'2026-09-29').text,/里程碑/);
});
test('built HTML has valid JavaScript and a fresh CSP nonce, including direct index access',{skip:!existsSync('../dist/index.html')},async()=>{
  const {createApp}=await import('../src/app.mjs');
  const {resolve}=await import('node:path');
  config.staticDir=resolve('../dist');
  const server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/index.html`);
    assert.equal(response.status,200);
    const html=await response.text();const script=html.match(/<script nonce="([^"]+)" type="module">([\s\S]*?)<\/script>/);
    assert.ok(script);assert.ok(response.headers.get('content-security-policy').includes(`nonce-${script[1]}`));
    const ts=createRequire(import.meta.url)('../../node_modules/typescript');
    assert.equal(ts.createSourceFile('built.js',script[2],ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
  }finally{await new Promise(resolveClose=>server.close(resolveClose));}
});
