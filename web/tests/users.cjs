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
for (const id of [1, 2]) fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))").run(id, 'Company ' + id, 'C' + id);
fixture.close();
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
const access = require('../src/lib/access.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
const request = (method, body, headers = {}) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });
const api = p => require('../src/app/api/' + p + '/route.ts');
const users = api('users');
const user = api('users/[id]');
const login = api('auth/login');
const password = api('auth/password');
const ADMIN_PASSWORD = 'admin-password-1';
const as = token => jar.set('auth_session', token);
const signIn = async (email, pass) => {
  const response = await login.POST(request('POST', { email, password: pass }));
  return { status: response.status, token: response.status === 200 ? response.headers.get('set-cookie').match(/auth_session=([^;]+)/)[1] : null };
};
const noHash = async response => { const text = await response.clone().text(); assert.ok(!/passwordHash|scrypt:/.test(text), 'response leaks a password hash: ' + text); return JSON.parse(text); };

test('user management, roles and passwords', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'admin@example.test','Admin',?,'admin',datetime('now'))").run(await auth.hashPassword(ADMIN_PASSWORD));
    const adminToken = (await signIn('admin@example.test', ADMIN_PASSWORD)).token;
    jar.set('active_company_id', '1');
    let accountantId, accountantPassword;

    await t.test('the migration is recorded and only known roles reach the database', () => {
      assert.ok(db.prepare("SELECT 1 FROM AppMigration WHERE version='2026-10-users-v1'").get());
      assert.throws(() => db.prepare("INSERT INTO User(email,name,passwordHash,role) VALUES('x@example.test','X','h','viewer')").run(), /USER_ROLE_INVALID/);
      assert.throws(() => db.prepare("UPDATE User SET role=NULL WHERE id=1").run(), /USER_ROLE_INVALID/);
      assert.throws(() => db.prepare("INSERT INTO User(email,name,passwordHash,role) VALUES('ADMIN@example.test','X','h','admin')").run(), /UNIQUE/);
    });

    await t.test('unauthenticated requests get 401', async () => {
      jar.delete('auth_session');
      assert.equal((await users.GET()).status, 401);
      assert.equal((await users.POST(request('POST', { email: 'a@example.test' }))).status, 401);
      assert.equal((await user.PATCH(request('PATCH', { name: 'X' }), context(1))).status, 401);
      assert.equal((await user.DELETE(request('DELETE'), context(1))).status, 401);
      assert.equal((await password.POST(request('POST', { currentPassword: 'x', newPassword: 'y'.repeat(12) }))).status, 401);
      as('f'.repeat(64));
      assert.equal((await users.GET()).status, 401);
    });

    await t.test('creating a user validates input and refuses duplicate e-mails ignoring case', async () => {
      as(adminToken);
      for (const body of [
        { email: 'bad', name: 'A', role: 'accountant', password: 'long-enough-1' },
        { email: 'a@example.test', name: '', role: 'accountant', password: 'long-enough-1' },
        { email: 'a@example.test', name: 'A', role: 'viewer', password: 'long-enough-1' },
        { email: 'a@example.test', name: 'A', role: 'accountant', password: 'short' },
        { email: 'a@example.test', name: 'A', role: 'accountant' },
      ]) assert.equal((await users.POST(request('POST', body))).status, 400, JSON.stringify(body));
      assert.equal((await users.POST(request('POST', { email: 'ADMIN@Example.test', name: 'Dup', role: 'accountant', password: 'long-enough-1' }))).status, 409);
      const response = await users.POST(request('POST', { email: 'Accountant@Example.test', name: 'Accountant', role: 'accountant', generatePassword: true }));
      assert.equal(response.status, 201);
      const data = await noHash(response);
      assert.equal(data.user.role, 'accountant');
      assert.equal(data.user.disabled, false);
      assert.ok(typeof data.password === 'string' && data.password.length >= 10);
      accountantId = data.user.id; accountantPassword = data.password;
      // Given passwords are never echoed back.
      const given = await noHash(await users.POST(request('POST', { email: 'second@example.test', name: 'Second', role: 'admin', password: 'second-password-1' })));
      assert.equal(given.password, null);
      const list = await noHash(await users.GET());
      assert.deepEqual(list.users.map(u => u.email).sort(), ['Accountant@Example.test', 'admin@example.test', 'second@example.test']);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM UserLog WHERE action='CREATE'").get().n, 2);
    });

    await t.test('write requests from another origin are refused', async () => {
      as(adminToken);
      const cross = { Origin: 'https://attacker.invalid' };
      assert.equal((await users.POST(request('POST', { email: 'x@example.test', name: 'X', role: 'admin', password: 'long-enough-1' }, cross))).status, 403);
      assert.equal((await user.PATCH(request('PATCH', { name: 'Hacked' }, cross), context(accountantId))).status, 403);
      assert.equal((await user.DELETE(request('DELETE', null, cross), context(accountantId))).status, 403);
      assert.equal((await password.POST(request('POST', { currentPassword: ADMIN_PASSWORD, newPassword: 'whatever-new-1' }, cross))).status, 403);
      assert.equal(db.prepare("SELECT name FROM User WHERE id=?").get(accountantId).name, 'Accountant');
    });

    await t.test('an accountant does the accounting work but not the administrator-only actions', async () => {
      const signed = await signIn('accountant@example.test', accountantPassword);
      assert.equal(signed.status, 200);
      as(signed.token);
      const me = await (await api('auth/me').GET()).json();
      assert.equal(me.role, 'accountant');
      assert.equal((await api('invoices').GET()).status, 200);
      assert.equal((await api('clients').GET()).status, 200);
      assert.equal((await api('companies').GET()).status, 200);
      assert.equal((await api('clients').POST(request('POST', { name: 'Client of the accountant' }))).status, 200);
      const forbidden = [
        ['backup', () => api('admin/backup').GET()],
        ['users GET', () => users.GET()],
        ['users POST', () => users.POST(request('POST', { email: 'z@example.test', name: 'Z', role: 'admin', password: 'long-enough-1' }))],
        ['users PATCH', () => user.PATCH(request('PATCH', { role: 'admin' }), context(accountantId))],
        ['users DELETE', () => user.DELETE(request('DELETE'), context(1))],
        ['export', () => api('companies/[id]/export').GET(request('GET'), context(1))],
        ['import-package', () => api('companies/import-package').POST(request('POST', {}))],
        ['legacy import', () => api('companies/import').POST(request('POST', { companyId: 1, jsonData: {} }))],
        ['history', () => api('companies/[id]/history').GET(request('GET'), context(1))],
        ['accounting-control GET', () => api('companies/[id]/accounting-control').GET(request('GET'), context(1))],
        ['accounting-control PUT', () => api('companies/[id]/accounting-control').PUT(request('PUT', { lockedThrough: '2026-01-31', reason: 'x' }), context(1))],
        ['companies POST', () => api('companies').POST(request('POST', { name: 'New' }))],
        ['companies DELETE', () => api('companies/[id]').DELETE(request('DELETE'), context(2))],
      ];
      for (const [name, call] of forbidden) assert.equal((await call()).status, 403, name);
      assert.ok(db.prepare('SELECT 1 FROM Company WHERE id=2').get());
      assert.equal(db.prepare("SELECT role FROM User WHERE id=?").get(accountantId).role, 'accountant');
      // Pages: the users page redirects an accountant away, normal pages open.
      await assert.rejects(access.requireAdminPage(), /redirect:\//);
      assert.equal((await access.requirePageAccess()).role, 'accountant');
    });

    await t.test('the last active administrator cannot be disabled, demoted or deleted', async () => {
      as(adminToken);
      // Two admins: the second one may be disabled, then admin #1 is the last active one.
      const second = db.prepare("SELECT id FROM User WHERE email='second@example.test'").get().id;
      assert.equal((await user.PATCH(request('PATCH', { disabled: true }), context(second))).status, 200);
      assert.equal((await user.PATCH(request('PATCH', { disabled: true }), context(1))).status, 409);
      assert.equal((await user.PATCH(request('PATCH', { role: 'accountant' }), context(1))).status, 409);
      assert.equal((await user.DELETE(request('DELETE'), context(1))).status, 409);
      const row = db.prepare('SELECT role, disabledAt FROM User WHERE id=1').get();
      assert.deepEqual({ ...row }, { role: 'admin', disabledAt: null });
      // A disabled admin does not count; enabling restores the second administrator, after which #1 can be demoted and promoted back.
      assert.equal((await user.PATCH(request('PATCH', { disabled: false }), context(second))).status, 200);
      as((await signIn('second@example.test', 'second-password-1')).token);
      assert.equal((await user.PATCH(request('PATCH', { role: 'accountant' }), context(1))).status, 200);
      assert.equal((await user.PATCH(request('PATCH', { role: 'accountant' }), context(second))).status, 409);
      assert.equal((await user.DELETE(request('DELETE'), context(second))).status, 409);
      assert.equal((await user.PATCH(request('PATCH', { role: 'admin' }), context(1))).status, 200);
    });

    await t.test('a disabled user loses existing sessions and cannot sign in', async () => {
      const signed = await signIn('accountant@example.test', accountantPassword);
      as(adminToken);
      const response = await user.PATCH(request('PATCH', { disabled: true }), context(accountantId));
      assert.equal(response.status, 200);
      assert.equal((await noHash(response)).user.disabled, true);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM AuthSession WHERE userId=?').get(accountantId).n, 0);
      assert.equal(auth.verifySessionToken(signed.token), null);
      as(signed.token);
      assert.equal((await api('invoices').GET()).status, 401);
      // Even a session row that survived (e.g. created concurrently) is ignored while the user is disabled.
      const leftover = auth.createSessionToken({ id: accountantId });
      assert.equal(auth.verifySessionToken(leftover), null);
      const refused = await login.POST(request('POST', { email: 'accountant@example.test', password: accountantPassword }));
      assert.equal(refused.status, 401);
      assert.equal((await refused.json()).error, 'Neteisingas el. paštas arba slaptažodis');
      as(adminToken);
      assert.equal((await user.PATCH(request('PATCH', { disabled: false }), context(accountantId))).status, 200);
      assert.equal(auth.verifySessionToken(leftover).id, accountantId);
      auth.revokeSession(leftover);
    });

    await t.test('a password reset returns the generated password once and it works', async () => {
      const before = await signIn('accountant@example.test', accountantPassword);
      db.prepare("INSERT OR REPLACE INTO LoginAttempt(email,attempts,resetAt) VALUES('accountant@example.test',10,?)").run(Date.now() + 60000);
      as(adminToken);
      const response = await user.PATCH(request('PATCH', { generatePassword: true }), context(accountantId));
      assert.equal(response.status, 200);
      const data = await noHash(response);
      assert.ok(data.password && data.password !== accountantPassword);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM LoginAttempt WHERE email='accountant@example.test'").get().n, 0);
      assert.equal(auth.verifySessionToken(before.token), null);
      assert.equal((await signIn('accountant@example.test', accountantPassword)).status, 401);
      assert.equal((await signIn('accountant@example.test', data.password)).status, 200);
      const list = await noHash(await users.GET());
      assert.ok(!JSON.stringify(list).includes(data.password));
      // A given password is accepted too, and too short ones are refused.
      assert.equal((await user.PATCH(request('PATCH', { password: 'short' }), context(accountantId))).status, 400);
      const given = await noHash(await user.PATCH(request('PATCH', { password: 'accountant-pass-2' }), context(accountantId)));
      assert.equal(given.password, null);
      accountantPassword = 'accountant-pass-2';
      assert.equal(db.prepare("SELECT COUNT(*) n FROM UserLog WHERE action='PASSWORD_RESET' AND userId=?").get(accountantId).n, 2);
      assert.ok(!db.prepare('SELECT group_concat(detailsJson) j FROM UserLog').get().j.includes('scrypt'));
    });

    await t.test('a user changes their own password and other sessions end', async () => {
      const first = await signIn('accountant@example.test', accountantPassword);
      const second = await signIn('accountant@example.test', accountantPassword);
      as(first.token);
      assert.equal((await password.POST(request('POST', { currentPassword: 'wrong-password', newPassword: 'brand-new-pass-3' }))).status, 400);
      assert.equal((await password.POST(request('POST', { currentPassword: accountantPassword, newPassword: 'short' }))).status, 400);
      const response = await password.POST(request('POST', { currentPassword: accountantPassword, newPassword: 'brand-new-pass-3' }));
      assert.equal(response.status, 200);
      await noHash(response);
      assert.equal(auth.verifySessionToken(first.token).id, accountantId);
      assert.equal(auth.verifySessionToken(second.token), null);
      assert.equal(auth.verifySessionToken(adminToken).id, 1);
      assert.equal((await signIn('accountant@example.test', accountantPassword)).status, 401);
      assert.equal((await signIn('accountant@example.test', 'brand-new-pass-3')).status, 200);
      accountantPassword = 'brand-new-pass-3';
    });
    await t.test('password-change attempts are counted before the password is checked, parallel guesses are throttled', async () => {
      db.prepare('DELETE FROM LoginAttempt').run();
      const signed = await signIn('accountant@example.test', accountantPassword); as(signed.token);
      const statuses = (await Promise.all(Array.from({ length: 16 }, (_, i) => password.POST(request('POST', { currentPassword: 'guess-number-' + i, newPassword: 'another-new-pass-9' }))))).map(r => r.status);
      assert.equal(statuses.filter(s => s === 400).length, 10); assert.equal(statuses.filter(s => s === 429).length, 6);
      db.prepare('DELETE FROM LoginAttempt').run();
    });
    await t.test('only an administrator changes the tax mode of a company', async () => {
      const company = api('companies/[id]');
      const body = mode => ({ name: 'Company A', code: '111', vatCode: 'LT100000000011', isVatPayer: mode !== 'NON_VAT', taxMode: mode, taxEffectiveFrom: '2026-01-01', currencyCode: 'EUR' });
      const current = db.prepare('SELECT taxMode,isVatPayer FROM Company WHERE id=1').get();
      const same = current.taxMode || (current.isVatPayer ? 'STANDARD_VAT' : 'NON_VAT');
      const other = same === 'STANDARD_VAT' ? 'NON_VAT' : 'STANDARD_VAT';
      const signed = await signIn('accountant@example.test', accountantPassword); as(signed.token);
      assert.equal((await company.PUT(request('PUT', body(other)), context(1))).status, 403);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM CompanyTaxPeriod WHERE companyId=1').get().n, 0, 'nothing was written');
      assert.equal((await company.PUT(request('PUT', body(same)), context(1))).status, 200, 'other company data stays editable for an accountant');
      as(adminToken);
      assert.equal((await company.PUT(request('PUT', body(other)), context(1))).status, 200);
    });

    await t.test('deleting removes an unused user and only disables one with history', async () => {
      as(adminToken);
      const created = await noHash(await users.POST(request('POST', { email: 'temp@example.test', name: 'Temp', role: 'accountant', password: 'temp-password-1' })));
      let response = await user.DELETE(request('DELETE'), context(created.user.id));
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { deleted: true });
      assert.equal(db.prepare('SELECT COUNT(*) n FROM User WHERE id=?').get(created.user.id).n, 0);
      db.prepare("INSERT INTO AccountingAudit(companyId,entity,recordId,action,actorId) VALUES(1,'Client',1,'INSERT',?)").run(accountantId);
      response = await user.DELETE(request('DELETE'), context(accountantId));
      const data = await noHash(response);
      assert.equal(data.deleted, false);
      assert.equal(data.user.disabled, true);
      assert.ok(db.prepare('SELECT 1 FROM User WHERE id=?').get(accountantId));
      assert.equal((await user.DELETE(request('DELETE'), context(9999))).status, 404);
      assert.throws(() => db.prepare('DELETE FROM UserLog').run(), /USER_LOG_IMMUTABLE/);
    });
  } finally { db.close(); if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('erp-test-')) throw new Error('Unsafe cleanup path'); fs.rmSync(temp, { recursive: true, force: true }); }
});
