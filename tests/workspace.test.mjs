import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

function loadModule(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(createRequire(import.meta.url), module, module.exports);
  return module.exports;
}

const { migrateWorkCodes, makeWorkCode, reorderItems } = loadModule('../src/data/migrate.ts');
const { focusReasons, focusedItemsForScope, dueItems, formatDate, workCode, weekBounds, dueListPageSize, compareWorkDefault, dateCellHint } = loadModule('../src/utils.ts');
const { getBreadcrumbItems, primaryNavigation, managementNavigation } = loadModule('../src/navigation.ts');
const fixture = () => ({
  requirements: [{ id: 'REQ-old-001', title: 'Existing requirement', attachments: [{ id: 'file', dataUrl: 'data:text/plain;base64,dGVzdA==' }] }, { id: 'REQ-old-002' }],
  tasks: [{ id: 'TASK-old-001', requirementId: 'REQ-old-001' }],
  activities: [{ workId: 'REQ-old-001' }], notices: [{ workId: 'TASK-old-001' }],
});

test('legacy numbers migrate while internal links and attachments stay intact', () => {
  const old = fixture();
  const data = migrateWorkCodes(old);
  assert.deepEqual(data.requirements.map(item => item.code), ['R00001', 'R00002']);
  assert.equal(data.tasks[0].code, 'T00001');
  assert.equal(data.tasks[0].requirementId, old.requirements[0].id);
  assert.deepEqual(data.requirements[0].attachments, old.requirements[0].attachments);
  assert.deepEqual(data.notices, old.notices);
  assert.equal(old.requirements[0].code, undefined);
});

test('migration is idempotent and retains monotonic counters after deletions', () => {
  const data = migrateWorkCodes(fixture());
  assert.deepEqual(migrateWorkCodes(data), data);
  const afterDeletion = migrateWorkCodes({ ...data, requirements: [] });
  assert.equal(afterDeletion.nextNumbers.requirement, 3);
  assert.equal(makeWorkCode('requirement', afterDeletion.nextNumbers.requirement), 'R00003');
});

test('mixed data preserves existing numbers and assigns unique numbers', () => {
  const data = fixture();
  data.requirements[0].code = 'R00008';
  data.requirements.push({ id: 'third', code: 'R00008' });
  const result = migrateWorkCodes(data);
  assert.deepEqual(result.requirements.map(item => item.code), ['R00008', 'R00009', 'R00010']);
  assert.equal(result.nextNumbers.requirement, 11);
});

test('drag ordering does not drop omitted items or duplicate records', () => {
  const items = [{ id: 'a', sort: 1 }, { id: 'b', sort: 2 }, { id: 'c', sort: 3 }];
  const result = reorderItems(items, ['b', 'b', 'missing', 'a']);
  assert.deepEqual(result.map(item => item.id), ['b', 'a', 'c']);
  assert.deepEqual(result.map(item => item.sort), [1, 2, 3]);
  assert.deepEqual(items.map(item => item.sort), [1, 2, 3]);
});

test('focus is manual only regardless of near deadlines, milestones or completion', () => {
  const item = { archived: false, manualFocus: false, status: '设计中', targetAt: weekBounds().start.add(2, 'day').format('YYYY-MM-DD') };
  assert.deepEqual(focusReasons(item), []);
  assert.deepEqual(focusReasons({ ...item, manualFocus: true }), ['手动重点']);
  assert.deepEqual(focusReasons({ ...item, status: '已上线' }), []);
  assert.deepEqual(focusReasons({ ...item, status: '已上线', manualFocus: true }), ['手动重点']);
  assert.deepEqual(focusReasons({ ...item, milestones: [{ plannedAt: item.targetAt }], status: '进行中', dueAt: item.targetAt }), []);
  assert.deepEqual(focusReasons({ ...item, archived: true, manualFocus: true }), []);
});

test('default work sorting applies number, priority, stage and manual focus in order', () => {
  const base = { id: 'one', code: 'R00009', priority: 'P2', status: '设计中', manualFocus: false };
  assert.ok(compareWorkDefault({ ...base, code: 'R00010', priority: 'P4', status: '已上线' }, base) < 0);
  assert.ok(compareWorkDefault({ ...base, priority: 'P1', status: '已上线' }, base) < 0);
  assert.ok(compareWorkDefault(base, { ...base, status: '已上线', manualFocus: true }) < 0);
  assert.ok(compareWorkDefault({ ...base, manualFocus: true }, base) < 0);
  assert.ok(compareWorkDefault({ ...base, code: 'T00001', status: '挂起' }, { ...base, code: 'T00001', status: '已完成' }) < 0);
});

test('date cells omit missing and completed hints but retain active countdowns', () => {
  const base = { status: '设计中', targetAt: undefined };
  assert.equal(dateCellHint(base), undefined);
  assert.equal(dateCellHint({ status: '挂起', milestones: [] }), undefined);
  assert.equal(dateCellHint({ ...base, status: '已上线', targetAt: '2026-09-30T17:00:00' }), undefined);
  assert.equal(dateCellHint({ ...base, targetAt: new Date(Date.now() + 4 * 86400000).toISOString() }), '4 天后');
});

test('personal dashboard scopes only include focused requirements and tasks', () => {
  const base = { archived: false, status: '已上线', manualFocus: true, participantIds: [], ownerId: 'me' };
  const data = {
    requirements: [
      { ...base, id: 'owned-focus' },
      { ...base, id: 'owned-unfocused', manualFocus: false },
      { ...base, id: 'joined-focus', ownerId: 'other', participantIds: ['me'] },
      { ...base, id: 'joined-unfocused', ownerId: 'other', participantIds: ['me'], manualFocus: false },
      { ...base, id: 'archived', archived: true },
    ],
    tasks: [{ ...base, id: 'focused-task', status: '已完成', milestones: [] }],
  };
  assert.deepEqual(focusedItemsForScope(data, '重点关注', 'me').map(item => item.id), ['owned-focus', 'joined-focus', 'focused-task']);
  assert.deepEqual(focusedItemsForScope(data, '我负责的', 'me').map(item => item.id), ['owned-focus', 'focused-task']);
  assert.deepEqual(focusedItemsForScope(data, '我参与的', 'me').map(item => item.id), ['joined-focus']);
  assert.deepEqual(focusedItemsForScope(data, '我负责的'), []);
});

test('due panel includes overdue through three calendar days by actual deadline', () => {
  const today = weekBounds().start.add((new Date().getDay() + 6) % 7, 'day');
  const when = days => today.add(days, 'day').format('YYYY-MM-DDTHH:mm:ss');
  const base = { archived: false, status: '设计中', manualFocus: false, participantIds: [] };
  const data = {
    requirements: [-2, 0, 1, 3, 4].map(days => ({ ...base, id: `r${days}`, targetAt: when(days) })),
    tasks: [
      { ...base, id: 'near-task', status: '进行中', dueAt: when(3), milestones: [] },
      { ...base, id: 'completed', status: '已完成', dueAt: when(-1), milestones: [] },
      { ...base, id: 'paused', status: '挂起', dueAt: when(0), milestones: [] },
      { ...base, id: 'archived', status: '进行中', archived: true, dueAt: when(1), milestones: [] },
      { ...base, id: 'milestone-only', status: '进行中', dueAt: when(10), milestones: [{ plannedAt: when(0) }] },
      { ...base, id: 'no-deadline', status: '进行中', milestones: [{ plannedAt: when(-1) }] },
    ],
  };
  assert.deepEqual(dueItems(data).map(item => item.id), ['r-2', 'r0', 'r1', 'r3', 'near-task']);
});

test('all list dates include the year and display numbers use short codes', () => {
  assert.equal(formatDate('2026-10-11T17:00:00'), '2026/10/11');
  assert.equal(formatDate('2026-10-11T17:00:00', true), '2026/10/11 17:00');
  assert.equal(workCode({ id: 'REQ-old-001', code: 'R00001' }), 'R00001');
  assert.equal(makeWorkCode('task', 100000), 'T100000');
});

test('due list uses available height and only reserves pagination when necessary', () => {
  assert.equal(dueListPageSize(600, 7), 8);
  assert.equal(dueListPageSize(600, 8), 8);
  assert.equal(dueListPageSize(600, 9), 7);
  assert.equal(dueListPageSize(175, 20), 1);
  assert.equal(dueListPageSize(null, 20), 8);
  for (const height of [240, 400, 600, 900]) {
    const capacity = dueListPageSize(height, 50);
    assert.ok(65 + capacity * 64 + 46 <= height);
  }
});

test('breadcrumbs match top-level navigation without a redundant dashboard prefix', () => {
  for (const item of primaryNavigation) {
    assert.deepEqual(getBreadcrumbItems(item.key), [{ title: item.label }]);
  }
  assert.deepEqual(getBreadcrumbItems('/requirements/'), [{ title: '需求池' }]);
});

test('management breadcrumbs include their actual sidebar parent', () => {
  for (const item of managementNavigation) {
    assert.deepEqual(getBreadcrumbItems(item.key), [{ title: '基础管理' }, { title: item.label }]);
  }
});

test('detail breadcrumbs link to the correct list and show the current item', () => {
  assert.deepEqual(getBreadcrumbItems('/requirements/R00001', '消息中心改版'), [{ title: '需求池', path: '/requirements' }, { title: '消息中心改版' }]);
  assert.deepEqual(getBreadcrumbItems('/tasks/T00001'), [{ title: '任务管理', path: '/tasks' }, { title: '任务详情' }]);
  assert.deepEqual(getBreadcrumbItems('/requirements/missing'), [{ title: '需求池', path: '/requirements' }, { title: '需求详情' }]);
});
