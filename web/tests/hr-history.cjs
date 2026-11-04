const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Pavyzdys', 'A', 'EUR', 1, datetime('now'), datetime('now'))").run();
fixture.close();
const jar = new Map();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const pkg = require('../src/lib/company-package.ts');
const route = require('../src/app/api/payrolls/[id]/route.ts');
const db = getDb();
db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'test@example.test','Tester','unused','admin',datetime('now'))").run();
jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
const context = id => ({ params: Promise.resolve({ id: String(id) }) });
const payrollEntries = id => db.prepare("SELECT COUNT(*) AS n FROM GeneralEntry WHERE sourceType='PAYROLL' AND sourceId=?").get(id).n;

const addPayroll = (month, postedInJournal) => {
  const id = Number(db.prepare("INSERT INTO Payroll(year,month,sumWithVat,companyId,postedInJournal,createdAt) VALUES(2025,?,0,1,?,datetime('now'))").run(month, postedInJournal).lastInsertRowid);
  db.prepare("INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer,position,payDate,npd,guaranteeFund,payOut) VALUES(?,'Jonas Jonaitis','39001010000',1000,625,180,195,17.7,'Vadovas','2025-02-10',0,1.6,625)").run(id);
  db.prepare("INSERT INTO PayrollDetail(payrollId,employeeName,employeeCode,kind,code,name,amount,hours,days) VALUES(?,'Jonas Jonaitis','39001010000','ADDITION','101','Pagrindinis atlyginimas',1000,160,20),(?,'Jonas Jonaitis','39001010000','DEDUCTION','31','Pajamų mokestis',180,NULL,NULL)").run(id, id);
  return id;
};

test('a payroll already posted in the imported journal is not posted again; a normal payroll still posts', () => {
  const imported = addPayroll(1, 1), normal = addPayroll(2, 0);
  assert.equal(payrollEntries(imported), 0, 'postedInJournal=1: the ledger triggers skip it');
  assert.ok(payrollEntries(normal) >= 3, 'postedInJournal=0: net, GPM and Sodra entries are posted as before');
  db.prepare('UPDATE PayrollEmployee SET grossSalary=1100 WHERE payrollId=?').run(imported);
  db.prepare('UPDATE Payroll SET sumWithVat=1100 WHERE id=?').run(imported);
  assert.equal(payrollEntries(imported), 0, 'edits of an imported payroll do not post either');
});

test('payroll slip: GET returns totals and the breakdown; editing employees keeps slip details and the breakdown', async () => {
  const id = addPayroll(3, 1);
  const slip = await (await route.GET(new Request('http://localhost:3000/api/payrolls/' + id), context(id))).json();
  assert.equal(slip.payroll.postedInJournal, 1);
  assert.equal(slip.employees[0].position, 'Vadovas');
  assert.equal(slip.employees[0].payOut, 625);
  assert.deepEqual(slip.details.map(d => [d.kind, d.code, d.amount]), [['ADDITION', '101', 1000], ['DEDUCTION', '31', 180]]);

  const body = { year: 2025, month: 3, employees: [{ employeeName: 'Jonas Jonaitis', employeeCode: '39001010000', grossSalary: 1000, netSalary: 625, gpm: 180, sodraEmployee: 195, sodraEmployer: 17.7 }] };
  const res = await route.PUT(new Request('http://localhost:3000/api/payrolls/' + id, { method: 'PUT', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, body: JSON.stringify(body) }), context(id));
  assert.equal(res.status, 200, await res.clone().text());
  const row = db.prepare('SELECT position, payDate, guaranteeFund, payOut FROM PayrollEmployee WHERE payrollId=?').get(id);
  assert.deepEqual({ ...row }, { position: 'Vadovas', payDate: '2025-02-10', guaranteeFund: 1.6, payOut: 625 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM PayrollDetail WHERE payrollId=?').get(id).n, 2);
  assert.equal(payrollEntries(id), 0);
});

test('company package carries the breakdown, the journal flag, employees and the reference books', () => {
  db.prepare("INSERT INTO Employee(companyId,name,personalCode,position,baseSalary,agreementNumber,agreementDate,externalId) VALUES(1,'Jonas Jonaitis','39001010000','Vadovas',1000,'DS-1','2020-01-02',39)").run();
  db.prepare("INSERT INTO HrPosition(companyId,name) VALUES(1,'Vadovas')").run();
  db.prepare("INSERT INTO PayrollCode(companyId,kind,code,name,category,sortOrder) VALUES(1,'PAY','101','Pagrindinis atlyginimas','ADDITION',1),(1,'TIMECARD','FD','Faktiškai dirbtas laikas',NULL,NULL)").run();
  db.prepare("INSERT INTO WorkShift(companyId,name,weekJson) VALUES(1,'Pirmadienis-penktadienis','[]')").run();
  const exported = pkg.exportCompany(db, 1);
  assert.equal(exported.data.payrollDetails.length, db.prepare('SELECT COUNT(*) AS n FROM PayrollDetail').get().n);
  assert.equal(exported.data.payrollCodes.length, 2);
  assert.ok(exported.data.payrolls.some(p => p.postedInJournal === 1));
  assert.ok(!('externalId' in exported.data.employees[0]), 'source-system ids stay in the source database');
  const result = pkg.importCompanyPackage(db, exported, { commit: true, name: 'UAB Kopija', allowDuplicateCode: true });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  const copy = result.companyId;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM PayrollDetail WHERE payrollId IN (SELECT id FROM Payroll WHERE companyId=?)').get(copy).n, exported.data.payrollDetails.length);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM PayrollCode WHERE companyId=?').get(copy).n, 2);
  assert.equal(db.prepare('SELECT agreementNumber FROM Employee WHERE companyId=?').get(copy).agreementNumber, 'DS-1');
  assert.equal(db.prepare('SELECT SUM(postedInJournal) AS n FROM Payroll WHERE companyId=?').get(copy).n, 2);
});


test('employee card: personnel fields saved, pay history matched by personal code with yearly totals', async () => {
  const runs = require('../src/lib/payroll-runs.ts');
  const e = runs.createEmployee(db, 1, { name: 'Ona Onaitė', personalCode: '49001010000', baseSalary: 900, agreementNumber: 'DS-7', agreementDate: '2024-01-02', email: 'ona@example.test', phone: '+37060000000', bankAccount: 'LT000000000000000000', address: 'Vilnius', notes: 'Pastaba' });
  assert.equal(e.agreementNumber, 'DS-7');
  assert.equal(e.email, 'ona@example.test');
  assert.throws(() => runs.updateEmployee(db, 1, e.id, { email: 'ne-pastas' }), /el. pašto/);
  for (const [year, month, gross] of [[2024, 1, 900], [2024, 2, 950], [2025, 1, 1000]]) {
    const pid = Number(db.prepare("INSERT INTO Payroll(year,month,sumWithVat,companyId,postedInJournal,createdAt) VALUES(?,?,?,1,1,datetime('now'))").run(year, month, gross).lastInsertRowid);
    db.prepare("INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer) VALUES(?,'Ona Onaitė','49001010000',?,?,?,?,0)").run(pid, gross, gross * 0.6, gross * 0.2, gross * 0.2);
  }
  db.prepare("INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer) VALUES((SELECT MIN(id) FROM Payroll),'Kitas Asmuo','38001010000',500,300,100,100,0)").run();
  const card = runs.getEmployeeCard(db, 1, e.id);
  assert.deepEqual(card.history.map(h => [h.year, h.month, h.gross]), [[2025, 1, 1000], [2024, 2, 950], [2024, 1, 900]], 'only this person, newest first');
  assert.deepEqual(card.years.map(y => [y.year, y.months, y.gross]), [[2025, 1, 1000], [2024, 2, 1850]]);
  const route = require('../src/app/api/payroll/employees/[id]/route.ts');
  const res = await route.GET(new Request('http://localhost:3000/api/payroll/employees/' + e.id), context(e.id));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).employee.notes, 'Pastaba');
});

test('item catalog: stock items and concrete services with their latest price; placeholders and credit notes skipped', () => {
  const { itemCatalog, findCatalogItem } = require('../src/lib/item-catalog.ts');
  db.prepare("INSERT INTO StockItem(companyId,name,code,price,stock,remainder) VALUES(1,'Popierius A4','A4',5.5,0,0)").run();
  const sale = (date, name, price, docType = 'SF') => {
    const id = Number(db.prepare("INSERT INTO Sale(companyId,series,number,saleDate,sumWithoutVat,vat,sumWithVat,docType,createdAt) VALUES(1,'T',?,?,?,0,?,?,datetime('now'))").run(String(Math.random()), date, price, price, docType).lastInsertRowid);
    db.prepare('INSERT INTO SaleItem(saleId,itemName,quantity,price,sumWithoutVat,sumWithVat,vatRate) VALUES(?,?,1,?,?,?,0)').run(id, name, price, price, price);
  };
  sale('2025-01-05', 'Svetainės priežiūra', 50); sale('2025-03-05', 'Svetainės priežiūra', 60); sale('2025-02-01', 'Paslauga (vnt.)', 5);
  const catalog = itemCatalog(db, 1);
  assert.equal(findCatalogItem(catalog, ' svetainės PRIEŽIŪRA ').price, 60, 'latest price, case-insensitive');
  assert.equal(findCatalogItem(catalog, 'Popierius A4').code, 'A4');
  assert.equal(findCatalogItem(catalog, 'Paslauga (vnt.)'), undefined, 'import placeholder is not suggested');
});

test('form suggestions: distinct values per company, most used first; purchase lines with latest price', () => {
  const { suggestions, purchaseCatalog } = require('../src/lib/suggestions.ts');
  db.prepare("INSERT INTO Client(companyId,name,city,createdAt,updatedAt) VALUES(1,'UAB Alfa','Vilnius',datetime('now'),datetime('now')),(1,'UAB Beta','vilnius ',datetime('now'),datetime('now')),(1,'UAB Gama','Kaunas',datetime('now'),datetime('now'))").run();
  const s = suggestions(db, 1, ['saleSeries', 'cities', 'clients', 'accounts', 'positions']);
  assert.equal(s.cities[0], 'Vilnius', 'case-insensitive distinct, most used first');
  assert.equal(s.cities.length, 2);
  assert.ok(s.saleSeries.includes('T'));
  assert.ok(s.clients.includes('UAB Gama'));
  assert.ok(s.positions.includes('Vadovas'));
  assert.ok(Array.isArray(s.accounts));
  const pid = Number(db.prepare("INSERT INTO Purchase(companyId,series,number,purchaseDate,sumWithoutVat,vat,sumWithVat,createdAt) VALUES(1,'P','1','2025-04-01',12,0,12,datetime('now'))").run().lastInsertRowid);
  db.prepare("INSERT INTO PurchaseItem(purchaseId,itemName,quantity,price,sumWithoutVat,sumWithVat,vatRate) VALUES(?,'Kuras',1,12,12,12,0)").run(pid);
  assert.deepEqual(purchaseCatalog(db, 1).find(c => c.name === 'Kuras').price, 12);
});

test('employee relations: service contract, linked counterparty with bank payments and journal by account, annual leave', () => {
  const runs = require('../src/lib/payroll-runs.ts');
  const clientId = Number(db.prepare("INSERT INTO Client(companyId,name,code,createdAt,updatedAt) VALUES(1,'Petras Petraitis','37001010000',datetime('now'),datetime('now'))").run().lastInsertRowid);
  const e = runs.createEmployee(db, 1, { name: 'Petras Petraitis', employmentKind: 'SERVICE', clientId });
  assert.equal(e.employmentKind, 'SERVICE');
  assert.throws(() => runs.updateEmployee(db, 1, e.id, { employmentKind: 'OTHER' }), /rūšis/);
  assert.throws(() => runs.updateEmployee(db, 1, e.id, { clientId: 999999 }), /Kontrahentas/);
  db.prepare("INSERT INTO BankTransaction(companyId,date,number,clientName,clientCode,sum) VALUES(1,'2025-01-10','1','Petras Petraitis','37001010000',-100),(1,'2025-02-10','2','PETRAS PETRAITIS',NULL,-50.5),(1,'2025-03-10','3','Kitas','38001010000',-7)").run();
  db.prepare("INSERT INTO GeneralEntry(companyId,date,debitAccount,creditAccount,amount,clientName,sourceType) VALUES(1,'2025-01-10','4430','2711',100,'Petras Petraitis','MANUAL')").run();
  db.prepare('INSERT INTO EmployeeLeave(companyId,employeeId,periodFrom,periodUntil,days) VALUES(1,?,?,?,20),(1,?,?,?,7.5)').run(e.id, '2023-01-01', '2023-12-31', e.id, '2024-01-01', '2024-12-31');
  const card = runs.getEmployeeCard(db, 1, e.id);
  assert.deepEqual(card.bankTotals, { count: 2, paid: 150.5, received: 0 });
  assert.deepEqual(card.ledger.map(l => [l.account, l.debit, l.credit]), [['2710', 0, 150.5], ['2711', 0, 100], ['4430', 250.5, 0]], 'bank postings and the manual entry, matched by name');
  assert.equal(card.leaveTotal, 27.5);
  assert.equal(card.leave[0].periodFrom, '2024-01-01');
});
