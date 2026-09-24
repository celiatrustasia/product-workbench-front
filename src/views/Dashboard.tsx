import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Segmented } from 'antd';
import { ArrowRightOutlined, CheckSquareOutlined, DatabaseOutlined } from '@ant-design/icons';
import { useWorkspace } from '../data/workspace';
import { FocusTags, PageHeading, PeopleGroup, PriorityTag, StatusTag } from '../components/ui';
import type { Requirement, Task } from '../types';
import { dueItems, dueLabel, focusReasons, formatDate, isoWeekNumber, platformName, requirementStatuses, taskStatuses, weekBounds } from '../utils';

const href = (item: Requirement | Task) => `${'milestones' in item ? '/tasks' : '/requirements'}/${item.id}`;

type MetricItem = { label: string; value: number; color: string };

function donutBackground(items: MetricItem[], total: number) {
  if (!total) return '#edf1f6';
  let cursor = 0;
  return `conic-gradient(${items.filter(item => item.value > 0).map(item => {
    const start = cursor / total * 360;
    cursor += item.value;
    return `${item.color} ${start}deg ${cursor / total * 360}deg`;
  }).join(', ')})`;
}

function FocusMetric({ type, total, items, onClick }: { type: 'requirement' | 'task'; total: number; items: MetricItem[]; onClick: () => void }) {
  const requirement = type === 'requirement';
  const chartLabel = items.map(item => `${item.label} ${item.value} 项`).join('，');
  return <button type="button" className={`focus-metric-card ${type}`} onClick={onClick}><div className="focus-metric-header"><span className="focus-metric-icon">{requirement ? <DatabaseOutlined /> : <CheckSquareOutlined />}</span><strong className="focus-metric-title">本周重点关注{requirement ? '需求' : '任务'}</strong><span className="focus-metric-link">查看列表 <ArrowRightOutlined /></span></div><div className="focus-chart-body"><div className="focus-donut" style={{ background: donutBackground(items, total) }} role="img" aria-label={chartLabel}><span><strong>{total}</strong><small>合计事项</small></span></div><div className="focus-chart-legend">{items.map(item => <span key={item.label}><i style={{ background: item.color }} /><em>{item.label}</em><b>{item.value}</b></span>)}</div></div></button>;
}

export default function Dashboard() {
  const { data, user } = useWorkspace();
  const navigate = useNavigate();
  const [scope, setScope] = useState('本周重点');
  const requirements = data.requirements.filter(item => !item.archived);
  const tasks = data.tasks.filter(item => !item.archived);
  const all = [...requirements, ...tasks];
  const focused = all.filter(item => focusReasons(item).length);
  const focusedRequirements = requirements.filter(item => focusReasons(item).length);
  const focusedTasks = tasks.filter(item => focusReasons(item).length);
  const visible = scope === '本周重点' ? focused : scope === '我负责的' ? all.filter(item => item.ownerId === user?.id) : all.filter(item => item.participantIds.includes(user!.id));
  const due = dueItems(data).slice(0, 4);
  const { start, end } = weekBounds();

  const requirementColors = ['#d69a38', '#8a6fc6', '#3f73dc', '#3c93ba', '#2d9b78'];
  const taskColors = ['#7898d2', '#2d9b78', '#d55461', '#3f73dc', '#98a2b3'];
  return <div className="page dashboard"><PageHeading kicker={`第 ${String(isoWeekNumber()).padStart(2, '0')} 周 · ${start.add(3, 'day').year()}`} title="团队工作台" description="聚焦本周关键交付，及时处理临期与阻塞事项。" />
    <div className="focus-metric-grid"><FocusMetric type="requirement" total={focusedRequirements.length} onClick={() => navigate('/requirements')} items={requirementStatuses.map((label, index) => ({
      label,
      value: focusedRequirements.filter(item => item.status === label).length,
      color: requirementColors[index],
    }))} /><FocusMetric type="task" total={focusedTasks.length} onClick={() => navigate('/tasks')} items={taskStatuses.map((label, index) => ({
      label: label === '待处理' ? '待开始' : label,
      value: focusedTasks.filter(item => item.status === label).length,
      color: taskColors[index],
    }))} /></div>
    <div className="dashboard-grid"><section className="surface focus-surface"><div className="surface-header focus-header"><Segmented value={scope} onChange={value => setScope(String(value))} options={['本周重点', '我负责的', '我参与的']} /><Link to="/tasks" className="section-link">查看全部 <ArrowRightOutlined /></Link></div><div className="data-scroll"><table className="focus-table"><thead><tr><th>事项</th><th>平台</th><th>状态</th><th>关注原因</th><th>负责人 / 时间</th></tr></thead><tbody>{visible.slice(0, 8).map(item => <tr key={item.id} onClick={() => navigate(href(item))}><td><strong>{item.title}</strong><small>{item.id} · <PriorityTag priority={item.priority} /></small></td><td>{platformName(data, item.platformId)}</td><td><StatusTag status={item.status} /></td><td><FocusTags item={item} /></td><td><PeopleGroup ids={[item.ownerId || '', ...item.participantIds]} data={data} /><small>{formatDate('milestones' in item ? item.dueAt : item.targetAt)}</small></td></tr>)}</tbody></table>{visible.length === 0 && <div className="empty-block">当前没有符合条件的事项</div>}</div><div className="focus-mobile-list">{visible.slice(0, 8).map(item => <button className="focus-mobile-row" key={item.id} onClick={() => navigate(href(item))}><div><strong>{item.title}</strong><PriorityTag priority={item.priority} /></div><small>{item.id} · {platformName(data, item.platformId)}</small><div className="focus-mobile-foot"><StatusTag status={item.status} /><FocusTags item={item} /><span>{formatDate('milestones' in item ? item.dueAt : item.targetAt)}</span></div></button>)}{visible.length === 0 && <div className="empty-block">当前没有符合条件的事项</div>}</div></section>
      <div className="dashboard-aside"><section className="surface"><div className="surface-header"><h2>临期与逾期</h2><Link to="/tasks" className="section-link">查看 {dueItems(data).length} 项 <ArrowRightOutlined /></Link></div><div className="alert-list">{due.map(item => <Link to={href(item)} className="alert-item" key={item.id}><span className={`alert-dot ${(dueLabel(item).includes('逾期')) ? 'red' : 'amber'}`} /><span><strong>{item.title}</strong><small>{item.id} · {'milestones' in item ? '最终截止' : '目标上线'}</small></span><em className={dueLabel(item).includes('逾期') ? 'red' : ''}>{dueLabel(item)}</em></Link>)}{due.length === 0 && <div className="empty-block">暂无临期事项</div>}</div></section><section className="surface"><div className="surface-header"><h2>本周交付</h2><span className="week-label">{start.format('M/D')} - {end.subtract(1, 'day').format('M/D')}</span></div><div className="delivery-stats"><div><span>重点需求</span><strong>{requirements.filter(r => focusReasons(r).length).length}</strong><i className="blue" /></div><div><span>重点任务</span><strong>{tasks.filter(t => focusReasons(t).length).length}</strong><i className="green" /></div><div><span>已完成任务</span><strong>{tasks.filter(t => t.status === '已完成').length}</strong><i className="violet" /></div></div></section></div></div>
  </div>;
}
