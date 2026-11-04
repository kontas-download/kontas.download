const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { resolvePeriod, periodWhere } = require('../src/lib/dashboard-period.ts');

test('overview period: this year by default, presets, any custom range, whole history', () => {
  const today = '2026-11-04';
  assert.deepEqual(resolvePeriod({}, today), { key: 'year', from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(resolvePeriod({ period: 'month' }, today), { key: 'month', from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(resolvePeriod({ period: 'quarter' }, today), { key: 'quarter', from: '2026-10-01', to: '2026-12-31' });
  assert.deepEqual(resolvePeriod({ period: 'last12' }, today), { key: 'last12', from: '2025-12-01', to: today });
  assert.deepEqual(resolvePeriod({ period: 'lastYear' }, today), { key: 'lastYear', from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(resolvePeriod({ period: 'all' }, today), { key: 'all', from: null, to: null });
  assert.deepEqual(resolvePeriod({ period: 'custom', from: '2024-03-01', to: '2024-05-31' }, today), { key: 'custom', from: '2024-03-01', to: '2024-05-31' });
  assert.deepEqual(resolvePeriod({ period: 'custom', from: '2024-05-31', to: '2024-03-01' }, today), { key: 'custom', from: '2024-03-01', to: '2024-05-31' }, 'reversed range is swapped');
  assert.deepEqual(resolvePeriod({ period: 'custom', from: '2024-03-01' }, today), { key: 'custom', from: '2024-03-01', to: null }, 'open end');
  assert.equal(resolvePeriod({ period: 'custom', from: 'blogai' }, today).key, 'year', 'invalid dates fall back to this year');
  assert.equal(resolvePeriod({ period: 'hack' }, today).key, 'year');
  assert.deepEqual(periodWhere('saleDate', resolvePeriod({ period: 'month' }, today)), { sql: ' AND substr(saleDate,1,10) >= ? AND substr(saleDate,1,10) <= ?', args: ['2026-11-01', '2026-11-30'] });
  assert.deepEqual(periodWhere('saleDate', resolvePeriod({ period: 'all' }, today)), { sql: '', args: [] });
});
