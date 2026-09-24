import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import dayjs from 'dayjs';
import { makeSeed } from './seed';
import type { Activity, DictionaryItem, Notice, Person, Platform, Requirement, Task, WorkKind, WorkbenchData } from '../types';

const DATA_KEY = 'product-workbench-preview-v1';
const SESSION_KEY = 'product-workbench-preview-user';
const stamp = () => dayjs().format('YYYY-MM-DDTHH:mm:ss');
const uniqueId = () => Math.random().toString(36).slice(2, 10);

function load(): WorkbenchData {
  try {
    const stored = localStorage.getItem(DATA_KEY);
    return stored ? JSON.parse(stored) as WorkbenchData : makeSeed();
  } catch {
    return makeSeed();
  }
}

function nextWorkId(kind: WorkKind, items: { id: string }[]) {
  const prefix = kind === 'requirement' ? 'REQ' : 'TASK';
  const month = dayjs().format('YYYYMM');
  const base = `${prefix}-${month}-`;
  const next = Math.max(0, ...items.filter(item => item.id.startsWith(base)).map(item => Number(item.id.slice(base.length)) || 0)) + 1;
  return `${base}${String(next).padStart(3, '0')}`;
}

interface WorkspaceContextValue {
  data: WorkbenchData;
  user?: Person;
  signIn: (username: string, password: string) => boolean;
  signOut: () => void;
  saveWork: (kind: WorkKind, value: Requirement | Task) => string;
  archiveWork: (kind: WorkKind, id: string, archived: boolean) => void;
  updateMilestone: (taskId: string, milestoneId: string) => void;
  savePlatform: (value: Platform) => void;
  reorderPlatforms: (orderedIds: string[]) => void;
  deletePlatform: (id: string) => void;
  savePerson: (value: Person) => void;
  deletePerson: (id: string) => void;
  saveDictionary: (value: DictionaryItem) => void;
  deleteDictionary: (id: string) => void;
  deleteWork: (kind: WorkKind, id: string) => void;
  markNotice: (id?: string) => void;
  addNotice: (value: Omit<Notice, 'id' | 'createdAt' | 'read'>) => void;
  resetPreview: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkbenchData>(load);
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(SESSION_KEY));
  const user = data.people.find(person => person.id === userId && person.active);

  useEffect(() => { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }, [data]);
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
    const items = data[key];
    const id = value.id || nextWorkId(kind, items);
    const existing = items.find(item => item.id === id);
    const time = stamp();
    const saved = { ...value, id, createdAt: existing?.createdAt || time, createdBy: existing?.createdBy || userId || 'celia', updatedAt: time };
    const activity: Activity = { id: uniqueId(), kind, workId: id, actorId: userId || 'celia', text: existing ? '更新了事项信息' : '创建了事项', createdAt: time };
    const targets = Array.from(new Set([saved.ownerId, ...saved.participantIds].filter(Boolean))) as string[];
    const notice: Notice | undefined = targets.length ? { id: uniqueId(), kind, workId: id, title: existing ? '事项信息已更新' : '新事项已分派', text: `${saved.title} ${existing ? '已更新' : '已创建并分派给你'}。`, createdAt: time, read: false, recipientIds: targets.filter(target => target !== userId), level: 'info' } : undefined;
    setData(current => ({
      ...current,
      [key]: [...current[key].filter(item => item.id !== id), saved],
      activities: [activity, ...current.activities],
      notices: notice && notice.recipientIds.length ? [notice, ...current.notices] : current.notices,
    }));
    return id;
  }, [data, userId]);

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
    platforms: orderedIds
      .map(id => current.platforms.find(item => item.id === id))
      .filter((item): item is Platform => Boolean(item))
      .map((item, index) => ({ ...item, sort: index + 1 })),
  })), []);
  const deletePlatform = useCallback((id: string) => setData(current => ({ ...current, platforms: current.platforms.filter(item => item.id !== id) })), []);
  const savePerson = useCallback((value: Person) => setData(current => ({ ...current, people: [...current.people.filter(item => item.id !== value.id), value] })), []);
  const deletePerson = useCallback((id: string) => setData(current => ({ ...current, people: current.people.filter(item => item.id !== id), notices: current.notices.map(item => ({ ...item, recipientIds: item.recipientIds.filter(personId => personId !== id), readByIds: item.readByIds?.filter(personId => personId !== id) })) })), []);
  const saveDictionary = useCallback((value: DictionaryItem) => setData(current => ({ ...current, dictionary: [...current.dictionary.filter(item => item.id !== value.id), value] })), []);
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
    const seed = makeSeed();
    setData(seed);
    localStorage.setItem(DATA_KEY, JSON.stringify(seed));
  }, []);

  return <WorkspaceContext.Provider value={{ data, user, signIn, signOut, saveWork, archiveWork, updateMilestone, savePlatform, reorderPlatforms, deletePlatform, savePerson, deletePerson, saveDictionary, deleteDictionary, deleteWork, markNotice, addNotice, resetPreview }}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('WorkspaceProvider is required');
  return context;
}
