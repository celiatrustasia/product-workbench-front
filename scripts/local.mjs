import { spawn } from 'node:child_process';
import { existsSync, readFileSync, openSync, closeSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { once } from 'node:events';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const runtime=resolve(root,'server/.runtime');
const envPath=resolve(root,'server/.env');
if(!existsSync(envPath))throw new Error('请先配置 server/.env，参考 server/.env.example');
const env={...process.env,...parseEnv(readFileSync(envPath,'utf8'))};
mkdirSync(runtime,{recursive:true,mode:0o700});
const mode=process.argv[2] || 'start';
const records=resolve(runtime,'local-processes.json');
if(mode==='stop'){
  const saved=existsSync(records) ? JSON.parse(readFileSync(records,'utf8')) : [];
  for(const item of saved){
    try {
      const child=spawn('ps',['-p',String(item.pid),'-o','command='],{stdio:['ignore','pipe','ignore']});
      let command='';child.stdout.on('data',chunk=>command+=chunk);await once(child,'close');
      if(command.includes(item.entry))process.kill(item.pid,'SIGTERM');
    }catch{}
  }
  writeFileSync(records,'[]',{mode:0o600});
  console.log('本项目启动的服务已停止');process.exit(0);
}
const running=existsSync(records) ? JSON.parse(readFileSync(records,'utf8')) : [];
function detach(entry,args,cwd,extra={}){
  const log=openSync(resolve(runtime,entry.includes('vite') ? 'frontend.log':'backend.log'),'a',0o600);
  const child=spawn(process.execPath,[entry,...args],{cwd,env:{...env,...extra},detached:true,stdio:['ignore',log,log]});
  closeSync(log);child.unref();running.push({pid:child.pid,entry});writeFileSync(records,JSON.stringify(running),{mode:0o600});
}
const healthy=async url=>{try{const res=await fetch(url,{signal:AbortSignal.timeout(1500)});return res.ok;}catch{return false;}};
if(env.MYSQL_SSH_KEY && !(await healthy('http://127.0.0.1:3001/api/health'))){
  const args=['-fNT','-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${env.MYSQL_SSH_KNOWN_HOSTS}`,'-o','ExitOnForwardFailure=yes','-o','ServerAliveInterval=30','-o','ServerAliveCountMax=3','-o','ConnectTimeout=10','-i',env.MYSQL_SSH_KEY,'-L',`127.0.0.1:${env.MYSQL_PORT || 13306}:127.0.0.1:3306`,`${env.MYSQL_SSH_USER || 'mysql-tunnel'}@${env.MYSQL_SSH_HOST}`];
  const net=await import('node:net');
  const listening=await new Promise(resolveCheck=>{const socket=net.createConnection({host:'127.0.0.1',port:Number(env.MYSQL_PORT || 13306)});socket.once('connect',()=>{socket.destroy();resolveCheck(true);});socket.once('error',()=>resolveCheck(false));socket.setTimeout(1500,()=>{socket.destroy();resolveCheck(false);});});
  if(!listening){const child=spawn('ssh',args,{stdio:'inherit'});const [code]=await once(child,'close');if(code!==0)throw new Error('数据库隧道启动失败');}
}
const apiUrl=`http://${env.HOST || '127.0.0.1'}:${env.PORT || 3001}/api/health`;
if(!(await healthy(apiUrl)))detach(resolve(root,'server/src/main.mjs'),[],resolve(root,'server'));
let ready=false;
for(let attempt=0;attempt<30;attempt++){if(await healthy(apiUrl)){ready=true;break;}await new Promise(done=>setTimeout(done,500));}
if(!ready)throw new Error(`后端未启动，请查看 ${runtime}/backend.log`);
const frontUrl='http://127.0.0.1:5174/';
if(!(await healthy(frontUrl)))detach(resolve(root,'node_modules/vite/bin/vite.js'),['--host','127.0.0.1','--port','5174'],root);
for(let attempt=0;attempt<20;attempt++){if(await healthy(frontUrl)){console.log(`产品工作台已启动：${frontUrl}`);process.exit(0);}await new Promise(done=>setTimeout(done,500));}
throw new Error(`前端未启动，请查看 ${runtime}/frontend.log`);
