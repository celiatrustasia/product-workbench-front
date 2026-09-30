import { Fragment, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Dropdown, Form, Input, Layout, Menu, message, Modal, Alert, Spin } from 'antd';
import {
  AppstoreOutlined, BellOutlined, BookOutlined, DatabaseOutlined, GlobalOutlined, LeftOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined, SettingOutlined, TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useWorkspace } from './data/workspace';
import { Brand, PersonAvatar } from './components/ui';
import { isNoticeRead, workCode } from './utils';
import Dashboard from './views/Dashboard';
import WorkList from './views/WorkList';
import WorkDetail from './views/WorkDetail';
import Notifications from './views/Notifications';
import Management from './views/Management';
import { getBreadcrumbItems, managementNavigation, managementParent, primaryNavigation } from './navigation';

const primaryNav = primaryNavigation.map(item => ({ ...item, icon: {
  '/': <AppstoreOutlined />, '/requirements': <DatabaseOutlined />,
  '/tasks': <UnorderedListOutlined />, '/notifications': <BellOutlined />,
}[item.key] }));
const managementNav = managementNavigation.map(item => ({ ...item, icon: {
  '/platforms': <GlobalOutlined />, '/people': <TeamOutlined />, '/dictionaries': <BookOutlined />,
}[item.key] }));

function Login() {
  const { signIn, isPreview } = useWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const submit = async (values: { username: string; password: string }) => {
    setBusy(true);
    try { if (await signIn(values.username, values.password)) navigate('/', { replace: true }); else message.error('用户名或密码不正确'); }
    catch (error) { message.error(error instanceof Error ? error.message : '登录失败'); }
    finally { setBusy(false); }
  };
  return <main className="account-page"><section className="account-form"><Brand /><h1>登录</h1>
    <Form layout="vertical" onFinish={submit} initialValues={isPreview ? { username: 'celia', password: 'demo1234' } : undefined} requiredMark>
      <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}><Input autoComplete="username" /></Form.Item>
      <Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}><Input.Password autoComplete="current-password" /></Form.Item>
      <Button type="primary" htmlType="submit" loading={busy} block>登录</Button>
    </Form>{isPreview && <small>离线预览 · demo1234</small>}
  </section></main>;
}

function PasswordPanel({ onDone, initial = false }: { onDone?: () => void; initial?: boolean }) {
  const { changePassword, signOut } = useWorkspace();
  const [busy, setBusy] = useState(false);
  return <section className="account-form"><h1>{initial ? '首次登录 · 设置密码' : '修改密码'}</h1><Form layout="vertical" requiredMark onFinish={async (values: { oldPassword: string; newPassword: string }) => {
    setBusy(true);
    try { await changePassword(values.oldPassword, values.newPassword); message.success('密码已更新'); onDone?.(); }
    catch (error) { message.error(error instanceof Error ? error.message : '修改失败'); }
    finally { setBusy(false); }
  }}>
    <Form.Item label="原密码" name="oldPassword" rules={[{ required: true, message: '请输入原密码' }]}><Input.Password autoComplete="current-password" /></Form.Item>
    <Form.Item label="新密码" name="newPassword" rules={[{ required: true }, { min: 12, max: 128, message: '密码长度为 12 至 128 位' }, { pattern: /^(?=.*[A-Za-z])(?=.*\d).+$/, message: '需要包含字母和数字' }]}><Input.Password autoComplete="new-password" /></Form.Item>
    <Form.Item label="确认新密码" name="confirmPassword" dependencies={['newPassword']} rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, value) => value === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('两次密码不一致')) })]}><Input.Password autoComplete="new-password" /></Form.Item>
    <Button type="primary" htmlType="submit" loading={busy} block>保存密码</Button>
  </Form>{initial && <Button type="link" onClick={async () => { try { await signOut(); } catch (error) { message.error(error instanceof Error ? error.message : '退出失败'); } }}>退出登录</Button>}</section>;
}

function Shell() {
  const { data, user, signOut, resetPreview, isPreview, error, retry } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState('');
  const isAdmin = user?.access === '管理员';
  const unread = data.notices.filter(n => !isNoticeRead(n, user!.id) && n.recipientIds.includes(user!.id)).length;
  const selected = '/' + (location.pathname.split('/')[1] || '');
  const detailId = location.pathname.split('/')[2];
  const detailTitle = (selected === '/requirements' ? data.requirements : data.tasks).find(item => item.id === detailId)?.title;
  const breadcrumbs = getBreadcrumbItems(location.pathname, detailTitle);
  const searchOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return [...data.requirements.map(item => ({ ...item, kind: 'requirement' as const })), ...data.tasks.map(item => ({ ...item, kind: 'task' as const }))]
      .filter(item => !item.archived && `${item.title}${workCode(item)}`.toLowerCase().includes(term)).slice(0, 6);
  }, [search, data.requirements, data.tasks]);

  const menuItems = [
    ...primaryNav.map(item => ({ ...item, label: item.key === '/notifications' ? <span className="nav-notice">{item.label}{unread > 0 && <i>{unread}</i>}</span> : item.label })),
    ...(isAdmin ? [{ ...managementParent, icon: <SettingOutlined />, children: managementNav }] : []),
  ];
  const renderSide = (compact: boolean) => <><div className="side-brand"><Brand compact={compact} /></div><Menu className="side-menu" mode="inline" inlineCollapsed={compact} defaultOpenKeys={compact ? [] : [managementParent.key]} selectedKeys={[selected]} items={menuItems} onClick={({ key }) => { if (key !== managementParent.key) navigate(key); setMobileMenu(false); }} /></>;

  const breadcrumb = <nav className="header-breadcrumb" aria-label="面包屑">{breadcrumbs.map((item, index) => <Fragment key={item.path || item.title}>
    {index > 0 && <LeftOutlined className="breadcrumb-chevron" aria-hidden="true" />}
    {item.path ? <Link className="breadcrumb-ancestor" to={item.path}>{item.title}</Link> : <span className={index === breadcrumbs.length - 1 ? 'breadcrumb-current' : 'breadcrumb-ancestor'} aria-current={index === breadcrumbs.length - 1 ? 'page' : undefined} title={item.title}>{item.title}</span>}
  </Fragment>)}</nav>;

  return <Layout className="app-shell"><Layout.Sider className="desktop-side" width={220} collapsedWidth={68} collapsed={collapsed} theme="light">{renderSide(collapsed)}</Layout.Sider>{mobileMenu && <div className="mobile-overlay" onClick={() => setMobileMenu(false)}><div className="mobile-drawer" onClick={event => event.stopPropagation()}>{renderSide(false)}</div></div>}<Layout className="main-layout"><Layout.Header className="app-header"><div className="header-left"><Button className="desktop-collapse" type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} /><Button className="mobile-toggle" type="text" icon={<MenuUnfoldOutlined />} onClick={() => setMobileMenu(true)} />{breadcrumb}</div><div className="header-actions"><Dropdown menu={{ items: searchOptions.map(item => ({ key: item.id, label: <div className="search-result"><strong>{item.title}</strong><small>{workCode(item)}</small></div>, onClick: () => { navigate(`/${item.kind === 'requirement' ? 'requirements' : 'tasks'}/${item.id}`); setSearch(''); } })) }} open={searchOptions.length > 0 && search.length > 0} trigger={['click']}><Input className="global-search" prefix={<SearchOutlined />} placeholder="搜索需求、任务" value={search} onChange={event => setSearch(event.target.value)} onPressEnter={() => { const target = /^T\d/i.test(search.trim()) || (searchOptions.length > 0 && searchOptions.every(item => item.kind === 'task')) ? '/tasks' : '/requirements'; navigate(`${target}?search=${encodeURIComponent(search)}`); setSearch(''); }} /></Dropdown><Button className="header-bell" type="text" onClick={() => navigate('/notifications')} icon={<Badge dot={unread > 0}><BellOutlined /></Badge>} aria-label="通知中心" /><Dropdown trigger={['click']} menu={{ items: [{ key: 'profile', label: `${user?.name} · ${user?.role}`, disabled: true }, ...(isPreview ? [{ key: 'reset', label: '重置预览数据', onClick: () => Modal.confirm({ title: '重置预览数据？', content: '当前浏览器中新增或修改的内容将恢复为初始示例。', onOk: resetPreview }) }] : [{ key: 'password', label: '修改密码', onClick: () => setPasswordOpen(true) }]), { type: 'divider' }, { key: 'logout', label: '退出登录', onClick: async () => { try { await signOut(); navigate('/login'); } catch (error) { message.error(error instanceof Error ? error.message : '退出失败'); } } }] }}><button className="avatar-button" aria-label="账号菜单"><PersonAvatar person={user} /></button></Dropdown></div></Layout.Header><Layout.Content className="app-content">{error && <Alert type="warning" title={error} action={<Button onClick={retry}>重试</Button>} />}<Modal open={passwordOpen} footer={null} onCancel={() => setPasswordOpen(false)} destroyOnHidden><PasswordPanel onDone={() => setPasswordOpen(false)} /></Modal><Routes><Route path="/" element={<Dashboard />} /><Route path="/requirements" element={<WorkList kind="requirement" />} /><Route path="/requirements/:id" element={<WorkDetail kind="requirement" />} /><Route path="/tasks" element={<WorkList kind="task" />} /><Route path="/tasks/:id" element={<WorkDetail kind="task" />} /><Route path="/notifications" element={<Notifications />} /><Route path="/platforms" element={isAdmin ? <Management kind="platforms" /> : <Navigate to="/" />} /><Route path="/people" element={isAdmin ? <Management kind="people" /> : <Navigate to="/" />} /><Route path="/dictionaries" element={isAdmin ? <Management kind="dictionaries" /> : <Navigate to="/" />} /><Route path="*" element={<Navigate to="/" />} /></Routes></Layout.Content></Layout></Layout>;
}

export default function Root() {
  const { user, loading, error, retry } = useWorkspace();
  if (loading) return <main className="account-page"><Spin size="large" /></main>;
  if (error && !user) return <main className="account-page"><section className="account-form"><Brand /><Alert type="error" title="后端服务连接失败" description={error} /><Button onClick={retry}>重新连接</Button></section></main>;
  if (user?.mustChangePassword) return <main className="account-page"><PasswordPanel initial /></main>;
  return <Routes><Route path="/login" element={user ? <Navigate to="/" /> : <Login />} /><Route path="/*" element={user ? <Shell /> : <Navigate to="/login" />} /></Routes>;
}
