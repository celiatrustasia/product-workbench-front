import dayjs from 'dayjs';
import type { Notice, Requirement, Task, WorkBase, WorkbenchData } from './types';

export const requirementStatuses = ['待评估', '设计中', '研发中', '测试中', '已上线'] as const;
export const taskStatuses = ['待处理', '进行中', '阻塞', '已完成', '挂起'] as const;
export const priorities = ['P1', 'P2', 'P3', 'P4'] as const;
export const priorityNames: Record<string, string> = { P1: '重要紧急', P2: '重要不紧急', P3: '不重要紧急', P4: '不重要不紧急' };

export const formatDate = (date?: string, withTime = false) => date ? dayjs(date).format(withTime ? 'YYYY/MM/DD HH:mm' : 'MM/DD') : '—';
export const formatLongDate = (date?: string) => date ? dayjs(date).format('YYYY年M月D日') : '—';
export const daysUntil = (date?: string) => date ? dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day') : null;

export function weekBounds() {
  const today = dayjs();
  const monday = today.startOf('day').subtract((today.day() + 6) % 7, 'day');
  return { start: monday, end: monday.add(7, 'day') };
}

export function isoWeekNumber() {
  const thursday = weekBounds().start.add(3, 'day');
  const jan4 = thursday.startOf('year').add(3, 'day');
  const firstMonday = jan4.subtract((jan4.day() + 6) % 7, 'day');
  return Math.floor(thursday.startOf('day').diff(firstMonday, 'day') / 7) + 1;
}

export function isNoticeRead(notice: Notice, userId: string) {
  return notice.read || Boolean(notice.readByIds?.includes(userId));
}

export function isThisWeek(date?: string) {
  if (!date) return false;
  const { start, end } = weekBounds();
  const value = dayjs(date);
  return !value.isBefore(start) && value.isBefore(end);
}

export function isComplete(item: Requirement | Task): boolean {
  return item.status === '已上线' || item.status === '已完成';
}

export function focusReasons(item: Requirement | Task): string[] {
  if (item.archived) return [];
  const reasons = item.manualFocus ? ['手动重点'] : [];
  if ('milestones' in item) {
    const active = item.status !== '已完成' && item.status !== '挂起';
    const dates = [item.startedAt, item.dueAt, ...item.milestones.filter(m => !m.completedAt).map(m => m.plannedAt)];
    if (active && (dates.some(isThisWeek) || [item.dueAt, ...item.milestones.filter(m => !m.completedAt).map(m => m.plannedAt)].some(date => daysUntil(date) !== null && daysUntil(date)! < 0))) reasons.push('本周节点');
  } else if (item.status !== '已上线' && (isThisWeek(item.targetAt) || (daysUntil(item.targetAt) !== null && daysUntil(item.targetAt)! < 0))) {
    reasons.push('本周节点');
  }
  return reasons;
}

export function dueDate(item: Requirement | Task): string | undefined {
  return 'milestones' in item ? item.dueAt : item.targetAt;
}

export function dueLabel(item: Requirement | Task) {
  if (isComplete(item)) return '已完成';
  if ('milestones' in item && item.status === '挂起') return '已挂起';
  const days = daysUntil(dueDate(item));
  if (days === null) return '未设日期';
  if (days < 0) return `逾期 ${Math.abs(days)} 天`;
  if (days === 0) return '今天到期';
  if (days === 1) return '明天到期';
  return `${days} 天后`;
}

export function dueItems(data: WorkbenchData) {
  const items = [...data.requirements, ...data.tasks].filter(item => !item.archived && !isComplete(item) && (!('milestones' in item) || item.status !== '挂起'));
  return items.filter(item => {
    const dates = 'milestones' in item ? [item.dueAt, ...item.milestones.filter(m => !m.completedAt).map(m => m.plannedAt)] : [item.targetAt];
    return dates.some(date => daysUntil(date) !== null && daysUntil(date)! <= 3);
  }).sort((a, b) => (daysUntil(dueDate(a)) ?? 999) - (daysUntil(dueDate(b)) ?? 999));
}

export function displayName(data: WorkbenchData, id?: string) { return data.people.find(p => p.id === id)?.name || '未分派'; }
export function platformName(data: WorkbenchData, id: string) { return data.platforms.find(p => p.id === id)?.name || '未知平台'; }
export function canEditAll(item: WorkBase, userId?: string, admin = false) { return admin || !!userId && (item.createdBy === userId || item.ownerId === userId); }
export function canContribute(item: WorkBase, userId?: string, admin = false) { return canEditAll(item, userId, admin) || !!userId && item.participantIds.includes(userId); }
