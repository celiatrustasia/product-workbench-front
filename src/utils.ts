import dayjs from 'dayjs';
import type { Notice, Requirement, Task, WorkBase, WorkbenchData } from './types';

export const requirementStatuses = ['待评估', '设计中', '研发中', '测试中', '已上线'] as const;
export const taskStatuses = ['待处理', '进行中', '阻塞', '已完成', '挂起'] as const;
export const priorities = ['P1', 'P2', 'P3', 'P4'] as const;
export const priorityNames: Record<string, string> = { P1: '重要紧急', P2: '重要不紧急', P3: '不重要紧急', P4: '不重要不紧急' };

export const formatDate = (date?: string, withTime = false) => date ? dayjs(date).format(withTime ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD') : '—';
export const workCode = (item: WorkBase) => item.code || item.id;
export function compareWorkDefault(a: Requirement | Task, b: Requirement | Task) {
  const number = (item: WorkBase) => Number(/^[RT](\d+)$/.exec(workCode(item))?.[1] || 0);
  const stages: Record<string, number> = { 待评估: 0, 待处理: 0, 设计中: 1, 进行中: 1, 研发中: 2, 阻塞: 2, 测试中: 3, 挂起: 3, 已上线: 4, 已完成: 4 };
  return number(b) - number(a) || a.priority.localeCompare(b.priority)
    || (stages[a.status] ?? 99) - (stages[b.status] ?? 99)
    || Number(Boolean(focusReasons(b).length)) - Number(Boolean(focusReasons(a).length))
    || a.id.localeCompare(b.id);
}
export const formatLongDate = (date?: string) => date ? dayjs(date).format('YYYY年M月D日') : '—';
export const daysUntil = (date?: string) => date ? dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day') : null;

export function dueListPageSize(listHeight: number | null, total: number) {
  if (listHeight === null) return 8;
  // Match the due panel header, row and pagination dimensions in styles.css.
  const chromeHeight = 65;
  const rowHeight = 64;
  const paginationHeight = 46;
  const capacity = Math.max(1, Math.floor((listHeight - chromeHeight) / rowHeight));
  return total <= capacity ? capacity : Math.max(1, Math.floor((listHeight - chromeHeight - paginationHeight) / rowHeight));
}

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
  return !item.archived && item.manualFocus ? ['手动重点'] : [];
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

export function dateCellHint(item: Requirement | Task) {
  return dueDate(item) && !isComplete(item) ? dueLabel(item) : undefined;
}

export function dueItems(data: WorkbenchData) {
  const items = [...data.requirements, ...data.tasks].filter(item => !item.archived && !isComplete(item) && (!('milestones' in item) || item.status !== '挂起'));
  return items.filter(item => {
    const days = daysUntil(dueDate(item));
    return days !== null && days <= 3;
  }).sort((a, b) => (daysUntil(dueDate(a)) ?? 999) - (daysUntil(dueDate(b)) ?? 999));
}

export function focusedItemsForScope(data: WorkbenchData, scope: string, userId?: string) {
  return [...data.requirements, ...data.tasks].filter(item => {
    if (!focusReasons(item).length) return false;
    if (scope === '我负责的') return Boolean(userId) && item.ownerId === userId;
    if (scope === '我参与的') return Boolean(userId) && item.participantIds.includes(userId!);
    return true;
  });
}

export function displayName(data: WorkbenchData, id?: string) { return data.people.find(p => p.id === id)?.name || '未分派'; }
export function platformName(data: WorkbenchData, id: string) { return data.platforms.find(p => p.id === id)?.name || '未知平台'; }
export function canEditAll(item: WorkBase, userId?: string, admin = false) { return admin || !!userId && (item.createdBy === userId || item.ownerId === userId); }
export function canContribute(item: WorkBase, userId?: string, admin = false) { return canEditAll(item, userId, admin) || !!userId && item.participantIds.includes(userId); }
