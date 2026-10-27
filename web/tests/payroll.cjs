const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only: the project database is never opened by this test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-payroll-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
const { payrollParams, calculatePayslip, monthlyNpd, payrollDate } = require('../src/lib/payroll-calc.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });

const p = payrollParams('2026-06-30');
const base = { ytdGrossBefore: 0, ytdSodraBaseBefore: 0, applyNpd: true, pensionAccumulation: false, fixedTerm: false };
const slip = (gross, extra = {}, overrides) => calculatePayslip({ gross, ...base, ...extra }, p, overrides);

test('payroll: golden examples 2026 - minimum wage', () => {
  const s = slip(1153);
  assert.equal(s.npd, 747);
  assert.equal(s.gpm, 81.2);
  assert.equal(s.vsd, 144.36);
  assert.equal(s.psd, 80.48);
  assert.equal(s.net, 846.96);
  assert.equal(s.employerContributions, 24.43);
  assert.equal(s.totalCost, 1177.43);
});

test('payroll: golden examples 2026 - average wage (VDU)', () => {
  const s = slip(2312.15);
  assert.equal(s.npd, 179.02);
  assert.equal(s.gpm, 426.63);
  assert.equal(s.vsd, 289.48);
  assert.equal(s.psd, 161.39);
  assert.equal(s.net, 1434.65);
  assert.equal(s.employerContributions, 30.29 + 11.33 + 3.7 + 3.7);
});

test('payroll: golden examples 2026 - tax-exempt amount formula and its end', () => {
  assert.equal(monthlyNpd(100000, p), 74700 - 0);
  assert.equal(slip(2677.49).npd, 0);
  assert.equal(slip(5000).npd, 0);
  assert.equal(slip(0).npd, 0);
  assert.equal(slip(2000, { applyNpd: false }).npd, 0);
});

test('payroll: golden examples 2026 - above 36 VDU (progressive income tax)', () => {
  // 83237.40 = 36 VDU; the year-to-date gross 83000 leaves 237.40 in the 20 % band, the rest of 5000 is taxed at 25 %.
  const s = slip(5000, { ytdGrossBefore: 83000, ytdSodraBaseBefore: 83000 });
  assert.deepEqual(s.gpmBands, [{ rate: 20, base: 237.4 }, { rate: 25, base: 4762.6 }]);
  assert.equal(s.gpm, 1238.13);
  const high = slip(5000, { ytdGrossBefore: 138000, ytdSodraBaseBefore: 138000 });
  assert.deepEqual(high.gpmBands, [{ rate: 25, base: 729 }, { rate: 32, base: 4271 }]);
  assert.equal(high.gpm, 1548.97);
});

test('payroll: golden examples 2026 - above the contribution ceiling (60 VDU = 138729)', () => {
  const s = slip(5000, { ytdGrossBefore: 138000, ytdSodraBaseBefore: 138000, pensionAccumulation: true });
  assert.equal(s.sodraBase, 729);
  assert.equal(s.vsd, 91.27);
  assert.equal(s.pension, 21.87);
  assert.equal(s.psd, 349);
  assert.equal(s.unemployment, 9.55);
  const over = slip(3000, { ytdGrossBefore: 140000, ytdSodraBaseBefore: 138729 });
  assert.equal(over.sodraBase, 0);
  assert.equal(over.vsd, 0);
  assert.equal(over.employerContributions, 0);
  assert.ok(over.psd > 0);
});

test('payroll: golden examples 2026 - fixed-term contract and accident rate group', () => {
  const open = slip(1153);
  const fixed = slip(1153, { fixedTerm: true });
  assert.equal(fixed.unemploymentRate, 2.03);
  assert.equal(fixed.unemployment, 23.41);
  assert.equal(Math.round((fixed.employerContributions - open.employerContributions) * 100), 831);
  assert.equal(slip(1153, { accidentRate: 1.4 }).accident, 16.14);
  assert.throws(() => slip(1153, { accidentRate: 2 }), /nelaimingų atsitikimų/);
});

test('payroll: manual override is returned beside the computed values and the computation is deterministic', () => {
  const computed = slip(1153);
  const manual = slip(1153, {}, { gpm: 90 });
  assert.deepEqual(manual.overridden, ['gpm']);
  assert.equal(manual.gpm, 90);
  assert.equal(manual.net, 1153 - 90 - 144.36 - 80.48);
  assert.equal(computed.gpm, 81.2);
  assert.deepEqual(slip(1153), computed);
  assert.throws(() => slip(1153, {}, { nope: 1 }), /nežinomas/);
  assert.throws(() => slip(-1), /neteisinga/);
});

test('payroll: parameters come from the registry by date and the month ends on its last day', () => {
  assert.equal(p.mma, 1153);
  assert.equal(p.provisional, true);
  assert.equal(payrollDate(2026, 2), '2026-02-28');
  assert.throws(() => payrollParams('2025-06-30'));
});

test('payroll: migration is additive and idempotent on a temporary database', () => {
  assert.ok(db.prepare('SELECT 1 FROM AppMigration WHERE version=?').get('2026-10-payroll-v1'));
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Employee','PayrollRun','PayrollRunLine','PayrollLog')").all().map(r => r.name).sort();
  assert.deepEqual(tables, ['Employee', 'PayrollLog', 'PayrollRun', 'PayrollRunLine']);
});
