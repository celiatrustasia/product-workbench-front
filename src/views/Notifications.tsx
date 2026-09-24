import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Empty, Segmented } from 'antd';
import { BellOutlined, CheckOutlined, ClockCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useWorkspace } from '../data/workspace';
import { PageHeading } from '../components/ui';
import { formatDate, isNoticeRead } from '../utils';

export default function Notifications() {
  const { data, user, markNotice } = useWorkspace();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('全部');
  const notices = data.notices.filter(n => n.recipientIds.includes(user!.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const visible = notices.filter(n => filter === '全部' || !isNoticeRead(n, user!.id));
  const unread = notices.filter(n => !isNoticeRead(n, user!.id)).length;
  return <div className="page notifications-page"><PageHeading title="通知中心" description="查看与你相关的分派、变更和时间提醒。" action={<Button icon={<CheckOutlined />} disabled={!unread} onClick={() => markNotice()}>全部标为已读</Button>} />
    <div className="surface notification-surface"><div className="surface-header"><Segmented value={filter} onChange={value => setFilter(String(value))} options={[`全部 (${notices.length})`, `未读 (${unread})`].map((label, i) => ({ label, value: i ? '未读' : '全部' }))} /><span className="muted">最近消息</span></div>{visible.length ? visible.map(n => <button key={n.id} className={`notice-row ${isNoticeRead(n, user!.id) ? '' : 'unread'}`} onClick={() => { markNotice(n.id); navigate(`/${n.kind === 'task' ? 'tasks' : 'requirements'}/${n.workId}`); }}><span className={`notice-icon ${n.level}`}>{n.level === 'danger' ? <ExclamationCircleOutlined /> : n.level === 'warning' ? <ClockCircleOutlined /> : <BellOutlined />}</span><span className="notice-copy"><strong>{n.title}</strong><span>{n.text}</span><small>{n.kind === 'task' ? '任务' : '需求'} · {n.workId}</small></span><span className="notice-time">{formatDate(n.createdAt, true)}{!isNoticeRead(n, user!.id) && <i />}</span></button>) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === '未读' ? '所有通知已读' : '暂无通知'} />}</div>
  </div>;
}
