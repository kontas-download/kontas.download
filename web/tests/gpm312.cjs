const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only; the working database is never opened.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-gpm312-'));
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
const { gpm312Draft, gpm312DueDate } = require('../src/lib/gpm312.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'Company A', '111111111', 'EUR', 0, datetime('now'), datetime('now'))").run();
const jonas = pr.createEmployee(db, 1, { name: 'Jonas', baseSalary: 2000, personalCode: '38001010001' });
const ona = pr.createEmployee(db, 1, { name: 'Ona', baseSalary: 1500 }); // no personal code
const lineOf = (runId, employeeId) => db.prepare('SELECT * FROM PayrollRunLine WHERE runId=? AND employeeId=?').get(runId, employeeId);
const r2 = v => Math.round(v * 100) / 100;

test('gpm312: posted months of the year are summed per employee, draft run is excluded', () => {
  const ids = [1, 2].map(m => { const id = pr.createRun(db, 1, 2026, m, null); pr.postRun(db, 1, id, null); return id; });
  pr.createRun(db, 1, 2026, 5, null); // stays a draft
  const d = gpm312Draft(db, 1, 2026);
  assert.equal(d.source, 'RUN');
  assert.equal(d.rows.length, 2);
  const row = d.rows.find(r => r.employee === 'Jonas');
  const lines = ids.map(id => lineOf(id, jonas.id));
  assert.equal(row.gross, r2(lines.reduce((s, l) => s + l.gross, 0)));
  assert.equal(row.gpm, r2(lines.reduce((s, l) => s + l.gpm, 0)));
  assert.equal(row.npd, r2(lines.reduce((s, l) => s + l.npd, 0)));
  assert.equal(row.months, 2);
  assert.equal(row.code, '38001010001');
  assert.equal(row.incomeCode, '01');
  assert.equal(d.totals.f4, r2(d.rows.reduce((s, r) => s + r.gross, 0)));
  assert.equal(d.totals.f5, r2(d.rows.reduce((s, r) => s + r.gpm, 0)));
  assert.ok(d.totals.f5 > 0);
  assert.ok(d.notFilled.some(n => n.startsWith('L9 laukelis')));
});

test('gpm312: employee without a personal code is flagged', () => {
  const d = gpm312Draft(db, 1, 2026);
  const row = d.rows.find(r => r.employee === 'Ona');
  assert.equal(row.code, null);
  assert.deepEqual(d.missingCodes, ['Ona']);
  assert.ok(d.notes.some(n => n.includes('Trūksta asmens kodo') && n.includes('Ona')));
});

test('gpm312: year boundaries and other company are not mixed in', () => {
  for (const m of [12]) { const id = pr.createRun(db, 1, 2026, m, null); pr.postRun(db, 1, id, null); }
  for (const [y, m] of [[2025, 12], [2027, 1]]) {
    const info = db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(1,?,?,500,datetime('now'))").run(y, m);
    db.prepare('INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer) VALUES(?,?,?,?,?,?,?,?)').run(info.lastInsertRowid, 'Kaimynas', '1', 500, 400, 50, 10, 5);
  }
  const d = gpm312Draft(db, 1, 2026);
  assert.equal(d.rows.length, 2);
  assert.equal(d.rows.find(r => r.employee === 'Jonas').months, 3);
  for (const [y, f4] of [[2025, 500], [2027, 500]]) {
    const o = gpm312Draft(db, 1, y);
    assert.deepEqual([o.rows.length, o.totals.f4, o.rows[0].employee], [1, f4, 'Kaimynas']);
  }
  assert.equal(gpm312Draft(db, 2, 2026).rows.length, 0);
});

test('gpm312: override uses the final values', () => {
  db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (2, 'Company B', '222222222', 'EUR', 0, datetime('now'), datetime('now'))").run();
  const petras = pr.createEmployee(db, 2, { name: 'Petras', baseSalary: 2000, personalCode: '38001010009' });
  const run = pr.createRun(db, 2, 2026, 6, null);
  pr.overrideLine(db, 2, run, lineOf(run, petras.id).id, 'gpm', 123.45, 'testas', null);
  pr.postRun(db, 2, run, null);
  const row = gpm312Draft(db, 2, 2026).rows[0];
  assert.equal(row.gpm, 123.45);
  assert.equal(row.gross, lineOf(run, petras.id).gross);
});

test('gpm312: legacy payroll without a run is included and marked; empty year is flagged', () => {
  for (const m of [1, 2]) {
    const info = db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(1,2022,?,1000,datetime('now'))").run(m);
    db.prepare('INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer) VALUES(?,?,?,?,?,?,?,?)').run(info.lastInsertRowid, 'Senas', '39001010002', 1000, 700, 150, 100, 30);
  }
  const d = gpm312Draft(db, 1, 2022);
  assert.equal(d.source, 'LEGACY');
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0].npd, null);
  assert.equal(d.totals.npd, null);
  assert.deepEqual([d.rows[0].months, d.totals.f4, d.totals.f5], [2, 2000, 300]);
  assert.ok(d.notes.some(n => n.includes('be skaičiavimo')));
  const empty = gpm312Draft(db, 1, 2020);
  assert.equal(empty.source, 'NONE');
  assert.deepEqual(empty.totals, { f4: 0, f5: 0, npd: null });
  assert.ok(empty.notes.some(n => n.includes('nėra')));
});

test('gpm312: filing deadline is 15 February of the next year', () => {
  assert.equal(gpm312DueDate(2026), '2027-02-15');
  assert.equal(gpm312DueDate(2025), '2026-02-15');
});
