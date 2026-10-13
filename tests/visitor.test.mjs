import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

function load(path) {
  const url = new URL(path, import.meta.url);
  const output = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const require = createRequire(url);
  const resolve = value => value.startsWith('./') ? load(new URL(value + '.ts', url).href) : require(value);
  new Function('require', 'module', 'exports', output)(resolve, module, module.exports);
  return module.exports;
}
const { isVisitorPath, makeVisitorSeed } = load('../src/data/visitor.ts');
test('visitor route is explicit and never turns normal or API paths public', () => {
  for (const path of ['/youke', '/youke/', '/youke/requirements']) assert.equal(isVisitorPath(path), true);
  for (const path of ['/', '/youke-admin', '/api/youke', '/login']) assert.equal(isVisitorPath(path), false);
});
test('public sample has isolated people, valid links, iterations and no private file URLs', () => {
  const data = makeVisitorSeed();
  const ids = new Set(data.iterations.map(item => item.id));
  const people = new Set(data.people.map(item => item.id));
  const works = [...data.requirements, ...data.tasks];
  assert.ok(data.requirements.length >= 5 && data.tasks.length >= 5 && data.iterations.length >= 3);
  assert.ok(data.people.every(person => person.name.startsWith('演示') && person.username.startsWith('demo.')));
  assert.ok(works.every(item => ids.has(item.iterationId) && people.has(item.ownerId)));
  assert.ok(data.tasks.every(item => !item.requirementId || data.requirements.some(requirement => requirement.id === item.requirementId)));
  assert.equal(JSON.stringify(data).includes('/api/files/'), false);
  assert.equal(JSON.stringify(data).includes('Celia Wang'), false);
  data.tasks[0].title = 'changed';
  assert.notEqual(makeVisitorSeed().tasks[0].title, 'changed');
});
