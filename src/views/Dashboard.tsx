import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Pagination, Segmented, Table, Tag, Tooltip } from 'antd';
import type { TableColumnsType } from 'antd';
import { ArrowRightOutlined, CheckSquareOutlined, DatabaseOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useWorkspace } from '../data/workspace';
import { PageHeading, PersonAvatar, PriorityTag, StatusTag } from '../components/ui';
import type { Requirement, Task } from '../types';
import { displayName, dueItems, dueLabel, dueListPageSize, focusedItemsForScope, focusReasons, formatDate, isoWeekNumber, platformName, requirementStatuses, taskStatuses, weekBounds, workCode } from '../utils';
import { getStatusColor } from '../statusColors';

type Work = Requirement | Task;
type MetricItem = { label: string; status: string; value: number; color: string };
const isTask = (item: Work) => 'milestones' in item;
const href = (item: Work) => `${isTask(item) ? '/tasks' : '/requirements'}/${item.id}`;
const point = (radius: number, angle: number) => {
  const radians = (angle - 90) * Math.PI / 180;
  return `${100 + radius * Math.cos(radians)},${100 + radius * Math.sin(radians)}`;
};
const ringPath = (start: number, end: number) => {
  const mid = (start + end) / 2;
  return `M${point(86, start)} A86,86 0 0,1 ${point(86, mid)} A86,86 0 0,1 ${point(86, end)} L${point(59, end)} A59,59 0 0,0 ${point(59, mid)} A59,59 0 0,0 ${point(59, start)} Z`;
};

function FocusMetric({ type, items }: { type: 'requirement' | 'task'; items: MetricItem[] }) {
  const [active, setActive] = useState<string>();
  const navigate = useNavigate();
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const selected = items.find(item => item.status === active);
  const base = type === 'requirement' ? '/requirements' : '/tasks';
  const go = (status?: string) => navigate(`${base}?weekly=yes${status ? `&status=${encodeURIComponent(status)}` : ''}`);
  let cursor = 0;
  const segments = items.filter(item => item.value > 0).map(item => {
    const start = cursor / total * 360;
    cursor += item.value;
    const end = cursor / total * 360;
    const middle = (start + end) / 2 * Math.PI / 180;
    return { ...item, path: ringPath(start, end), offset: `translate(${Math.sin(middle) * 5}px,${-Math.cos(middle) * 5}px)` };
  });
  return <section className={`focus-metric-card ${type}`}>
    <div className="focus-metric-header"><span className="focus-metric-icon">{type === 'requirement' ? <DatabaseOutlined /> : <CheckSquareOutlined />}</span><h2 className="focus-metric-title">重点关注{type === 'requirement' ? '需求' : '任务'}</h2><Button type="link" size="small" className="focus-metric-link" onClick={() => go()}>查看列表 <ArrowRightOutlined /></Button></div>
    <div className="focus-chart-body"><div className="focus-donut interactive-donut">
      <svg viewBox="0 0 200 200" aria-label={`重点关注${type === 'requirement' ? '需求' : '任务'}：${total} 项`} onMouseLeave={() => setActive(undefined)}>
        {!total && <circle cx="100" cy="100" r="72.5" fill="none" stroke="#edf1f6" strokeWidth="27" />}
        {segments.map(item => <path key={item.status} d={item.path} fill={item.color} className={`donut-segment ${active === item.status ? 'is-active' : active ? 'is-muted' : ''}`} style={{ transform: active === item.status ? item.offset : undefined, '--segment-glow': `${item.color}85` } as CSSProperties} tabIndex={0} role="button" aria-label={`${item.label}：${item.value} 项，${Math.round(item.value / total * 100)}%`} onPointerMove={() => setActive(item.status)} onPointerLeave={() => setActive(undefined)} onMouseEnter={() => setActive(item.status)} onFocus={() => setActive(item.status)} onBlur={() => setActive(undefined)} onClick={() => go(item.status)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go(item.status); } }}><title>{item.label}：{item.value} 项（{Math.round(item.value / total * 100)}%）</title></path>)}
      </svg><span aria-live="polite"><strong>{selected?.value ?? total}</strong><small>{selected ? selected.label : '合计事项'}</small>{selected && <small>{total ? Math.round(selected.value / total * 100) : 0}%</small>}</span>
    </div><div className="focus-chart-legend">{items.map(item => <button type="button" key={item.status} className={active === item.status ? 'is-active' : ''} onPointerMove={() => setActive(item.status)} onPointerLeave={() => setActive(undefined)} onMouseEnter={() => setActive(item.status)} onMouseLeave={() => setActive(undefined)} onFocus={() => setActive(item.status)} onBlur={() => setActive(undefined)} onClick={() => go(item.status)} aria-label={`${item.label} ${item.value} 项，查看列表`}><i style={{ background: item.color }} /><em>{item.label}</em><b>{item.value}</b></button>)}</div></div>
  </section>;
}

export default function Dashboard() {
  const { data, user } = useWorkspace();
  const navigate = useNavigate();
  const [scope, setScope] = useState('重点关注');
  const [page, setPage] = useState(1);
  const [duePage, setDuePage] = useState(1);
  const [listHeight, setListHeight] = useState<number | null>(null);
  const listRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const desktop = window.matchMedia('(min-width: 1301px)');
    const measure = () => setListHeight(desktop.matches ? Math.floor(list.getBoundingClientRect().height) : null);
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    desktop.addEventListener('change', measure);
    measure();
    return () => { observer.disconnect(); desktop.removeEventListener('change', measure); };
  }, []);
  const requirements = data.requirements.filter(item => !item.archived);
  const tasks = data.tasks.filter(item => !item.archived);
  const focusedRequirements = requirements.filter(item => focusReasons(item).length);
  const focusedTasks = tasks.filter(item => focusReasons(item).length);
  const visible = focusedItemsForScope(data, scope, user?.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const pageSize = 8;
  const safePage = Math.min(page, Math.max(1, Math.ceil(visible.length / pageSize)));
  const due = dueItems(data);
  const duePageSize = dueListPageSize(listHeight, due.length);
  const safeDuePage = Math.min(duePage, Math.max(1, Math.ceil(due.length / duePageSize)));
  useEffect(() => { setDuePage(1); }, [duePageSize]);
  const { start } = weekBounds();
  const columns: TableColumnsType<Work> = [
    { title: '事项', width: 200, render: (_, item) => <div className="list-title"><strong>{item.title}</strong><small>{workCode(item)} · <PriorityTag priority={item.priority} /></small></div> },
    { title: '类型', width: 66, render: (_, item) => <Tag className={`work-kind-tag ${isTask(item) ? 'task' : ''}`}>{isTask(item) ? '任务' : '需求'}</Tag> },
    { title: '平台', width: 92, render: (_, item) => platformName(data, item.platformId) },
    { title: '状态', width: 88, render: (_, item) => <StatusTag status={item.status} /> },
    { title: '负责人', width: 104, render: (_, item) => <span className="owner-cell"><PersonAvatar person={data.people.find(person => person.id === item.ownerId)} size="small" /><span>{displayName(data, item.ownerId)}</span></span> },
    { title: '截止时间', width: 120, render: (_, item) => formatDate(isTask(item) ? (item as Task).dueAt : (item as Requirement).targetAt) },
  ];
  const selectScope = (value: string) => { setScope(value); setPage(1); };
  return <div className="page dashboard"><PageHeading kicker={`第 ${String(isoWeekNumber()).padStart(2, '0')} 周 · ${start.add(3, 'day').year()}`} title="产品工作台" />
    <div className="focus-metric-grid"><FocusMetric type="requirement" items={requirementStatuses.map(label => ({ label, status: label, value: focusedRequirements.filter(item => item.status === label).length, color: getStatusColor(label) }))} /><FocusMetric type="task" items={taskStatuses.map(status => ({ label: status === '待处理' ? '待开始' : status, status, value: focusedTasks.filter(item => item.status === status).length, color: getStatusColor(status) }))} /></div>
    <div className="dashboard-grid"><section ref={listRef} className="surface focus-surface"><div className="surface-header focus-header"><Segmented value={scope} onChange={value => selectScope(String(value))} options={['重点关注', '我负责的', '我参与的']} /><span className="muted">共 {visible.length} 项</span></div>
      <div className="data-scroll"><Table className="compact-table" tableLayout="fixed" rowKey="id" columns={columns} dataSource={visible.slice((safePage - 1) * pageSize, safePage * pageSize)} pagination={false} scroll={{ x: 670 }} rowClassName="clickable-row" onRow={item => ({ onClick: () => navigate(href(item)) })} locale={{ emptyText: '当前没有符合条件的重点关注事项' }} /></div>
      <div className="focus-mobile-list">{visible.slice((safePage - 1) * pageSize, safePage * pageSize).map(item => <button className="focus-mobile-row" key={item.id} onClick={() => navigate(href(item))}><div><strong>{item.title}</strong><PriorityTag priority={item.priority} /></div><small>{workCode(item)} · {isTask(item) ? '任务' : '需求'} · {platformName(data, item.platformId)}</small><div className="focus-mobile-foot"><StatusTag status={item.status} /></div><div className="focus-mobile-owner"><span>负责人：{displayName(data, item.ownerId)}</span><time>截止时间：{formatDate(isTask(item) ? (item as Task).dueAt : (item as Requirement).targetAt)}</time></div></button>)}{!visible.length && <div className="empty-block">当前没有符合条件的重点关注事项</div>}</div>
      <Pagination className="focus-pagination" current={safePage} pageSize={pageSize} total={visible.length} onChange={setPage} hideOnSinglePage showSizeChanger={false} />
    </section><aside className="dashboard-aside"><section className="surface due-surface" aria-label="临期与逾期事项"><div className="surface-header"><h2>临期与逾期 <span className="muted">{due.length} 项</span></h2><Tooltip title="统计未完成、未归档且未挂起的事项：截止日期已过期，或在今天至未来 3 天内。需求使用目标上线日期，任务使用最终截止日期。"><InfoCircleOutlined className="due-scope-hint" tabIndex={0} aria-label="临期统计口径" /></Tooltip></div><div className="alert-list">{due.slice((safeDuePage - 1) * duePageSize, safeDuePage * duePageSize).map(item => <Link to={href(item)} className="alert-item" key={item.id}><span className={`alert-dot ${dueLabel(item).includes('逾期') ? 'red' : 'amber'}`} /><span><strong>{item.title}</strong><small>{workCode(item)} · 截止 {formatDate(isTask(item) ? (item as Task).dueAt : (item as Requirement).targetAt)}</small></span><em className={dueLabel(item).includes('逾期') ? 'red' : ''}>{dueLabel(item)}</em></Link>)}{!due.length && <div className="empty-block">暂无临期事项</div>}</div>{due.length > duePageSize && <nav className="due-pagination" aria-label="临期与逾期分页"><Pagination size="small" simple={{ readOnly: true }} current={safeDuePage} pageSize={duePageSize} total={due.length} onChange={setDuePage} showSizeChanger={false} /></nav>}</section></aside></div>
  </div>;
}
