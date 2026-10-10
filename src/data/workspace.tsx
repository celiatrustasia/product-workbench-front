import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import { makeSeed } from './seed';
import { makeWorkCode, migrateWorkCodes, reorderItems } from './migrate';
import type { Activity, DictionaryItem, Notice, Person, Platform, Requirement, Task, WorkKind, WorkbenchData } from '../types';
import { isApiMode, request, RequestError, setCsrf } from './api';

const DATA_KEY = 'product-workbench-preview-v1';
const SESSION_KEY = 'product-workbench-preview-user';
const stamp = () => dayjs().format('YYYY-MM-DDTHH:mm:ss');
const uniqueId = () => Math.random().toString(36).slice(2, 10);

function load(): WorkbenchData {
  try {
    const stored = localStorage.getItem(DATA_KEY);
    return migrateWorkCodes(stored ? JSON.parse(stored) as WorkbenchData : makeSeed());
  } catch {
    return migrateWorkCodes(makeSeed());
  }
}

interface WorkspaceContextValue {
  data: WorkbenchData;
  user?: Person;
  isPreview: boolean;
  loading?: boolean;
  error?: string;
  retry?: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  resetPersonPassword: (id: string) => Promise<{ temporaryPassword: string }>;
  signIn: (username: string, password: string) => boolean | Promise<boolean>;
  signOut: () => void | Promise<void>;
  saveWork: (kind: WorkKind, value: Requirement | Task) => string | Promise<string>;
  archiveWork: (kind: WorkKind, id: string, archived: boolean) => void | Promise<void>;
  updateMilestone: (taskId: string, milestoneId: string) => void | Promise<void>;
  savePlatform: (value: Platform) => void | Promise<void>;
  reorderPlatforms: (orderedIds: string[]) => void | Promise<void>;
  deletePlatform: (id: string) => void | Promise<void>;
  savePerson: (value: Person) => void | Promise<{ temporaryPassword?: string }>;
  deletePerson: (id: string) => void | Promise<void>;
  saveDictionary: (value: DictionaryItem) => void | Promise<void>;
  reorderDictionary: (group: DictionaryItem['group'], orderedIds: string[]) => void | Promise<void>;
  deleteDictionary: (id: string) => void | Promise<void>;
  deleteWork: (kind: WorkKind, id: string) => void | Promise<void>;
  markNotice: (id?: string) => void | Promise<void>;
  addNotice: (value: Omit<Notice, 'id' | 'createdAt' | 'read'>) => void;
  resetPreview: () => void;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  return isApiMode() ? <ApiWorkspaceProvider>{children}</ApiWorkspaceProvider> : <PreviewWorkspaceProvider>{children}</PreviewWorkspaceProvider>;
}

function PreviewWorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, updateData] = useState<WorkbenchData>(load);
  const dataRef = useRef(data);
  const setData = useCallback((value: WorkbenchData | ((current: WorkbenchData) => WorkbenchData)) => {
    const next = typeof value === 'function' ? value(dataRef.current) : value;
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(next));
    } catch {
      throw new Error('浏览器存储空间不足，未保存本次修改。请移除部分附件后重试。');
    }
    dataRef.current = next;
    updateData(next);
  }, []);
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const user = data.people.find(person => person.id === userId && person.active);

  useEffect(() => {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(dataRef.current)); }
    catch { /* Existing data stays intact if migration cannot be persisted yet. */ }
  }, []);
  useEffect(() => {
    if (userId && !user) {
      localStorage.removeItem(SESSION_KEY);
      setUserId(null);
    }
  }, [userId, user]);

  const signIn = useCallback((username: string, password: string) => {
    const person = data.people.find(item => item.username === username.trim() && item.active);
    if (!person || password !== 'demo1234') return false;
    localStorage.setItem(SESSION_KEY, person.id);
    setUserId(person.id);
    return true;
  }, [data.people]);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setUserId(null);
  }, []);

  const saveWork = useCallback((kind: WorkKind, value: Requirement | Task) => {
    const key = kind === 'requirement' ? 'requirements' : 'tasks';
    const currentData = dataRef.current;
    const items = currentData[key];
    const id = value.id || crypto.randomUUID();
    const existing = items.find(item => item.id === id);
    const number = currentData.nextNumbers?.[kind] || 1;
    const time = stamp();
    const saved = { ...value, id, code: existing?.code || makeWorkCode(kind, number), createdAt: existing?.createdAt || time, createdBy: existing?.createdBy || userId || 'celia', updatedAt: time };
    const activity: Activity = { id: uniqueId(), kind, workId: id, actorId: userId || 'celia', text: existing ? '更新了事项信息' : '创建了事项', createdAt: time };
    const targets = Array.from(new Set([saved.ownerId, ...saved.participantIds].filter(Boolean))) as string[];
    const notice: Notice | undefined = targets.length ? { id: uniqueId(), kind, workId: id, title: existing ? '事项信息已更新' : '新事项已分派', text: `${saved.title} ${existing ? '已更新' : '已创建并分派给你'}。`, createdAt: time, read: false, recipientIds: targets.filter(target => target !== userId), level: 'info' } : undefined;
    setData(current => ({
      ...current,
      nextNumbers: { requirement: 1, task: 1, ...current.nextNumbers, [kind]: existing ? number : number + 1 },
      [key]: [...current[key].filter(item => item.id !== id), saved],
      activities: [activity, ...current.activities],
      notices: notice && notice.recipientIds.length ? [notice, ...current.notices] : current.notices,
    }));
    return id;
  }, [setData, userId]);

  const archiveWork = useCallback((kind: WorkKind, id: string, archived: boolean) => {
    const key = kind === 'requirement' ? 'requirements' : 'tasks';
    setData(current => ({
      ...current,
      [key]: current[key].map(item => item.id === id ? { ...item, archived, updatedAt: stamp() } : item),
      activities: [{ id: uniqueId(), kind, workId: id, actorId: userId || 'celia', text: archived ? '归档了事项' : '恢复了事项', createdAt: stamp() }, ...current.activities],
    }));
  }, [userId]);

  const updateMilestone = useCallback((taskId: string, milestoneId: string) => {
    setData(current => ({
      ...current,
      tasks: current.tasks.map(task => task.id !== taskId ? task : {
        ...task,
        updatedAt: stamp(),
        milestones: task.milestones.map(m => m.id === milestoneId ? { ...m, completedAt: m.completedAt ? undefined : stamp() } : m),
      }),
      activities: [{ id: uniqueId(), kind: 'task', workId: taskId, actorId: userId || 'celia', text: '更新了里程碑完成状态', createdAt: stamp() }, ...current.activities],
    }));
  }, [userId]);

  const savePlatform = useCallback((value: Platform) => setData(current => ({ ...current, platforms: [...current.platforms.filter(item => item.id !== value.id), value] })), []);
  const reorderPlatforms = useCallback((orderedIds: string[]) => setData(current => ({
    ...current,
    platforms: reorderItems(current.platforms, orderedIds),
  })), []);
  const deletePlatform = useCallback((id: string) => setData(current => ({ ...current, platforms: current.platforms.filter(item => item.id !== id) })), []);
  const savePerson = useCallback((value: Person) => setData(current => ({ ...current, people: [...current.people.filter(item => item.id !== value.id), value] })), []);
  const deletePerson = useCallback((id: string) => setData(current => ({ ...current, people: current.people.filter(item => item.id !== id), notices: current.notices.map(item => ({ ...item, recipientIds: item.recipientIds.filter(personId => personId !== id), readByIds: item.readByIds?.filter(personId => personId !== id) })) })), []);
  const saveDictionary = useCallback((value: DictionaryItem) => setData(current => ({ ...current, dictionary: [...current.dictionary.filter(item => item.id !== value.id), value] })), []);
  const reorderDictionary = useCallback((group: DictionaryItem['group'], orderedIds: string[]) => setData(current => ({
    ...current,
    dictionary: [...current.dictionary.filter(item => item.group !== group), ...reorderItems(current.dictionary.filter(item => item.group === group), orderedIds)],
  })), []);
  const deleteDictionary = useCallback((id: string) => setData(current => ({ ...current, dictionary: current.dictionary.filter(item => item.id !== id) })), []);
  const deleteWork = useCallback((kind: WorkKind, id: string) => setData(current => kind === 'requirement' ? {
    ...current,
    requirements: current.requirements.filter(item => item.id !== id),
    tasks: current.tasks.map(item => item.requirementId === id ? { ...item, requirementId: undefined, updatedAt: stamp() } : item),
    notices: current.notices.filter(item => !(item.kind === kind && item.workId === id)),
    activities: current.activities.filter(item => !(item.kind === kind && item.workId === id)),
  } : {
    ...current,
    tasks: current.tasks.filter(item => item.id !== id),
    notices: current.notices.filter(item => !(item.kind === kind && item.workId === id)),
    activities: current.activities.filter(item => !(item.kind === kind && item.workId === id)),
  }), []);
  const markNotice = useCallback((id?: string) => setData(current => ({ ...current, notices: current.notices.map(item => item.recipientIds.includes(userId || '') && (!id || item.id === id) ? { ...item, readByIds: Array.from(new Set([...(item.readByIds || []), userId!])) } : item) })), [userId]);
  const addNotice = useCallback((value: Omit<Notice, 'id' | 'createdAt' | 'read'>) => setData(current => ({ ...current, notices: [{ ...value, id: uniqueId(), createdAt: stamp(), read: false }, ...current.notices] })), []);
  const resetPreview = useCallback(() => {
    const seed = migrateWorkCodes(makeSeed());
    setData(seed);
    localStorage.setItem(DATA_KEY, JSON.stringify(seed));
  }, []);

  return <WorkspaceContext.Provider value={{ data, user, isPreview: true, refreshWorkspace: async () => {}, changePassword: async () => { throw new Error('预览模式不支持修改密码'); }, resetPersonPassword: async () => ({ temporaryPassword: 'demo1234' }), signIn, signOut, saveWork, archiveWork, updateMilestone, savePlatform, reorderPlatforms, deletePlatform, savePerson, deletePerson, saveDictionary, reorderDictionary, deleteDictionary, deleteWork, markNotice, addNotice, resetPreview }}>{children}</WorkspaceContext.Provider>;
}

const emptyData = (): WorkbenchData => ({ people: [], platforms: [], dictionary: [], requirements: [], tasks: [], notices: [], activities: [] });
function ApiWorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkbenchData>(emptyData);
  const [user, setUser] = useState<Person>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const dataRef = useRef(data);
  const sessionVersion = useRef(0);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const session = sessionVersion.current;
    const version = ++refreshVersion.current;
    const next = await request<WorkbenchData>('/workspace');
    if (session !== sessionVersion.current || version !== refreshVersion.current) return;
    dataRef.current = next; setData(next); setError(undefined);
    setUser(current => current ? next.people.find(person => person.id === current.id) : current);
  }, []);
  const boot = useCallback(async () => {
    setLoading(true); setError(undefined);
    try {
      const session = await request<{ user: Person; csrf: string }>('/auth/me');
      setCsrf(session.csrf); setUser(session.user);
      if (!session.user.mustChangePassword) await refresh();
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) setUser(undefined);
      else setError(e instanceof Error ? e.message : '服务连接失败');
    } finally { setLoading(false); }
  }, [refresh]);
  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => {
    const expire = () => { sessionVersion.current++; setCsrf(''); setUser(undefined); dataRef.current = emptyData(); setData(emptyData()); };
    window.addEventListener('workbench-session-expired', expire);
    return () => window.removeEventListener('workbench-session-expired', expire);
  }, []);
  useEffect(() => {
    if (!user || user.mustChangePassword) return;
    const poll = setInterval(() => { void refresh().catch(() => {}); }, 30000);
    return () => clearInterval(poll);
  }, [user?.id, user?.mustChangePassword, refresh]);
  const mutate = async <T,>(path: string, method: string, body?: unknown) => {
    const value = await request<T>(path, method, body);
    // Do not report a committed write as failed when only its refresh is unavailable.
    await refresh().catch(e => setError(e instanceof Error ? `已保存，但数据刷新失败：${e.message}` : '已保存，请刷新页面'));
    return value;
  };
  const setting = async (kind: 'platforms' | 'people' | 'dictionaries', value: Platform | Person | DictionaryItem) => {
    const existing = dataRef.current[kind === 'dictionaries' ? 'dictionary' : kind].some(item => item.id === value.id);
    return mutate<{ temporaryPassword?: string }>(`/${kind}${existing ? `/${value.id}` : ''}`, existing ? 'PUT' : 'POST', value);
  };
  return <WorkspaceContext.Provider value={{ data, user, isPreview: false, loading, error, refreshWorkspace: refresh, retry: () => { void boot(); },
    signIn: async (username, password) => { const session = await request<{ user: Person; csrf: string }>('/auth/login', 'POST', { username, password }); sessionVersion.current++; setCsrf(session.csrf); setUser(session.user); if (!session.user.mustChangePassword) await refresh(); return true; },
    signOut: async () => { await request('/auth/logout', 'POST'); sessionVersion.current++; setCsrf(''); setUser(undefined); dataRef.current = emptyData(); setData(emptyData()); },
    changePassword: async (oldPassword, newPassword) => { await request('/auth/password', 'POST', { oldPassword, newPassword }); setUser(current => current ? { ...current, mustChangePassword: false } : current); await refresh(); },
    resetPersonPassword: id => mutate<{ temporaryPassword: string }>(`/people/${id}/reset-password`, 'POST'),
    saveWork: async (kind, value) => (await mutate<Requirement | Task>(`/works/${kind}${value.id ? `/${value.id}` : ''}`, value.id ? 'PUT' : 'POST', value)).id,
    archiveWork: async (kind, id, archived) => { await mutate(`/works/${kind}/${id}/archive`, 'PATCH', { archived }); },
    deleteWork: async (kind, id) => { await mutate(`/works/${kind}/${id}`, 'DELETE'); },
    updateMilestone: async (taskId, milestoneId) => { const task = dataRef.current.tasks.find(item => item.id === taskId); if (!task) throw new Error('任务不存在'); await mutate(`/tasks/${taskId}/milestones/${milestoneId}`, 'PATCH', { revision: task.revision, completed: !task.milestones.find(item => item.id === milestoneId)?.completedAt }); },
    savePlatform: async value => { await setting('platforms', value); }, savePerson: value => setting('people', value), saveDictionary: async value => { await setting('dictionaries', value); },
    reorderPlatforms: async ids => { await mutate('/platforms/order', 'POST', { ids }); }, reorderDictionary: async (group, ids) => { await mutate('/dictionaries/order', 'POST', { group, ids }); },
    deletePlatform: async id => { await mutate(`/platforms/${id}`, 'DELETE'); }, deletePerson: async id => { await mutate(`/people/${id}`, 'DELETE'); }, deleteDictionary: async id => { await mutate(`/dictionaries/${id}`, 'DELETE'); },
    markNotice: async id => { await mutate(id ? `/notices/${id}/read` : '/notices/read', 'PATCH'); }, addNotice: () => { throw new Error('提醒由服务端生成'); }, resetPreview: () => {},
  }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspaceProvider is required');
  return context;
}
