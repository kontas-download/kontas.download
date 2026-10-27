const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only; the working database is never opened.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-gpm313-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { getDb } = require('../src/lib/db.ts');
const pr = require('../src/lib/payroll-runs.ts');
const { gpm313Draft, gpm313DueDate } = require('../src/lib/gpm313.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'Company A', '111111111', 'EUR', 0, datetime('now'), datetime('now'))").run();
const jonas = pr.createEmployee(db, 1, { name: 'Jonas', baseSalary: 2000 });
const ona = pr.createEmployee(db, 1, { name: 'Ona', baseSalary: 1500 });
const lineOf = (runId, employeeId) => db.prepare('SELECT * FROM PayrollRunLine WHERE runId=? AND employeeId=?').get(runId, employeeId);

test('gpm313: posted run is included, draft run is excluded', () => {
  const sep = pr.createRun(db, 1, 2026, 9, null);
  pr.postRun(db, 1, sep, null);
  pr.createRun(db, 1, 2026, 10, null); // stays a draft
  const d = gpm313Draft(db, 1, 2026, 9);
  assert.equal(d.source, 'RUN');
  assert.equal(d.rows.length, 2);
  const lines = db.prepare('SELECT gross, gpm, npd FROM PayrollRunLine WHERE runId=?').all(sep);
  assert.equal(d.totals.f5, Math.round(lines.reduce((s, l) => s + l.gross * 100, 0)) / 100);
  assert.equal(d.totals.gpmTotal, Math.round(lines.reduce((s, l) => s + l.gpm * 100, 0)) / 100);
  assert.ok(d.totals.gpmTotal > 0);
  const oct = gpm313Draft(db, 1, 2026, 10);
  assert.equal(oct.rows.length, 0);
  assert.equal(oct.source, 'NONE');
  assert.ok(d.notFilled.some(n => n.startsWith('6 ir 7 laukai')));
});

test('gpm313: month boundaries and other company are not mixed in', () => {
  const nov = pr.createRun(db, 1, 2026, 11, null);
  pr.postRun(db, 1, nov, null);
  const sep = gpm313Draft(db, 1, 2026, 9), novDraft = gpm313Draft(db, 1, 2026, 11), dec = gpm313Draft(db, 1, 2026, 12);
  assert.equal(novDraft.rows.length, 2);
  assert.equal(dec.rows.length, 0);
  assert.equal(sep.rows.length, 2);
  assert.equal(gpm313Draft(db, 2, 2026, 11).rows.length, 0);
  assert.equal(gpm313DueDate('2026-11-01', '2026-11-30'), '2026-12-15');
  assert.equal(gpm313DueDate('2026-12-01', '2026-12-31'), '2027-01-15');
  assert.equal(gpm313DueDate('2026-11-01', '2026-11-29'), null);
});

test('gpm313: employee with overrides uses the final values', () => {
  const dec = pr.createRun(db, 1, 2026, 12, null);
  pr.overrideLine(db, 1, dec, lineOf(dec, jonas.id).id, 'gpm', 123.45, 'testas', null);
  pr.postRun(db, 1, dec, null);
  const d = gpm313Draft(db, 1, 2026, 12);
  const row = d.rows.find(r => r.employee === 'Jonas');
  assert.equal(row.gpm, 123.45);
  assert.equal(row.gross, lineOf(dec, jonas.id).gross);
  const other = d.rows.find(r => r.employee === 'Ona');
  assert.equal(other.gpm, lineOf(dec, ona.id).gpm);
  assert.equal(d.totals.gpmTotal, Math.round((123.45 + other.gpm) * 100) / 100);
});

test('gpm313: legacy payroll without a run is included and marked; empty month is flagged', () => {
  const info = db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(1,2025,3,1000,datetime('now'))").run();
  db.prepare('INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer) VALUES(?,?,?,?,?,?,?,?)').run(info.lastInsertRowid, 'Senas', '1', 1000, 700, 150, 100, 30);
  const d = gpm313Draft(db, 1, 2025, 3);
  assert.equal(d.source, 'LEGACY');
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0].npd, null);
  assert.equal(d.totals.npd, null);
  assert.deepEqual([d.totals.f5, d.totals.gpmTotal], [1000, 150]);
  const empty = gpm313Draft(db, 1, 2025, 4);
  assert.deepEqual(empty.totals, { f5: 0, gpmTotal: 0, npd: null });
  assert.ok(empty.notes.some(n => n.includes('4 p.')));
});

test('gpm313: filing deadline is the 15th of the next month', () => {
  assert.equal(gpm313DueDate('2026-09-01', '2026-09-30'), '2026-10-15');
  assert.equal(gpm313DueDate('2026-02-01', '2026-02-28'), '2026-03-15');
});
