export type Priority = 'P1' | 'P2' | 'P3' | 'P4';
export type RequirementStatus = '待评估' | '设计中' | '研发中' | '测试中' | '已上线';
export type TaskStatus = '待处理' | '进行中' | '阻塞' | '已完成' | '挂起';
export type WorkKind = 'requirement' | 'task';

export interface Person {
  id: string;
  name: string;
  username: string;
  role: '产品' | '研发' | '测试';
  access: '管理员' | '普通成员';
  active: boolean;
  color: string;
}

export interface Platform {
  id: string;
  name: string;
  description: string;
  active: boolean;
  sort: number;
}

export interface DictionaryItem {
  id: string;
  group: 'requirementType' | 'requirementSource' | 'taskSource';
  name: string;
  active: boolean;
  sort: number;
}

export interface Milestone {
  id: string;
  name: string;
  plannedAt: string;
  completedAt?: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: number;
  dataUrl: string;
}

export interface WorkBase {
  id: string;
  title: string;
  description: string;
  platformId: string;
  priority: Priority;
  manualFocus: boolean;
  ownerId?: string;
  participantIds: string[];
  note: string;
  attachments: Attachment[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface Requirement extends WorkBase {
  status: RequirementStatus;
  type?: string;
  source?: string;
  proposer?: string;
  proposedAt?: string;
  targetAt?: string;
  launchedAt?: string;
}

export interface Task extends WorkBase {
  status: TaskStatus;
  requirementId?: string;
  source?: string;
  startedAt?: string;
  dueAt?: string;
  completedAt?: string;
  milestones: Milestone[];
}

export interface Notice {
  id: string;
  kind: WorkKind;
  workId: string;
  title: string;
  text: string;
  createdAt: string;
  read: boolean;
  readByIds?: string[];
  recipientIds: string[];
  level: 'info' | 'warning' | 'danger';
}

export interface Activity {
  id: string;
  kind: WorkKind;
  workId: string;
  actorId: string;
  text: string;
  createdAt: string;
}

export interface WorkbenchData {
  people: Person[];
  platforms: Platform[];
  dictionary: DictionaryItem[];
  requirements: Requirement[];
  tasks: Task[];
  notices: Notice[];
  activities: Activity[];
}
