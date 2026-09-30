import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,unlink} from 'node:fs/promises';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';

test('cloud MySQL end-to-end permissions, works, uploads and reminders',{skip:process.env.RUN_MYSQL_TESTS!=='1'},async t=>{
  const testDatabase=`friend_workbench_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
  process.env.MYSQL_DATABASE=testDatabase;
  process.env.BOOTSTRAP_PASSWORD_FILE=`.runtime/${testDatabase}.txt`;
  const {config}=await import('../src/config.mjs');
  const {migrate}=await import('../src/migrate.mjs');
  const {pool,rows}=await import('../src/db.mjs');
  const {createApp}=await import('../src/app.mjs');
  const {runReminders}=await import('../src/reminders.mjs');
  const {stamp}=await import('../src/security.mjs');
  let server;
  try {
    await migrate();
    server=createApp().listen(0,'127.0.0.1');await once(server,'listening');
    const url=`http://127.0.0.1:${server.address().port}/api`;
    const admin={},owner={},participant={},outsider={};
    async function call(client,path,method='GET',body,expected=200,headers={}){
      const response=await fetch(url+path,{method,headers:{...(body instanceof FormData ? {} : {'Content-Type':'application/json'}),...(client.cookie ? {Cookie:client.cookie,'X-CSRF-Token':client.csrf}:{}),...headers},body:body===undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body)});
      const value=await response.json();
      assert.equal(response.status,expected,`${method} ${path}: ${JSON.stringify(value.error || {})}`);
      if(response.headers.get('set-cookie'))client.cookie=response.headers.get('set-cookie').split(';')[0];
      if(value.csrf)client.csrf=value.csrf;
      if(value.user)client.id=value.user.id;
      return value;
    }
    const bootstrap=(await readFile(config.bootstrapPasswordFile,'utf8')).split('\n')[1].split('：')[1];
    await t.test('authentication, forced password change, CSRF and origin',async()=>{
      await call({},'/workspace','GET',undefined,401);
      await call(admin,'/auth/login','POST',{username:'celia',password:bootstrap});
      await call(admin,'/workspace','GET',undefined,428);
      await call(admin,'/auth/password','POST',{oldPassword:bootstrap,newPassword:'Integration-admin-123'},403,{'X-CSRF-Token':'wrong'});
      await call(admin,'/auth/password','POST',{oldPassword:bootstrap,newPassword:'Integration-admin-123'});
      await call(admin,'/workspace','GET',undefined,403,{Origin:'https://evil.example'});
    });
    const workspace=await call(admin,'/workspace');const platformId=workspace.platforms[0].id;
    for(const [client,username] of [[owner,'owner'],[participant,'participant'],[outsider,'outsider']]){
      const result=await call(admin,'/people','POST',{name:username,username,role:'研发',access:'普通成员',active:true,color:'blue'},201);
      client.id=result.person.id;
      await call(client,'/auth/login','POST',{username,password:result.temporaryPassword});
      await call(client,'/auth/password','POST',{oldPassword:result.temporaryPassword,newPassword:`Integration-${username}-123`});
    }
    const requirementBody={title:'需求验证',platformId,ownerId:owner.id,participantIds:[participant.id],priority:'P1',status:'待评估',type:'新功能',manualFocus:true,description:'测试描述',note:'',targetAt:stamp().replace(' ','T'),attachments:[],descriptionImages:[]};
    let requirement=await call(admin,'/works/requirement','POST',requirementBody,201);
    let task=await call(admin,'/works/task','POST',{...requirementBody,title:'任务验证',type:undefined,targetAt:undefined,requirementId:requirement.id,status:'进行中',dueAt:stamp().replace(' ','T'),milestones:[{id:'milestone-1',name:'测试节点',plannedAt:stamp().replace(' ','T')}]},201);
    await t.test('real persistence, assignment and server-side permissions',async()=>{
      assert.equal(requirement.code,'R00001');assert.equal(task.code,'T00001');
      await call(outsider,`/works/task/${task.id}`,'PUT',{...task,note:'forbidden'},403);
      await call(participant,`/works/task/${task.id}`,'PUT',{...task,title:'forbidden'},403);
      task=await call(participant,`/works/task/${task.id}`,'PUT',{...task,note:'participant-note'});
      task=await call(participant,`/tasks/${task.id}/milestones/milestone-1`,'PATCH',{completed:true,revision:task.revision});
      assert.ok(task.milestones[0].completedAt);
      await call(owner,`/works/task/${task.id}`,'PUT',{...task,revision:1},409);
      await call(owner,'/platforms','POST',{name:'forbidden',active:true},403);
      await call(owner,`/works/task/${task.id}`,'DELETE',undefined,403);
      await call(admin,`/platforms/${platformId}`,'DELETE',undefined,409);
      await call(admin,`/people/${admin.id}`,'PUT',{...workspace.people[0],active:false},400);
    });
    await t.test('uploads are private before binding, survive saves and cannot be stolen',async()=>{
      const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XkAAAAASUVORK5CYII=','base64');
      const form=new FormData();form.append('file',new Blob([png],{type:'image/png'}),'测试.png');
      const file=await call(owner,'/files','POST',form,201);
      let response=await fetch(url+`/files/${file.id}`,{headers:{Cookie:outsider.cookie}});assert.equal(response.status,404);
      await call(outsider,'/works/task','POST',{...task,id:undefined,ownerId:outsider.id,descriptionImages:[file]},403);
      task=await call(owner,`/works/task/${task.id}`,'PUT',{...task,descriptionImages:[file]});
      assert.equal(task.descriptionImages[0].name,'测试.png');
      response=await fetch(url+`/files/${file.id}`,{headers:{Cookie:participant.cookie}});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
      const malicious=new FormData();malicious.append('file',new Blob(['<script>alert(1)</script>'],{type:'image/png'}),'fake.png');
      const unsafe=await call(owner,'/files','POST',malicious,201);
      await call(owner,`/works/task/${task.id}`,'PUT',{...task,descriptionImages:[unsafe]},400);
    });
    await t.test('dictionary and platform CRUD, persisted ordering and reference protection',async()=>{
      const created=await call(admin,'/platforms','POST',{name:'独立测试平台',description:'test',active:true},201);
      await call(admin,`/platforms/${created.id}`,'PUT',{name:'已修改平台',active:false});
      const state=await call(admin,'/workspace');const reversed=state.platforms.map(item=>item.id).reverse();
      await call(admin,'/platforms/order','POST',{ids:reversed});assert.deepEqual((await call(admin,'/workspace')).platforms.map(item=>item.id),reversed);
      await call(admin,`/platforms/${created.id}`,'DELETE');
      const option=await call(admin,'/dictionaries','POST',{name:'测试来源',group:'taskSource',active:true},201);
      await call(admin,'/dictionaries/order','POST',{group:'taskSource',ids:[option.id]});
      assert.equal((await call(admin,'/workspace')).dictionary.filter(item=>item.group==='taskSource')[0].id,option.id);
      await call(admin,`/dictionaries/${option.id}`,'DELETE');
    });
    await t.test('unique sequence under concurrent creates and filtered pagination',async()=>{
      const items=await Promise.all(Array.from({length:5},(_,index)=>call(owner,'/works/requirement','POST',{...requirementBody,title:`并发需求${index}`},201)));
      assert.equal(new Set(items.map(item=>item.code)).size,5);
      const page=await call(owner,'/works/requirement?page=2&pageSize=2&statuses=待评估,设计中&focus=yes');
      assert.equal(page.total,6);assert.equal(page.items.length,2);
      await call(owner,'/works/requirement','POST',{...requirementBody,title:'无时间未关注需求',manualFocus:false,targetAt:undefined},201);
      const unfocused=await call(owner,'/works/requirement?focus=no');assert.equal(unfocused.total,1);
    });
    await t.test('recipient-only reminders, deduplication and read flags',async()=>{
      await runReminders();await runReminders();
      const userNotices=await call(owner,'/notices');
      assert.ok(userNotices.some(item=>item.level==='warning'));
      const [dupes]=await rows('SELECT COUNT(*) AS total,COUNT(DISTINCT dedupe_key) AS unique_total FROM wb_notices WHERE dedupe_key IS NOT NULL');assert.equal(dupes.total,dupes.unique_total);
      await call(outsider,`/notices/${userNotices[0].id}/read`,'PATCH',undefined,404);
      await call(owner,'/notices/read','PATCH');assert.ok((await call(owner,'/notices')).every(item=>item.read));
      assert.equal((await call(outsider,'/notices')).length,0);
    });
    await t.test('archive/restore, soft deletion, retained tasks and reset revocation',async()=>{
      await call(admin,`/works/task/${task.id}/archive`,'PATCH',{archived:true});
      task=await call(admin,`/works/task/${task.id}`);await call(owner,`/works/task/${task.id}`,'PUT',task,409);
      await call(admin,`/works/task/${task.id}/archive`,'PATCH',{archived:false});
      await call(admin,`/works/requirement/${requirement.id}`,'DELETE');
      task=await call(owner,`/works/task/${task.id}`);assert.equal(task.requirementId,undefined);
      await call(owner,`/works/requirement/${requirement.id}`,'GET',undefined,404);
      const [auditCount]=await rows('SELECT COUNT(*) AS total FROM wb_activities WHERE work_id=?',[requirement.id]);assert.ok(auditCount.total>=2);
      const reset=await call(admin,`/people/${participant.id}/reset-password`,'POST');assert.ok(reset.temporaryPassword);
      await call(participant,'/workspace','GET',undefined,401);
      await call(participant,'/auth/login','POST',{username:'participant',password:reset.temporaryPassword});await call(participant,'/workspace','GET',undefined,428);
      await call(admin,`/works/task/${task.id}`,'DELETE');
    });
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    // This random database is created solely by this test, never an existing application database.
    if(config.database===testDatabase && /^friend_workbench_test_\d+_[a-f0-9]{8}$/.test(testDatabase))await pool.query(`DROP DATABASE IF EXISTS \`${testDatabase}\``);
    await pool.end();await unlink(config.bootstrapPasswordFile).catch(()=>{});
  }
});
