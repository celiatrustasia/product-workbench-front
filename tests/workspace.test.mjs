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
const { focusReasons, formatDate, workCode, weekBounds, dueListPageSize } = loadModule('../src/utils.ts');
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

test('weekly focus includes both manual and automatic inclusion', () => {
  const item = { archived: false, manualFocus: false, status: '设计中', targetAt: weekBounds().start.add(2, 'day').format('YYYY-MM-DD') };
  assert.deepEqual(focusReasons(item), ['本周节点']);
  assert.deepEqual(focusReasons({ ...item, manualFocus: true }), ['手动重点', '本周节点']);
  assert.deepEqual(focusReasons({ ...item, status: '已上线' }), []);
  assert.deepEqual(focusReasons({ ...item, archived: true, manualFocus: true }), []);
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
