const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-recv-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.SMTP_ENCRYPTION_KEY = 'ab'.repeat(32);
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'UAB Pardavėjas', '111');
company.run(2, 'Company B', '222');
fixture.close();
const jar = new Map();
const messages = [];
let failMail = false;
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'nodemailer') return { createTransport: () => ({ close() {}, sendMail: async mail => { if (failMail) throw new Error('SMTP timeout'); messages.push(mail); return { messageId: '<m' + messages.length + '@test>', accepted: [mail.to], rejected: [] }; } }) };
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const { bucketFor, daysBetween } = require('../src/lib/receivables.ts');
const db = getDb();
const request = (method, body, url = 'http://localhost:3000/api/test') => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

test('ageing buckets', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-31'), 30);
  assert.deepEqual([-5, 0, 1, 30, 31, 60, 61, 90, 91].map(bucketFor), ['NOT_DUE', 'NOT_DUE', 'D1_30', 'D1_30', 'D31_60', 'D31_60', 'D61_90', 'D61_90', 'D90_PLUS']);
});

test('receivables report and payment reminders', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'r@example.test','R','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0,email='seller@example.test' WHERE id=1").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,email,createdAt,updatedAt) VALUES(1,1,'UAB Klientas','300111222','buyer@example.test',datetime('now'),datetime('now'))").run();
    require('../src/lib/company-mail.ts').saveMailSettings(1, { host: 'smtp.example.test', port: 587, secure: false, sender: 'sender@example.test', username: 'u', password: 'p', enabled: true });
    const invoices = require('../src/app/api/invoices/route.ts');
    const report = require('../src/app/api/receivables/route.ts');
    const reminder = require('../src/app/api/invoices/[id]/reminder/route.ts');
    const bank = require('../src/app/api/bank/allocations/route.ts');
    const credit = require('../src/app/api/invoices/[id]/credit/route.ts');
    const make = async (number, saleDate, payUntil, price) => (await (await invoices.POST(request('POST', { statusName: 'Neapmokėta', series: 'SF', number, saleDate, payUntil, clientId: 1, clientName: 'UAB Klientas', items: [{ itemName: 'Paslauga', quantity: 1, price, vatRate: 0 }] }))).json()).sale;
    const old = await make('1', '2026-06-01', '2026-06-15', 100);
    const fresh = await make('2', '2026-10-20', '2026-11-20', 40);
    const paid = await make('3', '2026-09-01', '2026-09-10', 25);
    db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes) VALUES(1,'2026-09-12',25,'UAB Klientas','SF 3')").run();
    const txn = db.prepare('SELECT id FROM BankTransaction').get().id;
    assert.equal((await bank.POST(request('POST', { bankTransactionId: txn, kind: 'SALE', documentId: paid.id, amount: 25 }))).status, 200);
    const get = asOf => report.GET(request('GET', null, 'http://localhost:3000/api/receivables?asOf=' + asOf));

    await t.test('report lists only open invoices with age buckets and totals', async () => {
      const body = await (await get('2026-10-26')).json();
      assert.deepEqual(body.rows.map(r => r.label), ['SF 1', 'SF 2']);
      assert.equal(body.rows[0].daysOverdue, 133); assert.equal(body.rows[0].bucket, 'D90_PLUS'); assert.equal(body.rows[1].bucket, 'NOT_DUE');
      assert.equal(body.total, 140); assert.equal(body.totals.D90_PLUS, 100);
      assert.equal((await get('2026-02-30')).status, 400);
      jar.set('active_company_id', '2'); assert.equal((await (await get('2026-10-26')).json()).rows.length, 0); jar.set('active_company_id', '1');
    });

    await t.test('partial payment and credit notes reduce the reported balance', async () => {
      db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes) VALUES(1,'2026-10-01',30,'UAB Klientas','dalis')").run();
      const id = db.prepare('SELECT MAX(id) id FROM BankTransaction').get().id;
      await bank.POST(request('POST', { bankTransactionId: id, kind: 'SALE', documentId: old.id, amount: 30 }));
      assert.equal((await credit.POST(request('POST', { number: 'KS-1', saleDate: '2026-10-02', reason: 'Klaida', items: [{ itemName: 'x', quantity: 1, price: 20, vatRate: 0 }] }), context(old.id))).status, 200);
      const row = (await (await get('2026-10-26')).json()).rows.find(r => r.label === 'SF 1');
      assert.equal(row.balance, 50);
    });

    await t.test('reminder: draft, send once, idempotent retry, minimum interval, paid invoices refused', async () => {
      const draft = await (await reminder.GET(request('GET'), context(old.id))).json();
      assert.equal(draft.to, 'buyer@example.test'); assert.equal(draft.balance, 50); assert.match(draft.text, /50\.00 EUR/); assert.equal(draft.configured, true);
      const body = { to: draft.to, subject: draft.subject, text: draft.text, requestId: crypto.randomUUID() };
      assert.equal((await reminder.POST(request('POST', body), context(old.id))).status, 200);
      assert.equal(messages.length, 1); assert.equal(messages[0].attachments[0].content.subarray(0, 5).toString(), '%PDF-');
      const repeat = await reminder.POST(request('POST', body), context(old.id)); assert.equal((await repeat.json()).duplicate, true); assert.equal(messages.length, 1);
      assert.equal((await reminder.POST(request('POST', { ...body, requestId: crypto.randomUUID() }), context(old.id))).status, 409);
      assert.equal((await reminder.GET(request('GET'), context(old.id))).status, 409);
      assert.equal((await reminder.GET(request('GET'), context(paid.id))).status, 409);
      jar.set('active_company_id', '2'); assert.equal((await reminder.GET(request('GET'), context(old.id))).status, 404); jar.set('active_company_id', '1');
      const row = (await (await get('2026-10-26')).json()).rows.find(r => r.label === 'SF 1'); assert.equal(row.reminders, 1); assert.ok(row.lastReminder);
      assert.throws(() => db.prepare('DELETE FROM ReminderLog').run(), /append-only/);
    });

    await t.test('validation and failed delivery are safe', async () => {
      const good = { to: 'buyer@example.test', subject: 'Priminimas', text: 'Tekstas', requestId: crypto.randomUUID() };
      for (const bad of [{ ...good, to: 'a@b.test,c@d.test' }, { ...good, subject: 'x\r\nBcc: z@z.test' }, { ...good, requestId: 'nope' }, { ...good, text: ' ' }]) assert.equal((await reminder.POST(request('POST', bad), context(fresh.id))).status, 400);
      failMail = true; assert.equal((await reminder.POST(request('POST', good), context(fresh.id))).status, 502); failMail = false;
      assert.equal(db.prepare("SELECT status FROM ReminderLog WHERE requestId=?").get(good.requestId).status, 'uncertain');
      assert.equal((await reminder.POST(request('POST', good), context(fresh.id))).status, 409);
      assert.equal((await reminder.POST(request('POST', { ...good, requestId: crypto.randomUUID() }), context(fresh.id))).status, 409);
      assert.equal(messages.length, 1);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
