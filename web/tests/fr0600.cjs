const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { fr0600Draft, monthlyDueDate } = require('../src/lib/fr0600.ts');
const doc = (over = {}) => ({ id: 1, number: 'SF 1', date: '2026-09-10', clientId: 5, name: 'K', code: '1', vatCode: 'LT100000000011', country: '', lines: [{ rate: 21, net: 100, gross: 121 }], ...over });

test('sales are split by rate and credit notes reduce base and VAT', () => {
  const sales = [
    doc({ lines: [{ rate: 21, net: 100, gross: 121 }, { rate: 9, net: 50, gross: 54.5 }, { rate: 5, net: 20, gross: 21 }, { rate: 12, net: 10, gross: 11.2 }] }),
    doc({ id: 2, number: 'KS 1', lines: [{ rate: 21, net: -40, gross: -48.4 }] }),
  ];
  const d = fr0600Draft(sales, []);
  assert.deepEqual(d.fields, { f11: 140, f25: 0, f29: 12.6, f29a: 1.2, f30: 4.5, f31: 1, f35: 0, f36: 19.3 });
  assert.equal(d.complete, true);
});

test('purchase VAT goes to field 25 and only reviewed deduction to field 35', () => {
  const purchases = [
    doc({ id: 1, number: 'P1', lines: [{ rate: 21, net: 100, gross: 121 }], deductibleVat: 21 }),
    doc({ id: 2, number: 'P2', lines: [{ rate: 21, net: 100, gross: 121 }], deductibleVat: 10.5 }),
    doc({ id: 3, number: 'P3', lines: [{ rate: 21, net: 100, gross: 121 }], deductibleVat: null }),
    doc({ id: 4, number: 'P4', lines: [{ rate: 0, net: 100, gross: 100 }], deductibleVat: 0 }),
  ];
  const d = fr0600Draft([doc()], purchases);
  assert.equal(d.fields.f25, 63); assert.equal(d.fields.f35, 31.5);
  assert.equal(d.fields.f36, 21 - 31.5);
  assert.equal(d.complete, false); assert.equal(d.unreviewed.length, 1);
});

test('cases outside the supported set are listed for manual handling and never summed', () => {
  const d = fr0600Draft([
    doc({ id: 1, number: 'Z', lines: [{ rate: 0, net: 100, gross: 100 }] }),
    doc({ id: 2, number: 'F', vatCode: 'LV40003009497' }),
    doc({ id: 3, number: 'E', date: '2025-09-10', lines: [{ rate: 12, net: 10, gross: 11.2 }] }),
  ], [doc({ id: 9, number: 'FP', vatCode: 'DE123456789' })]);
  assert.equal(d.fields.f11, 0); assert.equal(d.fields.f29a, 0); assert.equal(d.fields.f25, 0);
  assert.equal(d.manual.length, 4); assert.equal(d.complete, false);
});

test('documents without lines are never silently ignored', () => {
  const d = fr0600Draft([doc({ id: 1, number: 'EMPTY-S', lines: [] })], [doc({ id: 2, number: 'EMPTY-P', lines: [] })]);
  assert.equal(d.complete, false); assert.equal(d.manual.length, 2); assert.equal(d.fields.f11, 0);
});

test('documents whose header totals differ from their lines are listed for manual handling', () => {
  const ok = doc({ headerNet: 100, headerGross: 121 });
  const bad = doc({ id: 2, number: 'BAD', headerNet: 100, headerGross: 130 });
  const d = fr0600Draft([ok, bad], [doc({ id: 3, number: 'PBAD', headerNet: 90, headerGross: 121 })]);
  assert.equal(d.fields.f11, 100); assert.equal(d.fields.f29, 21); assert.equal(d.fields.f25, 0);
  assert.equal(d.manual.length, 2); assert.equal(d.complete, false);
});

test('monthly due date is the 25th of the next month', () => {
  assert.equal(monthlyDueDate('2026-09-01', '2026-09-30'), '2026-10-25');
  assert.equal(monthlyDueDate('2026-12-01', '2026-12-31'), '2027-01-25');
  assert.equal(monthlyDueDate('2026-02-01', '2026-02-28'), '2026-03-25');
  assert.equal(monthlyDueDate('2026-09-01', '2026-09-29'), null);
  assert.equal(monthlyDueDate('2026-07-01', '2026-09-30'), null);
});
