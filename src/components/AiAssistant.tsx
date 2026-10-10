import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Form, Input, Modal, Select, Spin, Tag, Tooltip } from 'antd';
import { Bubble, Sender } from '@ant-design/x';
import { ArrowUpOutlined, CloseOutlined, PlusOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';
import { request } from '../data/api';
import { useWorkspace } from '../data/workspace';
import type { WorkKind } from '../types';
import { displayName, platformName } from '../utils';

type Provider = 'deepseek' | 'qwen';
type ModelStatus = {
  configured: boolean; managedByEnvironment: boolean; provider: Provider; model: string; baseUrl: string;
  providers: Record<Provider, { name: string; model: string; baseUrl: string }>;
};
type CreatedWork = { kind: WorkKind; id: string; code: string; title: string; priority: string; platformId: string; ownerId: string };
type Reply = { reply: string; created: CreatedWork[] };
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; created?: CreatedWork[] };
type ChatRequest = { requestId: string; message: string; history: { role: 'user' | 'assistant'; content: string }[] };

export default function AiAssistant() {
  const { user, data, isPreview, refreshWorkspace } = useWorkspace();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ModelStatus>();
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [form] = Form.useForm();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ payload: ChatRequest; error: string }>();
  const pending = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const admin = user?.access === '管理员';

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadStatus = async () => {
    if (isPreview) return;
    setConfigLoading(true); setConfigError('');
    try { const value = await request<ModelStatus>('/assistant/config'); if (mounted.current) setStatus(value); }
    catch (error) { if (mounted.current) setConfigError(error instanceof Error ? error.message : '助手配置读取失败'); }
    finally { if (mounted.current) setConfigLoading(false); }
  };
  useEffect(() => { if (open) void loadStatus(); }, [open, isPreview]);
  useEffect(() => { if (open && log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages, busy, failed, open]);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !settingsOpen) close(); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [open, settingsOpen]);

  const send = async (payload: ChatRequest, retry = false) => {
    if (pending.current || !status?.configured || isPreview) return;
    pending.current = true; setBusy(true); setFailed(undefined);
    if (!retry) { setMessages(current => [...current, { id: payload.requestId, role: 'user', text: payload.message }]); setInput(''); }
    try {
      const response = await request<Reply>('/assistant/messages', 'POST', payload, 60000);
      if (!mounted.current) return;
      setMessages(current => [...current, { id: `${payload.requestId}-reply`, role: 'assistant', text: response.reply, created: response.created }]);
      if (response.created.length) {
        try { await refreshWorkspace(); }
        catch { if (mounted.current) message.warning('事项已创建，列表刷新失败，请刷新页面查看。'); }
      }
    } catch (error) {
      if (mounted.current) setFailed({ payload, error: error instanceof Error ? error.message : '助手暂时无法响应，请重试' });
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = (text: string) => {
    const value = text.trim();
    if (!value || failed || busy || value.length > 4000) return;
    void send({ requestId: crypto.randomUUID(), message: value, history: messages.slice(-12).map(item => ({ role: item.role, content: item.text })) });
  };
  const editSettings = () => {
    if (!status) return;
    form.setFieldsValue({ provider: status.provider, model: status.model, baseUrl: status.baseUrl, apiKey: '' });
    setSettingsError(''); setSettingsOpen(true);
  };
  const closeSettings = () => { if (!settingsBusy) { setSettingsOpen(false); form.resetFields(); setSettingsError(''); } };
  const saveSettings = async (value: { provider: Provider; model: string; baseUrl: string; apiKey?: string }) => {
    setSettingsBusy(true); setSettingsError('');
    try {
      const updated = await request<ModelStatus>('/assistant/config', 'PUT', value, 60000);
      if (!mounted.current) return;
      setStatus(updated); setSettingsOpen(false); form.resetFields(); message.success('模型连接成功，AI 助手已启用');
    } catch (error) { if (mounted.current) setSettingsError(error instanceof Error ? error.message : '模型配置保存失败'); }
    finally { if (mounted.current) setSettingsBusy(false); }
  };
  const examplePlatform = data.platforms.find(item => item.active)?.name;
  const unavailable = isPreview || !status?.configured || configLoading || Boolean(configError);

  return <>
    <div className="ai-assistant">
      {open && <section id="ai-assistant-panel" className="ai-panel" role="region" aria-label="AI 助手聊天">
        <header className="ai-header"><span className="ai-avatar"><RobotOutlined /></span><div className="ai-header-title"><strong>AI 助手</strong><small>{isPreview ? '离线预览' : configLoading ? '正在连接' : status?.configured ? status.providers[status.provider].name : '待配置模型'}</small></div>
          {admin && !isPreview && <Tooltip title="模型设置"><Button type="text" icon={<SettingOutlined />} aria-label="模型设置" disabled={!status || configLoading || status.managedByEnvironment} onClick={editSettings} /></Tooltip>}
          <Tooltip title="新对话"><Button type="text" icon={<PlusOutlined />} aria-label="新对话" disabled={busy || Boolean(failed)} onClick={() => { setMessages([]); setInput(''); }} /></Tooltip>
          <Button type="text" icon={<CloseOutlined />} aria-label="关闭 AI 助手" onClick={close} />
        </header>
        <div ref={log} className="ai-conversation" role="log" aria-live="polite" aria-relevant="additions text">
          {!messages.length && <div className="ai-welcome"><span className="ai-welcome-icon"><RobotOutlined /></span><h3>把需求和任务交给我</h3><p>告诉我平台、要做什么，以及负责人或参与人。信息齐全即可创建，缺少必要信息时我会追问。</p><p className="muted">未指定负责人时分派给你；优先级默认 P2。</p>{examplePlatform && <button className="ai-example" disabled={unavailable} onClick={() => setInput(`帮我在 ${examplePlatform} 创建一个任务：整理下周产品评审材料，负责人是我，优先级 P2。`)}>试试：为 {examplePlatform} 新建任务</button>}</div>}
          {messages.map(item => <Bubble key={item.id} placement={item.role === 'user' ? 'end' : 'start'} variant={item.role === 'user' ? 'filled' : 'outlined'} content={<div><div className="ai-message-text">{item.text}</div>{item.created?.map(work => <Link className="ai-created-work" key={work.id} to={`/${work.kind === 'task' ? 'tasks' : 'requirements'}/${work.id}`}><span><Tag>{work.kind === 'task' ? '任务' : '需求'}</Tag><b>{work.code}</b></span><strong>{work.title}</strong><small>{platformName(data, work.platformId)} · {displayName(data, work.ownerId)} · {work.priority}</small></Link>)}</div>} />)}
          {busy && <div className="ai-thinking"><Spin size="small" />正在理解并处理，请稍候…</div>}
          {failed && <Alert type="error" showIcon title={failed.error} action={<Button size="small" disabled={busy} onClick={() => void send(failed.payload, true)}>重试这条消息</Button>} />}
        </div>
        <div className="ai-composer">
          {isPreview ? <Alert type="info" title="请在在线系统使用 AI 助手" /> : configError ? <Alert type="error" title={configError} action={<Button size="small" onClick={() => void loadStatus()}>重试</Button>} /> : !configLoading && !status?.configured && <Alert type="info" title={admin ? '配置模型 Key 后即可使用' : '请联系管理员配置 AI 模型'} action={admin && <Button size="small" onClick={editSettings} disabled={!status}>去配置</Button>} />}
          <Sender value={input} onChange={setInput} onSubmit={submit} disabled={unavailable || busy || Boolean(failed)} autoSize={{ minRows: 2, maxRows: 5 }} submitType="enter" placeholder="例如：给 CertCloud 新建需求，优化证书搜索…" suffix={<Button type="primary" shape="circle" size="small" icon={<ArrowUpOutlined />} aria-label="发送给 AI 助手" loading={busy} disabled={unavailable || Boolean(failed) || !input.trim() || input.length > 4000} onClick={() => submit(input)} />} />
          <small className="ai-composer-note">Enter 发送 · Shift + Enter 换行 · 每次最多 10 条{input.length > 4000 && <span className="danger-text"> · 已超过 4000 字</span>}</small>
        </div>
      </section>}
      <Button ref={launcher} className="ai-launcher" type="primary" icon={<RobotOutlined />} aria-label={open ? '收起 AI 助手' : '打开 AI 助手'} aria-expanded={open} aria-controls="ai-assistant-panel" onClick={() => open ? close() : setOpen(true)}>AI 助手</Button>
    </div>
    <Modal title="AI 模型设置" open={settingsOpen} onCancel={closeSettings} footer={null} destroyOnHidden closable={!settingsBusy} mask={{ closable: !settingsBusy }}>
      <Alert type="info" title="Key 仅保存于服务器，团队成员共用此模型。" description="对话内容会发送给所选模型服务；调用费用由该服务商按用量收取。" className="ai-settings-notice" />
      {settingsError && <Alert type="error" showIcon title={settingsError} className="ai-settings-notice" />}
      <Form form={form} layout="vertical" requiredMark onFinish={saveSettings} clearOnDestroy disabled={settingsBusy}>
        <Form.Item label="模型服务" name="provider" rules={[{ required: true }]}><Select options={status ? Object.entries(status.providers).map(([value, provider]) => ({ value, label: provider.name })) : []} onChange={(value: Provider) => { if (status) form.setFieldsValue({ ...status.providers[value], apiKey: '' }); }} /></Form.Item>
        <Form.Item label="模型名称" name="model" rules={[{ required: true, message: '请输入模型名称' }, { max: 100 }]}><Input /></Form.Item>
        <Form.Item label="接口地址" name="baseUrl" rules={[{ required: true, message: '请输入服务商官方接口地址' }, { type: 'url', message: '请输入完整 HTTPS 地址' }]}><Input /></Form.Item>
        <Form.Item label="API Key" name="apiKey" dependencies={['provider']} extra={status?.configured ? '使用同一服务商时，留空可保留已保存的 Key。' : undefined} rules={[({ getFieldValue }) => ({ validator: (_, value) => value?.trim() || status?.configured && getFieldValue('provider') === status.provider ? Promise.resolve() : Promise.reject(new Error('请输入模型服务的 API Key')) })]}><Input.Password autoComplete="off" placeholder="粘贴服务商生成的 Key" /></Form.Item>
        <div className="ai-settings-actions"><Button onClick={closeSettings}>取消</Button><Button type="primary" htmlType="submit" loading={settingsBusy}>测试连接并保存</Button></div>
      </Form>
    </Modal>
  </>;
}
