const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const { bootstrap } = require('../scripts/bootstrap.cjs');
const { setPassword } = require('../scripts/set-password.cjs');

const quiet = () => {};
const folder = () => fs.mkdtempSync(path.join(os.tmpdir(), 'erp-boot-'));
const logs = () => { const lines = []; return { lines, log: line => lines.push(line) }; };

test('base schema stays identical to the test fixture plus the ledger indexes', () => {
  const base = fs.readFileSync(path.join(__dirname, '../scripts/base-schema.sql'), 'utf8');
  const fixture = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8').trimEnd();
  assert.ok(base.startsWith(fixture), 'scripts/base-schema.sql must start with tests/schema.sql');
  assert.deepEqual(base.slice(fixture.length).match(/CREATE INDEX IF NOT EXISTS (\w+)/g).map(s => s.split(' ').pop()), ['idx_gen_company_date', 'idx_gen_debit', 'idx_gen_credit']);
  const chart = JSON.parse(fs.readFileSync(path.join(__dirname, '../scripts/chart-of-accounts.json'), 'utf8'));
  // The shipped chart is a small starter plan written for this program: exactly the accounts the automatic postings and fixed assets use,
  // with neutral names (no bank account labels, no person names, no vendor data).
  const needed = ['1130', '1139', '1202', '1204', '1205', '1206', '1209', '6306', '6810', '2410', '272', '2710', '2444', '4430', '4480', '4481', '4482', '4492', '5001', '6118', '6304'];
  assert.deepEqual(chart.map(([code]) => code).sort(), [...needed].sort());
  for (const [code, name] of chart) assert.ok(/^\d{2,6}$/.test(code) && name && name.length <= 60 && !/\d{4}|swed|paysera|seb|luminor|revolut/i.test(name), `neutral name for ${code}`);
});

test('a new database gets the schema, the chart of accounts and an administrator; running again changes nothing', async () => {
  const dir = folder(); const file = path.join(dir, 'prisma', 'dev.db');
  try {
    const first = logs();
    const result = bootstrap({ file, env: { ADMIN_EMAIL: ' Boss@Example.test ' }, log: first.log });
    assert.equal(result.created, true); assert.equal(result.admin.email, 'boss@example.test');
    assert.match(result.admin.password, /^[A-Za-z0-9]{16}$/); assert.ok(first.lines.some(l => l.includes(result.admin.password)), 'the one-time password is printed');
    const adminLine = first.lines.findIndex(l => l.startsWith('Administrator created'));
    assert.ok(first.lines.findIndex(l => l.includes('Create demonstration company')) > adminLine, 'the demo hint follows the administrator line');
    const db = new Database(file, { readonly: true });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM ChartOfAccount').get().n, 21);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM Company').get().n, 0);
    assert.deepEqual(db.prepare('SELECT email,role FROM User').all(), [{ email: 'boss@example.test', role: 'admin' }]);
    assert.ok(!/admin|kontas\.local/.test(db.prepare('SELECT passwordHash FROM User').get().passwordHash));
    const before = db.prepare("SELECT group_concat(name) n FROM (SELECT name FROM sqlite_master ORDER BY name)").get().n;
    db.close();
    const second = logs();
    const again = bootstrap({ file, env: {}, log: second.log });
    assert.equal(again.created, false); assert.equal(again.admin, null); assert.deepEqual(second.lines, []);
    const db2 = new Database(file, { readonly: true });
    assert.equal(db2.prepare('SELECT COUNT(*) n FROM User').get().n, 1);
    assert.equal(db2.prepare("SELECT group_concat(name) n FROM (SELECT name FROM sqlite_master ORDER BY name)").get().n, before);
    db2.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('administrator settings are validated; a given password is used and never printed', () => {
  const dir = folder();
  try {
    assert.throws(() => bootstrap({ file: path.join(dir, 'a.db'), env: { ADMIN_PASSWORD: 'short' }, log: quiet }), /at least 10/);
    assert.throws(() => bootstrap({ file: path.join(dir, 'b.db'), env: { ADMIN_EMAIL: 'not-an-email' }, log: quiet }), /valid e-mail/);
    const out = logs();
    const result = bootstrap({ file: path.join(dir, 'c.db'), env: { ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'a-long-secret-passphrase' }, log: out.log });
    assert.equal(result.admin.password, null); assert.ok(!out.lines.join('\n').includes('a-long-secret-passphrase'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('an existing database with data is never modified by the bootstrap', () => {
  const dir = folder(); const file = path.join(dir, 'live.db');
  try {
    const db = new Database(file); db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    db.prepare("INSERT INTO Company(id,name,code,currencyCode,isDefault,createdAt,updatedAt) VALUES(1,'Existing','111','EUR',1,datetime('now'),datetime('now'))").run();
    db.prepare("INSERT INTO User(email,name,passwordHash,role,createdAt) VALUES('keep@example.test','Keep','scrypt:x:y','admin',datetime('now'))").run();
    db.close();
    const out = logs();
    const result = bootstrap({ file, env: { ADMIN_PASSWORD: 'another-long-passphrase' }, log: out.log });
    assert.equal(result.created, false); assert.equal(result.admin, null); assert.deepEqual(out.lines, []);
    const after = new Database(file, { readonly: true });
    assert.deepEqual(after.prepare('SELECT email,passwordHash FROM User').all(), [{ email: 'keep@example.test', passwordHash: 'scrypt:x:y' }]);
    assert.equal(after.prepare('SELECT COUNT(*) n FROM ChartOfAccount').get().n, 0, 'an existing chart is not touched');
    after.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a fresh installation works end to end: sign-in password, application migrations, first company, an invoice with postings', async () => {
  const dir = folder(); const file = path.join(dir, 'prisma', 'dev.db');
  const result = bootstrap({ file, env: {}, log: quiet });
  process.env.DATABASE_URL = 'file:' + file;
  const jar = new Map();
  const realLoad = Module._load;
  Module._load = function (name, parent, isMain) {
    if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
    if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
    if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
    return realLoad.call(this, name, parent, isMain);
  };
  require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  const auth = require('../src/lib/auth.ts');
  const { getDb } = require('../src/lib/db.ts');
  const db = getDb();
  try {
    const row = db.prepare('SELECT id,passwordHash FROM User').get();
    assert.equal(await auth.verifyPassword(result.admin.password, row.passwordHash), true, 'the printed password signs in');
    assert.equal(await auth.verifyPassword('admin', row.passwordHash), false, 'no default password');
    const versions = db.prepare('SELECT version FROM AppMigration').all().map(r => r.version);
    for (const v of ['2026-10-documents-v2', '2026-10-tax-v1', '2026-10-controls-v1', '2026-10-document-language-v1', '2026-10-tax-codes-v1']) assert.ok(versions.includes(v), v);
    jar.set('auth_session', auth.createSessionToken({ id: row.id }));
    const { getActiveCompanyId } = require('../src/lib/company.ts');
    const companyId = await getActiveCompanyId();
    const company = db.prepare('SELECT name,code FROM Company WHERE id=?').get(companyId);
    assert.equal(company.code, null, 'no invented company code');
    db.prepare("UPDATE Company SET name='UAB Naujas',code='305000000',isVatPayer=0,taxMode='NON_VAT' WHERE id=?").run(companyId);
    const invoices = require('../src/app/api/invoices/route.ts');
    const response = await invoices.POST(new Request('http://localhost:3000/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ series: 'SF', number: '1', saleDate: '2026-10-27', clientName: 'Pirkėjas', items: [{ itemName: 'Paslauga', quantity: 1, price: 100, vatRate: 0 }] }) }));
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    const entries = db.prepare("SELECT debitAccount d, creditAccount c, amount a FROM GeneralEntry WHERE sourceType='SALE'").all();
    assert.equal(entries.length >= 1 && entries.reduce((n, e) => n + e.a, 0) > 0, true, 'the sale is posted to the ledger');
    for (const e of entries) for (const account of [e.d, e.c]) assert.ok(db.prepare('SELECT 1 FROM ChartOfAccount WHERE code=?').get(account), 'account ' + account + ' exists in the seeded chart');
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('set-password reports a disabled user and re-enables only on request', () => {
  const dir = folder(); const file = path.join(dir, 'd.db');
  try {
    bootstrap({ file, env: { ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'first-long-passphrase' }, log: quiet });
    const db = new Database(file); db.exec('ALTER TABLE User ADD COLUMN disabledAt INTEGER'); db.prepare('UPDATE User SET disabledAt=1').run(); db.close();
    const warned = setPassword(file, 'owner@example.test', 'second-long-passphrase');
    assert.equal(warned.disabled, true); assert.equal(warned.password, null);
    const still = new Database(file, { readonly: true }); assert.equal(still.prepare('SELECT disabledAt d FROM User').get().d, 1); still.close();
    const enabled = setPassword(file, 'owner@example.test', 'third-long-passphrase', { enable: true });
    assert.equal(enabled.disabled, false);
    const after = new Database(file, { readonly: true }); assert.equal(after.prepare('SELECT disabledAt d FROM User').get().d, null); after.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('set-password replaces the hash, ends sessions and refuses unknown users and weak passwords', () => {
  const dir = folder(); const file = path.join(dir, 'p.db');
  try {
    bootstrap({ file, env: { ADMIN_EMAIL: 'owner@example.test', ADMIN_PASSWORD: 'first-long-passphrase' }, log: quiet });
    const db = new Database(file);
    db.exec('CREATE TABLE AuthSession (tokenHash TEXT PRIMARY KEY, userId INTEGER NOT NULL, expiresAt INTEGER NOT NULL)');
    db.prepare('INSERT INTO AuthSession VALUES(?,?,?)').run('t'.repeat(64), 1, Date.now() + 1000);
    const before = db.prepare('SELECT passwordHash h FROM User').get().h; db.close();
    assert.throws(() => setPassword(file, 'nobody@example.test', 'long-enough-password'), /No user/);
    assert.throws(() => setPassword(file, 'owner@example.test', 'short'), /at least 10/);
    const generated = setPassword(file, 'OWNER@example.test');
    assert.match(generated.password, /^[A-Za-z0-9]{16}$/); assert.equal(generated.disabled, false);
    const after = new Database(file, { readonly: true });
    assert.notEqual(after.prepare('SELECT passwordHash h FROM User').get().h, before);
    assert.equal(after.prepare('SELECT COUNT(*) n FROM AuthSession').get().n, 0);
    after.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
