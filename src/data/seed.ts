import dayjs from 'dayjs';
import type { WorkbenchData, Requirement, Task } from '../types';

const when = (days: number, hour = 17) => dayjs().startOf('day').add(days, 'day').hour(hour).format('YYYY-MM-DDTHH:mm:ss');
const now = when(0, 10);
const month = dayjs().format('YYYYMM');

const requirement = (sequence: number, value: Partial<Requirement>): Requirement => ({
  id: `REQ-${month}-${String(sequence).padStart(3, '0')}`,
  title: '', description: '', platformId: 'web', priority: 'P2', status: '待评估',
  manualFocus: false, participantIds: [], note: '', attachments: [],
  createdBy: 'celia', createdAt: when(-14), updatedAt: when(-1), archived: false,
  ...value,
});

const task = (sequence: number, value: Partial<Task>): Task => ({
  id: `TASK-${month}-${String(sequence).padStart(3, '0')}`,
  title: '', description: '', platformId: 'web', priority: 'P2', status: '待处理',
  manualFocus: false, participantIds: [], note: '', attachments: [], milestones: [],
  createdBy: 'celia', createdAt: when(-10), updatedAt: when(-1), archived: false,
  ...value,
});

export function makeSeed(): WorkbenchData {
  const requirements = [
    requirement(18, { title: '消息中心改版', description: '整合系统通知与业务消息，增加分类、未读筛选和批量已读。', platformId: 'mobile', priority: 'P1', status: '研发中', type: '优化', source: '产品规划', manualFocus: true, ownerId: 'chen', participantIds: ['lin', 'zhao'], proposer: 'Celia', proposedAt: when(-22), targetAt: when(3), note: '重点关注旧消息迁移与推送到达率。' }),
    requirement(16, { title: '计费套餐升级', description: '支持套餐升降级、差额结算和生效时间配置。', priority: 'P1', status: '测试中', type: '新功能', source: '客户反馈', ownerId: 'lin', participantIds: ['chen', 'zhao'], targetAt: when(2), proposer: '售后团队' }),
    requirement(21, { title: '海外登录流程适配', description: '适配海外手机号与邮箱登录流程。', platformId: 'open', status: '设计中', type: '优化', source: '业务需求', ownerId: 'zhou', participantIds: ['celia'], targetAt: when(5), manualFocus: true }),
    requirement(12, { title: '客户线索导出', description: '支持按筛选条件导出线索和权限控制。', platformId: 'admin', priority: 'P1', source: '客户反馈', ownerId: 'celia', targetAt: when(-2), manualFocus: true }),
    requirement(24, { title: '多语言帮助中心', description: '为帮助中心增加中英文内容和语言切换。', platformId: 'web', status: '设计中', type: '新功能', ownerId: 'celia', targetAt: when(12) }),
    requirement(23, { title: '管理端权限分级', description: '细化管理员与普通成员的数据操作权限。', platformId: 'admin', status: '研发中', priority: 'P1', type: '优化', ownerId: 'chen', participantIds: ['celia'], targetAt: when(8) }),
    requirement(8, { title: '工作台数据概览', description: '统一展示本周重点事项与项目数据。', platformId: 'admin', status: '已上线', type: '新功能', ownerId: 'celia', targetAt: when(-8), launchedAt: when(-7) }),
  ];

  const tasks = [
    task(42, { title: '完成权限矩阵联调', description: '联调角色、成员与业务接口的权限判定。', platformId: 'admin', requirementId: requirements[5].id, status: '进行中', priority: 'P1', source: '研发', ownerId: 'chen', participantIds: ['celia', 'zhao'], startedAt: when(-3), dueAt: when(4), manualFocus: true, milestones: [{ id: 'm-1', name: '接口联调', plannedAt: when(1) }, { id: 'm-2', name: '回归测试', plannedAt: when(3) }] }),
    task(39, { title: '修复 iOS 深色模式异常', description: '修复消息详情和筛选弹层在深色模式下的文字对比度。', platformId: 'mobile', status: '阻塞', priority: 'P1', source: '测试', ownerId: 'zhao', participantIds: ['chen'], dueAt: when(-2), manualFocus: true, note: '等待系统组件版本修复。' }),
    task(47, { title: '输出支付失败兜底方案', description: '明确支付失败后的重试、提示和客服入口。', platformId: 'payment', status: '待处理', priority: 'P2', source: '产品', ownerId: 'lin', participantIds: ['celia'], dueAt: when(1) }),
    task(44, { title: '消息中心埋点接入', description: '补齐阅读、筛选、消息跳转的埋点。', platformId: 'mobile', requirementId: requirements[0].id, status: '进行中', priority: 'P1', source: '研发', ownerId: 'lin', dueAt: when(3), milestones: [{ id: 'm-3', name: '埋点方案确认', plannedAt: when(-1), completedAt: when(-1) }, { id: 'm-4', name: '客户端接入', plannedAt: when(2) }] }),
    task(52, { title: '补充海外登录验收标准', description: '覆盖海外手机号、邮箱与异常提示场景。', platformId: 'open', requirementId: requirements[2].id, status: '待处理', source: '测试', ownerId: 'zhou', dueAt: when(4) }),
    task(36, { title: '完成支付回调压测', description: '验证高峰时段支付回调的稳定性。', platformId: 'payment', status: '阻塞', priority: 'P1', source: '研发', ownerId: 'zhou', participantIds: ['zhao'], dueAt: when(0), note: '测试环境不稳定。' }),
    task(31, { title: '完成套餐配置页开发', platformId: 'web', requirementId: requirements[1].id, status: '已完成', priority: 'P1', source: '研发', ownerId: 'chen', completedAt: when(-1), dueAt: when(-1) }),
    task(28, { title: '更新登录安全策略文档', platformId: 'open', status: '已完成', source: '产品', ownerId: 'lin', completedAt: when(-2), dueAt: when(-2) }),
    task(55, { title: '梳理帮助中心信息架构', platformId: 'web', requirementId: requirements[4].id, status: '进行中', source: '产品', ownerId: 'celia', participantIds: ['lin'], startedAt: when(-1), dueAt: when(6) }),
    task(49, { title: '整理线索导出权限范围', platformId: 'admin', requirementId: requirements[3].id, status: '挂起', priority: 'P2', source: '售后', ownerId: 'celia', dueAt: when(-3), note: '等待客户确认字段范围。' }),
  ];

  return {
    people: [
      { id: 'celia', name: 'Celia Wang', username: 'celia', role: '产品', access: '管理员', active: true, color: 'blue' },
      { id: 'chen', name: '陈一', username: 'chenyi', role: '研发', access: '普通成员', active: true, color: 'blue' },
      { id: 'lin', name: '林琪', username: 'linqi', role: '产品', access: '普通成员', active: true, color: 'green' },
      { id: 'zhao', name: '赵晓', username: 'zhaoxiao', role: '测试', access: '普通成员', active: true, color: 'violet' },
      { id: 'zhou', name: '周乐', username: 'zhoule', role: '研发', access: '普通成员', active: true, color: 'amber' },
    ],
    platforms: [
      { id: 'web', name: 'Web 端', description: '面向客户的桌面 Web 产品', active: true, sort: 1 },
      { id: 'mobile', name: '移动端', description: 'iOS 与 Android 移动产品', active: true, sort: 2 },
      { id: 'admin', name: '管理后台', description: '内部运营与管理系统', active: true, sort: 3 },
      { id: 'open', name: '开放平台', description: '开发者接口及接入能力', active: true, sort: 4 },
      { id: 'payment', name: '支付中心', description: '支付、计费和结算服务', active: true, sort: 5 },
    ],
    dictionary: [
      { id: 'd1', group: 'requirementType', name: '优化', active: true, sort: 1 },
      { id: 'd2', group: 'requirementType', name: '新功能', active: true, sort: 2 },
      { id: 'd3', group: 'requirementSource', name: '产品规划', active: true, sort: 1 },
      { id: 'd4', group: 'requirementSource', name: '客户反馈', active: true, sort: 2 },
      { id: 'd5', group: 'requirementSource', name: '业务需求', active: true, sort: 3 },
      { id: 'd6', group: 'taskSource', name: '产品', active: true, sort: 1 },
      { id: 'd7', group: 'taskSource', name: '研发', active: true, sort: 2 },
      { id: 'd8', group: 'taskSource', name: '测试', active: true, sort: 3 },
      { id: 'd9', group: 'taskSource', name: '售后', active: true, sort: 4 },
    ],
    requirements,
    tasks,
    notices: [
      { id: 'n1', kind: 'task', workId: tasks[0].id, title: '你被分派为负责人', text: '完成权限矩阵联调，需要在本周内完成。', createdAt: when(0, 9), read: false, recipientIds: ['chen'], level: 'info' },
      { id: 'n2', kind: 'task', workId: tasks[1].id, title: '任务已逾期', text: '修复 iOS 深色模式异常已逾期 2 天。', createdAt: when(0, 9), read: false, recipientIds: ['zhao', 'celia'], level: 'danger' },
      { id: 'n3', kind: 'requirement', workId: requirements[1].id, title: '目标上线时间临近', text: '计费套餐升级的目标上线时间在 2 天后。', createdAt: when(-1, 10), read: false, recipientIds: ['lin'], level: 'warning' },
      { id: 'n4', kind: 'task', workId: tasks[2].id, title: '任务截止时间已更新', text: '输出支付失败兜底方案的截止时间调整为明天。', createdAt: when(-2, 16), read: true, recipientIds: ['lin', 'celia'], level: 'info' },
    ],
    activities: [
      { id: 'a1', kind: 'requirement', workId: requirements[0].id, actorId: 'celia', text: '创建了需求', createdAt: when(-14) },
      { id: 'a2', kind: 'requirement', workId: requirements[0].id, actorId: 'chen', text: '将状态更新为“研发中”', createdAt: when(-5) },
      { id: 'a3', kind: 'task', workId: tasks[0].id, actorId: 'celia', text: '创建了任务并分派给陈一', createdAt: when(-8) },
      { id: 'a4', kind: 'task', workId: tasks[1].id, actorId: 'zhao', text: '将状态更新为“阻塞”', createdAt: when(-1) },
    ],
  };
}

export { now };
