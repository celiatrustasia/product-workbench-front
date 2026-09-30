import type { WorkBase, WorkbenchData, WorkKind } from '../types';

export const makeWorkCode = (kind: WorkKind, number: number) => `${kind === 'requirement' ? 'R' : 'T'}${String(number).padStart(5, '0')}`;

// Display numbers can change without breaking stored task links, notices, or URLs.
export function migrateWorkCodes(data: WorkbenchData): WorkbenchData {
  const nextNumbers = { requirement: 1, task: 1, ...data.nextNumbers };
  const migrate = <T extends WorkBase>(kind: WorkKind, items: T[]): T[] => {
    const pattern = kind === 'requirement' ? /^R\d{5,}$/ : /^T\d{5,}$/;
    nextNumbers[kind] = Math.max(nextNumbers[kind], 1, ...items.map(item => item.code && pattern.test(item.code) ? Number(item.code.slice(1)) + 1 : 1));
    const seen = new Set<string>();
    return items.map(item => {
      let code = item.code;
      if (!code || !pattern.test(code) || seen.has(code)) code = makeWorkCode(kind, nextNumbers[kind]++);
      seen.add(code);
      return { ...item, code };
    });
  };
  const requirements = migrate('requirement', data.requirements);
  const tasks = migrate('task', data.tasks);
  return { ...data, requirements, tasks, nextNumbers };
}

export function reorderItems<T extends { id: string; sort: number }>(items: T[], orderedIds: string[]): T[] {
  const byId = new Map(items.map(item => [item.id, item]));
  const ids = [...new Set([...orderedIds, ...items.map(item => item.id)])];
  return ids.flatMap(id => byId.has(id) ? [byId.get(id)!] : []).map((item, index) => ({ ...item, sort: index + 1 }));
}
