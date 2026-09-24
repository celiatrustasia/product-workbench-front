import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { App, Button, Checkbox, Empty, Input, Select, Timeline } from 'antd';
import { ArrowLeftOutlined, DeleteOutlined, DownloadOutlined, EditOutlined, InboxOutlined, LinkOutlined, PaperClipOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useWorkspace } from '../data/workspace';
import WorkForm from '../components/WorkForm';
import { FocusTags, PageHeading, PersonAvatar, PriorityTag, StatusTag } from '../components/ui';
import type { Attachment, Requirement, Task, WorkKind } from '../types';
import { canContribute, canEditAll, displayName, formatDate, formatLongDate, platformName, priorityNames, requirementStatuses, taskStatuses } from '../utils';

const dateTime = (value?: string) => value ? formatDate(value, true) : '未设置';

export default function WorkDetail({ kind }: { kind: WorkKind }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, user, saveWork, archiveWork, deleteWork, updateMilestone } = useWorkspace();
  const { message, modal } = App.useApp();
  const [editOpen, setEditOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteValue, setNoteValue] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const task = kind === 'task';
  const item = (task ? data.tasks : data.requirements).find(record => record.id === id);
  const basePath = task ? '/tasks' : '/requirements';
  if (!item) return <div className="page"><Empty description="事项不存在或已移除"><Button onClick={() => navigate(basePath)}>返回列表</Button></Empty></div>;
  const canEdit = canEditAll(item, user?.id, user?.access === '管理员');
  const canUpdate = canContribute(item, user?.id, user?.access === '管理员');
  const isAdmin = user?.access === '管理员';
  const linked = task ? data.requirements.find(record => record.id === (item as Task).requirementId) : undefined;
  const children = task ? [] : data.tasks.filter(record => record.requirementId === item.id && !record.archived);
  const activity = data.activities.filter(record => record.kind === kind && record.workId === item.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const changeStatus = (status: string) => {
    if (task) saveWork(kind, { ...item as Task, status: status as Task['status'], completedAt: status === '已完成' ? new Date().toISOString() : undefined });
    else saveWork(kind, { ...item as Requirement, status: status as Requirement['status'], launchedAt: status === '已上线' ? new Date().toISOString() : undefined });
    message.success('状态已更新');
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    if (file.size > 1024 * 1024) return message.error('预览版附件限 1 MB，请选择更小的文件');
    const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
    const attachment: Attachment = { id: Math.random().toString(36).slice(2, 10), name: file.name, size: file.size, dataUrl };
    saveWork(kind, { ...item, attachments: [...item.attachments, attachment] } as Requirement | Task);
    message.success('附件已添加');
    if (fileInput.current) fileInput.current.value = '';
  };
  const removeAttachment = (attachment: Attachment) => modal.confirm({ title: '移除附件？', content: attachment.name, onOk: () => saveWork(kind, { ...item, attachments: item.attachments.filter(file => file.id !== attachment.id) } as Requirement | Task) });
  const toggleArchive = () => modal.confirm({ title: item.archived ? '恢复事项？' : '归档事项？', content: item.archived ? '恢复后会重新出现在默认列表中。' : '归档后不计入工作台统计，可从归档列表恢复。', onOk: () => { archiveWork(kind, item.id, !item.archived); message.success(item.archived ? '已恢复' : '已归档'); } });
  const removeWork = () => modal.confirm({ title: `确认删除${task ? '任务' : '需求'}“${item.title}”？`, content: !task && children.length ? `删除后无法恢复，${children.length} 个关联任务将保留，但会解除需求关联。` : '删除后无法恢复，对应通知与操作记录也会一并移除。', okText: '确认删除', okButtonProps: { danger: true }, onOk: () => { deleteWork(kind, item.id); message.success(`${task ? '任务' : '需求'}已删除`); navigate(basePath, { replace: true }); } });
  const saveNote = () => { saveWork(kind, { ...item, note: noteValue.trim() } as Requirement | Task); setNoteEditing(false); message.success('备注已更新'); };

  return <div className="page detail-page"><button className="back-link" onClick={() => navigate(basePath)}><ArrowLeftOutlined /> 返回{task ? '任务管理' : '需求池'}</button>
    <PageHeading kicker={item.id} title={item.title} description={`${platformName(data, item.platformId)} · 创建于 ${formatLongDate(item.createdAt)}`} action={<div className="detail-actions">{canEdit && <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>编辑</Button>}{!task && <Button type="primary" icon={<PlusOutlined />} onClick={() => setTaskOpen(true)}>新建关联任务</Button>}{task && isAdmin && <Button onClick={toggleArchive} icon={<InboxOutlined />}>{item.archived ? '恢复' : '归档'}</Button>}{isAdmin && <Button danger icon={<DeleteOutlined />} onClick={removeWork}>删除</Button>}</div>} />
    <div className="detail-layout"><div className="detail-main"><section className="surface detail-section"><div className="detail-section-head"><h2>事项概览</h2><div><StatusTag status={item.status} /><PriorityTag priority={item.priority} /><FocusTags item={item} /></div></div><div className="detail-description">{item.description || '暂无描述'}</div><div className="detail-meta-grid"><div><span>状态</span>{canUpdate && !item.archived ? <Select value={item.status} onChange={changeStatus} options={(task ? taskStatuses : requirementStatuses).map(value => ({ value, label: value }))} className="status-select" /> : <strong>{item.status}</strong>}</div><div><span>优先级</span><strong>{item.priority} · {priorityNames[item.priority]}</strong></div><div><span>来源</span><strong>{item.source || '未填写'}</strong></div><div><span>{task ? '最终截止' : '目标上线'}</span><strong>{dateTime(task ? (item as Task).dueAt : (item as Requirement).targetAt)}</strong></div>{task ? <><div><span>开始时间</span><strong>{dateTime((item as Task).startedAt)}</strong></div><div><span>完成时间</span><strong>{dateTime((item as Task).completedAt)}</strong></div></> : <><div><span>需求类型</span><strong>{(item as Requirement).type || '未填写'}</strong></div><div><span>提出人 / 时间</span><strong>{(item as Requirement).proposer || '未填写'} · {dateTime((item as Requirement).proposedAt)}</strong></div></>}</div></section>
      {task && <section className="surface detail-section"><div className="detail-section-head"><h2>时间节点</h2><span className="muted">{(item as Task).milestones.filter(m => m.completedAt).length} / {(item as Task).milestones.length} 已完成</span></div><div className="milestone-list">{(item as Task).milestones.map(m => <label className="milestone-row" key={m.id}><Checkbox checked={!!m.completedAt} disabled={!canUpdate || item.archived} onChange={() => updateMilestone(item.id, m.id)} /><span><strong className={m.completedAt ? 'done-text' : ''}>{m.name}</strong><small>计划 {dateTime(m.plannedAt)}{m.completedAt && ` · 完成 ${dateTime(m.completedAt)}`}</small></span></label>)}{(item as Task).milestones.length === 0 && <div className="empty-inline">尚未设置里程碑</div>}</div></section>}
      <section className="surface detail-section"><div className="detail-section-head"><h2>{task ? '关联需求' : '关联任务'}</h2>{!task && <span className="muted">{children.length} 项任务</span>}</div>{task ? linked ? <Link className="related-row" to={`/requirements/${linked.id}`}><LinkOutlined /><span><strong>{linked.title}</strong><small>{linked.id}</small></span><StatusTag status={linked.status} /></Link> : <div className="empty-inline">未关联需求</div> : children.length ? children.map(child => <Link className="related-row" key={child.id} to={`/tasks/${child.id}`}><LinkOutlined /><span><strong>{child.title}</strong><small>{child.id}</small></span><StatusTag status={child.status} /></Link>) : <div className="empty-inline">暂无关联任务</div>}</section>
      <section className="surface detail-section"><div className="detail-section-head"><h2>附件</h2>{canUpdate && !item.archived && <><input ref={fileInput} className="visually-hidden" type="file" onChange={event => { void upload(event.target.files); }} /><Button type="text" icon={<UploadOutlined />} onClick={() => fileInput.current?.click()}>上传附件</Button></>}</div>{item.attachments.map(file => <div className="attachment-row" key={file.id}><PaperClipOutlined /><a href={file.dataUrl} download={file.name}>{file.name}</a><small>{(file.size / 1024).toFixed(0)} KB</small><a href={file.dataUrl} download={file.name} title="下载"><DownloadOutlined /></a>{canUpdate && <Button type="link" danger size="small" onClick={() => removeAttachment(file)}>移除</Button>}</div>)}{item.attachments.length === 0 && <div className="empty-inline">暂无附件</div>}</section>
      <section className="surface detail-section"><div className="detail-section-head"><h2>备注</h2>{canUpdate && !item.archived && !noteEditing && <Button type="link" onClick={() => { setNoteValue(item.note); setNoteEditing(true); }}>编辑备注</Button>}</div>{noteEditing ? <div className="note-editor"><Input.TextArea value={noteValue} onChange={event => setNoteValue(event.target.value)} maxLength={1000} showCount rows={4} /><div><Button onClick={() => setNoteEditing(false)}>取消</Button><Button type="primary" onClick={saveNote}>保存备注</Button></div></div> : <div className="detail-description">{item.note || '暂无备注'}</div>}</section></div>
      <aside className="detail-aside"><section className="surface detail-section"><h2>协作人员</h2><div className="assignee-label">负责人</div><div className="person-line"><PersonAvatar person={data.people.find(p => p.id === item.ownerId)} /><span>{displayName(data, item.ownerId)}</span></div><div className="assignee-label">参与人</div>{item.participantIds.length ? item.participantIds.map(personId => <div className="person-line" key={personId}><PersonAvatar person={data.people.find(p => p.id === personId)} /><span>{displayName(data, personId)}</span></div>) : <div className="empty-inline">暂未分派</div>}</section><section className="surface detail-section"><h2>操作记录</h2>{activity.length ? <Timeline className="activity-timeline" items={activity.map(record => ({ content: <div><strong>{displayName(data, record.actorId)}</strong> {record.text}<small>{dateTime(record.createdAt)}</small></div> }))} /> : <div className="empty-inline">暂无记录</div>}</section>{!task && user?.access === '管理员' && <Button block onClick={toggleArchive} icon={<InboxOutlined />}>{item.archived ? '恢复需求' : '归档需求'}</Button>}</aside></div>
    <WorkForm kind={kind} initial={item} open={editOpen} onClose={() => setEditOpen(false)} />
    <WorkForm kind="task" open={taskOpen} presetRequirementId={item.id} onClose={() => setTaskOpen(false)} onSaved={savedId => navigate(`/tasks/${savedId}`)} />
  </div>;
}
