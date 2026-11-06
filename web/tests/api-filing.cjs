const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-apifiling-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.INTERNAL_BRIDGE_KEY = 'k'.repeat(40);
delete process.env.APP_BASE_URL;
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, email, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'info@pavyzdys.test', ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'UAB Pavyzdys', '300000000', '');
company.run(2, 'UAB Kita', '300000001', '');
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
const api = require('../src/lib/api-access.ts');
const filing = require('../src/lib/filing/index.ts');
const cal = require('../src/lib/tax-calendar.ts');
const auto = require('../src/lib/automation.ts');
const { saveMailSettings } = require('../src/lib/company-mail.ts');
const pkg = require('../src/lib/company-package.ts');
const db = getDb();

test('credentials: password is encrypted, never returned, kept on partial update and cleared on request', () => {
  assert.deepEqual(api.listCredentials(db, 1).map(c => [c.provider, c.status, c.hasSecret]), [['VMI_EDS', 'NOT_CONNECTED', false], ['SODRA_EDAS', 'NOT_CONNECTED', false]]);
  const saved = api.saveCredential(db, 1, 'VMI_EDS', { username: ' edsuser ', password: 'Slaptas-123', environment: 'PRODUCTION' });
  assert.deepEqual([saved.username, saved.hasSecret, saved.environment, saved.status], ['edsuser', true, 'PRODUCTION', 'CONFIGURED']);
  assert.ok(!JSON.stringify(saved).includes('Slaptas-123'));
  assert.ok(!('secretEncrypted' in saved) && !('password' in saved));
  const stored = db.prepare('SELECT secretEncrypted FROM CompanyApiCredential WHERE companyId=1 AND provider=?').get('VMI_EDS').secretEncrypted;
  assert.ok(stored && !stored.includes('Slaptas-123'));
  // Changing only the environment keeps the secret.
  const kept = api.saveCredential(db, 1, 'VMI_EDS', { environment: 'TEST' });
  assert.deepEqual([kept.hasSecret, kept.environment, kept.username], [true, 'TEST', 'edsuser']);
  assert.equal(db.prepare('SELECT secretEncrypted FROM CompanyApiCredential WHERE companyId=1 AND provider=?').get('VMI_EDS').secretEncrypted, stored);
  // Per company.
  assert.equal(api.listCredentials(db, 2)[0].hasSecret, false);
  assert.equal(api.connectionStatus(db, 1, 'VMI_EDS'), 'CONFIGURED');
  assert.equal(api.connectionStatus(db, 2, 'VMI_EDS'), 'NOT_CONNECTED');
  const cleared = api.saveCredential(db, 1, 'VMI_EDS', { clearSecret: true });
  assert.deepEqual([cleared.hasSecret, cleared.status], [false, 'NOT_CONNECTED']);
  api.saveCredential(db, 1, 'SODRA_EDAS', { username: 'api', password: 'x' });
  assert.equal(api.clearCredential(db, 1, 'SODRA_EDAS').hasSecret, false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM CompanyApiCredential WHERE companyId=1 AND provider=?').get('SODRA_EDAS').n, 0);
  assert.throws(() => api.saveCredential(db, 1, 'RC', { username: 'a' }), /Nežinomas/);
  assert.throws(() => api.saveCredential(db, 1, 'VMI_EDS', { environment: 'LIVE' }), /aplinka/);
});

test('provider mapping: forms go to their system', () => {
  const id = code => filing.providerForForm(code)?.id;
  for (const code of ['FR0600', 'FR0564', 'GPM313', 'GPM312', 'PLN204', 'ISAF']) assert.equal(id(code), 'VMI_EDS', code);
  for (const code of ['SAM', '1-SD']) assert.equal(id(code), 'SODRA_EDAS', code);
  assert.equal(id('FINANCIAL_STATEMENTS'), 'RC');
  assert.equal(id('UNKNOWN'), undefined);
  assert.equal(filing.PROVIDERS.VMI_EDS.supports('GPM313'), true);
  assert.equal(filing.PROVIDERS.RC.supports('GPM313'), false);
  assert.equal(filing.PROVIDERS.RC.status(db, 1), 'NOT_CONNECTED');
});

test('submit and check return NOT_IMPLEMENTED with a manual-filing message and every attempt is logged', async () => {
  for (const [id, text] of [['VMI_EDS', /VMI.*rankiniu būdu/], ['SODRA_EDAS', /Sodr.*rankiniu būdu/], ['RC', /Registrų centr.*rankiniu būdu/]]) {
    const r = await filing.PROVIDERS[id].submit(db, 1, {});
    assert.equal(r.result, 'NOT_IMPLEMENTED');
    assert.match(r.message, text);
    assert.equal((await filing.PROVIDERS[id].checkStatus(db, 1, null)).result, 'NOT_IMPLEMENTED');
  }
  db.prepare("INSERT OR REPLACE INTO CompanyObligation(companyId,code,enabled,period) VALUES(1,'GPM313',1,NULL)").run();
  db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(1,2026,1,1000,datetime('now'))").run();
  const submit = await filing.submitFiling(db, 1, 7, 'GPM313', '2026-01-31');
  assert.equal(submit.result, 'NOT_IMPLEMENTED');
  assert.match(submit.message, /Duomenų siuntimas į VMI dar neprijungtas/);
  await filing.checkFiling(db, 1, 7, 'GPM313', '2026-01-31');
  const attempts = filing.listAttempts(db, 1, 'GPM313', '2026-01-31');
  assert.deepEqual(attempts.map(a => [a.provider, a.action, a.result, a.actorId]), [['VMI_EDS', 'CHECK', 'NOT_IMPLEMENTED', 7], ['VMI_EDS', 'SUBMIT', 'NOT_IMPLEMENTED', 7]]);
  assert.ok(attempts[0].at && attempts[0].message);
  assert.equal(filing.listAttempts(db, 2, 'GPM313', '2026-01-31').length, 0);
  await assert.rejects(() => filing.submitFiling(db, 1, 7, 'GPM313', '2026-01-15'), /nerast/);
  assert.equal(filing.listAttempts(db, 1, 'GPM313', '2026-01-15').length, 0);
});

test('application address: saved setting first, APP_BASE_URL fallback, validated', async () => {
  assert.equal(api.appBaseUrl(db), '');
  process.env.APP_BASE_URL = 'https://env.example.test/';
  assert.equal(api.appBaseUrl(db), 'https://env.example.test');
  assert.equal(api.saveBaseUrl(db, ' https://apskaita.example.lt/ '), 'https://apskaita.example.lt');
  assert.equal(api.appBaseUrl(db), 'https://apskaita.example.lt');
  assert.throws(() => api.saveBaseUrl(db, 'javascript:alert(1)'), /adresas/);
  assert.throws(() => api.saveBaseUrl(db, 'not a url'), /adresas/);
  // The reminder link uses the saved setting.
  saveMailSettings(1, { host: 'smtp.example.test', port: 587, secure: false, sender: 'info@pavyzdys.test', username: 'u', password: 'p', enabled: true });
  const settings = { ...auto.getAutomationSettings(db, 1), taxEnabled: true, notifyEmail: 'owner@pavyzdys.test', taxDaysBefore: 5 };
  const today = '2026-02-12';
  const first = await auto.runTax(db, 1, settings, today);
  assert.ok(first.length >= 1);
  assert.match(String(sent[0].text || sent[0].html || ''), /https:\/\/apskaita\.example\.lt\/tax-calendar\?focus=GPM313:2026-01-31/);
  // Without the setting the environment variable is used.
  api.saveBaseUrl(db, '');
  db.prepare('DELETE FROM AutomationSent WHERE companyId=1').run();
  await auto.runTax(db, 1, settings, today);
  assert.match(String(sent[1].text || sent[1].html || ''), /https:\/\/env\.example\.test\/tax-calendar\?focus=GPM313:2026-01-31/);
  delete process.env.APP_BASE_URL;
});

test('company export includes submissions, omits credentials and the attempt log, and restores submissions', () => {
  api.saveCredential(db, 1, 'VMI_EDS', { username: 'edsuser', password: 'Slaptas-123' });
  cal.markObligationDone(db, 1, 'GPM313', '2026-01-31', { submittedDate: '2026-02-10', registrationNo: 'R-5', note: 'EDS' }, '2026-02-12', 99);
  const exported = JSON.parse(JSON.stringify(pkg.exportCompany(db, 1)));
  assert.deepEqual(exported.data.obligationSubmissions.map(r => [r.code, r.periodEnd, r.submittedDate, r.registrationNo]), [['GPM313', '2026-01-31', '2026-02-10', 'R-5']]);
  const text = JSON.stringify(exported);
  assert.ok(!text.includes('Slaptas-123') && !text.includes('edsuser'));
  assert.ok(!('credentials' in exported.data) && !('filingAttempts' in exported.data));
  const result = pkg.importCompanyPackage(db, exported, { commit: true, name: 'UAB Kopija', allowDuplicateCode: true });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  const copy = db.prepare("SELECT * FROM ObligationSubmission WHERE companyId=?").all(result.companyId);
  assert.deepEqual(copy.map(r => [r.code, r.periodEnd, r.submittedDate, r.registrationNo]), [['GPM313', '2026-01-31', '2026-02-10', 'R-5']]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM CompanyApiCredential WHERE companyId=?').get(result.companyId).n, 0);
});
