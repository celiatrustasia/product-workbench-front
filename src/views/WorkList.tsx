import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Empty, Input, Pagination, Select, Segmented, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { AppstoreOutlined, DeleteOutlined, DownOutlined, EditOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined, UpOutlined } from '@ant-design/icons';
import { useWorkspace } from '../data/workspace';
import WorkForm from '../components/WorkForm';
import WeeklyFocusSwitch from '../components/WeeklyFocusSwitch';
import { FocusTags, PageHeading, PeopleGroup, PriorityTag, StatusTag } from '../components/ui';
import type { Requirement, Task, WorkKind } from '../types';
import { canEditAll, dueLabel, focusReasons, formatDate, platformName, priorityNames, requirementStatuses, taskStatuses, workCode } from '../utils';

type Work = Requirement | Task;
export default function WorkList({ kind }: { kind: WorkKind }) {
  const { data, user, deleteWork } = useWorkspace();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'表格' | '看板'>('表格');
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState<string[]>(params.getAll('status'));
  const [platform, setPlatform] = useState('');
  const [priority, setPriority] = useState('');
  const [owner, setOwner] = useState('');
  const [participant, setParticipant] = useState('');
  const [requirement, setRequirement] = useState(params.get('requirement') || '');
  const [moreFilters, setMoreFilters] = useState(Boolean(params.get('requirement')));
  const [focus, setFocus] = useState('');
  const [weekly, setWeekly] = useState(params.get('weekly') || '');
  const [archive, setArchive] = useState('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Work>();
  const task = kind === 'task';
  const isAdmin = user?.access === '管理员';
  const items = task ? data.tasks : data.requirements;
  const statuses = task ? taskStatuses : requirementStatuses;
  useEffect(() => { setSearch(params.get('search') || ''); setStatus(params.getAll('status')); setWeekly(params.get('weekly') || ''); setRequirement(params.get('requirement') || ''); if (params.get('requirement')) setMoreFilters(true); setPage(1); if (params.get('new') === '1') { setEditing(undefined); setFormOpen(true); } }, [params]);
  const closeForm = () => { setFormOpen(false); setEditing(undefined); if (params.has('new')) { const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true }); } };
  const create = () => { setEditing(undefined); setFormOpen(true); };
  const edit = (item: Work) => { setEditing(item); setFormOpen(true); };
  const filtered = useMemo(() => items.filter(item => {
    if (archive === 'active' && item.archived || archive === 'archived' && !item.archived) return false;
    if (search && !`${item.title}${workCode(item)}${item.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (status.length && !status.includes(item.status) || platform && item.platformId !== platform || priority && item.priority !== priority || owner && item.ownerId !== owner) return false;
    if (participant && !item.participantIds.includes(participant)) return false;
    if (task && requirement && (item as Task).requirementId !== requirement) return false;
    if (focus && !focusReasons(item).includes(focus)) return false;
    if (weekly && (focusReasons(item).length > 0) !== (weekly === 'yes')) return false;
    return true;
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items, archive, search, status, platform, priority, owner, participant, focus, weekly, task, requirement]);
  const reset = () => { setSearch(''); setStatus([]); setPlatform(''); setPriority(''); setOwner(''); setParticipant(''); setRequirement(''); setFocus(''); setWeekly(''); setArchive('active'); setPage(1); setParams({}); };
  const advancedCount = Number(Boolean(priority)) + Number(Boolean(focus)) + Number(task && Boolean(requirement));
  const peopleOptions = data.people.map(item => ({ value: item.id, label: item.name }));
  const linkedTasks = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of data.tasks) if (record.requirementId && !record.archived) counts.set(record.requirementId, (counts.get(record.requirementId) || 0) + 1);
    return counts;
  }, [data.tasks]);
  const relatedCount = (item: Work) => task ? Number(data.requirements.some(record => record.id === (item as Task).requirementId)) : linkedTasks.get(item.id) || 0;
  const relatedLink = (item: Work) => {
    const count = relatedCount(item);
    return <Button className="related-count-link" type="link" size="small" disabled={task && !count} aria-label={`查看${item.title}的${count}个关联${task ? '需求' : '任务'}`} onClick={event => {
      event.stopPropagation();
      navigate(task ? `/requirements/${(item as Task).requirementId}` : `/tasks?requirement=${encodeURIComponent(item.id)}`);
    }}>{count}</Button>;
  };
  const remove = (item: Work) => {
    const linkedCount = task ? 0 : data.tasks.filter(record => record.requirementId === item.id).length;
    modal.confirm({ title: `确认删除${task ? '任务' : '需求'}“${item.title}”？`, content: linkedCount ? `删除后无法恢复，${linkedCount} 个关联任务将保留，但会解除需求关联。` : '删除后从列表移除，操作记录在服务端保留。', okText: '确认删除', okButtonProps: { danger: true }, onOk: async () => { await deleteWork(kind, item.id); message.success(`${task ? '任务' : '需求'}已删除`); } });
  };
  const columns: TableColumnsType<Work> = [
    { title: task ? '事项' : '需求', dataIndex: 'title', width: 210, render: (_, item) => <div className="list-title"><strong>{item.title}</strong><small>{workCode(item)}{task && (item as Task).requirementId && <span> · 关联需求</span>}</small></div>, sorter: (a, b) => a.title.localeCompare(b.title) },
    { title: '平台', dataIndex: 'platformId', width: 100, render: value => platformName(data, value) },
    { title: '状态', dataIndex: 'status', width: 100, render: value => <StatusTag status={value} /> },
    { title: '优先级', dataIndex: 'priority', width: 80, render: value => <PriorityTag priority={value} />, sorter: (a, b) => a.priority.localeCompare(b.priority) },
    { title: '负责人', dataIndex: 'ownerId', width: 110, render: value => <PeopleGroup ids={value ? [value] : []} data={data} /> },
    { title: '参与人', dataIndex: 'participantIds', width: 112, render: (ids: string[]) => ids.length ? <PeopleGroup ids={ids} data={data} /> : <span className="muted">—</span> },
    { title: task ? '最终截止时间' : '目标上线时间', width: 132, render: (_, item) => <span className={dueLabel(item).includes('逾期') ? 'danger-text' : ''}>{formatDate(task ? (item as Task).dueAt : (item as Requirement).targetAt)}<small className="cell-sub">{dueLabel(item)}</small></span> },
    { title: task ? '关联需求数' : '关联任务数', width: 100, align: 'center', fixed: 'right', render: (_, item) => relatedLink(item) },
    { title: '重点关注', width: 124, fixed: 'right', render: (_, item) => <WeeklyFocusSwitch kind={kind} item={item} /> },
    { title: '操作', width: 146, fixed: 'right', render: (_, item) => <span className="table-actions">{canEditAll(item, user?.id, isAdmin) && <Button size="small" type="link" icon={<EditOutlined />} onClick={event => { event.stopPropagation(); edit(item); }}>编辑</Button>}{isAdmin && <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={event => { event.stopPropagation(); remove(item); }}>删除</Button>}</span> },
  ];
  const pageSize = 10;
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const boardColumns = statuses.map(current => ({ status: current, items: filtered.filter(item => item.status === current) }));

  return <div className="page work-list-page"><PageHeading title={task ? '任务管理' : '需求池'} action={<Button type="primary" icon={<PlusOutlined />} onClick={create}>新建{task ? '任务' : '需求'}</Button>} />
    <div className="list-toolbar"><div className="list-toolbar-left"><Segmented value={view} onChange={value => setView(value as '表格' | '看板')} options={[{ value: '表格', label: <><UnorderedListOutlined /> 表格</> }, { value: '看板', label: <><AppstoreOutlined /> 看板</> }]} /><span className="list-count">共 {filtered.length} 项</span></div>{(archive === 'archived' || items.some(item => item.archived)) && <Button type="link" onClick={() => { setArchive(archive === 'active' ? 'archived' : 'active'); setPage(1); }}>{archive === 'archived' ? '返回正常列表' : `已归档（${items.filter(item => item.archived).length}）`}</Button>}</div>
    <div className="filter-bar">
      <div className="filter-field filter-keyword"><label htmlFor="filter-keyword">关键词</label><Input id="filter-keyword" prefix={<SearchOutlined />} placeholder={`搜索${task ? '任务' : '需求'}名称或编号`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="filter-search" allowClear /></div>
      <div className="filter-field"><label htmlFor="filter-status">状态</label><Select id="filter-status" mode="multiple" maxTagCount={0} maxTagPlaceholder={() => status.length === 1 ? status[0] : `已选 ${status.length} 项`} value={status} placeholder="全部" allowClear onChange={value => { setStatus(value); setPage(1); }} options={statuses.map(value => ({ value, label: value }))} /></div>
      <div className="filter-field"><label htmlFor="filter-platform">平台</label><Select id="filter-platform" value={platform || undefined} placeholder="全部" allowClear onChange={value => { setPlatform(value || ''); setPage(1); }} options={[...data.platforms].sort((a, b) => a.sort - b.sort).map(item => ({ value: item.id, label: item.name }))} /></div>
      <div className="filter-field"><label htmlFor="filter-owner">负责人</label><Select id="filter-owner" value={owner || undefined} placeholder="全部" allowClear showSearch={{ optionFilterProp: 'label' }} onChange={value => { setOwner(value || ''); setPage(1); }} options={peopleOptions} /></div>
      <div className="filter-field"><label htmlFor="filter-participant">参与人</label><Select id="filter-participant" value={participant || undefined} placeholder="全部" allowClear showSearch={{ optionFilterProp: 'label' }} onChange={value => { setParticipant(value || ''); setPage(1); }} options={peopleOptions} /></div>
      <div className="filter-field"><label htmlFor="filter-weekly">重点关注</label><Select id="filter-weekly" value={weekly || undefined} placeholder="全部" allowClear onChange={value => { setWeekly(value || ''); setPage(1); }} options={[{ value: 'yes', label: '是' }, { value: 'no', label: '否' }]} /></div>
      <div className="filter-actions"><Button type="text" className={advancedCount ? 'filters-active' : ''} icon={moreFilters ? <UpOutlined /> : <DownOutlined />} aria-expanded={moreFilters} aria-controls="advanced-filters" onClick={() => setMoreFilters(value => !value)}>{moreFilters ? '收起筛选' : '更多筛选'}{advancedCount > 0 && `（${advancedCount}）`}</Button><Button className="filter-reset" type="link" onClick={reset}>重置</Button></div>
      {moreFilters && <div className="filter-advanced" id="advanced-filters">
        <div className="filter-field"><label htmlFor="filter-priority">优先级</label><Select id="filter-priority" value={priority || undefined} placeholder="全部" allowClear onChange={value => { setPriority(value || ''); setPage(1); }} options={['P1', 'P2', 'P3', 'P4'].map(value => ({ value, label: `${value} · ${priorityNames[value]}` }))} /></div>
        <div className="filter-field"><label htmlFor="filter-focus">关注来源</label><Select id="filter-focus" value={focus || undefined} placeholder="全部" allowClear onChange={value => { setFocus(value || ''); setPage(1); }} options={[{ value: '手动重点', label: '手动重点' }, { value: '本周节点', label: '时间节点' }]} /></div>
        {task && <div className="filter-field"><label htmlFor="filter-requirement">关联需求</label><Select id="filter-requirement" value={requirement || undefined} placeholder="全部" allowClear showSearch={{ optionFilterProp: 'label' }} onChange={value => { setRequirement(value || ''); setPage(1); }} options={data.requirements.map(item => ({ value: item.id, label: `${workCode(item)} · ${item.title}${item.archived ? '（已归档）' : ''}` }))} /></div>}
      </div>}
    </div>
    {view === '表格' ? <><section className="surface table-surface"><Table className="compact-table" tableLayout="fixed" rowKey="id" columns={columns} dataSource={filtered} pagination={{ pageSize, current: safePage, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true, placement: ['bottomEnd'] }} onRow={item => ({ onClick: () => navigate(`/${task ? 'tasks' : 'requirements'}/${item.id}`) })} rowClassName="clickable-row" scroll={{ x: 1214 }} locale={{ emptyText: <Empty description="没有找到符合条件的事项" /> }} /></section><div className="mobile-item-list">{filtered.slice((safePage - 1) * pageSize, safePage * pageSize).map(item => <article className="mobile-work-item" key={item.id}><button className="mobile-work-item-link" onClick={() => navigate(`/${task ? 'tasks' : 'requirements'}/${item.id}`)}><div className="mobile-item-top"><span>{workCode(item)}</span><PriorityTag priority={item.priority} /></div><strong>{item.title}</strong><div className="mobile-item-meta"><span>{platformName(data, item.platformId)}</span><StatusTag status={item.status} /><span>{formatDate(task ? (item as Task).dueAt : (item as Requirement).targetAt)}</span></div></button><div className="mobile-item-people"><span>负责人 <PeopleGroup ids={item.ownerId ? [item.ownerId] : []} data={data} /></span><span>参与人 {item.participantIds.length ? <PeopleGroup ids={item.participantIds} data={data} /> : '—'}</span></div><div className="mobile-item-foot"><span className="mobile-related-count">关联{task ? '需求' : '任务'}数 {relatedLink(item)}</span><WeeklyFocusSwitch kind={kind} item={item} /></div></article>)}{filtered.length === 0 && <Empty description="没有找到符合条件的事项" />}<Pagination current={safePage} pageSize={pageSize} total={filtered.length} onChange={setPage} hideOnSinglePage /></div></> : <div className="kanban-board">{boardColumns.map(col => <section className="kanban-column" key={col.status}><div className="kanban-column-head"><span><StatusTag status={col.status} /></span><em>{col.items.length}</em></div><div className="kanban-cards">{col.items.map(item => <button key={item.id} className="kanban-card" onClick={() => navigate(`/${task ? 'tasks' : 'requirements'}/${item.id}`)}><div className="kanban-card-top"><span>{workCode(item)}</span><PriorityTag priority={item.priority} /></div><strong>{item.title}</strong><small>{platformName(data, item.platformId)} · {dueLabel(item)}</small><div className="kanban-card-foot"><FocusTags item={item} /><PeopleGroup ids={item.ownerId ? [item.ownerId] : []} data={data} /></div></button>)}{col.items.length === 0 && <div className="kanban-empty">暂无事项</div>}</div></section>)}</div>}
    <WorkForm kind={kind} open={formOpen} initial={editing} onClose={closeForm} onSaved={id => { if (!editing) navigate(`/${task ? 'tasks' : 'requirements'}/${id}`); }} />
  </div>;
}
