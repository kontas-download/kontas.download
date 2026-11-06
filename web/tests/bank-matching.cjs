const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-bank-matching-'));
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
const bm = require('../src/lib/bank-matching.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });
const pdfBuf = tag => Buffer.from(`%PDF-1.4 ${tag} ${crypto.randomUUID()}`);
const extractedJson = (over = {}) => JSON.stringify({
  docKind: 'INVOICE', supplier: { name: 'UAB Juodraštis', code: '300000555', vatCode: null, address: null }, buyer: { name: null, code: null, vatCode: null },
  series: null, number: 'JUO-1', issueDate: '2026-10-12', dueDate: null, currency: 'EUR',
  lines: [{ name: 'X', quantity: 1, unitPrice: 82.64, net: 82.64, vatRate: 21, vat: 17.35, gross: 99.99 }],
  totals: { net: 82.64, vat: 17.35, gross: 99.99 }, vatBreakdown: [], receipt: null, payment: { method: null, cardLast4: null }, uncertainFields: [], notes: null, ...over,
});

const doc = (over = {}) => ({ kind: 'purchase', id: 1, label: 'ALFA-1', date: '2026-10-02', gross: 60.5, supplierName: 'UAB Alfa Tiekėjas', supplierCode: '300111111', cardLast4: null, ...over });
const line = (over = {}) => ({ id: 1, date: '2026-10-02', sum: -60.5, clientName: '', clientCode: '', number: '', notes: '', allocated: 0, ...over });

test('scoring: exact amount, date window, card last 4, supplier, document number, already matched', () => {
  const base = bm.scoreMatch(doc(), line());
  assert.equal(base.confidence, 65); assert.deepEqual(base.reasons, ['AMOUNT', 'DATE_SAME']);
  assert.equal(bm.scoreMatch(doc(), line({ sum: -60.51 })), null);
  assert.equal(bm.scoreMatch(doc(), line({ sum: 60.5 })), null);
  assert.equal(bm.scoreMatch(doc(), line({ date: '2026-09-28' })), null);
  assert.equal(bm.scoreMatch(doc(), line({ date: '2026-10-13' })), null);
  assert.equal(bm.scoreMatch(doc(), line({ date: '2026-09-29' })).confidence, 60);
  assert.equal(bm.scoreMatch(doc(), line({ date: '2026-10-12' })).confidence, 55);
  assert.equal(bm.scoreMatch(doc(), line({ date: '2026-10-04' })).confidence, 60);
  const card = bm.scoreMatch(doc({ cardLast4: '1234' }), line({ notes: 'PIRKINYS ****1234' }));
  assert.equal(card.confidence, 90); assert.ok(card.reasons.includes('CARD'));
  assert.equal(bm.scoreMatch(doc({ cardLast4: '1234' }), line({ notes: 'ref 912345' })).confidence, 65);
  const name = bm.scoreMatch(doc(), line({ clientName: 'ALFA TIEKEJAS UAB' }));
  assert.equal(name.confidence, 80); assert.ok(name.reasons.includes('SUPPLIER_NAME'));
  assert.equal(bm.scoreMatch(doc(), line({ clientName: 'Alfa Kitas' })).confidence, 73);
  const code = bm.scoreMatch(doc(), line({ notes: 'Mokėtojo kodas 300111111' }));
  assert.equal(code.confidence, 80); assert.ok(code.reasons.includes('SUPPLIER_CODE'));
  const number = bm.scoreMatch(doc({ label: 'ALFA 1001' }), line({ notes: 'apmokejimas uz ALFA-1001' }));
  assert.equal(number.confidence, 98); assert.ok(number.reasons.includes('NUMBER'));
  assert.ok(bm.scoreMatch(doc({ label: 'ALFA 1001' }), line({ date: '2026-12-01', notes: 'ALFA-1001' })).confidence >= 75);
  const penalised = bm.scoreMatch(doc(), line({ sum: -100, allocated: 39.5 }));
  assert.equal(penalised.confidence, 25); assert.ok(penalised.reasons.includes('ALREADY_MATCHED'));
  assert.equal(bm.scoreMatch(doc(), line({ sum: -60.5, allocated: 60.5 })), null);
  assert.equal(bm.scoreMatch(doc({ cardLast4: '1234', label: 'ALFA 1001' }), line({ clientName: 'ALFA TIEKEJAS UAB', notes: '1234 ALFA-1001' })).confidence, 100);
});

test('bank side and purchase side suggestions, link, unlink, bulk threshold, PERSON and cash exclusion', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'m@example.test','M','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
    const purchasesRoute = require('../src/app/api/purchases/route.ts');
    const matchesRoute = require('../src/app/api/bank/purchase-matches/route.ts');
    const forPurchase = require('../src/app/api/purchases/[id]/bank-matches/route.ts');
    const allocation = require('../src/app/api/bank/allocations/[id]/route.ts');
    const rec = require('../src/lib/purchase-recognition.ts');
    const { openDocuments } = require('../src/lib/payments.ts');
    const buy = async (number, date, price, name, code, extras = {}) => {
      const p = (await (await purchasesRoute.POST(request('POST', { series: '', number, purchaseDate: date, clientName: name, clientCode: code, items: [{ itemName: 'Goods', quantity: 1, price, vatRate: 21 }] }))).json()).purchase;
      if (Object.keys(extras).length) db.prepare('UPDATE Purchase SET paidBy=?,paidByName=?,paymentMethod=?,cardLast4=? WHERE id=?').run(extras.paidBy ?? null, extras.paidByName ?? null, extras.paymentMethod ?? null, extras.cardLast4 ?? null, p.id);
      return p;
    };
    const bank = (date, sum, name, notes) => Number(db.prepare('INSERT INTO BankTransaction(companyId,date,number,clientName,sum,correspondenceAccountCode,accountingBankInternalName,notes) VALUES(1,?,?,?,?,?,?,?)').run(date, null, name, sum, '2710', 'Bank', notes).lastInsertRowid);
    const ledger = () => db.prepare('SELECT COUNT(*) n, ROUND(SUM(amount),2) s FROM GeneralEntry').get();

    const A = await buy('ALFA-1', '2026-10-02', 50, 'UAB Alfa Tiekėjas', '300111111', { paymentMethod: 'CARD', cardLast4: '1234' });
    const B = await buy('BETA-2', '2026-10-05', 20, 'UAB Beta', '300222222');
    const C = await buy('GAMA-3', '2026-10-01', 10, 'UAB Gama', '300333333');
    const D = await buy('OWN-4', '2026-10-03', 30, 'Kavinė', '300444444', { paidBy: 'PERSON', paidByName: 'Jonas Jonaitis' });
    const E = await buy('CASH-5', '2026-10-04', 40, 'Kioskas', '300555555', { paymentMethod: 'CASH' });
    const F1 = await buy('DELTA-6', '2026-10-06', 70, 'UAB Delta', '300666666', { paymentMethod: 'CARD', cardLast4: '1111' });
    const F2 = await buy('DELTA-7', '2026-10-06', 70, 'UAB Delta', '300666666', { paymentMethod: 'CARD', cardLast4: '1111' });
    const L1 = bank('2026-10-02', -60.5, 'ALFA TIEKEJAS UAB', 'Card ****1234 purchase');
    const L2 = bank('2026-10-08', -24.2, '', 'payment');
    bank('2026-10-20', -12.1, 'UAB Gama', 'late');
    const L4 = bank('2026-10-10', -36.3, 'Jonas Jonaitis', 'kompensacija');
    const L5 = bank('2026-10-04', -48.4, 'Kioskas', 'card');
    const L6 = bank('2026-10-06', -84.7, 'UAB Delta', 'card 1111');
    const incoming = bank('2026-10-02', 60.5, 'UAB Alfa Tiekėjas', 'grąžinimas');
    const draftId = rec.storeDocument(1, { buffer: pdfBuf('d'), fileName: 'd.pdf', mimeType: 'application/pdf' }).id;
    db.prepare("UPDATE PurchaseDocument SET status='EXTRACTED', extractedJson=? WHERE id=?").run(extractedJson(), draftId);
    const L7 = bank('2026-10-12', -99.99, 'UAB Juodraštis', 'card');
    const ledgerBefore = ledger();

    await t.test('bank side: ranked suggestions, drafts, exclusions', async () => {
      const data = await (await matchesRoute.GET()).json();
      const byPurchase = Object.fromEntries(data.suggestions.map(s => [s.documentId, s]));
      assert.equal(byPurchase[A.id].bankTransactionId, L1); assert.equal(byPurchase[A.id].confidence, 100); assert.equal(byPurchase[A.id].amount, 60.5);
      assert.equal(byPurchase[B.id].bankTransactionId, L2); assert.equal(byPurchase[B.id].confidence, 60);
      assert.equal(byPurchase[C.id], undefined, 'outside the date window');
      assert.equal(byPurchase[D.id], undefined, 'own funds are not matched against the company bank');
      assert.equal(byPurchase[E.id], undefined, 'cash is not paid through the bank');
      assert.ok(data.suggestions.every(s => s.bankTransactionId !== incoming && s.bankTransactionId !== L5));
      assert.deepEqual(data.suggestions.map(s => s.confidence), [...data.suggestions.map(s => s.confidence)].sort((x, y) => y - x));
      assert.deepEqual(data.drafts.map(d => [d.documentId, d.bankTransactionId, d.kind]), [ [draftId, L7, 'document']]);
      for (const f of [F1, F2]) { assert.equal(byPurchase[f.id].bankTransactionId, L6); assert.ok(byPurchase[f.id].confidence < 90); assert.ok(byPurchase[f.id].reasons.includes('AMBIGUOUS')); }
    });

    await t.test('purchase side lists candidates; PERSON purchase is flagged', async () => {
      const mine = await (await forPurchase.GET(request('GET'), context(A.id))).json();
      assert.deepEqual(mine.candidates.map(c => [c.bankTransactionId, c.confidence]), [ [L1, 100] ]); assert.deepEqual(mine.linked, []); assert.equal(mine.ownFunds, false);
      const own = await (await forPurchase.GET(request('GET'), context(D.id))).json();
      assert.deepEqual(own.candidates, []); assert.equal(own.ownFunds, true);
      jar.set('active_company_id', '2'); assert.equal((await forPurchase.GET(request('GET'), context(A.id))).status, 404); jar.set('active_company_id', '1');
    });

    await t.test('bulk links only reliable suggestions, via the existing payment mechanism', async () => {
      const res = await (await matchesRoute.POST(request('POST', { action: 'linkReliable' }))).json();
      assert.equal(res.applied, 1);
      const rows = db.prepare('SELECT bankTransactionId, purchaseId, amount FROM PaymentAllocation').all();
      assert.deepEqual(rows, [{ bankTransactionId: L1, purchaseId: A.id, amount: 60.5 }]);
      const open = openDocuments(db, 1);
      assert.equal(open.find(d => d.kind === 'PURCHASE' && d.id === A.id), undefined);
      assert.ok(open.find(d => d.kind === 'PURCHASE' && d.id === B.id));
      assert.deepEqual(ledger(), ledgerBefore, 'the bank line already carries the posting (D 4430 / K 2710); linking adds none');
      const posting = db.prepare("SELECT debitAccount, creditAccount, amount FROM GeneralEntry WHERE sourceType='BANK' AND sourceId=?").get(L1);
      assert.deepEqual(posting, { debitAccount: '4430', creditAccount: '2710', amount: 60.5 });
      const again = await (await matchesRoute.POST(request('POST', { action: 'linkReliable' }))).json();
      assert.equal(again.applied, 0);
      const linked = await (await forPurchase.GET(request('GET'), context(A.id))).json();
      assert.equal(linked.linked.length, 1); assert.equal(linked.linked[0].bankTransactionId, L1);
    });

    await t.test('unlink reverses the payment', async () => {
      const id = db.prepare('SELECT id FROM PaymentAllocation WHERE purchaseId=?').get(A.id).id;
      assert.equal((await allocation.DELETE(request('DELETE'), context(id))).status, 200);
      assert.ok(openDocuments(db, 1).find(d => d.kind === 'PURCHASE' && d.id === A.id && d.balance === 60.5));
      assert.deepEqual(ledger(), ledgerBefore);
    });

    await t.test('a person links a lower-confidence suggestion; wrong or own-funds links are refused', async () => {
      const post = body => matchesRoute.POST(request('POST', body));
      assert.equal((await post({ action: 'link', bankTransactionId: L2, purchaseId: B.id })).status, 200);
      assert.equal(db.prepare('SELECT amount FROM PaymentAllocation WHERE purchaseId=?').get(B.id).amount, 24.2);
      assert.equal((await post({ action: 'link', bankTransactionId: L2, purchaseId: C.id })).status, 409);
      assert.equal((await post({ action: 'link', bankTransactionId: L4, purchaseId: D.id })).status, 409);
      assert.equal((await post({ action: 'link', bankTransactionId: incoming, purchaseId: C.id })).status, 409);
      assert.equal((await post({ action: 'nope' })).status, 400);
    });

    await t.test('reimbursement of an own-funds purchase from the bank line to the person', async () => {
      const data = await (await matchesRoute.GET()).json();
      assert.deepEqual(data.reimbursements.map(r => [r.bankTransactionId, r.person, r.purchaseIds, r.amount]), [[L4, 'Jonas Jonaitis', [D.id], 36.3]]);
      const post = body => matchesRoute.POST(request('POST', body));
      assert.equal((await post({ action: 'reimburse', bankTransactionId: L1, purchaseIds: [D.id] })).status, 409);
      assert.equal((await post({ action: 'reimburse', bankTransactionId: L4, purchaseIds: [D.id, F1.id] })).status, 409);
      assert.equal((await post({ action: 'reimburse', bankTransactionId: L4, purchaseIds: [D.id] })).status, 200);
      assert.equal(db.prepare('SELECT reimbursedAt FROM Purchase WHERE id=?').get(D.id).reimbursedAt, '2026-10-10');
      assert.deepEqual((await (await matchesRoute.GET()).json()).reimbursements, []);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
