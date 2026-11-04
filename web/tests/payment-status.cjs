const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-paystatus-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'Company A', '111', 'EUR', 0, datetime('now'), datetime('now'))").run();
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
const { openDocuments } = require('../src/lib/payments.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

test('invoice payment status: paid settles through the journal, unpaid reverses it', async t => {
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'s@example.test','S','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=1").run();
  const invoices = require('../src/app/api/invoices/route.ts');
  const status = require('../src/app/api/invoices/[id]/payment-status/route.ts');
  const credit = require('../src/app/api/invoices/[id]/credit/route.ts');
  const sale = async (number, price) => (await (await invoices.POST(request('POST', { statusName: 'Neapmokėta', series: 'SF', number, saleDate: '2026-09-01', clientName: 'Klientas', items: [{ itemName: 'x', quantity: 1, price, vatRate: 0 }] }))).json()).sale;
  const set = (id, value) => status.POST(request('POST', { status: value }), context(id));
  const isOpen = id => openDocuments(db, 1).some(d => d.kind === 'SALE' && d.id === id);

  await t.test('marking paid creates a cash settlement and a journal entry, and closes the invoice', async () => {
    const s = await sale('701', 120);
    assert.ok(isOpen(s.id));
    const res = await set(s.id, 'paid');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).sale.statusName, 'Apmokėta');
    assert.equal(db.prepare('SELECT SUM(amount) a FROM ManualSettlement WHERE saleId=?').get(s.id).a, 120);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM GeneralEntry WHERE sourceType='SETTLEMENT' AND creditAccount='2410'").get().c, 1);
    assert.ok(!isOpen(s.id));
    assert.equal((await set(s.id, 'paid')).status, 200, 'repeating paid is harmless');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ManualSettlement WHERE saleId=?').get(s.id).c, 1);
  });

  await t.test('marking unpaid removes the manual settlement and its journal entry', async () => {
    const s = await sale('702', 80);
    await set(s.id, 'paid');
    const res = await set(s.id, 'unpaid');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).sale.statusName, 'Neapmokėta');
    assert.equal(db.prepare('SELECT COUNT(*) c FROM ManualSettlement WHERE saleId=?').get(s.id).c, 0);
    assert.equal(db.prepare("SELECT COUNT(*) c FROM GeneralEntry WHERE sourceType='SETTLEMENT' AND docNumber=?").get('SF 702').c, 0);
    assert.ok(isOpen(s.id));
  });

  await t.test('money linked from the bank is not removed from here', async () => {
    const s = await sale('703', 50);
    const tx = Number(db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes) VALUES(1,'2026-10-01',50,'Klientas','703')").run().lastInsertRowid);
    db.prepare('INSERT INTO PaymentAllocation(companyId,bankTransactionId,saleId,amount,createdAt) VALUES(1,?,?,50,?)').run(tx, s.id, Date.now());
    const res = await set(s.id, 'unpaid');
    assert.equal(res.status, 409);
    assert.equal(db.prepare('SELECT COUNT(*) c FROM PaymentAllocation WHERE saleId=?').get(s.id).c, 1);
  });

  await t.test('credit notes, unknown values, foreign ids and anonymous callers are rejected', async () => {
    const s = await sale('704', 30);
    const cn = await (await credit.POST(request('POST', { number: 'KS-704', saleDate: '2026-10-05', reason: 'x', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 0 }] }), context(s.id))).json();
    const creditId = cn.sale?.id ?? cn.id;
    assert.ok(creditId, 'credit note was created: ' + JSON.stringify(cn).slice(0, 120));
    assert.equal((await set(creditId, 'paid')).status, 409);
    assert.equal((await set(s.id, 'maybe')).status, 400);
    assert.equal((await set(999999, 'paid')).status, 404);
    jar.delete('auth_session');
    assert.equal((await set(s.id, 'paid')).status, 401);
  });
});
