const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-bank-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'Company A', '111');
company.run(2, 'Company B', '222');
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
const { parseBankCsv, parseAmount, parseDate } = require('../src/lib/bank-import.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

test('CSV parsing handles formats and rejects bad rows', () => {
  assert.equal(parseAmount('1 234,56'), 1234.56); assert.equal(parseAmount('-12.30 EUR'), -12.3); assert.equal(parseAmount('1,234.50'), 1234.5); assert.equal(parseAmount('(5,00)'), -5); assert.equal(parseAmount('abc'), null); assert.equal(parseAmount('12.345'), null);
  assert.equal(parseDate('2026-10-05'), '2026-10-05'); assert.equal(parseDate('05.10.2026'), '2026-10-05'); assert.equal(parseDate('31.02.2026'), null);
  const csv = 'Data;Suma;Gavėjas/Mokėtojas;Mokėjimo paskirtis;Dokumento Nr\n05.10.2026;121,00;UAB Klientas;Apmokėjimas už SF 123;B1\n06.10.2026;-60,50;Tiekėjas;Sąskaita TIEK-7;B2\n';
  const ok = parseBankCsv(csv, 1);
  assert.deepEqual(ok.errors, []); assert.equal(ok.rows.length, 2); assert.equal(ok.rows[0].sum, 121); assert.equal(ok.rows[1].sum, -60.5);
  const split = parseBankCsv('Date,Debit,Credit,Details\n2026-10-01,10.00,,Out\n2026-10-02,,25.50,In\n', 1);
  assert.deepEqual(split.rows.map(r => r.sum), [-10, 25.5]);
  const bad = parseBankCsv('Date,Amount\n2026-13-01,5\n2026-10-01,x\n2026-10-01,0\n', 1);
  assert.equal(bad.errors.length, 3);
  assert.ok(parseBankCsv('foo,bar\n1,2\n', 1).errors.length);
  const twin = parseBankCsv('Date,Amount,Details\n2026-10-01,5,Same\n2026-10-01,5,Same\n', 1);
  assert.notEqual(twin.rows[0].hash, twin.rows[1].hash);
});

test('direction column, balance rows and ambiguity', async () => {
  const dk = parseBankCsv('Data;Suma;D/K;Gavėjas;Paskirtis\n01.10.2026;10,00;D;Tiekėjas;apmokėjimas\n02.10.2026;25,50;K;Klientas;SF 1\n03.10.2026;5,00;Kreditas;Klientas;SF 2\n', 1);
  assert.deepEqual(dk.errors, []); assert.deepEqual(dk.rows.map(r => r.sum), [-10, 25.5, 5]); assert.equal(dk.ambiguousDirection, false);
  assert.ok(parseBankCsv('Data;Suma;D/K\n01.10.2026;10,00;X\n', 1).errors[0].includes('kryptis'));
  const balances = parseBankCsv('Data;Suma;Paskirtis\n01.10.2026;1000,00;Pradinis likutis\n02.10.2026;-10,00;pirkinys\n31.10.2026;990,00;Galutinis likutis\n', 1);
  assert.equal(balances.errors.length, 2); assert.match(balances.errors[0], /likučio/);
  assert.equal(parseBankCsv('Data;Suma\n01.10.2026;10,00\n02.10.2026;20,00\n', 1).ambiguousDirection, true);
  assert.equal(parseBankCsv('Data;Suma\n01.10.2026;10,00\n02.10.2026;-20,00\n', 1).ambiguousDirection, false);
  assert.equal(parseBankCsv('Data;Debetas;Kreditas\n01.10.2026;;10,00\n', 1).ambiguousDirection, false);
  const same = 'Data;Suma;Paskirtis\n01.10.2026;-10,00;vienodas\n';
  // the duplicate key must not depend on the free-text account label, otherwise re-importing with another label doubles the rows
  assert.equal(parseBankCsv(same, 1, 'Swedbank').rows[0].hash, parseBankCsv(same, 1, 'SEB').rows[0].hash);
  assert.notEqual(parseBankCsv(same, 1).rows[0].hash, parseBankCsv(same, 2).rows[0].hash);
  assert.deepEqual(parseBankCsv('Data;Suma;Gavėjas\n01.10.2026;-10,00;Total Energies\n02.10.2026;-5,00;Bendra Logistika\n', 1).errors, []);
  assert.deepEqual(parseBankCsv('Date,Amount,Type\n2026-10-01,-10.00,Card payment\n', 1).errors, []);
  assert.equal(parseBankCsv(same, 1, 'Swedbank').rows[0].hash, parseBankCsv(same, 1, ' swedbank ').rows[0].hash);
});

test('bank import, matching and payment allocation', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'b@example.test','B','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
    const importRoute = require('../src/app/api/bank/import/route.ts');
    const matches = require('../src/app/api/bank/matches/route.ts');
    const allocations = require('../src/app/api/bank/allocations/route.ts');
    const allocation = require('../src/app/api/bank/allocations/[id]/route.ts');
    const invoices = require('../src/app/api/invoices/route.ts');
    const credit = require('../src/app/api/invoices/[id]/credit/route.ts');
    const purchases = require('../src/app/api/purchases/route.ts');
    const sale = async (number, price, name) => (await (await invoices.POST(request('POST', { statusName: 'Neapmokėta', series: 'SF', number, saleDate: '2026-10-01', clientName: name, clientCode: name === 'UAB Klientas' ? '300111222' : '300999888', items: [{ itemName: 'Service', quantity: 1, price, vatRate: 21 }] }))).json()).sale;
    const s123 = await sale('123', 100, 'UAB Klientas');
    const s124 = await sale('124', 50, 'UAB Klientas');
    const p = (await (await purchases.POST(request('POST', { series: '', number: 'TIEK-7', purchaseDate: '2026-10-02', clientName: 'Tiekėjas', items: [{ itemName: 'Goods', quantity: 1, price: 50, vatRate: 21 }] }))).json()).purchase;
    const csv = 'Data;Suma;Gavėjas/Mokėtojas;Mokėjimo paskirtis;Dokumento Nr\n05.10.2026;121,00;UAB Klientas;Apmokėjimas už SF 123;B1\n06.10.2026;-60,50;Tiekėjas;Sąskaita TIEK-7;B2\n07.10.2026;30,00;Nežinomas;be nuorodos;B3\n';
    let transactionIds;

    await t.test('dry run changes nothing, commit imports once and rejects broken files atomically', async () => {
      const dry = await importRoute.POST(request('POST', { csv })); const dryBody = await dry.json();
      assert.equal(dry.status, 200); assert.equal(dryBody.committed, false); assert.equal(dryBody.new, 3); assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 0);
      const done = await importRoute.POST(request('POST', { csv, commit: true, account: 'Revolut' })); const doneBody = await done.json();
      assert.equal(doneBody.committed, true); assert.equal(doneBody.incoming, 2); assert.equal(doneBody.outgoing, 1);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 3);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='BANK'").get().n, 3);
      const again = await (await importRoute.POST(request('POST', { csv, commit: true, account: 'Revolut' }))).json(); assert.equal(again.new, 0); assert.equal(again.duplicates, 3); assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 3);
      const broken = await importRoute.POST(request('POST', { csv: csv + '99.99.2026;5;x;y;z\n', commit: true, account: 'Revolut' })); assert.equal(broken.status, 422); assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 3);
      transactionIds = db.prepare('SELECT id FROM BankTransaction ORDER BY id').all().map(r => r.id);
      jar.set('active_company_id', '2'); const other = await (await importRoute.POST(request('POST', { csv, commit: true }))).json(); assert.equal(other.new, 3); jar.set('active_company_id', '1');
      db.prepare('DELETE FROM BankTransaction WHERE companyId=2').run();
    });

    await t.test('all-positive statements without a direction column need an explicit confirmation', async () => {
      const incoming = 'Data;Suma;Gavėjas/Mokėtojas;Mokėjimo paskirtis\n08.10.2026;15,00;Pirkėjas;įplauka\n';
      const blocked = await importRoute.POST(request('POST', { csv: incoming, commit: true }));
      assert.equal(blocked.status, 422); assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 3);
      assert.equal((await importRoute.POST(request('POST', { csv: incoming, commit: true, acknowledgeDirection: true }))).status, 200);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM BankTransaction').get().n, 4);
      db.prepare("DELETE FROM BankTransaction WHERE notes='įplauka'").run();
      transactionIds = db.prepare('SELECT id FROM BankTransaction ORDER BY id').all().map(r => r.id);
    });

    await t.test('suggestions use number and exact amount, never guess from amount alone', async () => {
      const list = (await (await matches.GET()).json()).suggestions;
      const byTxn = Object.fromEntries(list.map(s => [s.bankTransactionId, s]));
      assert.equal(byTxn[transactionIds[0]].documentId, s123.id); assert.equal(byTxn[transactionIds[0]].confidence, 'high'); assert.equal(byTxn[transactionIds[0]].amount, 121);
      assert.equal(byTxn[transactionIds[1]].kind, 'PURCHASE'); assert.equal(byTxn[transactionIds[1]].documentId, p.id);
      assert.equal(byTxn[transactionIds[2]], undefined);
    });

    await t.test('manual allocation rules: direction, caps, partial payments, credit notes', async () => {
      const post = body => allocations.POST(request('POST', body));
      assert.equal((await post({ bankTransactionId: transactionIds[2], kind: 'PURCHASE', documentId: p.id, amount: 10 })).status, 409);
      assert.equal((await post({ bankTransactionId: transactionIds[2], kind: 'SALE', documentId: s124.id, amount: 31 })).status, 409);
      assert.equal((await post({ bankTransactionId: transactionIds[2], kind: 'SALE', documentId: s124.id, amount: 0.001 })).status, 400);
      assert.equal((await post({ bankTransactionId: transactionIds[2], kind: 'SALE', documentId: s124.id, amount: 30 })).status, 200);
      const open = (await (await allocations.GET()).json()).open;
      assert.equal(open.find(d => d.kind === 'SALE' && d.id === s124.id).balance, 30.5);
      const listed = (await (await invoices.GET()).json()).sales.find(x => x.id === s124.id);
      assert.equal(listed.paidAmount, 30); assert.equal(listed.dueAmount, 60.5);
      assert.equal((await post({ bankTransactionId: transactionIds[0], kind: 'SALE', documentId: s123.id, amount: 121.01 })).status, 409);
      const note = await credit.POST(request('POST', { number: 'KS-1', saleDate: '2026-10-08', reason: 'Grąžinta', items: [{ itemName: 'Service', quantity: 1, price: 50, vatRate: 21 }] }), context(s123.id));
      assert.equal(note.status, 200);
      const credited = (await (await allocations.GET()).json()).open.find(d => d.kind === 'SALE' && d.id === s123.id);
      assert.equal(credited.due, 60.5);
      assert.equal((await post({ bankTransactionId: transactionIds[0], kind: 'SALE', documentId: s123.id, amount: 60.51 })).status, 409);
      assert.equal((await post({ bankTransactionId: transactionIds[0], kind: 'SALE', documentId: (await note.json()).sale.id, amount: 1 })).status, 409);
    });

    await t.test('high-confidence batch applies matching rows and the document balance follows', async () => {
      const result = await (await matches.POST(request('POST'))).json();
      assert.ok(result.applied >= 1);
      const paidPurchase = db.prepare('SELECT COALESCE(SUM(amount),0) n FROM PaymentAllocation WHERE purchaseId=?').get(p.id).n;
      assert.equal(paidPurchase, 60.5);
      const open = (await (await allocations.GET()).json()).open;
      assert.equal(open.find(d => d.kind === 'PURCHASE' && d.id === p.id), undefined);
    });

    await t.test('allocations are company scoped, deletable and block deleting paid invoices', async () => {
      const first = db.prepare('SELECT id FROM PaymentAllocation ORDER BY id LIMIT 1').get().id;
      jar.set('active_company_id', '2'); assert.equal((await allocation.DELETE(request('DELETE'), context(first))).status, 404); assert.equal((await (await allocations.GET()).json()).allocations.length, 0); jar.set('active_company_id', '1');
      assert.throws(() => db.prepare('UPDATE PaymentAllocation SET amount=1 WHERE id=?').run(first), /cannot be edited/);
      assert.throws(() => db.prepare('DELETE FROM Sale WHERE id=?').run(s124.id), /FOREIGN KEY/);
      assert.equal((await allocation.DELETE(request('DELETE'), context(first))).status, 200);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
