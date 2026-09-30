import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { z } from 'zod';
import { config } from './config.mjs';
import { rows, transaction } from './db.mjs';
import { assert, publicUser, stamp, json } from './security.mjs';
import { authenticate, requireAdmin, requireChangedPassword, originGuard, login, logout, changePassword } from './auth.mjs';
import { saveWork, findWork, hydrateWorks, archiveWork, deleteWork, milestone, fileView } from './works.mjs';
import { saveSetting, deleteSetting, reorder, resetPassword, settingsLock } from './management.mjs';
import { orderSchema, dictionarySchema } from './validation.mjs';

const iso = value => value?.replace(' ', 'T');
const workKind = value => { assert(['requirement','task'].includes(value),400,'事项类型无效'); return value; };
const notices = async userId => (await rows('SELECT * FROM wb_notices WHERE recipient_id=? ORDER BY created_at DESC,id DESC LIMIT 2000',[userId])).map(item=>({id:item.id,kind:item.kind,workId:item.work_id,title:item.title,text:item.text,level:item.level,createdAt:iso(item.created_at),read:Boolean(item.read_at),readByIds:item.read_at ? [userId] : [],recipientIds:[userId]}));
const fileUpload = multer({ storage:multer.memoryStorage(), limits:{fileSize:1024*1024,files:1,fields:0,parts:1} }).single('file');

export function createApp() {
  const app=express();
  app.disable('x-powered-by');
  app.use((_req,res,next)=>{res.locals.nonce=randomBytes(16).toString('base64');next();});
  app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'",(_req,res)=>`'nonce-${res.locals.nonce}'`],'style-src':["'self'","'unsafe-inline'"],'img-src':["'self'",'data:','blob:'],'connect-src':["'self'"],'upgrade-insecure-requests':config.production ? [] : null}},strictTransportSecurity:config.production ? undefined : false}));
  app.use('/api',originGuard,express.json({limit:'200kb'}),(_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  app.get('/api/health',async (_req,res)=>{await rows('SELECT 1');res.json({ok:true,service:'product-workbench-api'});});
  app.post('/api/auth/login',rateLimit({windowMs:15*60000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,handler:(_req,res)=>res.status(429).json({error:{code:'RATE_LIMIT',message:'登录尝试过多，请稍后重试'}})}),login);
  app.use('/api',authenticate);
  app.get('/api/auth/me',(req,res)=>res.json({user:req.user,csrf:req.session.csrf}));
  app.post('/api/auth/logout',logout);
  app.post('/api/auth/password',changePassword);
  app.use('/api',requireChangedPassword);

  app.get('/api/workspace',async (req,res)=>{
    const people=(await rows('SELECT * FROM wb_users WHERE deleted_at IS NULL ORDER BY created_at,id')).map(publicUser);
    const platforms=(await rows('SELECT * FROM wb_platforms ORDER BY sort,id')).map(item=>({...item,active:Boolean(item.active)}));
    const dictionary=(await rows('SELECT * FROM wb_dictionary ORDER BY group_key,sort,id')).map(item=>({id:item.id,group:item.group_key,name:item.name,active:Boolean(item.active),sort:item.sort}));
    const works=await hydrateWorks(await rows('SELECT * FROM wb_works WHERE deleted_at IS NULL ORDER BY updated_at DESC,id DESC'));
    const activities=(await rows('SELECT a.* FROM wb_activities a JOIN wb_works w ON w.id=a.work_id WHERE w.deleted_at IS NULL ORDER BY a.created_at DESC,a.id DESC LIMIT 5000')).map(item=>({id:item.id,kind:item.kind,workId:item.work_id,actorId:item.actor_id,text:item.text,changes:json(item.changes),createdAt:iso(item.created_at)}));
    const requirements=works.filter(item=>!Object.hasOwn(item,'milestones'));
    const tasks=works.filter(item=>Object.hasOwn(item,'milestones'));
    res.json({people,platforms,dictionary,requirements,tasks,activities,notices:await notices(req.user.id)});
  });

  app.get('/api/works/:kind',async (req,res)=>{
    const kind=workKind(req.params.kind);
    const query=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),pageSize:z.coerce.number().int().min(1).max(100).default(20),search:z.string().max(100).optional(),statuses:z.string().max(200).optional(),platformId:z.string().max(64).optional(),priority:z.enum(['P1','P2','P3','P4']).optional(),ownerId:z.string().max(64).optional(),archived:z.enum(['true','false','all']).default('false'),focus:z.enum(['yes','no']).optional()}).parse(req.query);
    const predicates=['kind=?','deleted_at IS NULL'];const values=[kind];
    if(query.archived!=='all'){predicates.push('archived=?');values.push(query.archived==='true');}
    if(query.search){predicates.push('(title LIKE ? OR code LIKE ?)');const term=`%${query.search.replace(/[\\%_]/g,'\\$&')}%`;values.push(term,term);}
    if(query.statuses){const statuses=query.statuses.split(',');assert(statuses.length<=5,400,'状态过多');predicates.push(`status IN (${statuses.map(()=>'?').join(',')})`);values.push(...statuses);}
    for(const [field,column] of [['platformId','platform_id'],['priority','priority'],['ownerId','owner_id']])if(query[field]){predicates.push(`${column}=?`);values.push(query[field]);}
    if(query.focus){
      const week="BETWEEN DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY) AND DATE_ADD(DATE_SUB(CURDATE(), INTERVAL WEEKDAY(CURDATE()) DAY), INTERVAL 6 DAY)";
      const exactFocus=`(archived=0 AND (manual_focus=1 OR (status NOT IN ('已完成','已上线','挂起') AND (DATE(due_at) < CURDATE() OR DATE(due_at) ${week} OR (kind='task' AND DATE(started_at) ${week}) OR EXISTS (SELECT 1 FROM JSON_TABLE(COALESCE(JSON_EXTRACT(document,'$.milestones'),JSON_ARRAY()), '$[*]' COLUMNS (planned_at VARCHAR(40) PATH '$.plannedAt', completed_at VARCHAR(40) PATH '$.completedAt' NULL ON EMPTY)) m WHERE m.completed_at IS NULL AND (DATE(m.planned_at)<CURDATE() OR DATE(m.planned_at) ${week}))))))`;
      predicates.push(query.focus==='yes' ? `COALESCE(${exactFocus},0)` : `NOT COALESCE(${exactFocus},0)`);
    }
    const where=predicates.join(' AND ');const [count]=await rows(`SELECT COUNT(*) AS total FROM wb_works WHERE ${where}`,values);
    const records=await rows(`SELECT * FROM wb_works WHERE ${where} ORDER BY updated_at DESC,id DESC LIMIT ${query.pageSize} OFFSET ${(query.page-1)*query.pageSize}`,values);
    res.json({items:await hydrateWorks(records),total:count.total,page:query.page,pageSize:query.pageSize});
  });
  app.get('/api/works/:kind/:id',async(req,res)=>res.json(await findWork(workKind(req.params.kind),req.params.id)));
  app.post('/api/works/:kind',async(req,res)=>res.status(201).json(await saveWork(req.user,workKind(req.params.kind),req.body)));
  app.put('/api/works/:kind/:id',async(req,res)=>res.json(await saveWork(req.user,workKind(req.params.kind),req.body,req.params.id)));
  app.patch('/api/works/:kind/:id/archive',async(req,res)=>{const {archived}=z.object({archived:z.boolean()}).parse(req.body);res.json(await archiveWork(req.user,workKind(req.params.kind),req.params.id,archived));});
  app.delete('/api/works/:kind/:id',async(req,res)=>res.json(await deleteWork(req.user,workKind(req.params.kind),req.params.id)));
  app.patch('/api/tasks/:id/milestones/:milestoneId',async(req,res)=>{const value=z.object({completed:z.boolean(),revision:z.number().int().positive()}).parse(req.body);res.json(await milestone(req.user,req.params.id,req.params.milestoneId,value.completed,value.revision));});

  for(const kind of ['platforms','people','dictionaries']){
    app.post(`/api/${kind}`,requireAdmin,async(req,res)=>res.status(201).json(await saveSetting(req.user,kind,req.body)));
    app.put(`/api/${kind}/:id`,requireAdmin,async(req,res)=>res.json(await saveSetting(req.user,kind,req.body,req.params.id)));
    app.delete(`/api/${kind}/:id`,requireAdmin,async(req,res)=>res.json(await deleteSetting(req.user,kind,req.params.id)));
  }
  app.post('/api/platforms/order',requireAdmin,async(req,res)=>res.json(await reorder(req.user,'platforms',orderSchema.parse(req.body).ids)));
  app.post('/api/dictionaries/order',requireAdmin,async(req,res)=>{const {ids}=orderSchema.parse(req.body);const group=dictionarySchema.shape.group.parse(req.body.group);res.json(await reorder(req.user,'dictionaries',ids,group));});
  app.post('/api/people/:id/reset-password',requireAdmin,async(req,res)=>res.json(await resetPassword(req.user,req.params.id)));
  app.get('/api/notices',async(req,res)=>res.json(await notices(req.user.id)));
  app.patch('/api/notices/read',async(req,res)=>{await rows('UPDATE wb_notices SET read_at=? WHERE recipient_id=? AND read_at IS NULL',[stamp(),req.user.id]);res.json({ok:true});});
  app.patch('/api/notices/:id/read',async(req,res)=>{const result=await rows('UPDATE wb_notices SET read_at=? WHERE id=? AND recipient_id=?',[stamp(),req.params.id,req.user.id]);assert(result.affectedRows,404,'提醒不存在');res.json({ok:true});});
  app.get('/api/audit',requireAdmin,async(_req,res)=>res.json(await rows('SELECT * FROM wb_audit ORDER BY created_at DESC,id DESC LIMIT 500')));

  app.post('/api/files',rateLimit({windowMs:60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false}),fileUpload,async(req,res)=>{
    assert(req.file?.size,400,'请选择非空文件');
    const file=req.file;const detected=await fileTypeFromBuffer(file.buffer);
    const mime=detected?.mime || 'application/octet-stream';
    const filename=basename(Buffer.from(file.originalname,'latin1').toString('utf8')).replace(/[\x00-\x1f\x7f]/g,'').slice(0,180) || 'attachment';
    const fileId=randomUUID();
    await transaction(async connection=>{
      await settingsLock(connection);
      const [usage]=await rows('SELECT COALESCE(SUM(size),0) AS total,COUNT(*) AS count FROM wb_files WHERE uploader_id=? AND work_id IS NULL',[req.user.id],connection);
      assert(Number(usage.total)+file.size<=24*1024*1024 && usage.count<48,413,'未保存附件过多，请先保存事项或稍后重试');
      await rows('INSERT INTO wb_files (id,uploader_id,name,mime,size,contents,created_at) VALUES (?,?,?,?,?,?,?)',[fileId,req.user.id,filename,mime,file.size,file.buffer,stamp()],connection);
    });
    res.status(201).json(fileView({id:fileId,name:filename,mime,size:file.size}));
  });
  app.get('/api/files/:id',async(req,res)=>{
    const [file]=await rows('SELECT f.*,w.deleted_at FROM wb_files f LEFT JOIN wb_works w ON w.id=f.work_id WHERE f.id=?',[req.params.id]);
    assert(file && !file.deleted_at && (file.work_id || file.uploader_id===req.user.id),404,'附件不存在或无权访问');
    const inline=/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(file.mime);
    res.setHeader('Content-Type',inline ? file.mime : 'application/octet-stream');
    res.setHeader('Content-Disposition',`${inline ? 'inline':'attachment'}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g,'%27')}`);
    res.send(file.contents);
  });
  app.delete('/api/files/:id',async(req,res)=>{const result=await rows('DELETE FROM wb_files WHERE id=? AND uploader_id=? AND work_id IS NULL',[req.params.id,req.user.id]);assert(result.affectedRows,404,'只能移除自己未保存的附件');res.json({ok:true});});
  app.use('/api',(_req,res)=>res.status(404).json({error:{code:'NOT_FOUND',message:'接口不存在'}}));
  if(config.staticDir){
    const servePage=async(_req,res)=>{const html=await readFile(resolve(config.staticDir,'index.html'),'utf8');res.setHeader('Cache-Control','no-store');res.type('html').send(html.replace(/<script\b/,`<script nonce="${res.locals.nonce}"`));};
    app.get(['/','/index.html'],servePage);
    app.use(express.static(config.staticDir,{index:false}));
    app.get('/{*path}',servePage);
  }
  app.use((error,_req,res,_next)=>{
    let status=error.status || 500;let code=error.code || 'INTERNAL_ERROR';let message=error.message;
    if(error instanceof z.ZodError){status=400;code='VALIDATION_FAILED';message=error.issues.map(issue=>`${issue.path.join('.') || '字段'}：${issue.message}`).join('；');}
    else if(error instanceof multer.MulterError){status=413;code='UPLOAD_LIMIT';message='文件超过限制：单个文件最多 1 MB';}
    else if(error.code==='ER_DUP_ENTRY'){status=409;code='DUPLICATE';message='名称或用户名已存在';}
    else if(error.code==='ER_ROW_IS_REFERENCED_2'){status=409;code='REFERENCED';message='记录仍被引用，请使用停用功能';}
    if(status>=500){console.error('API error:',error.code || error.name);message='服务暂时不可用，请稍后重试';code='INTERNAL_ERROR';}
    res.status(status).json({error:{code,message}});
  });
  return app;
}
