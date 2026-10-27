const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only: the project database is never opened by this test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-payguard-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
const pr = require('../src/lib/payroll-runs.ts');
const { assertFormCompany, HttpError } = require('../src/lib/errors.ts');
const { exportCompany, importCompanyPackage } = require('../src/lib/company-package.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const addCompany = db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
addCompany.run(1, 'Saltinis', '1'); addCompany.run(2, 'Kita', '2');
const status = fn => { try { fn(); } catch (e) { return e instanceof HttpError ? e.status : e; } return 0; };
const rowsOf = (sql, ...args) => db.prepare(sql).all(...args);

test('posting uses fresh year-to-date values; unposting is blocked while a later month is posted', () => {
  pr.createEmployee(db, 1, { name: 'Jonas', baseSalary: 2000 });
  const feb = pr.createRun(db, 1, 2026, 2, null);
  const jan = pr.createRun(db, 1, 2026, 1, null);
  pr.postRun(db, 1, jan, null);
  assert.equal(status(() => pr.postRun(db, 1, feb, null)), 409);
  pr.recalculateRun(db, 1, feb, null);
  pr.postRun(db, 1, feb, null);
  assert.equal(status(() => pr.unpostRun(db, 1, jan, 'x', null)), 409);
  pr.unpostRun(db, 1, feb, 'x', null);
  pr.unpostRun(db, 1, jan, 'x', null);
});

test('a month cannot be posted while a later month of the same year is posted', () => {
  pr.createEmployee(db, 2, { name: 'Ona', baseSalary: 1500 });
  const feb = pr.createRun(db, 2, 2026, 2, null);
  const jan = pr.createRun(db, 2, 2026, 1, null);
  pr.postRun(db, 2, feb, null);
  assert.equal(status(() => pr.postRun(db, 2, jan, null)), 409);
  pr.unpostRun(db, 2, feb, 'x', null);
  pr.postRun(db, 2, jan, null);
  pr.recalculateRun(db, 2, feb, null);
  pr.postRun(db, 2, feb, null);
});

test('employees, draft and posted payroll runs and the log survive the company package round trip', () => {
  const emp = pr.createEmployee(db, 1, { name: 'Ona', baseSalary: 1500 });
  const mar = pr.createRun(db, 1, 2026, 3, null);
  pr.postRun(db, 1, mar, null);
  const apr = pr.createRun(db, 1, 2026, 4, null);
  pr.recalculateRun(db, 1, apr, null);
  const line = db.prepare('SELECT id FROM PayrollRunLine WHERE runId=? AND employeeId=?').get(apr, emp.id);
  pr.overrideLine(db, 1, apr, line.id, 'gpm', 10, 'testas', null);
  const pkg = JSON.parse(JSON.stringify(exportCompany(db, 1)));
  for (const key of ['employees', 'payrollRuns', 'payrollRunLines', 'payrollLogs']) assert.ok(pkg.data[key].length > 0, key);
  // Older packages without the new keys still import.
  const old = JSON.parse(JSON.stringify(pkg));
  for (const key of ['employees', 'payrollRuns', 'payrollRunLines', 'payrollLogs']) delete old.data[key];
  old.checksum = require('../src/lib/company-package.ts').packageChecksum(old.data);
  assert.deepEqual(importCompanyPackage(db, old, { commit: false, name: 'Sena', allowDuplicateCode: true }).problems, []);

  const result = importCompanyPackage(db, pkg, { commit: true, name: 'Kopija', allowDuplicateCode: true });
  assert.deepEqual(result.problems, []);
  const copy = result.companyId;
  const same = sql => assert.deepEqual(rowsOf(sql, copy), rowsOf(sql, 1), sql);
  same('SELECT name,baseSalary,contractType FROM Employee WHERE companyId=? ORDER BY id');
  same('SELECT year,month,status,verifiedBy,createdBy FROM PayrollRun WHERE companyId=? ORDER BY id');
  same('SELECT employeeName,gross,ytdGrossBefore,ytdSodraBaseBefore,overridesJson,gpm,net FROM PayrollRunLine WHERE companyId=? ORDER BY id');
  same('SELECT action,field,oldValue,newValue,reason FROM PayrollLog WHERE companyId=? ORDER BY id');
  assert.equal(rowsOf('SELECT 1 FROM PayrollRunLine l JOIN PayrollRun r ON r.id=l.runId JOIN Employee e ON e.id=l.employeeId WHERE l.companyId=? AND r.companyId=? AND e.companyId=?', copy, copy, copy).length, rowsOf('SELECT 1 FROM PayrollRunLine WHERE companyId=?', copy).length);
  const posted = db.prepare("SELECT r.payrollId,p.companyId FROM PayrollRun r JOIN Payroll p ON p.id=r.payrollId WHERE r.companyId=? AND r.status='POSTED'").get(copy);
  assert.equal(posted.companyId, copy);
  assert.equal(rowsOf('SELECT 1 FROM PayrollLog WHERE companyId=? AND actorId IS NOT NULL', copy).length, 0);
  // A broken link is rejected.
  const bad = JSON.parse(JSON.stringify(pkg));
  bad.data.payrollRunLines[0].employeeId = 999999;
  bad.checksum = require('../src/lib/company-package.ts').packageChecksum(bad.data);
  assert.ok(importCompanyPackage(db, bad, { commit: false, name: 'Bloga', allowDuplicateCode: true }).problems.some(p => p.code === 'brokenLink'));
});

test('the form company guard rejects another company and is wired into bank, assets and payroll runs', () => {
  assert.equal(status(() => assertFormCompany(2, 1)), 409);
  assert.equal(status(() => assertFormCompany('2', 1)), 409);
  assert.equal(status(() => assertFormCompany(1, 1)), 0);
  assert.equal(status(() => assertFormCompany(undefined, 1)), 0);
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', 'app', ...f.split('/')), 'utf8');
  for (const f of ['api/bank/route.ts', 'api/assets/route.ts', 'api/payroll/runs/route.ts']) assert.match(src(f), /assertFormCompany\(/, f);
  assert.equal((src('api/assets/depreciation/route.ts').match(/assertFormCompany\(/g) || []).length, 2);
  assert.equal((src('assets/AssetsClient.tsx').match(/\{ period(: latest)?, companyId \}/g) || []).length, 2);
  for (const f of ['bank/BankClient.tsx', 'assets/AssetsClient.tsx', 'payroll/PayrollClient.tsx']) assert.match(src(f), /companyId/, f);
});

test('a run without any gross pay can be neither verified nor posted', () => {
  pr.createEmployee(db, 1, { name: 'Nulinis', baseSalary: 1000 });
  const run = pr.createRun(db, 1, 2027, 1, null);
  for (const l of rowsOf('SELECT id FROM PayrollRunLine WHERE runId=?', run)) pr.setLineGross(db, 1, run, l.id, 0, null);
  assert.equal(status(() => pr.verifyRun(db, 1, run, null)), 400);
  assert.equal(status(() => pr.postRun(db, 1, run, null)), 400);
});

test('the purchases section export carries the warehouse name', () => {
  const { sectionRows, SECTIONS } = require('../src/lib/section-transfer.ts');
  assert.ok(SECTIONS.purchases.columns.includes('warehouseName'));
  db.prepare("INSERT INTO Purchase(companyId,purchaseDate,warehouseName,sumWithoutVat,vat,sumWithVat) VALUES(1,'2027-01-05','Sandelis A',1,0,1)").run();
  assert.equal(sectionRows(db, 'purchases', 1, false)[0].warehouseName, 'Sandelis A');
});
