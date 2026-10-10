import { rows, transaction } from './db.mjs';
import { stamp, digest } from './security.mjs';
import { hydrateWorks, notify } from './works.mjs';
import { REMINDER_ADVANCE_DAYS } from '../../shared/notificationRules.mjs';

export function reminderFor(work, today = stamp().slice(0,10)) {
  if (work.archived || ['已完成','已上线','挂起'].includes(work.status)) return;
  const milestones=work.milestones?.filter(item=>!item.completedAt).map(item=>({date:item.plannedAt,label:`里程碑「${item.name}」`})) || [];
  const dates=[{date:work.milestones ? work.dueAt : work.targetAt,label:work.milestones ? '最终截止' : '目标上线'},...milestones].filter(item=>item.date);
  const start=Date.parse(`${today}T00:00:00+08:00`);
  const candidates=dates.map(item=>({...item,days:Math.round((Date.parse(`${item.date.slice(0,10)}T00:00:00+08:00`)-start)/86400000)})).filter(item=>item.days<=0 || item.days===REMINDER_ADVANCE_DAYS).sort((a,b)=>a.days-b.days);
  if (!candidates.length) return;
  const first=candidates[0];
  return {level:first.days<0 ? 'danger' : 'warning',title:first.days<0 ? '事项已逾期' : first.days===0 ? '事项今天到期' : '事项即将到期',text:`${work.code} · ${work.title}：${first.label}${first.days<0 ? `已逾期 ${-first.days} 天` : first.days===0 ? '今天到期' : '将在 3 天后到期'}。`};
}
export async function runReminders() {
  return transaction(async connection=>{
    await rows("SELECT next_value FROM wb_sequences WHERE kind='settings-lock' FOR UPDATE",[],connection);
    const records=await rows("SELECT * FROM wb_works WHERE deleted_at IS NULL AND archived=0 AND status NOT IN ('已完成','已上线','挂起')",[],connection);
    const works=await hydrateWorks(records,connection);
    const today=stamp().slice(0,10);
    for (const work of works) {
      const reminder=reminderFor(work,today);
      if (!reminder) continue;
      const recipients=[work.ownerId,...work.participantIds].filter(Boolean);
      await notify(connection,work.milestones ? 'task':'requirement',work,recipients.length ? recipients : [work.createdBy],reminder.title,reminder.text,reminder.level,digest(`${work.id}:${today}`));
    }
    await rows('DELETE FROM wb_sessions WHERE expires_at<?',[stamp()],connection);
    await rows('DELETE FROM wb_files WHERE work_id IS NULL AND created_at<?',[stamp(new Date(Date.now()-86400000))],connection);
  });
}
