import { useEffect } from 'react';
import { App, Button, DatePicker, Drawer, Form, Input, Select, Space, Switch } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useWorkspace } from '../data/workspace';
import type { Requirement, Task, WorkKind } from '../types';
import { priorityOptions } from './ui';
import { requirementStatuses, taskStatuses } from '../utils';

interface Props {
  kind: WorkKind;
  open: boolean;
  initial?: Requirement | Task;
  presetRequirementId?: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

type Values = Record<string, unknown> & { title: string; platformId: string; status: string; priority: string; milestones?: { id?: string; name: string; plannedAt: dayjs.Dayjs; completedAt?: string }[] };
const toDate = (value?: string) => value ? dayjs(value) : undefined;
const toIso = (value: unknown) => value && dayjs.isDayjs(value) ? value.format('YYYY-MM-DDTHH:mm:ss') : undefined;

export default function WorkForm({ kind, open, initial, presetRequirementId, onClose, onSaved }: Props) {
  const { data, user, saveWork } = useWorkspace();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const task = kind === 'task';
  const preset = data.requirements.find(r => r.id === presetRequirementId);
  const activePeople = data.people.filter(item => item.active).map(item => ({ value: item.id, label: item.name }));
  const activePlatforms = data.platforms.filter(item => item.active || item.id === initial?.platformId).sort((a, b) => a.sort - b.sort).map(item => ({ value: item.id, label: item.name }));
  const dict = (group: string) => data.dictionary.filter(item => item.group === group && item.active).sort((a, b) => a.sort - b.sort).map(item => ({ value: item.name, label: item.name }));

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(initial ? {
      ...initial,
      targetAt: !task ? toDate((initial as Requirement).targetAt) : undefined,
      proposedAt: !task ? toDate((initial as Requirement).proposedAt) : undefined,
      startedAt: task ? toDate((initial as Task).startedAt) : undefined,
      dueAt: task ? toDate((initial as Task).dueAt) : undefined,
      milestones: task ? (initial as Task).milestones.map(m => ({ ...m, plannedAt: toDate(m.plannedAt) })) : undefined,
    } : { status: task ? '待处理' : '待评估', priority: 'P2', manualFocus: false, participantIds: [], requirementId: presetRequirementId, platformId: preset?.platformId });
  }, [open, initial, task, form, presetRequirementId, preset?.platformId]);

  const submit = (values: Values) => {
    if (task && values.startedAt && values.dueAt && dayjs(values.dueAt as dayjs.Dayjs).isBefore(dayjs(values.startedAt as dayjs.Dayjs))) return message.error('最终截止时间不能早于开始时间');
    const ownerId = String(values.ownerId);
    const base = { id: initial?.id || '', title: values.title.trim(), description: String(values.description || ''), platformId: values.platformId, priority: values.priority as Task['priority'], status: values.status, manualFocus: Boolean(values.manualFocus), ownerId, participantIds: ((values.participantIds || []) as string[]).filter(id => id !== ownerId), note: String(values.note || ''), attachments: initial?.attachments || [], createdAt: initial?.createdAt || '', createdBy: initial?.createdBy || user!.id, updatedAt: initial?.updatedAt || '', archived: initial?.archived || false };
    let record: Requirement | Task;
    if (task) {
      const wasComplete = (initial as Task | undefined)?.status === '已完成';
      record = { ...base, status: values.status as Task['status'], requirementId: values.requirementId ? String(values.requirementId) : undefined, source: values.source ? String(values.source) : undefined, startedAt: toIso(values.startedAt), dueAt: toIso(values.dueAt), completedAt: values.status === '已完成' ? (wasComplete ? (initial as Task).completedAt : dayjs().format('YYYY-MM-DDTHH:mm:ss')) : undefined, milestones: (values.milestones || []).filter(m => m?.name && m?.plannedAt).map(m => ({ id: m.id || `m-${Math.random().toString(36).slice(2, 8)}`, name: m.name, plannedAt: toIso(m.plannedAt)!, completedAt: m.completedAt })) };
    } else {
      const wasLaunched = (initial as Requirement | undefined)?.status === '已上线';
      record = { ...base, status: values.status as Requirement['status'], type: values.type ? String(values.type) : undefined, source: values.source ? String(values.source) : undefined, proposer: values.proposer ? String(values.proposer) : undefined, proposedAt: toIso(values.proposedAt), targetAt: toIso(values.targetAt), launchedAt: values.status === '已上线' ? (wasLaunched ? (initial as Requirement).launchedAt : dayjs().format('YYYY-MM-DDTHH:mm:ss')) : undefined };
    }
    const id = saveWork(kind, record);
    message.success(initial ? '已保存修改' : task ? '任务已创建' : '需求已创建');
    onSaved?.(id);
    onClose();
  };

  return <Drawer title={<strong>{initial ? `编辑${task ? '任务' : '需求'} · ${initial.title}` : task ? '新建任务' : '新建需求'}</strong>} open={open} onClose={onClose} size={680} className="work-drawer" destroyOnHidden extra={<Button onClick={onClose}>关闭</Button>} footer={<div className="drawer-footer"><Button onClick={onClose}>取消</Button><Button type="primary" onClick={() => form.submit()}>保存{task ? '任务' : '需求'}</Button></div>}>
    <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} className="work-form"><div className="form-section-title">基础信息</div><div className="form-grid"><Form.Item label="平台" name="platformId" rules={[{ required: true, message: '请选择平台' }]}><Select showSearch optionFilterProp="label" options={activePlatforms} placeholder="选择平台" /></Form.Item><Form.Item label={task ? '事项名称' : '需求名称'} name="title" rules={[{ required: true, whitespace: true, message: '请输入名称' }]}><Input placeholder={task ? '输入事项名称' : '输入需求名称'} maxLength={100} /></Form.Item></div>
      <Form.Item label={task ? '事项描述' : '需求描述'} name="description"><Input.TextArea rows={3} placeholder="补充背景、目标和处理范围" maxLength={2000} showCount /></Form.Item>
      <div className="form-grid"><Form.Item label="状态" name="status" rules={[{ required: true }]}><Select options={(task ? taskStatuses : requirementStatuses).map(value => ({ value, label: value }))} /></Form.Item><Form.Item label="优先级" name="priority" rules={[{ required: true }]}><Select options={priorityOptions} /></Form.Item></div>
      <div className="form-grid">{task ? <Form.Item label="关联需求" name="requirementId"><Select allowClear showSearch optionFilterProp="label" placeholder="可不关联需求" options={data.requirements.filter(item => !item.archived).map(item => ({ value: item.id, label: `${item.id} · ${item.title}` }))} onChange={id => { const selected = data.requirements.find(item => item.id === id); if (selected) form.setFieldValue('platformId', selected.platformId); }} /></Form.Item> : <Form.Item label="需求类型" name="type"><Select allowClear placeholder="选择类型" options={dict('requirementType')} /></Form.Item>}<Form.Item label="来源" name="source"><Select allowClear placeholder="选择来源" options={dict(task ? 'taskSource' : 'requirementSource')} /></Form.Item></div>
      <div className="form-section-title">分派与时间</div><div className="form-grid"><Form.Item label="负责人" name="ownerId" rules={[{ required: true, message: '请选择负责人' }]}><Select showSearch optionFilterProp="label" placeholder="选择负责人" options={activePeople} /></Form.Item><Form.Item label="参与人" name="participantIds"><Select mode="multiple" showSearch optionFilterProp="label" maxTagCount="responsive" placeholder="选择参与人" options={activePeople} /></Form.Item></div>
      {task ? <><div className="form-grid"><Form.Item label="开始时间" name="startedAt"><DatePicker showTime format="YYYY-MM-DD HH:mm" className="full-width" placeholder="选择开始时间" /></Form.Item><Form.Item label="最终截止时间" name="dueAt"><DatePicker showTime format="YYYY-MM-DD HH:mm" className="full-width" placeholder="选择截止时间" /></Form.Item></div><div className="form-section-title with-action">里程碑</div><Form.List name="milestones">{(fields, { add, remove }) => <><div className="milestone-edit-list">{fields.map(field => <div className="milestone-edit" key={field.key}><Form.Item {...field} label="名称" name={[field.name, 'name']} rules={[{ required: true, message: '输入名称' }]}><Input placeholder="例如：设计评审" /></Form.Item><Form.Item {...field} label="计划完成" name={[field.name, 'plannedAt']} rules={[{ required: true, message: '选择时间' }]}><DatePicker showTime format="YYYY-MM-DD HH:mm" className="full-width" /></Form.Item><Button type="text" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} title="移除里程碑" /></div>)}</div><Button type="dashed" icon={<PlusOutlined />} onClick={() => add()} block>添加里程碑</Button></>}</Form.List></> : <><div className="form-grid"><Form.Item label="提出人" name="proposer"><Input placeholder="姓名或团队" /></Form.Item><Form.Item label="提出时间" name="proposedAt"><DatePicker showTime format="YYYY-MM-DD HH:mm" className="full-width" /></Form.Item></div><Form.Item label="目标上线时间" name="targetAt"><DatePicker showTime format="YYYY-MM-DD HH:mm" className="full-width" /></Form.Item></>}
      <div className="form-section-title">其他</div><Form.Item label="本周重点关注" name="manualFocus" valuePropName="checked"><Switch checkedChildren="已关注" unCheckedChildren="未关注" /></Form.Item><Form.Item label="备注" name="note"><Input.TextArea rows={3} placeholder="填写补充说明" maxLength={1000} /></Form.Item><Space size={4} className="form-hint">附件可在保存后进入详情页添加。</Space>
    </Form>
  </Drawer>;
}
