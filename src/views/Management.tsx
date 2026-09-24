import { useState } from 'react';
import { App, Button, Drawer, Form, Input, InputNumber, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import { DeleteOutlined, EditOutlined, HolderOutlined, PlusOutlined } from '@ant-design/icons';
import { useWorkspace } from '../data/workspace';
import { PageHeading, PersonAvatar } from '../components/ui';
import type { DictionaryItem, Person, Platform } from '../types';

type Kind = 'platforms' | 'people' | 'dictionaries';
const groups = [{ key: 'requirementType', label: '需求类型' }, { key: 'requirementSource', label: '需求来源' }, { key: 'taskSource', label: '任务来源' }] as const;
const createId = () => Math.random().toString(36).slice(2, 10);

export default function Management({ kind }: { kind: Kind }) {
  const { data, user, savePlatform, reorderPlatforms, deletePlatform, savePerson, deletePerson, saveDictionary, deleteDictionary } = useWorkspace();
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState<Platform | Person | DictionaryItem | null>(null);
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<DictionaryItem['group']>('requirementType');
  const [draggingId, setDraggingId] = useState<string>();
  const [form] = Form.useForm();
  const title = kind === 'platforms' ? '平台管理' : kind === 'people' ? '人员管理' : '字典设置';
  const singular = kind === 'platforms' ? '平台' : kind === 'people' ? '成员' : '选项';
  const edit = (item?: Platform | Person | DictionaryItem) => { setEditing(item || null); form.resetFields(); form.setFieldsValue(item || { active: true, sort: kind === 'platforms' ? data.platforms.length + 1 : data.dictionary.filter(d => d.group === group).length + 1, role: '产品', access: '普通成员', group }); setOpen(true); };
  const save = (values: Record<string, unknown>) => {
    const name = String(values.name || '').trim();
    if (kind === 'platforms') {
      if (data.platforms.some(p => p.id !== editing?.id && p.name === name)) return message.error('平台名称已存在');
      savePlatform({ id: editing?.id || createId(), name, description: String(values.description || ''), active: Boolean(values.active), sort: (editing as Platform | null)?.sort || Math.max(0, ...data.platforms.map(item => item.sort)) + 1 });
    } else if (kind === 'people') {
      const username = String(values.username || '').trim().toLowerCase();
      if (data.people.some(p => p.id !== editing?.id && p.username === username)) return message.error('登录用户名已存在');
      if ((editing as Person | null)?.access === '管理员' && (!values.active || values.access !== '管理员') && data.people.filter(p => p.active && p.access === '管理员').length === 1) return message.error('至少需要保留一位启用的管理员');
      savePerson({ id: editing?.id || createId(), name, username, role: values.role as Person['role'], access: values.access as Person['access'], active: Boolean(values.active), color: (editing as Person | null)?.color || 'blue' });
    } else {
      if (data.dictionary.some(d => d.id !== editing?.id && d.group === group && d.name === name)) return message.error('当前分类中已存在该选项');
      saveDictionary({ id: editing?.id || createId(), name, group, active: Boolean(values.active), sort: Number(values.sort || 1) });
    }
    message.success(editing ? '已保存修改' : `已添加${singular}`);
    setOpen(false);
  };
  const status = (active: boolean) => <Tag className={`status-tag ${active ? 'green' : 'gray'}`}><span className="status-dot" />{active ? '启用' : '停用'}</Tag>;
  const remove = (record: Platform | Person | DictionaryItem) => {
    if (kind === 'platforms') {
      const used = [...data.requirements, ...data.tasks].filter(item => item.platformId === record.id).length;
      if (used) return message.error(`该平台仍被 ${used} 个需求或任务使用，请先迁移数据`);
    }
    if (kind === 'people') {
      const person = record as Person;
      if (person.id === user?.id) return message.error('不能删除当前登录账号');
      const related = [...data.requirements, ...data.tasks].filter(item => item.createdBy === person.id || item.ownerId === person.id || item.participantIds.includes(person.id)).length;
      if (related) return message.error(`该成员仍关联 ${related} 个需求或任务，请先调整分派`);
      if (person.access === '管理员' && data.people.filter(item => item.active && item.access === '管理员').length === 1) return message.error('至少需要保留一位启用的管理员');
    }
    modal.confirm({ title: `确认删除${singular}“${record.name}”？`, content: '删除后无法恢复。', okText: '确认删除', okButtonProps: { danger: true }, onOk: () => { if (kind === 'platforms') deletePlatform(record.id); else if (kind === 'people') deletePerson(record.id); else deleteDictionary(record.id); message.success(`${singular}已删除`); } });
  };
  const action = (record: Platform | Person | DictionaryItem) => <Space className="management-actions" size={0} wrap={false}><Button type="link" icon={<EditOutlined />} onClick={() => edit(record)}>编辑</Button>{kind === 'people' && <Button type="link" onClick={() => message.success(`已为 ${(record as Person).name} 生成临时密码 demo1234`)}>重置密码</Button>}<Button type="link" danger icon={<DeleteOutlined />} onClick={() => remove(record)}>删除</Button></Space>;
  const orderedPlatforms = [...data.platforms].sort((a, b) => a.sort - b.sort);
  const dropPlatform = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return setDraggingId(undefined);
    const ids = orderedPlatforms.map(item => item.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return setDraggingId(undefined);
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderPlatforms(ids);
    setDraggingId(undefined);
    message.success('平台顺序已更新');
  };
  const platforms = <Table className="compact-table draggable-table" tableLayout="fixed" rowKey="id" dataSource={orderedPlatforms} onRow={record => ({
    draggable: true,
    onDragStart: event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', record.id); setDraggingId(record.id); },
    onDragOver: event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; },
    onDrop: event => { event.preventDefault(); dropPlatform(record.id); },
    onDragEnd: () => setDraggingId(undefined),
  })} rowClassName={record => draggingId === record.id ? 'dragging-row' : ''} columns={[{ title: '', width: 44, render: () => <span className="drag-handle" title="拖拽排序" aria-label="拖拽排序"><HolderOutlined /></span> }, { title: '平台名称', dataIndex: 'name', width: 180, render: (value: string) => <strong>{value}</strong> }, { title: '说明', dataIndex: 'description', width: 360, ellipsis: true }, { title: '状态', dataIndex: 'active', width: 90, render: status }, { title: '操作', width: 190, render: (_, record: Platform) => action(record) }]} pagination={false} scroll={{ x: 864 }} />;
  const people = <Table className="compact-table" tableLayout="fixed" rowKey="id" dataSource={data.people} columns={[{ title: '成员', width: 250, render: (_, record: Person) => <div className="person-line"><PersonAvatar person={record} /><span><strong>{record.name}</strong><small>@{record.username}</small></span></div> }, { title: '团队角色', dataIndex: 'role', width: 110 }, { title: '操作权限', dataIndex: 'access', width: 120 }, { title: '状态', dataIndex: 'active', width: 90, render: status }, { title: '操作', width: 280, render: (_, record: Person) => action(record) }]} pagination={false} scroll={{ x: 850 }} />;
  const dictionary = <><Tabs activeKey={group} onChange={value => setGroup(value as DictionaryItem['group'])} items={groups.map(item => ({ key: item.key, label: item.label }))} /><Table className="compact-table" tableLayout="fixed" rowKey="id" dataSource={data.dictionary.filter(d => d.group === group).sort((a, b) => a.sort - b.sort)} columns={[{ title: '选项名称', dataIndex: 'name', width: 230, render: (value: string) => <strong>{value}</strong> }, { title: '排序', dataIndex: 'sort', width: 90 }, { title: '状态', dataIndex: 'active', width: 90, render: status }, { title: '操作', width: 170, render: (_, record: DictionaryItem) => action(record) }]} pagination={false} scroll={{ x: 580 }} /></>;
  return <div className="page management-page"><PageHeading title={title} description={kind === 'platforms' ? '维护产品平台，拖拽行可调整展示顺序。' : kind === 'people' ? '管理员创建成员，并分配团队角色及操作权限。' : '维护需求类型与来源等可选项。'} action={<Button type="primary" icon={<PlusOutlined />} onClick={() => edit()}>新增{singular}</Button>} />
    <section className={`surface management-surface management-${kind}`}><div className="surface-header"><h2>{title}</h2><span className="muted">{kind === 'platforms' ? data.platforms.length : kind === 'people' ? data.people.length : data.dictionary.filter(d => d.group === group).length} 项</span></div>{kind === 'platforms' ? platforms : kind === 'people' ? people : dictionary}</section>
    <Drawer title={`${editing ? '编辑' : '新增'}${singular}`} open={open} onClose={() => setOpen(false)} size={480} destroyOnHidden footer={<div className="drawer-footer"><Button onClick={() => setOpen(false)}>取消</Button><Button type="primary" onClick={() => form.submit()}>保存</Button></div>}><Form form={form} layout="vertical" requiredMark={false} onFinish={save} className="work-form"><Form.Item label={`${singular}名称`} name="name" rules={[{ required: true, whitespace: true, message: '请输入名称' }]}><Input maxLength={40} placeholder={`输入${singular}名称`} /></Form.Item>{kind === 'platforms' && <Form.Item label="平台说明" name="description"><Input.TextArea rows={3} maxLength={200} /></Form.Item>}{kind === 'people' && <><Form.Item label="登录用户名" name="username" rules={[{ required: true, whitespace: true, message: '请输入登录用户名' }, { pattern: /^[a-zA-Z0-9._-]+$/, message: '仅支持英文字母、数字、点、下划线和连字符' }]}><Input disabled={!!editing} placeholder="例如 zhangsan" /></Form.Item><div className="form-grid"><Form.Item label="团队角色" name="role" rules={[{ required: true }]}><Select options={['产品', '研发', '测试'].map(value => ({ value, label: value }))} /></Form.Item><Form.Item label="操作权限" name="access" rules={[{ required: true }]}><Select options={['管理员', '普通成员'].map(value => ({ value, label: value }))} /></Form.Item></div><div className="form-hint">预览版新成员使用统一演示密码 demo1234。正式账号与权限将在后端接入时实现。</div></>}{kind === 'dictionaries' && <Form.Item label="排序" name="sort" rules={[{ required: true }]}><InputNumber min={1} max={999} className="full-width" /></Form.Item>}<Form.Item label="启用状态" name="active" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="停用" /></Form.Item></Form></Drawer>
  </div>;
}
