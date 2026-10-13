import dayjs from 'dayjs';
import { makeSeed } from './seed';
import { migrateWorkCodes } from './migrate';
import type { WorkbenchData } from '../types';

export function isVisitorPath(pathname: string) {
  return /^\/youke(?:\/|$)/.test(pathname);
}

// Public data is generated independently. Never copy the authenticated workspace here.
export function makeVisitorSeed(): WorkbenchData {
  const data = migrateWorkCodes(makeSeed());
  const date = (days: number) => dayjs().add(days, 'day').format('YYYY-MM-DD');
  const names = ['演示产品经理', '演示研发小陈', '演示产品小林', '演示测试小赵', '演示研发小周'];
  data.people = data.people.map((person, index) => ({ ...person, name: names[index], username: `demo.member${index + 1}`, access: '普通成员' }));
  data.requirements = data.requirements.map(item => ({ ...item, proposer: '演示团队', createdBy: 'celia' }));
  data.iterations = [
    { id: 'demo-current', name: '体验优化 · 第 2 期', goal: '完成消息中心、海外登录与权限能力优化，交付可验收的产品体验。', startDate: date(-5), endDate: date(8), status: '进行中', ownerId: 'celia', createdBy: 'celia', createdAt: dayjs().subtract(7, 'day').format('YYYY-MM-DDTHH:mm:ss') },
    { id: 'demo-next', name: '服务升级 · 第 3 期', goal: '完善客户服务与帮助中心，沉淀交付文档。', startDate: date(9), endDate: date(22), status: '待开始', ownerId: 'lin', createdBy: 'celia', createdAt: dayjs().format('YYYY-MM-DDTHH:mm:ss') },
    { id: 'demo-done', name: '基础能力 · 第 1 期', goal: '完成工作台概览和基础配置能力。', startDate: date(-20), endDate: date(-7), status: '已完成', ownerId: 'celia', createdBy: 'celia', createdAt: dayjs().subtract(21, 'day').format('YYYY-MM-DDTHH:mm:ss') },
  ];
  data.requirements.forEach((item, index) => { item.iterationId = item.status === '已上线' ? 'demo-done' : index < 4 ? 'demo-current' : 'demo-next'; });
  data.tasks.forEach((item, index) => { item.iterationId = item.status === '已完成' ? 'demo-done' : index < 6 ? 'demo-current' : 'demo-next'; });
  return data;
}
