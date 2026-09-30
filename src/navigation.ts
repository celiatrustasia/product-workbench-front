export const primaryNavigation = [
  { key: '/', label: '工作台' },
  { key: '/requirements', label: '需求池' },
  { key: '/tasks', label: '任务管理' },
  { key: '/notifications', label: '通知中心' },
] as const;

export const managementParent = { key: '/management', label: '基础管理' };
export const managementNavigation = [
  { key: '/platforms', label: '平台管理' },
  { key: '/people', label: '人员管理' },
  { key: '/dictionaries', label: '字典设置' },
] as const;

interface BreadcrumbItem {
  title: string;
  path?: string;
}

export function getBreadcrumbItems(pathname: string, detailTitle?: string): BreadcrumbItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const selected = '/' + (segments[0] || '');
  const management = managementNavigation.find(item => item.key === selected);
  if (management) return [{ title: managementParent.label }, { title: management.label }];

  const primary = primaryNavigation.find(item => item.key === selected);
  if (!primary) return [{ title: '页面未找到' }];
  if (segments.length > 1 && (selected === '/requirements' || selected === '/tasks')) {
    return [
      { title: primary.label, path: primary.key },
      { title: detailTitle || (selected === '/requirements' ? '需求详情' : '任务详情') },
    ];
  }
  return [{ title: primary.label }];
}
