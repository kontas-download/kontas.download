const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-attach-routes-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'Company A', '111');
company.run(2, 'Company B', '222');
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
const rec = require('../src/lib/purchase-recognition.ts');
const db = getDb();
const request = (method, body, url = 'http://localhost:3000/api/test') => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });
const extractedJson = (over = {}) => JSON.stringify({
  docKind: 'RECEIPT', supplier: { name: 'Kavinė Testas', code: '300000777', vatCode: null, address: null }, buyer: { name: null, code: null, vatCode: null },
  series: null, number: null, issueDate: '2026-10-21', dueDate: null, currency: 'EUR', lines: [], totals: { net: 20, vat: 4.2, gross: 24.2 }, vatBreakdown: [],
  receipt: { cashRegisterNo: 'KA-1', receiptNo: '12', time: '09:15', storeAddress: null }, payment: { method: 'CARD', cardLast4: '4321' }, uncertainFields: [], notes: null, ...over,
});
const queued = (json) => {
  const id = rec.storeDocument(1, { buffer: Buffer.from(`%PDF-1.4 ${crypto.randomUUID()}`), fileName: 'r.pdf', mimeType: 'application/pdf' }).id;
  db.prepare("UPDATE PurchaseDocument SET status='EXTRACTED', extractedJson=? WHERE id=?").run(json, id);
  return id;
};

test('attach, promote guard, list shape and search through the API routes', async () => {
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'m@example.test','M','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
  const purchasesRoute = require('../src/app/api/purchases/route.ts');
  const attachRoute = require('../src/app/api/purchase-documents/[id]/attach/route.ts');
  const confirmRoute = require('../src/app/api/purchase-documents/[id]/confirm/route.ts');
  const searchRoute = require('../src/app/api/purchase-documents/purchase-search/route.ts');

  const created = (await (await purchasesRoute.POST(request('POST', { series: '', number: 'RT-1', purchaseDate: '2026-10-20', clientName: 'Kavinė Testas', clientCode: '300000777', items: [{ itemName: 'Kava', quantity: 1, price: 20, vatRate: 21 }] }))).json()).purchase;
  const purchaseCount = () => db.prepare('SELECT COUNT(*) n FROM Purchase').get().n;
  const before = purchaseCount();

  const wrong = queued(extractedJson({ totals: { net: 40, vat: 8.4, gross: 48.4 } }));
  const refused = await attachRoute.POST(request('POST', { purchaseId: created.id, role: 'PAYMENT_RECEIPT' }), context(wrong));
  assert.equal(refused.status, 409);
  const refusedBody = await refused.json();
  assert.ok(refusedBody.fields.confirmMismatch); assert.deepEqual(refusedBody.mismatch, ['AMOUNT']);
  assert.equal(db.prepare('SELECT status FROM PurchaseDocument WHERE id=?').get(wrong).status, 'EXTRACTED');

  const ok = await attachRoute.POST(request('POST', { purchaseId: created.id, role: 'PAYMENT_RECEIPT', confirmMismatch: true }), context(wrong));
  assert.equal(ok.status, 200);
  const okBody = await ok.json();
  assert.equal(okBody.document.role, 'PAYMENT_RECEIPT'); assert.equal(okBody.purchase.cardLast4, '4321'); assert.equal(purchaseCount(), before);

  assert.equal((await attachRoute.POST(request('POST', { purchaseId: created.id, role: 'ATTACHMENT' }), context(wrong))).status, 409, 'confirmed documents cannot be attached again');
  const other = queued(extractedJson());
  assert.equal((await attachRoute.POST(request('POST', { purchaseId: 987654, role: 'ATTACHMENT' }), context(other))).status, 404);
  assert.equal((await attachRoute.POST(request('POST', { purchaseId: created.id, role: 'NOPE' }), context(other))).status, 400);

  // An invoice purchase cannot be taken over by a promotion.
  const promote = await confirmRoute.POST(request('POST', { promote: true, intoPurchaseId: created.id, number: 'X' }), context(other));
  assert.equal(promote.status, 409);

  const list = await (await purchasesRoute.GET(request('GET', null))).json();
  const row = list.purchases.find(p => p.id === created.id);
  assert.deepEqual(row.documents.map(d => d.role), ['PAYMENT_RECEIPT']); assert.equal(row.documentId, row.documents[0].id);

  const found = await (await searchRoute.GET(request('GET', null, 'http://localhost:3000/api/purchase-documents/purchase-search?q=rt-1'))).json();
  assert.deepEqual(found.purchases.map(p => [p.id, p.number, p.supplier, p.gross, p.documentCount]), [ [created.id, 'RT-1', 'Kavinė Testas', 24.2, 1] ]);
});
