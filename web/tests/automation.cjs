const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.INTERNAL_BRIDGE_KEY = 'k'.repeat(40);
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, email, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Pavyzdys', '300000000', 'info@pavyzdys.test', 'EUR', 1, datetime('now'), datetime('now'))").run();
fixture.close();
const sent = [];
const jar = new Map();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'nodemailer') return { createTransport: () => ({ close() {}, sendMail: async m => { sent.push(m); return { accepted: [m.to], rejected: [], messageId: '<' + sent.length + '@test>' }; } }) };
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);
const { getDb } = require('../src/lib/db.ts');
const { saveMailSettings } = require('../src/lib/company-mail.ts');
const { todayVilnius } = require('../src/lib/dates.ts');
const auto = require('../src/lib/automation.ts');
const db = getDb();
const today = todayVilnius();
const shift = n => new Date(Date.parse(today + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);

test('automation robot: recurring issue and send, overdue reminders, unambiguous bank matching, weekly summary, once a day', async () => {
  saveMailSettings(1, { host: 'smtp.example.test', port: 587, secure: false, sender: 'info@pavyzdys.test', username: 'u', password: 'p', enabled: true });
  db.prepare("INSERT INTO Client(id,companyId,name,code,email,createdAt,updatedAt) VALUES(10,1,'UAB Alfa','111111111','alfa@example.test',datetime('now'),datetime('now'))").run();
  const items = JSON.stringify([{ itemName: 'Svetainės priežiūra', quantity: 1, price: 50, vatRate: 0 }]);
  db.prepare("INSERT INTO RecurringInvoice(companyId,name,clientId,series,frequency,nextDate,anchorDay,payDays,itemsJson,active,createdAt,autoMode) VALUES(1,'Auto',10,'AUT','MONTH',?,1,14,?,1,0,'ISSUE_SEND'),(1,'Rankinis',10,'RAN','MONTH',?,1,14,?,1,0,'MANUAL')").run(today, items, today, items);
  // An overdue invoice (20 days) and one paid by a bank transfer that names it.
  const sale = (series, number, date, due, total) => {
    const id = Number(db.prepare("INSERT INTO Sale(companyId,series,number,saleDate,payUntil,clientId,clientName,clientCode,sumWithoutVat,vat,sumWithVat,statusName,createdAt) VALUES(1,?,?,?,?,10,'UAB Alfa','111111111',?,0,?,'Neapmokėta',datetime('now'))").run(series, number, date, due, total, total).lastInsertRowid);
    db.prepare("INSERT INTO SaleItem(saleId,itemName,quantity,price,sumWithoutVat,sumWithVat,vatRate) VALUES(?,'Paslauga',1,?,?,?,0)").run(id, total, total, total);
    return id;
  };
  const overdue = sale('SF', '000101', shift(-34), shift(-20), 120);
  const paid = sale('SF', '000102', shift(-5), shift(9), 80.5);
  db.prepare("INSERT INTO BankTransaction(companyId,date,number,clientName,clientCode,sum,notes) VALUES(1,?,'B1','UAB Alfa','111111111',80.5,'Apmokejimas pagal SF 000102')").run(shift(-1));

  assert.throws(() => auto.saveAutomationSettings(db, 1, { recurringEnabled: true, remindersEnabled: true, bankMatchEnabled: true, digestEnabled: true, taxEnabled: false, reminderDays: '3, 14', digestWeekday: 1, taxDaysBefore: 5, notifyEmail: '' }), /el. paštą/, 'summary needs an address');
  const weekday = ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1;
  auto.saveAutomationSettings(db, 1, { recurringEnabled: true, remindersEnabled: true, bankMatchEnabled: true, digestEnabled: true, taxEnabled: false, reminderDays: '3, 14', digestWeekday: weekday, taxDaysBefore: 5, notifyEmail: 'owner@pavyzdys.test' });

  const results = await auto.runAutomation(db, {});
  const by = job => results.find(r => r.job === job);
  assert.deepEqual(results.map(r => [r.job, r.status]), [['recurring', 'OK'], ['reminders', 'OK'], ['bank', 'OK'], ['digest', 'OK']]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM Sale WHERE series='AUT'").get().n, 1, 'automatic template issued');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM Sale WHERE series='RAN'").get().n, 0, 'manual template left alone');
  const invoiceMail = sent.find(m => m.attachments?.some(a => a.contentType === 'application/pdf') && /AUT/.test(m.subject + m.text));
  assert.ok(invoiceMail, 'issued invoice e-mailed with its PDF');
  assert.equal(db.prepare("SELECT status FROM InvoiceDelivery WHERE recipient='alfa@example.test'").get().status, 'sent');
  assert.ok(by('reminders').details.some(d => d.ok && /000101/.test(d.text)), 'overdue invoice reminded');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ReminderLog WHERE saleId=? AND status='sent'").get(overdue).n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM PaymentAllocation WHERE saleId=?').get(paid).n, 1, 'payment naming the invoice with the exact amount linked');
  assert.ok(sent.some(m => m.to === 'owner@pavyzdys.test' && /suvestinė/i.test(m.subject)), 'weekly summary sent');

  const sentBefore = sent.length;
  const again = await auto.runAutomation(db, {});
  assert.ok(again.every(r => r.status === 'SKIPPED'), 'each job runs once a day');
  const forced = await auto.runAutomation(db, { companyId: 1, force: true, trigger: 'manual' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM Sale WHERE series='AUT'").get().n, 1, 'the next period is not due yet');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ReminderLog WHERE saleId=?").get(overdue).n, 1, 'no second reminder within 3 days');
  assert.equal(sent.length, sentBefore, 'nothing sent twice (summary deduplicated)');
  assert.ok(forced.every(r => r.status === 'OK'));
  assert.ok(auto.listAutomationRuns(db, 1).length >= 8, 'every run logged');
});

test('automation trigger: internal route needs the bridge key', async () => {
  const route = require('../src/app/api/internal/automation/route.ts');
  assert.equal((await route.POST(new Request('http://localhost/api/internal/automation', { method: 'POST' }))).status, 401);
  assert.equal((await route.POST(new Request('http://localhost/api/internal/automation', { method: 'POST', headers: { 'x-d1-bridge-key': 'x'.repeat(40) } }))).status, 401);
  const ok = await route.POST(new Request('http://localhost/api/internal/automation', { method: 'POST', headers: { 'x-d1-bridge-key': process.env.INTERNAL_BRIDGE_KEY } }));
  assert.equal(ok.status, 200);
});

test('recurring template from the client last invoice: series, payment term, notes and lines', async () => {
  const auth = require('../src/lib/auth.ts');
  db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'test@example.test','Tester','unused','admin',datetime('now'))").run();
  jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
  const route = require('../src/app/api/recurring/last-items/route.ts');
  const data = await (await route.GET(new Request('http://localhost/api/recurring/last-items?clientId=10'))).json();
  assert.equal(data.sale.series, 'AUT', 'the newest invoice of the client');
  assert.equal(data.sale.payDays, 14);
  assert.equal(data.items[0].itemName, 'Svetainės priežiūra');
  assert.equal((await route.GET(new Request('http://localhost/api/recurring/last-items?clientId=abc'))).status, 400);
});
