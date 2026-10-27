const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-guard-'));
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
const { numberPattern, suggestMatches, openDocuments } = require('../src/lib/payments.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

test('document numbers match only as whole tokens', () => {
  const m = (label, text) => { const p = numberPattern(label); return Boolean(p && p.test(text.toLowerCase())); };
  assert.equal(m('AB 555555', 'mokejimas 555555'), true); assert.equal(m('AB 5555', 'mokejimas 5555'), false);
  assert.equal(numberPattern('SF 0'), null); assert.equal(numberPattern('PARD'), null);
  assert.equal(m('12345', 'suma 12345.00 eur'), false); assert.equal(m('12345', 'saskaita 12345 apmoketa'), true);
  assert.equal(m('SF 123', 'apmokejimas uz sf 123'), true); assert.equal(m('SF 123', 'sf123'), true); assert.equal(m('SF 123', 'sf-000123 dekui'), true);
  assert.equal(m('SF 12', 'apmokejimas uz sf 123'), false); assert.equal(m('SF 12', 'sf 12.'), true);
  assert.equal(m('TIEK-7', 'saskaita tiek-7'), true); assert.equal(m('TIEK-7', 'tiek-77'), false);
  assert.equal(numberPattern('2026'), null); assert.equal(numberPattern('123'), null); assert.ok(numberPattern('1234567'));
  assert.equal(m('1234567', 'saskaita 001234567 uz paslaugas'), true); assert.equal(m('1234567', 'iban lt12345678'), false);
});

test('payment safeguards', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'g@example.test','G','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=1").run();
    const invoices = require('../src/app/api/invoices/route.ts');
    const invoice = require('../src/app/api/invoices/[id]/route.ts');
    const purchaseRoute = require('../src/app/api/purchases/route.ts');
    const purchaseOne = require('../src/app/api/purchases/[id]/route.ts');
    const credit = require('../src/app/api/invoices/[id]/credit/route.ts');
    const allocations = require('../src/app/api/bank/allocations/route.ts');
    const matches = require('../src/app/api/bank/matches/route.ts');
    const sale = async (number, price, over = {}) => (await (await invoices.POST(request('POST', { statusName: 'Neapmokėta', series: 'SF', number, saleDate: '2026-09-01', clientName: 'Klientas', items: [{ itemName: 'x', quantity: 1, price, vatRate: 0 }], ...over }))).json()).sale;
    const txn = (sum, notes, name = 'Mokėtojas') => Number(db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes) VALUES(1,'2026-10-01',?,?,?)").run(sum, name, notes).lastInsertRowid);
    const allocate = (bankTransactionId, documentId, amount, kind = 'SALE') => allocations.POST(request('POST', { bankTransactionId, kind, documentId, amount }));

    await t.test('invoices marked paid are not open unless money is already linked', async () => {
      const old = await sale('900', 50, { statusName: 'Apmokėta', saleDate: '2020-01-01' });
      db.prepare("UPDATE Sale SET createdAt='2000-01-01 00:00:00' WHERE id=?").run(old.id);
      // an invoice entered after tracking started is open even though the form saves it as 'Apmokėta'
      const fresh = await sale('902', 40, { statusName: 'Apmokėta' });
      assert.ok(openDocuments(db, 1).some(d => d.kind === 'SALE' && d.id === fresh.id));
      const open = await sale('901', 70);
      let ids = openDocuments(db, 1).filter(d => d.kind === 'SALE').map(d => d.id);
      assert.ok(!ids.includes(old.id)); assert.ok(ids.includes(open.id));
      const t1 = txn(20, 'dalis'); assert.equal((await allocate(t1, old.id, 20)).status, 200);
      const row = openDocuments(db, 1).find(d => d.kind === 'SALE' && d.id === old.id);
      assert.equal(row.balance, 30);
      await allocate(txn(30, 'likutis'), old.id, 30);
      assert.ok(!openDocuments(db, 1).some(d => d.id === old.id && d.kind === 'SALE'));
    });

    await t.test('a shorter number never steals a payment; equal candidates are not "high"', async () => {
      db.prepare('DELETE FROM BankTransaction').run();
      const s12 = await sale('SF-12'.replace('SF-', ''), 100, { series: 'SF' });
      const s123 = await sale('123', 100, { series: 'SF' });
      const t1 = txn(100, 'Apmokėjimas už SF 123');
      let list = suggestMatches(db, 1).filter(s => s.bankTransactionId === t1);
      assert.equal(list.length, 1); assert.equal(list[0].documentId, s123.id); assert.equal(list[0].confidence, 'high');
      // same wording that fits two documents equally -> medium
      const twinA = await sale('555555', 40, { series: 'AB' });
      const twinB = await sale('555555', 40, { series: 'CD' });
      const t2 = txn(40, 'mokėjimas 555555');
      list = suggestMatches(db, 1).filter(s => s.bankTransactionId === t2);
      assert.equal(list.length, 1); assert.equal(list[0].confidence, 'medium'); assert.ok([twinA.id, twinB.id].includes(list[0].documentId));
      assert.ok(list[0].reasons.some(r => /pasirinkite rankiniu būdu/.test(r)));
      assert.ok(s12.id);
    });

    await t.test('two payments for one invoice: only one is "high" and the batch does not fail', async () => {
      db.prepare('DELETE FROM PaymentAllocation').run(); db.prepare('DELETE FROM BankTransaction').run();
      const inv = await sale('777777', 60, { series: 'DD' });
      const a = txn(60, 'DD 777777'), b = txn(60, 'DD 777777 (kartojasi)');
      const list = suggestMatches(db, 1).filter(s => [a, b].includes(s.bankTransactionId));
      assert.equal(list.length, 1); assert.equal(list[0].bankTransactionId, a); assert.equal(list[0].confidence, 'high');
      const result = await (await matches.POST(request('POST'))).json();
      assert.equal(result.applied, 1);
      assert.equal(db.prepare('SELECT COALESCE(SUM(amount),0) n FROM PaymentAllocation WHERE saleId=?').get(inv.id).n, 60);
    });

    await t.test('documents cannot be edited below the money already linked to them', async () => {
      db.prepare('DELETE FROM PaymentAllocation').run(); db.prepare('DELETE FROM BankTransaction').run();
      const inv = await sale('888888', 121, { series: 'EE' });
      assert.equal((await allocate(txn(100, 'EE 888888'), inv.id, 100)).status, 200);
      const body = (price) => ({ series: 'EE', number: '888888', saleDate: '2026-09-01', clientName: 'Klientas', items: [{ itemName: 'x', quantity: 1, price, vatRate: 0 }] });
      const low = await invoice.PUT(request('PUT', body(50)), context(inv.id));
      assert.equal(low.status, 409); assert.match((await low.json()).error, /mažesnė už jau susietus mokėjimus/);
      assert.equal(db.prepare('SELECT sumWithVat n FROM Sale WHERE id=?').get(inv.id).n, 121);
      assert.equal((await invoice.PUT(request('PUT', body(100)), context(inv.id))).status, 200);
      assert.equal((await invoice.PUT(request('PUT', body(120)), context(inv.id))).status, 200);
      const note = (price) => credit.POST(request('POST', { number: 'KS-' + price, saleDate: '2026-10-05', reason: 'x', items: [{ itemName: 'x', quantity: 1, price, vatRate: 0 }] }), context(inv.id));
      // a credit note below the money already received is allowed; the refund owed is reported
      assert.equal((await note(30)).status, 200);
      const { overpaidDocuments } = require('../src/lib/payments.ts');
      assert.deepEqual(overpaidDocuments(db, 1).filter(r => r.id === inv.id).map(r => r.excess), [10]);
      assert.equal((await note(20)).status, 200);
      assert.equal(overpaidDocuments(db, 1).find(r => r.id === inv.id).excess, 30);
      assert.equal((await note(80)).status, 400);
      const p = (await (await purchaseRoute.POST(request('POST', { series: '', number: 'P-1', purchaseDate: '2026-09-02', clientName: 'Tiekėjas', items: [{ itemName: 'x', quantity: 1, price: 80, vatRate: 0 }] }))).json()).purchase;
      assert.equal((await allocate(txn(-80, 'P-1'), p.id, 80, 'PURCHASE')).status, 200);
      const pb = (price) => ({ series: '', number: 'P-1', purchaseDate: '2026-09-02', clientName: 'Tiekėjas', items: [{ itemName: 'x', quantity: 1, price, vatRate: 0 }] });
      assert.equal((await purchaseOne.PUT(request('PUT', pb(70)), context(p.id))).status, 409);
      assert.equal((await purchaseOne.PUT(request('PUT', pb(90)), context(p.id))).status, 200);
    });

    await t.test('deleting a company that uses payments, credit notes and recurring templates works', async () => {
      db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (2, 'Company B', '222', 'EUR', 0, datetime('now'), datetime('now'))").run();
      db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=2").run();
      jar.set('active_company_id', '2');
      db.prepare("INSERT INTO Client(id,companyId,name,code,createdAt,updatedAt) VALUES(50,2,'K2','500',datetime('now'),datetime('now'))").run();
      const recurring = require('../src/app/api/recurring/route.ts');
      assert.equal((await recurring.POST(request('POST', { name: 'R', clientId: 50, frequency: 'MONTH', nextDate: '2026-01-01', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 0 }] }))).status, 200);
      const rid = db.prepare('SELECT id FROM RecurringInvoice WHERE companyId=2').get().id;
      const issue = require('../src/app/api/recurring/[id]/issue/route.ts');
      assert.equal((await issue.POST(request('POST', {}), context(rid))).status, 200);
      const base = (await sale('B-1', 100, { clientId: 50 }));
      const bank = Number(db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes) VALUES(2,'2026-10-01',60,'x','B-1')").run().lastInsertRowid);
      assert.equal((await allocate(bank, base.id, 60)).status, 200);
      assert.equal((await credit.POST(request('POST', { number: 'KS-B', saleDate: '2026-10-05', reason: 'x', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 0 }] }), context(base.id))).status, 200);
      const companies = require('../src/app/api/companies/[id]/route.ts');
      jar.set('active_company_id', '1');
      const res = await companies.DELETE(request('DELETE'), context(2));
      assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
      for (const table of ['Sale', 'Client', 'BankTransaction', 'PaymentAllocation', 'RecurringInvoice', 'RecurringRun']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${table === 'RecurringRun' ? '1' : 'companyId'}${table === 'RecurringRun' ? '=0' : '=2'}`).get().n, 0, table);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Company WHERE id=2').get().n, 0);
    });

    await t.test('audit trigger rebuild picks up columns added after the controls migration', async () => {
      const { migrateAuditColumns } = require('../src/lib/control-schema.ts');
      // emulate a live database whose purchase audit trigger predates the debitAccount column
      db.exec('DROP TRIGGER audit_Purchase_UPDATE');
      db.exec("CREATE TRIGGER audit_Purchase_UPDATE AFTER UPDATE ON Purchase BEGIN INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson) VALUES(NEW.companyId,'Purchase',NEW.id,'UPDATE',json_object('number',OLD.number),json_object('number',NEW.number)); END;");
      db.prepare("DELETE FROM AppMigration WHERE version='2026-10-audit-columns-v1'").run();
      migrateAuditColumns(db);
      const id = Number(db.prepare("INSERT INTO Purchase(companyId,number,purchaseDate,createdAt) VALUES(1,'AUD-1','2026-09-01',datetime('now'))").run().lastInsertRowid);
      db.prepare("UPDATE Purchase SET debitAccount='2040' WHERE id=?").run(id);
      const row = db.prepare("SELECT afterJson FROM AccountingAudit WHERE entity='Purchase' AND recordId=? AND action='UPDATE' ORDER BY id DESC LIMIT 1").get(id);
      assert.equal(JSON.parse(row.afterJson).debitAccount, '2040');
      migrateAuditColumns(db); // idempotent
    });

    await t.test('payment guards migration reaches a database where the payments migration already ran', async () => {
      const { migratePaymentGuards } = require('../src/lib/payment-schema.ts');
      db.exec('DROP TRIGGER sale_total_below_payments; DROP TRIGGER purchase_total_below_payments');
      db.prepare("DELETE FROM AppMigration WHERE version='2026-10-payment-guards-v1'").run();
      const inv = await sale('990', 100, { series: 'GG' });
      assert.equal((await allocate(txn(100, 'GG 990'), inv.id, 100)).status, 200);
      db.prepare('UPDATE Sale SET sumWithVat=10 WHERE id=?').run(inv.id); // unguarded, as on the live database before the migration
      db.prepare('UPDATE Sale SET sumWithVat=100 WHERE id=?').run(inv.id);
      migratePaymentGuards(db);
      assert.throws(() => db.prepare('UPDATE Sale SET sumWithVat=10 WHERE id=?').run(inv.id), /exceed document total/);
      migratePaymentGuards(db); // idempotent
    });

    await t.test('payment outside the bank (cash, offset) closes the balance, is capped together with bank links and is company scoped', async () => {
      const settlements = require('../src/app/api/bank/settlements/route.ts');
      const settlement = require('../src/app/api/bank/settlements/[id]/route.ts');
      const { overpaidDocuments } = require('../src/lib/payments.ts');
      db.prepare('DELETE FROM PaymentAllocation').run(); db.prepare('DELETE FROM BankTransaction').run();
      const inv = await sale('777', 100, { series: 'CC' });
      const settle = (body) => settlements.POST(request('POST', { kind: 'SALE', documentId: inv.id, method: 'CASH', date: '2026-10-10', ...body }));
      assert.equal((await settle({ amount: 60.005 })).status, 400);
      assert.equal((await settle({ method: 'CHEQUE' })).status, 400);
      assert.equal((await settle({ date: '2026-02-30' })).status, 400);
      assert.equal((await settle({ amount: 101 })).status, 409);
      assert.equal((await settle({ date: '2026-08-31' })).status, 400); // before the document date
      assert.equal((await settle({ method: 'OFFSET' })).status, 400); // an offset needs a counter account
      db.prepare("INSERT OR IGNORE INTO ChartOfAccount(code,name) VALUES('4494','Kitos mokėtinos sumos')").run();
      assert.equal((await settle({ method: 'OFFSET', account: '2410' })).status, 400); assert.equal((await settle({ method: 'OFFSET', account: '9999' })).status, 400);
      const first = await settle({ amount: 40 }); assert.equal(first.status, 200);
      assert.equal(openDocuments(db, 1).find(d => d.id === inv.id && d.kind === 'SALE').balance, 60);
      // the settlement is posted like the matching bank movement: Dt 272 cash / Kt 2410 receivable, with its own journal source
      assert.deepEqual(db.prepare("SELECT debitAccount d, creditAccount c, amount a, date FROM GeneralEntry WHERE sourceType='SETTLEMENT' AND sourceId=?").all((await first.clone().json()).id), [{ d: '272', c: '2410', a: 40, date: '2026-10-10' }]);
      // a bank link and a manual settlement share one cap
      assert.equal((await allocate(txn(70, 'CC 777'), inv.id, 70)).status, 409);
      assert.equal((await allocate(txn(60, 'CC 777'), inv.id, 60)).status, 200);
      assert.ok(!openDocuments(db, 1).some(d => d.id === inv.id && d.kind === 'SALE'));
      assert.equal((await settle({})).status, 409);
      // total cannot go below what was settled
      const body = (price) => ({ series: 'CC', number: '777', saleDate: '2026-09-01', clientName: 'Klientas', items: [{ itemName: 'x', quantity: 1, price, vatRate: 0 }] });
      assert.equal((await invoice.PUT(request('PUT', body(50)), context(inv.id))).status, 409);
      // deleting the settlement reopens the balance; credit notes are not settled
      const sid = (await first.json()).id;
      db.prepare("INSERT OR IGNORE INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (2, 'Company B', '222', 'EUR', 0, datetime('now'), datetime('now'))").run();
      jar.set('active_company_id', '2'); assert.equal((await settlement.DELETE(request('DELETE'), context(sid))).status, 404); jar.set('active_company_id', '1');
      assert.equal((await settlement.DELETE(request('DELETE'), context(sid))).status, 200);
      assert.equal(openDocuments(db, 1).find(d => d.id === inv.id && d.kind === 'SALE').balance, 40);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='SETTLEMENT' AND sourceId=?").get(sid).n, 0); // the journal row goes with it
      assert.equal((await settle({ amount: 10 })).status, 200);
      const off = await settle({ method: 'OFFSET', account: '4494', amount: 5, note: 'zachet' }); assert.equal(off.status, 200);
      assert.deepEqual(db.prepare("SELECT debitAccount d, creditAccount c, amount a FROM GeneralEntry WHERE sourceType='SETTLEMENT' AND sourceId=?").all((await off.json()).id), [{ d: '4494', c: '2410', a: 5 }]);
      // closed period: neither the settlement nor its journal row is created
      const controls = require('../src/app/api/companies/[id]/accounting-control/route.ts');
      assert.equal((await controls.PUT(request('PUT', { lockedThrough: '2026-12-31', reason: 'Patikrinta' }), context(1))).status, 200);
      const settlementsBefore = db.prepare('SELECT COUNT(*) n FROM ManualSettlement').get().n;
      assert.equal((await settle({ amount: 1 })).status, 409);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM ManualSettlement').get().n, settlementsBefore);
      await controls.PUT(request('PUT', { lockedThrough: null, reason: 'Atrakinta' }), context(1));
      assert.throws(() => db.prepare('UPDATE ManualSettlement SET amount=1').run(), /cannot be edited/);
      assert.deepEqual(overpaidDocuments(db, 1).filter(r => r.id === inv.id), []);
      const note = await credit.POST(request('POST', { number: 'KS-C', saleDate: '2026-10-11', reason: 'x', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 0 }] }), context(inv.id));
      assert.equal((await settlements.POST(request('POST', { kind: 'SALE', documentId: (await note.json()).sale.id, method: 'CASH', date: '2026-10-12' }))).status, 409);
    });

    await t.test('imported history counts as historical for the paid-status rule', async () => {
      const row = db.prepare("SELECT createdAt FROM Sale WHERE id=(SELECT MIN(id) FROM Sale)").get();
      assert.ok(row.createdAt); // normal invoices keep their real creation time
      const src = fs.readFileSync(path.join(__dirname, '../src/app/api/companies/import/route.ts'), 'utf8');
      assert.match(src, /'2000-01-01 00:00:00'/);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
