const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-invoices-period-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'Company A', '111', 'EUR', 0, datetime('now'), datetime('now'))").run();
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
fixture.close();
const jar = new Map();
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const period = require('../src/lib/list-period.ts');
const numbers = require('../src/lib/sale-numbers.ts');
const purchasePeriod = require('../src/lib/purchases-period.ts');

test('shared helpers: default period, presets, garbage, query string; purchases keep their aliases', () => {
  assert.deepEqual(period.resolveListPeriod({}, '2026-11-17'), { key: 'last12', from: '2025-11-17', to: '2026-11-17' });
  assert.equal(period.oneYearBefore('2028-02-29'), '2027-02-28');
  assert.deepEqual(period.resolveListPeriod({ period: 'all' }, '2026-11-17'), { key: 'all', from: null, to: null });
  assert.deepEqual(period.resolveListPeriod({ period: 'lastYear' }, '2026-11-17'), { key: 'lastYear', from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(period.resolveListPeriod({ from: '2026-04-30', to: '2026-03-01' }, '2026-11-17'), { key: 'custom', from: '2026-03-01', to: '2026-04-30' });
  assert.equal(period.resolveListPeriod({ from: '2026-02-30', period: 'nope' }, '2026-11-17').key, 'last12');
  assert.equal(period.periodQuery({ key: 'year', from: null, to: null }), '?period=year');
  assert.equal(period.parseApiRange(new URLSearchParams('from=2025-02-30')).error, 'Neteisinga data');
  assert.equal(period.parseApiRange(new URLSearchParams('from=2025-12-31&to=2025-01-01')).error, 'Neteisinga data');
  assert.equal(period.parseApiRange(new URLSearchParams('')).error, undefined);
  assert.deepEqual(period.dateRangeSql('x.d', '2025-01-01', null), { sql: ' AND substr(x.d,1,10) >= ?', args: ['2025-01-01'] });
  assert.equal(purchasePeriod.resolvePurchasePeriod({}, '2026-11-17').key, 'last12');
  assert.deepEqual(purchasePeriod.purchaseListQuery(1, null, null).args, [1]);
});

test('invoices API filters by inclusive invoice date, rejects bad dates, returns everything without params', async () => {
  const db = getDb();
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'m@example.test','M','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  const route = require('../src/app/api/invoices/route.ts');
  const post = (date, number, series = 'SF') => route.POST(new Request('http://localhost:3000/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ series, number, saleDate: date, clientName: 'Buyer', clientCode: '300000777', items: [{ itemName: 'Item', quantity: 1, price: 10, vatRate: 0 }] }) }));
  const dates = ['2024-12-31', '2025-01-01', '2025-06-15', '2025-12-31', '2026-01-01'];
  for (const [i, d] of dates.entries()) assert.equal((await post(d, String(i + 1).padStart(6, '0'))).status, 200, d);
  const list = async qs => {
    const res = await route.GET(new Request('http://localhost:3000/api/invoices' + qs));
    return { status: res.status, dates: res.status === 200 ? (await res.json()).sales.map(p => p.saleDate.slice(0, 10)) : null };
  };
  assert.equal((await list('')).dates.length, 5);
  assert.deepEqual((await list('?from=2025-01-01&to=2025-12-31')).dates, ['2025-12-31', '2025-06-15', '2025-01-01']);
  assert.deepEqual((await list('?from=2025-12-31')).dates, ['2026-01-01', '2025-12-31']);
  assert.deepEqual((await list('?to=2024-12-31')).dates, ['2024-12-31']);
  assert.deepEqual((await list('?from=2030-01-01&to=2030-12-31')).dates, []);
  for (const bad of ['?from=2025-13-01', '?to=abc', '?from=2025-02-30', '?from=2025-12-31&to=2025-01-01']) assert.equal((await list(bad)).status, 400, bad);
});

test('next numbers come from all sales even when the shown period excludes the latest invoice', () => {
  const db = getDb();
  const base = numbers.saleNumberBase(db, 1);
  assert.deepEqual(base.series.SF, { max: 5, width: 6 });
  // The page shows only 2025: the newest invoice (000005, 2026) is not loaded.
  const loaded = db.prepare("SELECT series, number, docType FROM Sale WHERE companyId = 1 AND substr(saleDate,1,4) = '2025'").all();
  assert.equal(loaded.length, 3);
  assert.equal(numbers.nextInvoiceNumber(base, loaded, 'SF'), '000006');
  assert.equal(numbers.nextInvoiceNumber(base, [], 'SF'), '000006');
  assert.equal(numbers.nextInvoiceNumber(base, [{ series: 'SF', number: '000009' }], 'SF'), '000010');
  assert.equal(numbers.nextInvoiceNumber(base, loaded, 'NEW'), '000001');
  assert.equal(numbers.nextInvoiceNumber(numbers.buildNumberBase([{ series: 'A', number: 'A-0042' }]), [], 'A'), '0043');
  // Credit notes: highest KS number over all sales.
  const credit = numbers.buildNumberBase([{ series: 'KS', number: '000007', docType: 'KS' }, { series: 'SF', number: '000020', docType: null }]);
  assert.equal(numbers.nextCreditNumber(credit, []), '000008');
  assert.equal(numbers.nextCreditNumber(credit, [{ series: 'KS', number: '000011', docType: 'KS' }]), '000012');
  assert.equal(numbers.nextCreditNumber(numbers.buildNumberBase([]), []), '000001');
});
