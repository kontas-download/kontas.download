const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const { reportMissingXsd, validateIsaf } = require('./helpers/isaf-xsd.cjs');
reportMissingXsd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-pcr-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'MB Pirkėjas', '111111111', 'LT111111119');
company.run(2, 'Company B', '222222222', 'LT222222229');
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

test('supplier credit notes', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'p@example.test','P','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,createdAt,updatedAt) VALUES(1,1,'UAB Tiekėjas','300000001','LT100000000011',datetime('now'),datetime('now'))").run();
    const purchases = require('../src/app/api/purchases/route.ts');
    const one = require('../src/app/api/purchases/[id]/route.ts');
    const credit = require('../src/app/api/purchases/[id]/credit/route.ts');
    const allocations = require('../src/app/api/bank/allocations/route.ts');
    const settlements = require('../src/app/api/bank/settlements/route.ts');
    const { openDocuments, overpaidDocuments } = require('../src/lib/payments.ts');
    const { buildIsaf } = require('../src/lib/isaf.ts');
    const { loadTaxDocuments } = require('../src/lib/tax-documents.ts');
    const { fr0600Draft } = require('../src/lib/fr0600.ts');
    const make = async (number, price, extra = {}) => (await (await purchases.POST(request('POST', { series: '', number, purchaseDate: '2026-09-10', clientId: 1, clientName: 'UAB Tiekėjas', clientCode: '300000001', items: [{ itemName: 'Prekė', quantity: 1, price, vatRate: 21 }], ...extra }))).json()).purchase;
    const note = (id, price, extra = {}) => credit.POST(request('POST', { number: 'K-' + Math.random().toString(36).slice(2, 7), purchaseDate: '2026-09-20', reason: 'Grąžinta dalis', items: [{ itemName: 'Prekė', quantity: 1, price, vatRate: 21 }], ...extra }), context(id));
    const entries = id => db.prepare("SELECT debitAccount d, creditAccount c, amount a FROM GeneralEntry WHERE sourceType='PURCHASE' AND sourceId=? ORDER BY debitAccount").all(id);
    const base = await make('T-100', 100);

    await t.test('credit note is stored negative, reverses the deducted VAT and links the original', async () => {
      const r = await note(base.id, 50); assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      const body = await r.json(); const k = body.purchase;
      assert.equal(k.docType, 'KS'); assert.equal(k.originalPurchaseId, base.id); assert.equal(k.sumWithoutVat, -50); assert.equal(k.vat, -10.5); assert.equal(k.sumWithVat, -60.5);
      assert.equal(k.deductionPercent, 100); assert.equal(k.deductibleVat, -10.5); assert.equal(k.clientId, 1);
      assert.deepEqual(body.items.map(i => [i.sumWithoutVat, i.sumWithVat]), [[-50, -60.5]]);
      assert.deepEqual(entries(k.id), [{ d: '2444', c: '4430', a: -10.5 }, { d: '6118', c: '4430', a: -50 }]);
      assert.equal(db.prepare("SELECT ROUND(SUM(amount),2) n FROM GeneralEntry WHERE sourceType='PURCHASE' AND debitAccount='2444'").get().n, 10.5);
    });

    await t.test('limits, validation and company scope', async () => {
      assert.equal((await note(base.id, 50.01)).status, 400); // 50 already credited
      assert.equal((await note(base.id, 50)).status, 200);
      assert.equal((await note(base.id, 0.01)).status, 400);
      assert.equal((await note(base.id, 1, { reason: ' ' })).status, 400);
      assert.equal((await note(base.id, 1, { purchaseDate: '2026-09-01' })).status, 400);
      const k = db.prepare("SELECT id FROM Purchase WHERE docType='KS' LIMIT 1").get().id;
      assert.equal((await note(k, 1)).status, 400); // no credit on a credit
      jar.set('active_company_id', '2'); assert.equal((await note(base.id, 1)).status, 404); jar.set('active_company_id', '1');
    });

    await t.test('partial and zero deductions are carried over; unreviewed legacy stays unreviewed', async () => {
      const half = await make('T-200', 100, { deductionPercent: 50 });
      const r = await (await note(half.id, 20)).json();
      assert.equal(r.purchase.deductionPercent, 50); assert.equal(r.purchase.deductibleVat, -2.1);
      assert.deepEqual(entries(r.purchase.id), [{ d: '2444', c: '4430', a: -2.1 }, { d: '6118', c: '4430', a: -22.1 }]);
      db.prepare("INSERT INTO Purchase(id,companyId,number,purchaseDate,vat,sumWithoutVat,sumWithVat,clientId,createdAt) VALUES(900,1,'LEGACY','2026-01-01',21,100,121,1,datetime('now'))").run();
      const legacy = await (await note(900, 10)).json();
      assert.equal(legacy.purchase.deductibleVat, null); assert.equal(legacy.purchase.deductionPercent, null);
    });

    await t.test('originals with credit notes and credit notes cannot be edited; deletion order is enforced', async () => {
      const body = { series: '', number: 'T-100', purchaseDate: '2026-09-10', clientName: 'UAB Tiekėjas', items: [{ itemName: 'Prekė', quantity: 1, price: 100, vatRate: 21 }] };
      const k = db.prepare("SELECT id FROM Purchase WHERE originalPurchaseId=? LIMIT 1").get(base.id).id;
      assert.equal((await one.PUT(request('PUT', body), context(base.id))).status, 409);
      assert.equal((await one.PUT(request('PUT', body), context(k))).status, 409);
      assert.equal((await one.DELETE(request('DELETE'), context(base.id))).status, 409);
      for (const row of db.prepare('SELECT id FROM Purchase WHERE originalPurchaseId=?').all(base.id)) assert.equal((await one.DELETE(request('DELETE'), context(row.id))).status, 200);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='PURCHASE' AND sourceId=?").get(k).n, 0);
      assert.equal((await one.PUT(request('PUT', body), context(base.id))).status, 200);
    });

    await t.test('payables: the balance follows credit notes, credit notes cannot be paid, overpayment is reported', async () => {
      const p = await make('T-300', 100); // 121
      const txn = (sum, notes) => Number(db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes) VALUES(1,'2026-10-01',?,'UAB Tiekėjas',?)").run(sum, notes).lastInsertRowid);
      const pay = (bank, id, amount) => allocations.POST(request('POST', { bankTransactionId: bank, kind: 'PURCHASE', documentId: id, amount }));
      assert.equal((await pay(txn(-121, 'T-300'), p.id, 121)).status, 200); // fully paid
      assert.ok(!openDocuments(db, 1).some(d => d.kind === 'PURCHASE' && d.id === p.id));
      const k = (await (await note(p.id, 40)).json()).purchase; // 48.4 credited after payment
      assert.deepEqual(overpaidDocuments(db, 1).filter(r => r.kind === 'PURCHASE' && r.id === p.id).map(r => r.excess), [48.4]);
      assert.ok(!openDocuments(db, 1).some(d => d.id === k.id)); // a credit note is not a payable
      assert.equal((await pay(txn(-5, 'x'), k.id, 5)).status, 409);
      const q = await make('T-400', 100);
      await note(q.id, 100); // whole 121 credited: nothing left to pay
      assert.ok(!openDocuments(db, 1).some(d => d.id === q.id));
      assert.equal((await pay(txn(-1, 'y'), q.id, 1)).status, 409);
      const r2 = await make('T-500', 100); await note(r2.id, 50); // 60.5 left
      assert.equal(openDocuments(db, 1).find(d => d.id === r2.id).balance, 60.5);
      assert.equal((await pay(txn(-61, 'z'), r2.id, 61)).status, 409);
      assert.equal((await settlements.POST(request('POST', { kind: 'PURCHASE', documentId: r2.id, method: 'CASH' }))).status, 200);
      assert.ok(!openDocuments(db, 1).some(d => d.id === r2.id));
    });

    await t.test('FR0600 and i.SAF treat the supplier credit note as a negative document with a reference', async () => {
      const p = await make('T-600', 100, { purchaseDate: '2026-11-05' });
      const k = (await (await note(p.id, 40, { purchaseDate: '2026-11-20' })).json()).purchase;
      const docs = loadTaxDocuments(db, 1, '2026-11-01', '2026-11-30');
      const draft = fr0600Draft([], docs.purchases);
      assert.equal(draft.fields.f25, 21 - 8.4); assert.equal(draft.fields.f35, 21 - 8.4);
      assert.equal(draft.complete, true);
      const sup = docs.purchases.find(d => d.id === k.id); assert.equal(sup.docType, 'KS'); assert.equal(sup.original.number, 'T-600'); assert.equal(sup.original.date, '2026-11-05');
      const r = buildIsaf({ company: { name: 'A', code: '111111111', vatCode: 'LT111111119' }, period: { start: '2026-11-01', end: '2026-11-30' }, sales: [], purchases: docs.purchases, software: { company: 'x', name: 'x', version: '1' } });
      assert.deepEqual(r.issues, []);
      const valid = await validateIsaf(r.xml);
      assert.equal(valid.valid, true, JSON.stringify(valid.errors));
      assert.match(r.xml, /<InvoiceType>KS<\/InvoiceType>[\s\S]*?<ReferenceNo>T-600<\/ReferenceNo><ReferenceDate>2026-11-05<\/ReferenceDate>/);
      assert.match(r.xml, /<TaxableValue>-40\.00<\/TaxableValue><TaxCode>PVM1<\/TaxCode><TaxPercentage>21<\/TaxPercentage><Amount>-8\.40<\/Amount>/);
    });

    await t.test('non-VAT buyer: the credit note keeps the supplier VAT in the expense, no deduction', async () => {
      db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=1").run();
      const p = await make('T-700', 100, { purchaseDate: '2026-12-01' });
      assert.equal(p.deductibleVat, 0);
      const k = (await (await note(p.id, 50, { purchaseDate: '2026-12-02' })).json()).purchase;
      assert.equal(k.deductibleVat, 0); assert.equal(k.deductionPercent, 0);
      assert.deepEqual(entries(k.id), [{ d: '6118', c: '4430', a: -60.5 }]);
    });

    await t.test('the shared dialog payload works (date under both names, items as listed in the register)', async () => {
      db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
      const p = await make('T-850', 100, { purchaseDate: '2027-01-05' });
      const items = db.prepare('SELECT itemName,itemCode,quantity,price,vatRate,sumWithoutVat,sumWithVat FROM PurchaseItem WHERE purchaseId=?').all(p.id);
      const dialog = { series: '', number: 'DLG-1', saleDate: '2027-01-06', purchaseDate: '2027-01-06', reason: 'Grąžinta', items: items.map(i => ({ ...i, quantity: Number(i.quantity), price: 30 })) };
      const r = await credit.POST(request('POST', dialog), context(p.id)); assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      const legacyShape = { series: '', number: 'DLG-2', saleDate: '2027-01-07', reason: 'Tik saleDate', items: [{ itemName: 'Prekė', quantity: 1, price: 10, vatRate: 21 }] };
      assert.equal((await credit.POST(request('POST', legacyShape), context(p.id))).status, 200);
    });

    await t.test('a credit note cannot reverse VAT the original did not have, nor use other rates', async () => {
      const noVat = await make('T-900', 100, { purchaseDate: '2027-02-01', items: [{ itemName: 'Prekė', quantity: 1, price: 100, vatRate: 0 }] });
      assert.equal(noVat.vat, 0);
      const r = await note(noVat.id, 82.64, { purchaseDate: '2027-02-02' }); assert.equal(r.status, 400); assert.match((await r.json()).error, /PVM tarifo 21%/);
      assert.equal((await credit.POST(request('POST', { number: 'ZERO-1', purchaseDate: '2027-02-02', reason: 'x', items: [{ itemName: 'Prekė', quantity: 1, price: 50, vatRate: 0 }] }), context(noVat.id))).status, 200);
      // legacy lines without a stored rate use the rate implied by their amounts
      db.prepare("INSERT INTO Purchase(id,companyId,number,purchaseDate,vat,sumWithoutVat,sumWithVat,clientId,buyerVatMode,deductionPercent,deductibleVat,createdAt) VALUES(9100,1,'LEG-2','2027-02-01',21,100,121,1,'STANDARD_VAT',100,21,datetime('now'))").run();
      db.prepare("INSERT INTO PurchaseItem(purchaseId,itemName,quantity,price,sumWithoutVat,sumWithVat,vatRate) VALUES(9100,'Sena',1,100,100,121,NULL)").run();
      assert.equal((await note(9100, 10, { purchaseDate: '2027-02-02' })).status, 200);
      assert.equal((await credit.POST(request('POST', { number: 'LEG-X', purchaseDate: '2027-02-03', reason: 'x', items: [{ itemName: 'Sena', quantity: 1, price: 5, vatRate: 9 }] }), context(9100))).status, 400);
    });

    await t.test('reversed deductions never add up to more than was deducted', async () => {
      const tiny = await make('T-950', 0.14, { purchaseDate: '2027-03-01', deductionPercent: 50 });
      assert.equal(tiny.vat, 0.03); assert.equal(tiny.deductibleVat, 0.02);
      const k = [];
      for (let i = 0; i < 3; i++) { const r = await note(tiny.id, 0.04, { purchaseDate: '2027-03-02' }); assert.equal(r.status, 200, JSON.stringify(await r.clone().json())); k.push((await r.json()).purchase); }
      assert.deepEqual(k.map(x => x.vat), [-0.01, -0.01, -0.01]);
      const reversed = Math.round(k.reduce((n, x) => n + x.deductibleVat * 100, 0));
      assert.equal(reversed, -2);
    });

    await t.test('offset of a payable against the same party receivable is allowed (Dt 4430 / Kt 2410); its own side is not', async () => {
      db.prepare("INSERT OR IGNORE INTO ChartOfAccount(code,name) VALUES('2410','Pirkėjų skolos')").run();
      const p = await make('T-990', 10, { purchaseDate: '2027-04-01' });
      const body = (account) => request('POST', { kind: 'PURCHASE', documentId: p.id, method: 'OFFSET', account, amount: 5, date: '2027-04-02' });
      assert.equal((await settlements.POST(body('4430'))).status, 400);
      const r = await settlements.POST(body('2410')); assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
      assert.deepEqual(db.prepare("SELECT debitAccount d, creditAccount c, amount a FROM GeneralEntry WHERE sourceType='SETTLEMENT' AND sourceId=?").all((await r.json()).id), [{ d: '4430', c: '2410', a: 5 }]);
    });

    await t.test('i.SAF refuses a supplier credit note with VAT from a supplier without a VAT code', async () => {
      const r = buildIsaf({ company: { name: 'A', code: '111111111', vatCode: 'LT111111119' }, period: { start: '2027-05-01', end: '2027-05-31' }, sales: [], purchases: [{ id: 1, number: 'KS 1', date: '2027-05-10', clientId: null, name: 'Be kodo', code: '300', vatCode: '', country: '', docType: 'KS', original: { number: 'X 1', date: '2027-05-01' }, lines: [{ rate: 21, net: -10, gross: -12.1 }] }], software: { company: 'x', name: 'x', version: '1' } });
      assert.equal(r.xml, null); assert.ok(r.issues.some(i => /tiekėjas neturi PVM kodo/.test(i)));
    });

    await t.test('deleting a company with credit notes works', async () => {
      db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=2").run();
      jar.set('active_company_id', '2');
      db.prepare("INSERT INTO Client(id,companyId,name,code,createdAt,updatedAt) VALUES(7,2,'T2','777',datetime('now'),datetime('now'))").run();
      const p = (await (await purchases.POST(request('POST', { series: '', number: 'B-1', purchaseDate: '2026-09-10', clientId: 7, clientName: 'T2', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 21 }] }))).json()).purchase;
      assert.equal((await note(p.id, 5)).status, 200);
      jar.set('active_company_id', '1');
      const companies = require('../src/app/api/companies/[id]/route.ts');
      const res = await companies.DELETE(request('DELETE'), context(2));
      assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchase WHERE companyId=2').get().n, 0);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
