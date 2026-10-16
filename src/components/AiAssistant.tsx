import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, App, Button, Form, Input, Modal, Select, Spin, Tag, Tooltip } from 'antd';
import { Bubble, Sender } from '@ant-design/x';
import { ArrowUpOutlined, CloseOutlined, PlusOutlined, RobotOutlined, SettingOutlined } from '@ant-design/icons';
import { request } from '../data/api';
import { useWorkspace } from '../data/workspace';
import type { WorkKind } from '../types';
import { displayName, platformName } from '../utils';

type Provider = 'deepseek' | 'qwen' | 'openai' | 'kimi';
type ModelStatus = {
  configured: boolean; managedByEnvironment: boolean; provider: Provider; model: string; baseUrl: string;
  providers: Record<Provider, { name: string; model: string; baseUrl: string }>;
};
type CreatedWork = { kind: WorkKind; id: string; code: string; title: string; priority: string; platformId: string; ownerId: string };
type Reply = { reply: string; created: CreatedWork[] };
type ChatMessage = { id: string; role: 'user' | 'assistant'; text: string; created?: CreatedWork[] };
type ChatRequest = { requestId: string; message: string; history: { role: 'user' | 'assistant'; content: string }[] };
type ModelSettings = { provider: Provider; model: string; baseUrl: string; apiKey?: string };

function ModelSettingsForm({ status, busy, onSave, onCancel }: {
  status: ModelStatus; busy: boolean; onSave: (value: ModelSettings) => Promise<void>; onCancel: () => void;
}) {
  const [form] = Form.useForm<ModelSettings>();
  const selectedProvider = Form.useWatch('provider', form) as Provider | undefined;
  return <Form name="ai-model-settings" form={form} layout="vertical" requiredMark onFinish={onSave} autoComplete="off" disabled={busy}
    initialValues={{ provider: status.provider, model: status.model, baseUrl: status.baseUrl, apiKey: '' }}>
    <Form.Item label="模型服务" name="provider" rules={[{ required: true }]}><Select options={Object.entries(status.providers).map(([value, provider]) => ({ value, label: provider.name }))} onChange={(value: Provider) => {
      const current = value === status.provider ? status : status.providers[value];
      form.setFieldsValue({ model: current.model, baseUrl: current.baseUrl, apiKey: '' });
    }} /></Form.Item>
    {selectedProvider === 'openai' && <Alert type="info" className="ai-settings-notice" title="OpenAI / Responses 兼容接口" description={<span>官方接口使用 OpenAI 平台 API Key；团队接口使用对应服务的 Key。调用权限及费用以所选服务为准。<a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI 平台</a></span>} />}
    {selectedProvider === 'kimi' && <Alert type="info" className="ai-settings-notice" title="Kimi 开放平台" description={<span>填写 Kimi 开放平台的 API Key，模型名称以账号可用模型为准。<a href="https://platform.kimi.com/console/api-keys" target="_blank" rel="noopener noreferrer">获取 Kimi API Key</a></span>} />}
    <Form.Item label="模型名称" name="model" rules={[{ required: true, message: '请输入模型名称' }, { max: 100 }]}><Input autoComplete="off" spellCheck={false} /></Form.Item>
    <Form.Item label="接口地址" name="baseUrl" rules={[{ required: true, message: '请输入服务商 HTTPS 接口地址' }, { type: 'url', message: '请输入完整 HTTPS 地址' }]}><Input type="url" autoComplete="off" spellCheck={false} /></Form.Item>
    <Form.Item label="API Key" name="apiKey" dependencies={['provider']} extra={status.configured && selectedProvider === status.provider ? 'API Key 已保存；留空可继续使用，不回显密钥。' : undefined} rules={[({ getFieldValue }) => ({ validator: (_, value) => value?.trim() || status.configured && getFieldValue('provider') === status.provider ? Promise.resolve() : Promise.reject(new Error('请输入模型服务的 API Key')) })]}><Input.Password autoComplete="new-password" placeholder={status.configured && selectedProvider === status.provider ? '已保存 Key，无需重复输入' : '粘贴服务商生成的 Key'} /></Form.Item>
    <div className="ai-settings-actions"><Button onClick={onCancel}>取消</Button><Button type="primary" htmlType="submit" loading={busy}>测试连接并保存</Button></div>
  </Form>;
}

export default function AiAssistant() {
  const { user, data, isPreview, isVisitor, refreshWorkspace } = useWorkspace();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ModelStatus>();
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<{ payload: ChatRequest; error: string }>();
  const pending = useRef(false);
  const log = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  const admin = user?.access === '管理员';
  const readOnly = isVisitor || isPreview;

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const loadStatus = async () => {
    if (readOnly) return;
    setConfigLoading(true); setConfigError('');
    try { const value = await request<ModelStatus>('/assistant/config'); if (mounted.current) { setStatus(value); return value; } }
    catch (error) { if (mounted.current) setConfigError(error instanceof Error ? error.message : '助手配置读取失败'); }
    finally { if (mounted.current) setConfigLoading(false); }
  };
  useEffect(() => { if (open) void loadStatus(); }, [open, readOnly]);
  useEffect(() => { if (open && log.current) log.current.scrollTop = messages.length || busy || failed ? log.current.scrollHeight : 0; }, [messages, busy, failed, open]);
  const close = () => { setOpen(false); launcher.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !settingsOpen) close(); };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [open, settingsOpen]);

  const send = async (payload: ChatRequest, retry = false) => {
    if (pending.current || !status?.configured || readOnly) return;
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
  const editSettings = async () => {
    if (readOnly || configLoading) return;
    const current = await loadStatus();
    if (current) { setSettingsError(''); setSettingsOpen(true); }
  };
  const closeSettings = () => { if (!settingsBusy) { setSettingsOpen(false); setSettingsError(''); } };
  const saveSettings = async (value: ModelSettings) => {
    if (readOnly) return;
    setSettingsBusy(true); setSettingsError('');
    try {
      const updated = await request<ModelStatus>('/assistant/config', 'PUT', value, 60000);
      if (!mounted.current) return;
      setStatus(updated); setSettingsOpen(false); message.success('模型连接成功，AI 助手已启用');
    } catch (error) { if (mounted.current) setSettingsError(error instanceof Error ? error.message : '模型配置保存失败'); }
    finally { if (mounted.current) setSettingsBusy(false); }
  };
  const examplePlatform = data.platforms.find(item => item.active)?.name;
  const unavailable = readOnly || !status?.configured || configLoading || Boolean(configError);

  return <>
    <div className="ai-assistant">
      {open && <section id="ai-assistant-panel" className="ai-panel" role="region" aria-label="AI 助手聊天">
        <header className="ai-header"><span className="ai-avatar"><RobotOutlined /></span><div className="ai-header-title"><strong>AI 助手</strong><small>{isVisitor ? '访客演示' : isPreview ? '离线预览' : configLoading ? '正在连接' : status?.configured ? status.providers[status.provider].name : '待配置模型'}</small></div>
          {admin && !readOnly && <Tooltip title="模型设置"><Button type="text" icon={<SettingOutlined />} aria-label="模型设置" disabled={!status || configLoading || status.managedByEnvironment} onClick={editSettings} /></Tooltip>}
          {!isVisitor && <Tooltip title="新对话"><Button type="text" icon={<PlusOutlined />} aria-label="新对话" disabled={busy || Boolean(failed)} onClick={() => { setMessages([]); setInput(''); }} /></Tooltip>}
          <Button type="text" icon={<CloseOutlined />} aria-label="关闭 AI 助手" onClick={close} />
        </header>
        <div ref={log} className="ai-conversation" role="log" aria-live="polite" aria-relevant="additions text">
          {!messages.length && <div className="ai-welcome"><span className="ai-welcome-icon"><RobotOutlined /></span><h3>把需求和任务交给我</h3><p>{isVisitor ? '在正式工作台中，告诉助手平台、要做什么，以及负责人或参与人，即可通过对话创建需求和任务。缺少必要信息时，助手会继续追问。' : '告诉我平台、要做什么，以及负责人或参与人。信息齐全即可创建，缺少必要信息时我会追问。'}</p><p className="muted">未指定负责人时分派给你；优先级默认 P2。</p>{examplePlatform && (isVisitor ? <div className="ai-example"><strong>指令示例</strong><br />帮我在 {examplePlatform} 创建一个任务：整理下周产品评审材料，负责人是我，优先级 P2。</div> : <button className="ai-example" disabled={unavailable} onClick={() => setInput(`帮我在 ${examplePlatform} 创建一个任务：整理下周产品评审材料，负责人是我，优先级 P2。`)}>试试：为 {examplePlatform} 新建任务</button>)}</div>}
          {messages.map(item => <Bubble key={item.id} placement={item.role === 'user' ? 'end' : 'start'} variant={item.role === 'user' ? 'filled' : 'outlined'} content={<div><div className="ai-message-text">{item.text}</div>{item.created?.map(work => <Link className="ai-created-work" key={work.id} to={`/${work.kind === 'task' ? 'tasks' : 'requirements'}/${work.id}`}><span><Tag>{work.kind === 'task' ? '任务' : '需求'}</Tag><b>{work.code}</b></span><strong>{work.title}</strong><small>{platformName(data, work.platformId)} · {displayName(data, work.ownerId)} · {work.priority}</small></Link>)}</div>} />)}
          {busy && <div className="ai-thinking"><Spin size="small" />正在理解并处理，请稍候…</div>}
          {failed && <Alert type="error" showIcon title={failed.error} action={<Button size="small" disabled={busy} onClick={() => void send(failed.payload, true)}>重试这条消息</Button>} />}
        </div>
        <div className="ai-composer">
          {isVisitor ? <><Alert type="info" showIcon title="当前为访客演示模式" description="创建需求、任务等操作需进入正式工作台并登录。正式账号需联系管理员开通。" /><Button type="primary" href="/#/login">进入正式工作台</Button></> : isPreview ? <Alert type="info" title="请在在线系统使用 AI 助手" /> : configError ? <Alert type="error" title={configError} action={<Button size="small" onClick={() => void loadStatus()}>重试</Button>} /> : !configLoading && !status?.configured && <Alert type="info" title={admin ? '配置模型 Key 后即可使用' : '请联系管理员配置 AI 模型'} action={admin && <Button size="small" onClick={editSettings} disabled={!status}>去配置</Button>} />}
          <Sender value={input} onChange={setInput} onSubmit={submit} disabled={unavailable || busy || Boolean(failed)} autoSize={{ minRows: 2, maxRows: 5 }} submitType="enter" placeholder={isVisitor ? '登录正式工作台后，可发送需求或任务…' : '例如：给 CertCloud 新建需求，优化证书搜索…'} suffix={<Button type="primary" shape="circle" size="small" icon={<ArrowUpOutlined />} aria-label="发送给 AI 助手" loading={busy} disabled={unavailable || Boolean(failed) || !input.trim() || input.length > 4000} onClick={() => submit(input)} />} />
          {!isVisitor && <small className="ai-composer-note">Enter 发送 · Shift + Enter 换行 · 每次最多 10 条{input.length > 4000 && <span className="danger-text"> · 已超过 4000 字</span>}</small>}
        </div>
      </section>}
      <Button ref={launcher} className="ai-launcher" type="primary" icon={<RobotOutlined />} aria-label={open ? '收起 AI 助手' : '打开 AI 助手'} aria-expanded={open} aria-controls="ai-assistant-panel" onClick={() => open ? close() : setOpen(true)}>AI 助手</Button>
    </div>
    <Modal title="AI 模型设置" open={settingsOpen} onCancel={closeSettings} footer={null} destroyOnHidden closable={!settingsBusy} mask={{ closable: !settingsBusy }}>
      <Alert type="info" title="Key 仅保存于服务器，团队成员共用此模型。" description="对话内容会发送给所选模型服务；调用费用由该服务商按用量收取。" className="ai-settings-notice" />
      {settingsError && <Alert type="error" showIcon title={settingsError} className="ai-settings-notice" />}
      {settingsOpen && status && <ModelSettingsForm status={status} busy={settingsBusy} onSave={saveSettings} onCancel={closeSettings} />}
    </Modal>
  </>;
}
