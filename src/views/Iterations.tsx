import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, Button, DatePicker, Drawer, Empty, Form, Input, Modal, Progress, Segmented, Select, Space, Table, Tag } from 'antd';
import { ArrowLeftOutlined, CalendarOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { TableColumnsType } from 'antd';
import dayjs from 'dayjs';
import { useWorkspace } from '../data/workspace';
import { PageHeading, PeopleGroup, PriorityTag, StatusTag } from '../components/ui';
import type { Iteration, IterationStatus, Requirement, Task, WorkKind } from '../types';
import { canEditAll, formatDate, platformName, workCode } from '../utils';

type Item = (Requirement | Task) & { kind: WorkKind };
const statusColor = { '待开始': 'default', '进行中': 'blue', '已完成': 'green' };
const done = (item: Item) => item.status === '已上线' || item.status === '已完成';

export default function Iterations() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, user, isVisitor, saveIteration, deleteIteration, changeIterationMembers } = useWorkspace();
  const { message, modal } = App.useApp();
  const [filter, setFilter] = useState('全部');
  const [search, setSearch] = useState('');
  const [itemType, setItemType] = useState('全部');
  const [selected, setSelected] = useState<React.Key[]>([]);
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<Iteration>();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<'add' | 'move'>();
  const [pickerSearch, setPickerSearch] = useState('');
  const [picked, setPicked] = useState<React.Key[]>([]);
  const [destination, setDestination] = useState<string>();
  useEffect(() => { setSelected([]); setSearch(''); setItemType('全部'); setPicker(undefined); }, [id]);
  const iterations = data.iterations || [];
  const current = iterations.find(item => item.id === id);
  const items = useMemo<Item[]>(() => [
    ...data.requirements.map(item => ({ ...item, kind: 'requirement' as const })),
    ...data.tasks.map(item => ({ ...item, kind: 'task' as const })),
  ], [data.requirements, data.tasks]);
  const manageable = (item: Iteration) => !isVisitor && (user?.access === '管理员' || item.ownerId === user?.id || item.createdBy === user?.id);
  const editable = (item: Item) => !isVisitor && !item.archived && canEditAll(item, user?.id, user?.access === '管理员');
  const members = items.filter(item => item.iterationId === id && !item.archived);
  const visible = members.filter(item => (itemType === '全部' || item.kind === (itemType === '需求' ? 'requirement' : 'task')) && `${workCode(item)} ${item.title}`.toLowerCase().includes(search.toLowerCase()));
  const candidates = items.filter(item => editable(item) && item.iterationId !== id && (!item.iterationId || iterations.some(iteration => iteration.id === item.iterationId && iteration.status !== '已完成' && manageable(iteration))) && `${workCode(item)} ${item.title}`.toLowerCase().includes(pickerSearch.toLowerCase()));
  const counts = (records: Item[]) => ({ total: records.length, completed: records.filter(done).length, requirements: records.filter(item => item.kind === 'requirement').length, tasks: records.filter(item => item.kind === 'task').length });
  const stats = counts(members);
  const percent = stats.total ? Math.round(stats.completed / stats.total * 100) : 0;
  const selectedMembers = members.filter(item => selected.includes(item.id) && editable(item));
  const mutable = current && manageable(current) && current.status !== '已完成';

  const edit = (item?: Iteration) => {
    setEditing(item); form.resetFields();
    form.setFieldsValue(item ? { ...item, dates: [dayjs(item.startDate), dayjs(item.endDate)] } : { ownerId: user?.id, dates: [dayjs(), dayjs().add(13, 'day')] });
    setOpen(true);
  };
  const attempt = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try { await action(); message.success(success); return true; }
    catch (error) { message.error(error instanceof Error ? error.message : '操作失败'); return false; }
    finally { setBusy(false); }
  };
  const save = async (values: { name: string; goal?: string; dates: [dayjs.Dayjs, dayjs.Dayjs]; ownerId: string }) => {
    const ok = await attempt(async () => {
      const savedId = await saveIteration({ id: editing?.id || '', name: values.name.trim(), goal: values.goal || '', startDate: values.dates[0].format('YYYY-MM-DD'), endDate: values.dates[1].format('YYYY-MM-DD'), ownerId: values.ownerId, status: editing?.status || '待开始', revision: editing?.revision, createdBy: editing?.createdBy || user!.id, createdAt: editing?.createdAt || '' });
      setOpen(false); navigate(`/iterations/${savedId}`);
    }, editing ? '迭代已更新' : '迭代已创建');
    return ok;
  };
  const changeStatus = (status: IterationStatus) => {
    if (!current) return;
    modal.confirm({ title: status === '已完成' ? '完成这个迭代？' : status === '进行中' && current.status === '已完成' ? '重新打开迭代？' : '开始这个迭代？', content: status === '已完成' ? `还有 ${stats.total - stats.completed} 项未完成。完成迭代不会改变事项状态；事项保留在该迭代，重新打开后可调整范围。` : `迭代周期：${current.startDate} 至 ${current.endDate}。`, onOk: async () => { if (!await attempt(() => saveIteration({ ...current, status }), '迭代状态已更新')) throw new Error('更新失败'); } });
  };
  const removeIteration = (item: Iteration) => modal.confirm({ title: `删除迭代「${item.name}」？`, content: '迭代中的需求和任务会保留，仅解除迭代归属。', okText: '删除迭代', okButtonProps: { danger: true }, onOk: async () => { if (!await attempt(() => deleteIteration(item.id), '迭代已删除')) throw new Error('删除失败'); if (id === item.id) navigate('/iterations'); } });
  const changeMembers = async (target: string, records: Item[], remove = false) => {
    const ok = await attempt(() => changeIterationMembers(target, records.map(item => ({ kind: item.kind, id: item.id, revision: item.revision })), remove), remove ? '事项已移出迭代' : '迭代范围已更新');
    if (ok) { setPicker(undefined); setPicked([]); setSelected([]); }
  };
  const openPicker = (mode: 'add' | 'move') => { setPicker(mode); setPickerSearch(''); setPicked([]); setDestination(undefined); };
  const columns: TableColumnsType<Item> = [
    { title: '事项', width: 250, render: (_, item) => <Link className="list-title" to={`/${item.kind === 'task' ? 'tasks' : 'requirements'}/${item.id}`}><strong>{item.title}</strong><small>{workCode(item)}</small></Link> },
    { title: '类型', width: 75, render: (_, item) => <Tag color={item.kind === 'task' ? 'green' : 'blue'}>{item.kind === 'task' ? '任务' : '需求'}</Tag> },
    { title: '平台', width: 105, render: (_, item) => platformName(data, item.platformId) },
    { title: '状态', width: 105, render: (_, item) => <StatusTag status={item.status} /> },
    { title: '优先级', width: 80, render: (_, item) => <PriorityTag priority={item.priority} /> },
    { title: '负责人', width: 100, render: (_, item) => <PeopleGroup data={data} ids={item.ownerId ? [item.ownerId] : []} /> },
    { title: '截止时间', width: 120, render: (_, item) => formatDate(item.kind === 'task' ? (item as Task).dueAt : (item as Requirement).targetAt) },
  ];
  const drawer = <Drawer title={editing ? '编辑迭代' : '新建迭代'} open={open} onClose={() => setOpen(false)} size={520} destroyOnHidden footer={<div className="drawer-footer"><Button onClick={() => setOpen(false)}>取消</Button><Button type="primary" loading={busy} onClick={() => form.submit()}>保存迭代</Button></div>}><Form form={form} layout="vertical" requiredMark onFinish={save} className="work-form">
    <Form.Item name="name" label="迭代名称" rules={[{ required: true, whitespace: true, message: '请输入迭代名称' }]}><Input maxLength={100} placeholder="例如：产品体验优化 · 第 3 期" /></Form.Item>
    <Form.Item name="dates" label="起止日期" rules={[{ required: true, message: '请选择起止日期' }]}><DatePicker.RangePicker className="full-width" /></Form.Item>
    <Form.Item name="ownerId" label="负责人" rules={[{ required: true, message: '请选择负责人' }]}><Select options={data.people.filter(person => person.active || person.id === editing?.ownerId).map(person => ({ value: person.id, label: person.name }))} /></Form.Item>
    <Form.Item name="goal" label="迭代目标"><Input.TextArea rows={5} maxLength={2000} placeholder="希望本次迭代交付什么？" /></Form.Item>
  </Form></Drawer>;

  if (id && !current) return <div className="page"><Empty description="迭代不存在"><Button onClick={() => navigate('/iterations')}>返回迭代管理</Button></Empty></div>;
  return <div className="page iteration-page">
    {current ? <>
      <button className="back-link" onClick={() => navigate('/iterations')}><ArrowLeftOutlined /> 返回迭代管理</button>
      <PageHeading title={current.name} action={manageable(current) && <Space wrap><Button icon={<EditOutlined />} onClick={() => edit(current)}>编辑</Button><Button type="primary" loading={busy} onClick={() => changeStatus(current.status === '进行中' ? '已完成' : '进行中')}>{current.status === '待开始' ? '开始迭代' : current.status === '进行中' ? '完成迭代' : '重新打开'}</Button><Button danger icon={<DeleteOutlined />} onClick={() => removeIteration(current)}>删除</Button></Space>} />
      <section className="surface iteration-summary"><div className="iteration-summary-head"><Tag color={statusColor[current.status]}>{current.status}</Tag><span><CalendarOutlined /> {current.startDate} 至 {current.endDate}</span><span className="iteration-owner"><PeopleGroup data={data} ids={[current.ownerId]} />{data.people.find(person => person.id === current.ownerId)?.name || '未分派'}</span></div><h3>迭代目标</h3><p>{current.goal || '尚未填写目标'}</p><div className="iteration-stats"><div><strong>{stats.requirements}</strong><span>需求</span></div><div><strong>{stats.tasks}</strong><span>任务</span></div><div><strong>{stats.completed} / {stats.total}</strong><span>已完成</span></div><div className="iteration-progress"><Progress percent={percent} strokeColor="#3F73E6" /><span>按未归档事项数量统计，已上线需求和已完成任务计为完成</span></div></div></section>
      <section className="surface iteration-items"><div className="iteration-toolbar"><Segmented value={itemType} onChange={value => { setItemType(String(value)); setSelected([]); }} options={['全部','需求','任务']} /><Input prefix={<SearchOutlined />} placeholder="搜索事项名称或编号" value={search} onChange={event => setSearch(event.target.value)} allowClear />{mutable && <Button type="primary" icon={<PlusOutlined />} onClick={() => openPicker('add')}>移入需求 / 任务</Button>}</div>
        {mutable && selectedMembers.length > 0 && <div className="iteration-selection"><span>已选 {selectedMembers.length} 项</span><Button onClick={() => openPicker('move')}>移至其他迭代</Button><Button onClick={() => { void changeMembers(current.id, selectedMembers, true); }} loading={busy}>移出迭代</Button></div>}
        <Table className="compact-table" rowKey="id" columns={columns} dataSource={visible} scroll={{ x: 900 }} pagination={{ pageSize: 10, hideOnSinglePage: true, showSizeChanger: false }} rowSelection={mutable ? { selectedRowKeys: selected, onChange: setSelected, getCheckboxProps: item => ({ disabled: !editable(item) }) } : undefined} locale={{ emptyText: <Empty description="该迭代暂无事项" /> }} />
      </section>
    </> : <>
      <PageHeading title="迭代管理" action={!isVisitor && <Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新建迭代</Button>} />
      <div className="iteration-list-toolbar"><Segmented value={filter} onChange={value => setFilter(String(value))} options={['全部','待开始','进行中','已完成']} /><span className="muted">共 {iterations.length} 个迭代</span></div>
      <div className="iteration-grid">{iterations.filter(item => filter === '全部' || item.status === filter).sort((a,b) => b.startDate.localeCompare(a.startDate)).map(item => { const summary = counts(items.filter(work => work.iterationId === item.id && !work.archived)); return <section className="surface iteration-card" key={item.id}><div className="iteration-card-top"><Tag color={statusColor[item.status]}>{item.status}</Tag><span>{item.startDate} — {item.endDate}</span></div><Link className="iteration-name" to={`/iterations/${item.id}`}>{item.name}</Link><p>{item.goal || '尚未填写目标'}</p><Progress percent={summary.total ? Math.round(summary.completed / summary.total * 100) : 0} strokeColor="#3F73E6" /><div className="iteration-card-counts"><span>{summary.requirements} 个需求 · {summary.tasks} 个任务</span><span>已完成 {summary.completed} / {summary.total}</span></div><div className="iteration-card-footer"><span className="iteration-owner"><PeopleGroup data={data} ids={[item.ownerId]} />{data.people.find(person => person.id === item.ownerId)?.name || '未分派'}</span><Button type="link" onClick={() => navigate(`/iterations/${item.id}`)}>查看迭代 →</Button></div></section>; })}</div>
      {!iterations.some(item => filter === '全部' || item.status === filter) && <section className="surface iteration-empty"><Empty description="暂无迭代" /></section>}
    </>}
    {drawer}
    <Modal title={picker === 'move' ? '移至其他迭代' : '移入需求 / 任务'} open={Boolean(picker)} onCancel={() => setPicker(undefined)} width={900} confirmLoading={busy} okText={picker === 'move' ? '移动' : `移入${picked.length ? ` ${picked.length} 项` : ''}`} okButtonProps={{ disabled: picker === 'move' ? !destination || !selectedMembers.length : !picked.length }} onOk={() => { if (current) void changeMembers(picker === 'move' ? destination! : current.id, picker === 'move' ? selectedMembers : items.filter(item => picked.includes(item.id))); }}>
      {picker === 'move' ? <Select className="full-width" placeholder="选择目标迭代" value={destination} onChange={setDestination} options={iterations.filter(item => item.id !== id && item.status !== '已完成' && manageable(item)).map(item => ({ value: item.id, label: item.name }))} /> : <><Input prefix={<SearchOutlined />} value={pickerSearch} onChange={event => setPickerSearch(event.target.value)} placeholder="搜索需求或任务" allowClear /><p className="muted">已在其他迭代的事项会移至当前迭代；每项只归属一个迭代。最多批量选择 100 项。</p><Table className="compact-table" rowKey="id" columns={[...columns.slice(0,4), { title: '所属迭代', width: 160, render: (_, item) => iterations.find(iteration => iteration.id === item.iterationId)?.name || '未分配' }]} dataSource={candidates} scroll={{ x: 650 }} pagination={{ pageSize: 6, showSizeChanger: false }} rowSelection={{ selectedRowKeys: picked, preserveSelectedRowKeys: true, onChange: keys => setPicked(keys.slice(0,100)) }} /></>}
    </Modal>
  </div>;
}
