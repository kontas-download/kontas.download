const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-purchases-period-'));
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
const period = require('../src/lib/purchases-period.ts');

test('default period is the last 12 months, same day a year back; 29 February maps to 28 February', () => {
  assert.deepEqual(period.resolvePurchasePeriod({}, '2026-11-17'), { key: 'last12', from: '2025-11-17', to: '2026-11-17' });
  assert.equal(period.oneYearBefore('2028-02-29'), '2027-02-28');
  assert.equal(period.oneYearBefore('2028-03-01'), '2027-03-01');
  assert.equal(period.oneYearBefore('2027-02-28'), '2026-02-28');
  assert.deepEqual(period.resolvePurchasePeriod({}, '2028-02-29'), { key: 'last12', from: '2027-02-28', to: '2028-02-29' });
});

test('page query selects presets, custom range and falls back to the default on garbage', () => {
  const today = '2026-11-17';
  assert.deepEqual(period.resolvePurchasePeriod({ period: 'all' }, today), { key: 'all', from: null, to: null });
  assert.deepEqual(period.resolvePurchasePeriod({ period: 'year' }, today), { key: 'year', from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(period.resolvePurchasePeriod({ period: 'lastYear' }, today), { key: 'lastYear', from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(period.resolvePurchasePeriod({ from: '2026-03-01', to: '2026-04-30' }, today), { key: 'custom', from: '2026-03-01', to: '2026-04-30' });
  assert.deepEqual(period.resolvePurchasePeriod({ from: '2026-04-30', to: '2026-03-01' }, today), { key: 'custom', from: '2026-03-01', to: '2026-04-30' });
  assert.deepEqual(period.resolvePurchasePeriod({ from: '2026-03-01' }, today), { key: 'custom', from: '2026-03-01', to: null });
  assert.equal(period.resolvePurchasePeriod({ from: '2026-02-30', to: 'x', period: 'nope' }, today).key, 'last12');
  assert.equal(period.periodQuery({ key: 'last12', from: 'a', to: 'b' }), '');
  assert.equal(period.periodQuery({ key: 'all', from: null, to: null }), '?period=all');
  assert.equal(period.periodQuery({ key: 'custom', from: '2026-03-01', to: null }), '?from=2026-03-01');
});

test('purchases API filters by inclusive purchase date, rejects bad dates, returns everything without params', async () => {
  const db = getDb();
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'m@example.test','M','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  const route = require('../src/app/api/purchases/route.ts');
  const post = date => route.POST(new Request('http://localhost:3000/api/purchases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ series: 'T', number: 'N' + date, purchaseDate: date, clientName: 'Supplier', clientCode: '300000777', items: [{ itemName: 'Item', quantity: 1, price: 10, vatRate: 21 }] }) }));
  for (const d of ['2024-12-31', '2025-01-01', '2025-06-15', '2025-12-31', '2026-01-01']) assert.equal((await post(d)).status, 200);
  const list = async qs => {
    const res = await route.GET(new Request('http://localhost:3000/api/purchases' + qs));
    return { status: res.status, dates: res.status === 200 ? (await res.json()).purchases.map(p => p.purchaseDate.slice(0, 10)) : null };
  };
  assert.equal((await list('')).dates.length, 5);
  assert.deepEqual((await list('?from=2025-01-01&to=2025-12-31')).dates, ['2025-12-31', '2025-06-15', '2025-01-01']);
  assert.deepEqual((await list('?from=2025-12-31')).dates, ['2026-01-01', '2025-12-31']);
  assert.deepEqual((await list('?to=2024-12-31')).dates, ['2024-12-31']);
  assert.deepEqual((await list('?from=2030-01-01&to=2030-12-31')).dates, []);
  for (const bad of ['?from=2025-13-01', '?to=abc', '?from=2025-02-30', '?from=2025-12-31&to=2025-01-01']) assert.equal((await list(bad)).status, 400, bad);

  // The page applies the same SQL: default period query returns only the last year's rows.
  const q = period.purchaseListQuery(1, '2025-06-15', '2026-01-01');
  assert.deepEqual(db.prepare(q.sql).all(...q.args).map(r => r.purchaseDate.slice(0, 10)), ['2026-01-01', '2025-12-31', '2025-06-15']);
  const all = period.purchaseListQuery(1, null, null);
  assert.equal(db.prepare(all.sql).all(...all.args).length, 5);
});
