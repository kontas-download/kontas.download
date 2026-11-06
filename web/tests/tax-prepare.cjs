const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-prep-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.INTERNAL_BRIDGE_KEY = 'k'.repeat(40);
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, email, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'info@pavyzdys.test', ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'UAB Pavyzdys', '300000000', '');
company.run(2, 'UAB PVM', '300000001', 'LT100000001');
fixture.close();
const sent = [];
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'nodemailer') return { createTransport: () => ({ close() {}, sendMail: async m => { sent.push(m); return { accepted: [m.to], rejected: [], messageId: '<' + sent.length + '@test>' }; } }) };
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true } }).outputText, filename);
const { getDb } = require('../src/lib/db.ts');
const { saveMailSettings } = require('../src/lib/company-mail.ts');
const cal = require('../src/lib/tax-calendar.ts');
const prep = require('../src/lib/tax-prepare.ts');
const auto = require('../src/lib/automation.ts');
const db = getDb();
const TODAY = '2026-02-12';
const enable = (companyId, code) => db.prepare('INSERT OR REPLACE INTO CompanyObligation(companyId,code,enabled,period) VALUES(?,?,1,NULL)').run(companyId, code);
const events = (companyId, from, to) => cal.calendarEvents(db, companyId, from, to, TODAY);

test('relevance: VAT forms need a VAT code; GPM313/GPM312 need payroll once the period is over', () => {
  db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id IN (1,2)").run();
  for (const id of [1, 2]) for (const code of ['FR0564', 'GPM313', 'GPM312']) enable(id, code);
  db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(1,2026,1,1000,datetime('now'))").run();
  db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(1,2025,12,1000,datetime('now'))").run();
  const codes = list => [...new Set(list.map(e => e.code))].sort();
  // Company 1 has no VAT code: no FR0600/FR0564; GPM313 only for months with payroll (or a month not over yet).
  const e1 = events(1, '2026-01-01', '2026-03-31');
  assert.deepEqual(codes(e1), ['GPM312', 'GPM313']);
  assert.deepEqual(e1.filter(e => e.code === 'GPM313').map(e => e.periodEnd), ['2025-12-31', '2026-01-31', '2026-02-28']);
  assert.equal(cal.loadSettings(db, 1, TODAY).find(s => s.code === 'FR0600').enabled, false);
  assert.equal(cal.loadSettings(db, 1, TODAY).find(s => s.code === 'FR0564').enabled, false);
  // Company 2 is a VAT payer without payroll: VAT forms shown, ended payroll periods hidden.
  const e2 = events(2, '2026-01-01', '2026-03-31');
  assert.deepEqual(codes(e2), ['FR0564', 'FR0600', 'GPM313']);
  assert.deepEqual(e2.filter(e => e.code === 'GPM313').map(e => e.periodEnd), ['2026-02-28']);
  assert.equal(cal.hasPayroll(db, 1, 2026, 1), true);
  assert.equal(cal.hasPayroll(db, 2, 2026, 1), false);
});

test('prepare: file, period prefill, checks and submission target', () => {
  const p = prep.prepareObligation(db, 1, 'GPM313', '2026-01-31', TODAY);
  assert.equal(p.periodStart, '2026-01-01');
  assert.equal(p.dueNominal, '2026-02-15');
  assert.equal(p.files.length, 1);
  assert.equal(p.files[0].name, 'GPM313_2026-01-01_2026-01-31.ffdata');
  assert.match(p.files[0].content, /2026/);
  assert.ok(p.issues.length > 0 && p.issues.every(i => i.level === 'warning'));
  assert.deepEqual(p.submit, { system: 'EDS', url: 'https://deklaravimas.vmi.lt' });
  const y = prep.prepareObligation(db, 1, 'GPM312', '2025-12-31', TODAY);
  assert.equal(y.periodStart, '2025-01-01');
  assert.match(y.files[0].name, /^GPM312_2025-01-01_2025-12-31/);
  const v = prep.prepareObligation(db, 2, 'FR0564', '2026-01-31', TODAY);
  assert.equal(v.periodStart, '2026-01-01');
  assert.equal(v.files[0].name, 'FR0564_2026-01-01_2026-01-31.ffdata');
  const f = prep.prepareObligation(db, 2, 'FR0600', '2026-01-31', TODAY);
  assert.equal(f.files[0].name, 'FR0600_2026-01-01_2026-01-31.ffdata');
  // Hidden by relevance for this company, or a period that is not in the calendar.
  assert.throws(() => prep.prepareObligation(db, 1, 'FR0600', '2026-01-31', TODAY), /nerast/);
  assert.throws(() => prep.prepareObligation(db, 1, 'GPM313', '2026-01-15', TODAY), /nerast/);
});

test('mark submitted records date, registration number and note, and is reversible per company', () => {
  const find = (id = 1) => events(id, '2026-02-01', '2026-02-28').find(e => e.code === 'GPM313');
  assert.equal(find().done, false);
  cal.markObligationDone(db, 1, 'GPM313', '2026-01-31', { submittedDate: '2026-02-12', registrationNo: ' R-77 ', note: 'per EDS' }, TODAY, 5);
  let e = find();
  assert.deepEqual([e.done, e.submittedDate, e.registrationNo, e.note], [true, '2026-02-12', 'R-77', 'per EDS']);
  assert.equal(events(2, '2026-02-01', '2026-02-28').some(x => x.done), false);
  assert.throws(() => cal.markObligationDone(db, 1, 'GPM313', '2026-01-31', { submittedDate: '2026-13-40' }, TODAY), /data/);
  cal.unmarkObligationDone(db, 1, 'GPM313', '2026-01-31');
  e = find();
  assert.deepEqual([e.done, e.submittedDate, e.registrationNo], [false, null, null]);
  cal.markObligationDone(db, 1, 'GPM313', '2026-01-31', {}, TODAY, 6);
  assert.equal(find().submittedDate, TODAY); // default: today
  cal.unmarkObligationDone(db, 1, 'GPM313', '2026-01-31');
});

test('reminders: N days before an unsubmitted deadline, once per entry, with a link to the entry', async () => {
  saveMailSettings(1, { host: 'smtp.example.test', port: 587, secure: false, sender: 'info@pavyzdys.test', username: 'u', password: 'p', enabled: true });
  const settings = auto.getAutomationSettings(db, 1);
  assert.equal(settings.taxDaysBefore, 5);
  const s = { ...settings, taxEnabled: true, notifyEmail: 'owner@pavyzdys.test' };
  // 2026-02-12: GPM313 for January is due 2026-02-15 (Sunday and 16 Feb is a holiday: working day 02-17, 5 days ahead).
  assert.equal((await auto.runTax(db, 1, { ...s, taxDaysBefore: 3 }, TODAY)).length, 0, 'not within 3 days');
  const first = await auto.runTax(db, 1, s, TODAY);
  assert.ok(first.length >= 1);
  assert.equal(sent.length, 1);
  assert.match(String(sent[0].text || sent[0].html || ''), /tax-calendar\?focus=GPM313:2026-01-31/);
  assert.equal((await auto.runTax(db, 1, s, TODAY)).length, 0, 'no duplicate');
  assert.equal(sent.length, 1);
  // A submitted entry is not reminded.
  db.prepare('DELETE FROM AutomationSent WHERE companyId=1').run();
  cal.markObligationDone(db, 1, 'GPM313', '2026-01-31', {}, TODAY);
  cal.markObligationDone(db, 1, 'GPM312', '2025-12-31', {}, TODAY);
  assert.equal((await auto.runTax(db, 1, s, TODAY)).length, 0);
  assert.equal(sent.length, 1);
});
