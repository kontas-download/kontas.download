const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only; the working database is never opened.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-fr0564-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'Company A', '111111111', 'LT111111119', 'EUR', 0, datetime('now'), datetime('now'))").run();
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
const { fr0564Draft, fr0564DueDate } = require('../src/lib/fr0564.ts');
const { loadTaxDocuments } = require('../src/lib/tax-documents.ts');
const db = getDb();

let clientId = 0;
const client = (name, code, vatCode, country = '') => {
  const id = ++clientId;
  db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,countryName,isVatPayer,createdAt,updatedAt) VALUES(?,1,?,?,?,?,1,datetime('now'),datetime('now'))").run(id, name, code, vatCode, country);
  return id;
};
let saleId = 0;
// lines: [net, taxCode | null, rate]
const sale = (clientRef, date, lines, docType = null) => {
  const id = ++saleId;
  const net = lines.reduce((n, l) => n + l[0], 0);
  const gross = lines.reduce((n, l) => n + l[0] * (1 + (l[2] || 0) / 100), 0);
  db.prepare("INSERT INTO Sale(id,companyId,series,number,saleDate,clientId,docType,sumWithoutVat,vat,sumWithVat,sellerVatMode,sellerIsVatPayer,statusName,createdAt) VALUES(?,1,'SF',?,?,?,?,?,?,?,'STANDARD_VAT',1,'Neapmokėta',datetime('now'))").run(id, String(id), date, clientRef, docType, net, gross - net, gross);
  for (const [lineNet, code, rate] of lines) {
    const info = db.prepare("INSERT INTO SaleItem(saleId,itemName,quantity,price,vatRate,sumWithoutVat,sumWithVat) VALUES(?,?,1,?,?,?,?)").run(id, 'Prekė', lineNet, rate || 0, lineNet, lineNet * (1 + (rate || 0) / 100));
    if (code) db.prepare("INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,updatedAt) VALUES(1,'SALE',?,?,0)").run(info.lastInsertRowid, code);
  }
  return id;
};
const draftFor = (start, end) => fr0564Draft(loadTaxDocuments(db, 1, start, end).sales);

const lv = client('SIA Latvija', 'LV1', 'LV40003009497');
const de = client('GmbH', 'DE1', 'DE 123-456-789');
const lt = client('UAB Vidaus', 'LT1', 'LT100000000011', 'Lietuva');
const us = client('Inc', 'US1', '', 'US');
const noVat = client('SIA Be PVM', 'LV2', '', 'LV');

test('fr0564: EU B2B sale is included per customer VAT code; domestic and non-EU are excluded', () => {
  sale(lv, '2026-09-10', [[1000.4, 'PVM13', 0]]);
  sale(lv, '2026-09-12', [[500, 'PVM15', 0]]);
  sale(lv, '2026-09-20', [[200, 'PVM19', 0]]);
  sale(de, '2026-09-15', [[300.5, 'PVM13', 0]]);
  sale(lt, '2026-09-11', [[999, null, 21]]);
  sale(us, '2026-09-13', [[800, 'PVM12', 0]]);
  const d = draftFor('2026-09-01', '2026-09-30');
  assert.equal(d.rows.length, 2);
  const row = Object.fromEntries(d.rows.map(r => [r.country + r.vatCode, r]));
  assert.deepEqual([row.LV40003009497.r13, row.LV40003009497.r14, row.LV40003009497.r18], [1000, 200, 500]);
  assert.deepEqual([row.DE123456789.r13, row.DE123456789.r14, row.DE123456789.r18], [301, 0, 0]);
  assert.deepEqual(d.totals, { r13: 1301, r14: 200, r18: 500 });
  assert.ok(d.notes.some(n => n.includes('PVM15')));
});

test('fr0564: credit note reduces the amounts of the same VAT code', () => {
  const original = sale(lv, '2026-10-05', [[1000, 'PVM13', 0]]);
  sale(lv, '2026-10-20', [[-400, 'PVM13', 0]], 'KS');
  const d = draftFor('2026-10-01', '2026-10-31');
  assert.equal(d.rows.length, 1);
  assert.equal(d.rows[0].r13, 600);
  assert.ok(original > 0);
});

test('fr0564: only the reporting calendar month is taken, month boundaries are inclusive', () => {
  sale(lv, '2026-07-31', [[10, 'PVM13', 0]]);
  sale(lv, '2026-08-01', [[20, 'PVM13', 0]]);
  sale(lv, '2026-08-31', [[40, 'PVM13', 0]]);
  sale(lv, '2026-09-01', [[80, 'PVM13', 0]]);
  const aug = draftFor('2026-08-01', '2026-08-31');
  assert.equal(aug.rows[0].r13, 60);
  assert.equal(fr0564DueDate('2026-08-01', '2026-08-31'), '2026-09-25');
  assert.equal(fr0564DueDate('2026-08-01', '2026-08-30'), null);
});

test('fr0564: customer without a VAT code and lines without a code are flagged, not summed', () => {
  sale(noVat, '2026-11-03', [[500, 'PVM13', 0]]);
  sale(noVat, '2026-11-04', [[300, null, 0]]);
  sale(lv, '2026-11-05', [[250, null, 0]]);
  const d = draftFor('2026-11-01', '2026-11-30');
  assert.equal(d.rows.length, 0);
  assert.equal(d.complete, false);
  assert.equal(d.manual.length, 3);
  assert.ok(d.manual.some(m => m.includes('neturi kitos ES šalies PVM kodo')));
  assert.ok(d.manual.some(m => m.includes('be i.SAF kodo')));
});

test('fr0564: filing deadline is the 25th of the next month', () => {
  assert.equal(fr0564DueDate('2026-09-01', '2026-09-30'), '2026-10-25');
  assert.equal(fr0564DueDate('2026-12-01', '2026-12-31'), '2027-01-25');
  assert.equal(fr0564DueDate('2026-02-01', '2026-02-28'), '2026-03-25');
});
