import { useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Dropdown, Form, Input, Layout, Menu, message, Modal } from 'antd';
import {
  AppstoreOutlined, BellOutlined, BookOutlined, DatabaseOutlined, GlobalOutlined, LeftOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, SearchOutlined, SettingOutlined, TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useWorkspace } from './data/workspace';
import { Brand, PersonAvatar } from './components/ui';
import { isNoticeRead } from './utils';
import Dashboard from './views/Dashboard';
import WorkList from './views/WorkList';
import WorkDetail from './views/WorkDetail';
import Notifications from './views/Notifications';
import Management from './views/Management';

const primaryNav = [
  { key: '/', label: '工作台', icon: <AppstoreOutlined /> },
  { key: '/requirements', label: '需求池', icon: <DatabaseOutlined /> },
  { key: '/tasks', label: '任务管理', icon: <UnorderedListOutlined /> },
  { key: '/notifications', label: '通知中心', icon: <BellOutlined /> },
];
const managementNav = [
  { key: '/platforms', label: '平台管理', icon: <GlobalOutlined /> },
  { key: '/people', label: '人员管理', icon: <TeamOutlined /> },
  { key: '/dictionaries', label: '字典设置', icon: <BookOutlined /> },
];
const routeLabels = Object.fromEntries([...primaryNav, ...managementNav].map(item => [item.key, item.label]));

function Login() {
  const { signIn } = useWorkspace();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const submit = (values: { username: string; password: string }) => {
    setBusy(true);
    if (signIn(values.username, values.password)) navigate('/', { replace: true });
    else message.error('用户名或密码不正确');
    setBusy(false);
  };
  return <main className="login-page"><div className="login-header"><Brand /><span>团队协作空间</span></div><div className="login-layout"><div className="login-visual"><h1>让每一项工作<br />都有清晰进展。</h1><p>从需求到交付，在一个工作台中保持同步。</p><div className="login-grid"><div><span>01</span><strong>需求有序沉淀</strong></div><div><span>02</span><strong>任务清晰分派</strong></div><div><span>03</span><strong>重点一目了然</strong></div></div></div><div className="login-form-wrap"><div className="login-form"><div className="login-form-top"><span className="mini-mark">▦</span><h2>登录产品工作台</h2><p>使用管理员创建的账号进入团队空间</p></div><Form layout="vertical" onFinish={submit} initialValues={{ username: 'celia', password: 'demo1234' }} requiredMark={false}><Form.Item label="用户名" name="username" rules={[{ required: true, message: '请输入用户名' }]}><Input size="large" autoComplete="username" placeholder="请输入用户名" /></Form.Item><Form.Item label="密码" name="password" rules={[{ required: true, message: '请输入密码' }]}><Input.Password size="large" autoComplete="current-password" placeholder="请输入密码" /></Form.Item><Button type="primary" htmlType="submit" size="large" loading={busy} block>登录工作台</Button></Form><div className="demo-accounts"><span>预览账号</span><button onClick={() => { signIn('celia', 'demo1234'); navigate('/', { replace: true }); }}>管理员 Celia</button><button onClick={() => { signIn('chenyi', 'demo1234'); navigate('/', { replace: true }); }}>普通成员 陈一</button></div><div className="demo-foot">仅供前端演示，账号与操作数据保存在当前浏览器。</div></div></div></div></main>;
}

function Shell() {
  const { data, user, signOut, resetPreview } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [search, setSearch] = useState('');
  const isAdmin = user?.access === '管理员';
  const unread = data.notices.filter(n => !isNoticeRead(n, user!.id) && n.recipientIds.includes(user!.id)).length;
  const selected = '/' + (location.pathname.split('/')[1] || '');
  const searchOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return [...data.requirements.map(item => ({ ...item, kind: 'requirement' as const })), ...data.tasks.map(item => ({ ...item, kind: 'task' as const }))]
      .filter(item => !item.archived && `${item.title}${item.id}`.toLowerCase().includes(term)).slice(0, 6);
  }, [search, data.requirements, data.tasks]);

  const menuItems = [
    ...primaryNav.map(item => ({ ...item, label: item.key === '/notifications' ? <span className="nav-notice">{item.label}{unread > 0 && <i>{unread}</i>}</span> : item.label })),
    ...(isAdmin ? [{ key: '/management', label: '基础管理', icon: <SettingOutlined />, children: managementNav }] : []),
  ];
  const renderSide = (compact: boolean) => <><div className="side-brand"><Brand compact={compact} /></div><Menu className="side-menu" mode="inline" inlineCollapsed={compact} defaultOpenKeys={compact ? [] : ['/management']} selectedKeys={[selected]} items={menuItems} onClick={({ key }) => { if (key !== '/management') navigate(key); setMobileMenu(false); }} /><div className="side-bottom"><PersonAvatar person={user} />{!compact && <div><strong>{user?.name}</strong><small>{user?.access}</small></div>}</div></>;

  return <Layout className="app-shell"><Layout.Sider className="desktop-side" width={220} collapsedWidth={68} collapsed={collapsed} theme="light">{renderSide(collapsed)}</Layout.Sider>{mobileMenu && <div className="mobile-overlay" onClick={() => setMobileMenu(false)}><div className="mobile-drawer" onClick={event => event.stopPropagation()}>{renderSide(false)}</div></div>}<Layout className="main-layout"><Layout.Header className="app-header"><div className="header-left"><Button className="desktop-collapse" type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />} onClick={() => setCollapsed(!collapsed)} /><Button className="mobile-toggle" type="text" icon={<MenuUnfoldOutlined />} onClick={() => setMobileMenu(true)} /><span className="header-breadcrumb"><Link to="/">工作台</Link><LeftOutlined className="breadcrumb-chevron" />{routeLabels[selected] || '事项详情'}</span></div><div className="header-actions"><Dropdown menu={{ items: searchOptions.map(item => ({ key: item.id, label: <div className="search-result"><strong>{item.title}</strong><small>{item.id}</small></div>, onClick: () => { navigate(`/${item.kind === 'requirement' ? 'requirements' : 'tasks'}/${item.id}`); setSearch(''); } })) }} open={searchOptions.length > 0 && search.length > 0} trigger={['click']}><Input className="global-search" prefix={<SearchOutlined />} placeholder="搜索需求、任务" value={search} onChange={event => setSearch(event.target.value)} onPressEnter={() => { navigate(`/requirements?search=${encodeURIComponent(search)}`); setSearch(''); }} /></Dropdown><Button className="header-bell" type="text" onClick={() => navigate('/notifications')} icon={<Badge dot={unread > 0}><BellOutlined /></Badge>} aria-label="通知中心" /><Dropdown trigger={['click']} menu={{ items: [{ key: 'profile', label: `${user?.name} · ${user?.role}`, disabled: true }, { key: 'reset', label: '重置预览数据', onClick: () => Modal.confirm({ title: '重置预览数据？', content: '当前浏览器中新增或修改的内容将恢复为初始示例。', onOk: resetPreview }) }, { type: 'divider' }, { key: 'logout', label: '退出登录', onClick: () => { signOut(); navigate('/login'); } }] }}><button className="avatar-button" aria-label="账号菜单"><PersonAvatar person={user} /></button></Dropdown></div></Layout.Header><Layout.Content className="app-content"><Routes><Route path="/" element={<Dashboard />} /><Route path="/requirements" element={<WorkList kind="requirement" />} /><Route path="/requirements/:id" element={<WorkDetail kind="requirement" />} /><Route path="/tasks" element={<WorkList kind="task" />} /><Route path="/tasks/:id" element={<WorkDetail kind="task" />} /><Route path="/notifications" element={<Notifications />} /><Route path="/platforms" element={isAdmin ? <Management kind="platforms" /> : <Navigate to="/" />} /><Route path="/people" element={isAdmin ? <Management kind="people" /> : <Navigate to="/" />} /><Route path="/dictionaries" element={isAdmin ? <Management kind="dictionaries" /> : <Navigate to="/" />} /><Route path="*" element={<Navigate to="/" />} /></Routes></Layout.Content></Layout></Layout>;
}

export default function Root() {
  const { user } = useWorkspace();
  return <Routes><Route path="/login" element={user ? <Navigate to="/" /> : <Login />} /><Route path="/*" element={user ? <Shell /> : <Navigate to="/login" />} /></Routes>;
}
