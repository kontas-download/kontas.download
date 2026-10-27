const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-stmt-'));
const dbFile = path.join(temp, 'test.db');
process.env.DATABASE_URL = 'file:' + dbFile;
const fixture = new Database(dbFile);
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
const { computePnl, computeBalance, balanceNet } = require('../src/lib/financial-statements-calc.ts');
const { loadTaxDocuments } = require('../src/lib/tax-documents.ts');
const nameOf = c => 'A' + c;
const e = (d, c, amount) => ({ date: '2026-01-01', debitAccount: d, creditAccount: c, amount });

test('P&L keeps accounts with one-sided turnover', () => {
  const pnl = computePnl([e('5001', '2410', 30)], nameOf);
  assert.equal(pnl.salesRevenue.sum, -30); // debit-only revenue correction is not dropped
  assert.deepEqual(pnl.salesRevenue.list.map(l => l.code), ['5001']);
  const credit = computePnl([e('2410', '6001', 40)], nameOf);
  assert.equal(credit.cogs.sum, -40); // credit-only expense
  const mixed = computePnl([e('2410', '5001', 100), e('5001', '2410', 30), e('6001', '4430', 20)], nameOf);
  assert.equal(mixed.totalRevenue, 70); assert.equal(mixed.cogs.sum, 20);
});

test('balance sheet classifies 33 and 440-442 and never drops a balance', () => {
  const net = balanceNet([e('2710', '3301', 50), e('2710', '4401', 10), e('2710', '4421', 5), e('2710', '3901', 7), e('2710', '7001', 3)]);
  const b = computeBalance(net, nameOf);
  assert.equal(b.reserves.sum, 50);
  assert.equal(b.otherShortTerm.sum, 15);
  assert.equal(b.unclassified.sum, 10); assert.deepEqual(b.unclassified.list.map(l => l.code).sort(), ['3901', '7001']);
  assert.equal(b.totalAssets, 75); assert.equal(b.totalEquityAndLiabilities, 75); assert.equal(b.isBalanced, true);
});

test('isBalanced tolerance is one cent', () => {
  assert.equal(computeBalance(new Map([['2710', 100.005], ['3011', -100]]), nameOf).isBalanced, true);
  assert.equal(computeBalance(new Map([['2710', 100.02], ['3011', -100]]), nameOf).isBalanced, false);
});

test('tax export keeps stored document values after the client card changes', () => {
  const now = "datetime('now')";
  db.prepare(`INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1,'A','111111111','EUR',1,${now},${now})`).run();
  db.prepare(`INSERT INTO Client(id,companyId,name,code,vatCode,countryName,createdAt,updatedAt) VALUES(1,1,'Senas','300000001','LT100000000011','Lietuva',${now},${now})`).run();
  db.prepare("INSERT INTO Sale(companyId,series,number,saleDate,clientId,clientName,clientCode,clientVatCode,sumWithoutVat,vat,sumWithVat) VALUES(1,'','S-1','2026-09-10',1,'Senas','300000001','LT100000000011',100,21,121)").run();
  db.prepare("INSERT INTO Sale(companyId,series,number,saleDate,clientId,clientName,clientCode,clientVatCode,sumWithoutVat,vat,sumWithVat) VALUES(1,'','S-2','2026-09-11',1,'','','',100,21,121)").run();
  db.prepare("INSERT INTO Purchase(companyId,series,number,purchaseDate,clientId,clientName,clientCode,sumWithoutVat,vat,sumWithVat) VALUES(1,'','P-1','2026-09-10',1,'Senas','300000001',100,21,121)").run();
  const pick = () => { const d = loadTaxDocuments(db, 1, '2026-09-01', '2026-09-30'); return { s1: d.sales.find(x => x.number === 'S-1'), s2: d.sales.find(x => x.number === 'S-2'), p: d.purchases[0] }; };
  const before = pick();
  assert.equal(before.s1.name, 'Senas');
  db.prepare("UPDATE Client SET name='Naujas',code='999999999',vatCode='LT999999999',countryName='Latvija' WHERE id=1").run();
  const after = pick();
  for (const k of ['name', 'code', 'vatCode']) assert.equal(after.s1[k], before.s1[k], k);
  assert.equal(after.p.name, 'Senas'); assert.equal(after.p.code, '300000001');
  assert.equal(after.s1.country, 'Latvija'); // country still comes from the card
  assert.equal(after.s2.name, 'Naujas'); assert.equal(after.s2.vatCode, 'LT999999999'); // empty stored values fall back to the card
});
