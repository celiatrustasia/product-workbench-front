import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { App, Button, Empty, Input, Pagination, Select, Segmented, Table } from 'antd';
import type { TableColumnsType } from 'antd';
import { AppstoreOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useWorkspace } from '../data/workspace';
import WorkForm from '../components/WorkForm';
import { FocusTags, PageHeading, PeopleGroup, PriorityTag, StatusTag } from '../components/ui';
import type { Requirement, Task, WorkKind } from '../types';
import { canEditAll, dueLabel, focusReasons, formatDate, platformName, priorityNames, requirementStatuses, taskStatuses } from '../utils';

type Work = Requirement | Task;
export default function WorkList({ kind }: { kind: WorkKind }) {
  const { data, user, deleteWork } = useWorkspace();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<'表格' | '看板'>('表格');
  const [search, setSearch] = useState(params.get('search') || '');
  const [status, setStatus] = useState(params.get('status') || '');
  const [platform, setPlatform] = useState('');
  const [priority, setPriority] = useState('');
  const [owner, setOwner] = useState('');
  const [focus, setFocus] = useState('');
  const [archive, setArchive] = useState('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Work>();
  const task = kind === 'task';
  const isAdmin = user?.access === '管理员';
  const items = task ? data.tasks : data.requirements;
  const statuses = task ? taskStatuses : requirementStatuses;
  useEffect(() => { setSearch(params.get('search') || ''); setStatus(params.get('status') || ''); if (params.get('new') === '1') { setEditing(undefined); setFormOpen(true); } }, [params]);
  const closeForm = () => { setFormOpen(false); setEditing(undefined); if (params.has('new')) { const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true }); } };
  const create = () => { setEditing(undefined); setFormOpen(true); };
  const edit = (item: Work) => { setEditing(item); setFormOpen(true); };
  const filtered = useMemo(() => items.filter(item => {
    if (archive === 'active' && item.archived || archive === 'archived' && !item.archived) return false;
    if (search && !`${item.title}${item.id}${item.description}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (status && item.status !== status || platform && item.platformId !== platform || priority && item.priority !== priority || owner && item.ownerId !== owner) return false;
    if (focus && !focusReasons(item).includes(focus)) return false;
    return true;
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [items, archive, search, status, platform, priority, owner, focus]);
  const reset = () => { setSearch(''); setStatus(''); setPlatform(''); setPriority(''); setOwner(''); setFocus(''); setArchive('active'); setPage(1); setParams({}); };
  const remove = (item: Work) => {
    const linkedCount = task ? 0 : data.tasks.filter(record => record.requirementId === item.id).length;
    modal.confirm({ title: `确认删除${task ? '任务' : '需求'}“${item.title}”？`, content: linkedCount ? `删除后无法恢复，${linkedCount} 个关联任务将保留，但会解除需求关联。` : '删除后无法恢复，对应通知与操作记录也会一并移除。', okText: '确认删除', okButtonProps: { danger: true }, onOk: () => { deleteWork(kind, item.id); message.success(`${task ? '任务' : '需求'}已删除`); } });
  };
  const columns: TableColumnsType<Work> = [
    { title: task ? '事项' : '需求', dataIndex: 'title', width: 235, render: (_, item) => <div className="list-title"><strong>{item.title}</strong><small>{item.id}{task && (item as Task).requirementId && <span> · 关联需求</span>}</small></div>, sorter: (a, b) => a.title.localeCompare(b.title) },
    { title: '平台', dataIndex: 'platformId', width: 100, render: value => platformName(data, value) },
    { title: '状态', dataIndex: 'status', width: 100, render: value => <StatusTag status={value} /> },
    { title: '优先级', dataIndex: 'priority', width: 80, render: value => <PriorityTag priority={value} />, sorter: (a, b) => a.priority.localeCompare(b.priority) },
    { title: '负责人', dataIndex: 'ownerId', width: 110, render: value => <PeopleGroup ids={value ? [value] : []} data={data} /> },
    { title: task ? '最终截止' : '目标上线', width: 126, render: (_, item) => <span className={dueLabel(item).includes('逾期') ? 'danger-text' : ''}>{formatDate(task ? (item as Task).dueAt : (item as Requirement).targetAt)}<small className="cell-sub">{dueLabel(item)}</small></span> },
    { title: '本周关注', width: 160, render: (_, item) => <FocusTags item={item} /> },
    { title: '操作', width: 146, fixed: 'right', render: (_, item) => <span className="table-actions">{canEditAll(item, user?.id, isAdmin) && <Button size="small" type="link" icon={<EditOutlined />} onClick={event => { event.stopPropagation(); edit(item); }}>编辑</Button>}{isAdmin && <Button size="small" type="link" danger icon={<DeleteOutlined />} onClick={event => { event.stopPropagation(); remove(item); }}>删除</Button>}</span> },
  ];
  const pageSize = 10;
  const boardColumns = statuses.map(current => ({ status: current, items: filtered.filter(item => item.status === current) }));

  return <div className="page work-list-page"><PageHeading title={task ? '任务管理' : '需求池'} description={task ? '跟踪任务状态、分派关系与交付节点。' : '统一收集需求，记录评估、设计、研发到上线的完整过程。'} action={<Button type="primary" icon={<PlusOutlined />} onClick={create}>新建{task ? '任务' : '需求'}</Button>} />
    <div className="list-toolbar"><div className="list-toolbar-left"><Segmented value={view} onChange={value => setView(value as '表格' | '看板')} options={[{ value: '表格', label: <><UnorderedListOutlined /> 表格</> }, { value: '看板', label: <><AppstoreOutlined /> 看板</> }]} /><span className="list-count">共 {filtered.length} 项</span></div><Select className="archive-select" value={archive} onChange={setArchive} options={[{ value: 'active', label: '进行中的数据' }, { value: 'archived', label: '已归档' }]} /></div>
    <div className="filter-bar"><div className="filter-field filter-keyword"><label>关键词</label><Input prefix={<SearchOutlined />} placeholder={`搜索${task ? '任务' : '需求'}名称或编号`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="filter-search" allowClear /></div><div className="filter-field"><label>状态</label><Select value={status || undefined} placeholder="全部" allowClear onChange={value => { setStatus(value || ''); setPage(1); }} options={statuses.map(value => ({ value, label: value }))} /></div><div className="filter-field"><label>平台</label><Select value={platform || undefined} placeholder="全部" allowClear onChange={value => { setPlatform(value || ''); setPage(1); }} options={data.platforms.map(item => ({ value: item.id, label: item.name }))} /></div><div className="filter-field"><label>优先级</label><Select value={priority || undefined} placeholder="全部" allowClear onChange={value => { setPriority(value || ''); setPage(1); }} options={['P1', 'P2', 'P3', 'P4'].map(value => ({ value, label: `${value} · ${priorityNames[value]}` }))} /></div><div className="filter-field"><label>负责人</label><Select value={owner || undefined} placeholder="全部" allowClear onChange={value => { setOwner(value || ''); setPage(1); }} options={data.people.map(item => ({ value: item.id, label: item.name }))} /></div><div className="filter-field"><label>关注</label><Select value={focus || undefined} placeholder="全部" allowClear onChange={value => { setFocus(value || ''); setPage(1); }} options={['手动重点', '本周节点'].map(value => ({ value, label: value }))} /></div><Button className="filter-reset" type="link" onClick={reset}>重置</Button></div>
    {view === '表格' ? <><section className="surface table-surface"><Table className="compact-table" tableLayout="fixed" rowKey="id" columns={columns} dataSource={filtered} pagination={{ pageSize, current: page, onChange: setPage, showSizeChanger: false, hideOnSinglePage: true, placement: ['bottomEnd'] }} onRow={item => ({ onClick: () => navigate(`/${task ? 'tasks' : 'requirements'}/${item.id}`) })} rowClassName="clickable-row" scroll={{ x: 1057 }} locale={{ emptyText: <Empty description="没有找到符合条件的事项" /> }} /></section><div className="mobile-item-list">{filtered.slice((page - 1) * pageSize, page * pageSize).map(item => <button className="mobile-work-item" key={item.id} onClick={() => navigate(`/${task ? 'tasks' : 'requirements'}/${item.id}`)}><div className="mobile-item-top"><span>{item.id}</span><PriorityTag priority={item.priority} /></div><strong>{item.title}</strong><div className="mobile-item-meta"><span>{platformName(data, item.platformId)}</span><StatusTag status={item.status} /><span>{formatDate(task ? (item as Task).dueAt : (item as Requirement).targetAt)}</span></div><div className="mobile-item-foot"><FocusTags item={item} /><PeopleGroup ids={item.ownerId ? [item.ownerId] : []} data={data} /></div></button>)}{filtered.length === 0 && <Empty description="没有找到符合条件的事项" />}<Pagination current={page} pageSize={pageSize} total={filtered.length} onChange={setPage} hideOnSinglePage /></div></> : <div className="kanban-board">{boardColumns.map(col => <section className="kanban-column" key={col.status}><div className="kanban-column-head"><span><StatusTag status={col.status} /></span><em>{col.items.length}</em></div><div className="kanban-cards">{col.items.map(item => <button key={item.id} className="kanban-card" onClick={() => navigate(`/${task ? 'tasks' : 'requirements'}/${item.id}`)}><div className="kanban-card-top"><span>{item.id}</span><PriorityTag priority={item.priority} /></div><strong>{item.title}</strong><small>{platformName(data, item.platformId)} · {dueLabel(item)}</small><div className="kanban-card-foot"><FocusTags item={item} /><PeopleGroup ids={item.ownerId ? [item.ownerId] : []} data={data} /></div></button>)}{col.items.length === 0 && <div className="kanban-empty">暂无事项</div>}</div></section>)}</div>}
    <WorkForm kind={kind} open={formOpen} initial={editing} onClose={closeForm} onSaved={id => { if (!editing) navigate(`/${task ? 'tasks' : 'requirements'}/${id}`); }} />
  </div>;
}
