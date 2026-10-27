const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-credit-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))").run(1, 'Company A', 'A');
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))").run(2, 'Company B', 'B');
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
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

const { invoiceDocument } = require('../src/lib/invoice-document.ts');
test('credit notes against invoices', async t => { try {
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'kr@example.test','K','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1,name='Seller',code='111',vatCode='LT111' WHERE id=1").run();
  const invoices = require('../src/app/api/invoices/route.ts'); const one = require('../src/app/api/invoices/[id]/route.ts'); const credit = require('../src/app/api/invoices/[id]/credit/route.ts');
  const sale = (await (await invoices.POST(request('POST', { series: 'SF', number: '1', saleDate: '2026-10-01', clientName: 'Buyer', items: [{ itemName: 'Service', quantity: 1, price: 100, vatRate: 21 }] }))).json()).sale;
  const note = (extra = {}) => credit.POST(request('POST', { number: 'KS-' + Math.random(), saleDate: '2026-10-05', reason: 'Grąžinta dalis', items: [{ itemName: 'Service', quantity: 1, price: 50, vatRate: 21 }], ...extra }), context(sale.id));
  const journal = id => db.prepare("SELECT debitAccount,creditAccount,amount FROM GeneralEntry WHERE sourceType='SALE' AND sourceId=? ORDER BY creditAccount").all(id);
  let first;
  await t.test('credit note is stored negative, posts negative entries and links the original', async () => {
    const r = await note(); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); const data = await r.json(); first = data.sale;
    assert.equal(first.docType, 'KS'); assert.equal(first.originalSaleId, sale.id); assert.equal(first.sumWithoutVat, -50); assert.equal(first.vat, -10.5); assert.equal(first.sumWithVat, -60.5);
    assert.deepEqual(data.items.map(i => [i.sumWithoutVat, i.sumWithVat]), [[-50, -60.5]]);
    assert.deepEqual(journal(first.id), [{ debitAccount: '2410', creditAccount: '4492', amount: -10.5 }, { debitAccount: '2410', creditAccount: '5001', amount: -50 }]);
    assert.equal(db.prepare("SELECT ROUND(SUM(amount),2) n FROM GeneralEntry WHERE companyId=1 AND creditAccount='5001'").get().n, 50);
  });
  await t.test('a credit note cannot use a VAT rate the original did not have; legacy lines use their implied rate', async () => {
    const wrong = await note({ items: [{ itemName: 'Service', quantity: 1, price: 10, vatRate: 9 }] }); assert.equal(wrong.status, 400); assert.match((await wrong.json()).error, /PVM tarifo 9%/);
    db.prepare("INSERT INTO Sale(id,companyId,series,number,saleDate,sumWithoutVat,vat,sumWithVat,sellerVatMode,sellerIsVatPayer,statusName,createdAt) VALUES(950,1,'SF','LEG',?,100,21,121,'STANDARD_VAT',1,'Neapmokėta',datetime('now'))").run('2026-10-01');
    db.prepare("INSERT INTO SaleItem(saleId,itemName,quantity,price,vatRate,sumWithoutVat,sumWithVat) VALUES(950,'Sena',1,100,NULL,100,121)").run();
    const legacy = await credit.POST(request('POST', { number: 'KS-LEG', saleDate: '2026-10-05', reason: 'x', items: [{ itemName: 'Sena', quantity: 1, price: 10, vatRate: 21 }] }), context(950)); assert.equal(legacy.status, 200);
    const ids = db.prepare('SELECT id FROM Sale WHERE id=950 OR originalSaleId=950').all().map(r => r.id);
    for (const x of ids) { db.prepare("DELETE FROM GeneralEntry WHERE sourceType='SALE' AND sourceId=?").run(x); db.prepare('DELETE FROM SaleItem WHERE saleId=?').run(x); }
    db.prepare('DELETE FROM Sale WHERE originalSaleId=950').run(); db.prepare('DELETE FROM Sale WHERE id=950').run();
  });

  await t.test('total credit cannot exceed the original invoice', async () => {
    assert.equal((await note({ items: [{ itemName: 'Service', quantity: 1, price: 50.01, vatRate: 21 }] })).status, 400);
    assert.equal((await note({ items: [{ itemName: 'Service', quantity: 1, price: 50, vatRate: 21 }] })).status, 200);
    assert.equal((await note({ items: [{ itemName: 'Service', quantity: 1, price: 0.01, vatRate: 21 }] })).status, 400);
  });
  await t.test('validation: reason, date, company scope, nested credits', async () => {
    assert.equal((await note({ reason: '  ' })).status, 400); assert.equal((await note({ saleDate: '2026-09-30' })).status, 400);
    jar.set('active_company_id', '2'); assert.equal((await note()).status, 404); jar.set('active_company_id', '1');
    assert.equal((await credit.POST(request('POST', { number: 'X', saleDate: '2026-10-06', reason: 'r', items: [{ itemName: 'S', quantity: 1, price: 1, vatRate: 21 }] }), context(first.id))).status, 400);
  });
  await t.test('originals with credits and credit notes are protected from edits; deletion order is enforced', async () => {
    const edit = { series: 'SF', number: '1', saleDate: '2026-10-01', clientName: 'Buyer', items: [{ itemName: 'Service', quantity: 1, price: 100, vatRate: 21 }] };
    assert.equal((await one.PUT(request('PUT', edit), context(sale.id))).status, 409); assert.equal((await one.PUT(request('PUT', edit), context(first.id))).status, 409);
    assert.equal((await one.DELETE(request('DELETE'), context(sale.id))).status, 409);
    for (const row of db.prepare('SELECT id FROM Sale WHERE originalSaleId=?').all(sale.id)) assert.equal((await one.DELETE(request('DELETE'), context(row.id))).status, 200);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='SALE' AND sourceId!=?").get(sale.id).n, 0);
    assert.equal((await one.DELETE(request('DELETE'), context(sale.id))).status, 200);
  });
  await t.test('PDF document carries the correction reference; non-PVM originals stay without VAT; i.SAF refuses credit notes', async () => {
    db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=1").run();
    const base = (await (await invoices.POST(request('POST', { series: 'SF', number: '2', saleDate: '2026-10-01', clientName: 'Buyer', items: [{ itemName: 'Service', quantity: 1, price: 100, vatRate: 0 }] }))).json());
    assert.equal(base.sale.vat, 0);
    const bad = await credit.POST(request('POST', { number: 'KS-N', saleDate: '2026-10-02', reason: 'r', items: [{ itemName: 'S', quantity: 1, price: 10, vatRate: 21 }] }), context(base.sale.id)); assert.equal(bad.status, 400);
    const ok = await credit.POST(request('POST', { number: 'KS-N', saleDate: '2026-10-02', reason: 'Klaida', items: [{ itemName: 'S', quantity: 1, price: 10, vatRate: 0 }] }), context(base.sale.id)); assert.equal(ok.status, 200);
    const doc = invoiceDocument((await ok.json()).sale.id, 1);
    assert.deepEqual(doc.correction, { originalNumber: 'SF 2', originalDate: '2026-10-01', reason: 'Klaida' }); assert.equal(doc.total, -10);
    const { buildIsaf } = require('../src/lib/isaf.ts');
    const r = buildIsaf({ company: { name: 'A', code: '111', vatCode: 'LT1' }, period: { start: '2026-10-01', end: '2026-10-31' }, sales: [{ id: 1, number: 'KS 1', date: '2026-10-02', clientId: 1, name: 'B', code: '1', vatCode: 'LT100', country: '', lines: [{ rate: 21, net: -10, gross: -12.1 }] }], purchases: [], software: { company: 'x', name: 'x', version: '1' } });
    assert.equal(r.xml, null); // a negative document that is not marked as a credit note is still refused
  });
} finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); } });
