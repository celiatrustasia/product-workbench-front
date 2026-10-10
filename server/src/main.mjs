import { createApp } from './app.mjs';
import { config } from './config.mjs';
import { pool } from './db.mjs';
import { migrate } from './migrate.mjs';
import { runReminders } from './reminders.mjs';
import { REMINDER_INTERVAL_MS } from '../../shared/notificationRules.mjs';

await migrate();
const server=createApp().listen(config.port,config.host,()=>console.log(`Product workbench API: http://${config.host}:${config.port}`));
let reminding=false;
async function reminders(){if(reminding)return;reminding=true;try{await runReminders();}catch(error){console.error('Reminder error:',error.code || error.name);}finally{reminding=false;}}
void reminders();
const timer=setInterval(()=>void reminders(),REMINDER_INTERVAL_MS);
timer.unref();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{clearInterval(timer);server.close(async()=>{await pool.end();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
