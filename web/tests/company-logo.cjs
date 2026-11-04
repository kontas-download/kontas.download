const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Pavyzdys', 'A', 'EUR', 0, datetime('now'), datetime('now'))").run();
fixture.close();
const jar = new Map();
const realMailer = require('nodemailer');
const messages = [];
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'nodemailer') return { createTransport: () => { const stream = realMailer.createTransport({ streamTransport: true, buffer: true }); return { close: () => stream.close(), sendMail: async mail => { messages.push(mail); return { accepted: [mail.to], rejected: [], messageId: '<test@local>' }; } }; } };
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();

const context = id => ({ params: Promise.resolve({ id: String(id) }) });
const putFile = body => new Request('http://localhost:3000/api/test', { method: 'PUT', body });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('company logo: validated upload, served back, printed on the invoice PDF, removable', async () => {
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'test@example.test','Tester','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  const logo = require('../src/app/api/companies/[id]/logo/route.ts');
  const invoices = require('../src/app/api/invoices/route.ts');
  const { invoiceDocument } = require('../src/lib/invoice-document.ts');
  const { invoiceDefinition, renderInvoicePdf } = require('../src/lib/invoice-pdf.ts');
  const sale = (await (await invoices.POST(new Request('http://localhost:3000/api/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ number: 'LG-001', saleDate: '2026-10-26', payUntil: '2026-11-10', clientName: 'Klientas', clientCode: 'K1', statusName: 'Neapmokėta', items: [{ itemName: 'Paslauga', quantity: 1, price: 10, vatRate: 0 }] }) }))).json()).sale;

  assert.equal((await logo.GET(putFile(), context(1))).status, 404);
  assert.equal(invoiceDocument(sale.id, 1).logo, undefined);
  assert.equal(JSON.stringify(invoiceDefinition(invoiceDocument(sale.id, 1))).includes('"image"'), false);

  assert.equal((await logo.PUT(putFile(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')), context(1))).status, 415);
  assert.equal((await logo.PUT(putFile(Buffer.concat([PNG, Buffer.alloc(600 * 1024)])), context(1))).status, 413);
  assert.equal((await logo.PUT(putFile(Buffer.alloc(0)), context(1))).status, 400);
  assert.equal((await logo.PUT(putFile(PNG), context(99))).status, 404);

  assert.equal((await logo.PUT(putFile(PNG), context(1))).status, 200);
  const served = await logo.GET(putFile(), context(1));
  assert.equal(served.status, 200); assert.equal(served.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), PNG);

  const doc = invoiceDocument(sale.id, 1);
  assert.match(doc.logo, /^data:image\/png;base64,/);
  assert.ok(JSON.stringify(invoiceDefinition(doc)).includes('"image"'));
  assert.equal((await renderInvoicePdf(doc)).subarray(0, 4).toString(), '%PDF');

  assert.equal((await logo.DELETE(putFile(), context(1))).status, 200);
  assert.equal((await logo.GET(putFile(), context(1))).status, 404);
  assert.equal(invoiceDocument(sale.id, 1).logo, undefined);
});

test('company notes: free text is saved, trimmed, cleared and size-limited; omitting it keeps the value', async () => {
  const one = require('../src/app/api/companies/[id]/route.ts');
  const put = body => one.PUT(new Request('http://localhost:3000/api/test', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'UAB Pavyzdys', code: 'A', ...body }) }), context(1));
  const notes = () => db.prepare('SELECT notes n FROM Company WHERE id=1').get().n;
  assert.equal((await put({ notes: '  Kontaktas: Jonas\nTel. 8 600 00000  ' })).status, 200);
  assert.equal(notes(), 'Kontaktas: Jonas\nTel. 8 600 00000');
  assert.equal((await put({})).status, 200); assert.equal(notes(), 'Kontaktas: Jonas\nTel. 8 600 00000');
  assert.equal((await put({ notes: 'x'.repeat(2001) })).status, 400);
  assert.equal((await put({ notes: 5 })).status, 400);
  assert.equal((await put({ notes: '' })).status, 200); assert.equal(notes(), null);
});
