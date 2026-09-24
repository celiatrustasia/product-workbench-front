import { Tag, Tooltip } from 'antd';
import type { ReactNode } from 'react';
import type { Person, Priority, Requirement, Task, WorkbenchData } from '../types';
import { focusReasons, priorities, priorityNames } from '../utils';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>{!compact && <span className="brand-copy"><strong>产品工作台</strong></span>}</div>;
}

export function PersonAvatar({ person, size = 'normal' }: { person?: Person; size?: 'normal' | 'small' }) {
  return <Tooltip title={person?.name || '未分派'}><span className={`person-avatar ${person?.color || 'gray'} ${size}`}>{person?.name === 'Celia Wang' ? 'CW' : person?.name?.slice(0, 2) || '?'}</span></Tooltip>;
}

export function PeopleGroup({ ids, data }: { ids: string[]; data: WorkbenchData }) {
  return <span className="avatar-group">{ids.filter(Boolean).slice(0, 4).map(id => <PersonAvatar key={id} person={data.people.find(p => p.id === id)} size="small" />)}{ids.length > 4 && <span className="more-people">+{ids.length - 4}</span>}</span>;
}

export function StatusTag({ status }: { status: string }) {
  const tone = status === '阻塞' ? 'red' : status === '挂起' ? 'gray' : ['已完成', '已上线', '进行中'].includes(status) ? 'green' : ['设计中', '待处理', '待评估'].includes(status) ? 'amber' : status === '测试中' ? 'violet' : 'blue';
  return <Tag className={`status-tag ${tone}`}><span className="status-dot" />{status}</Tag>;
}

export function PriorityTag({ priority }: { priority: Priority }) {
  const tone = priority === 'P1' ? 'red' : priority === 'P2' ? 'amber' : priority === 'P3' ? 'blue' : 'gray';
  return <Tooltip title={priorityNames[priority]}><Tag className={`priority-tag ${tone}`}>{priority}</Tag></Tooltip>;
}

export function FocusTags({ item }: { item: Requirement | Task }) {
  return <span className="tag-row">{focusReasons(item).map(reason => <Tag key={reason} className={`focus-tag ${reason === '手动重点' ? 'amber' : 'blue'}`}>{reason}</Tag>)}</span>;
}

export function PageHeading({ kicker, title, description, action }: { kicker?: string; title: string; description?: string; action?: ReactNode }) {
  return <div className="page-heading"><div>{kicker && <div className="eyebrow">{kicker}</div>}<h1>{title}</h1>{description && <p>{description}</p>}</div><div className="page-action">{action}</div></div>;
}

export function StatStrip({ items }: { items: { label: string; value: number; note?: string; tone?: string; onClick?: () => void }[] }) {
  return <div className="stat-strip">{items.map(item => <button type="button" className="stat-cell" key={item.label} onClick={item.onClick}><div className="stat-top"><span>{item.label}</span>{item.note && <span className={`stat-note ${item.tone || ''}`}>{item.note}</span>}</div><div className={`stat-value ${item.tone || ''}`}>{item.value}<small>项</small></div></button>)}</div>;
}

export const priorityOptions = priorities.map(value => ({ value, label: `${value} · ${priorityNames[value]}` }));
