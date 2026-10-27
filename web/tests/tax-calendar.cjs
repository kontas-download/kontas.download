const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-cal-'));
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
const cal = require('../src/lib/tax-calendar.ts');
const db = getDb();
const request = (method, body, url = 'http://localhost:3000/api/tax-calendar') => new Request(url, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

test('Easter, holidays and working days', () => {
  assert.equal(cal.easter(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(cal.easter(2027).toISOString().slice(0, 10), '2027-03-28');
  assert.equal(cal.easter(2025).toISOString().slice(0, 10), '2025-04-20');
  for (const d of ['2026-01-01', '2026-02-16', '2026-04-05', '2026-04-06', '2026-07-06', '2026-11-02', '2026-12-25']) assert.equal(cal.isHoliday(d), true, d);
  assert.equal(cal.isHoliday('2026-04-07'), false);
  assert.equal(cal.isWorkingDay('2026-10-24'), false); // Saturday
  assert.equal(cal.nextWorkingDay('2026-10-25'), '2026-10-26'); // Sunday -> Monday
  assert.equal(cal.nextWorkingDay('2026-10-26'), '2026-10-26');
  assert.equal(cal.nextWorkingDay('2026-12-24'), '2026-12-28'); // 24-26 Dec holidays, 27 Sunday
});

test('calendar events, applicability and filed marks', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'c@example.test','C','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    const route = require('../src/app/api/tax-calendar/route.ts');
    const get = (from, to) => route.GET(request('GET', null, `http://localhost:3000/api/tax-calendar?from=${from}&to=${to}`)).then(r => r.json());
    const put = body => route.PUT(request('PUT', body));

    await t.test('non-VAT company has no FR0600; optional obligations are off by default', async () => {
      db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=1").run();
      const body = await get('2026-01-01', '2027-12-31');
      assert.equal(body.events.length, 0);
      assert.equal(body.settings.find(s => s.code === 'FR0600').enabled, false);
    });

    await t.test('FR0600 follows the VAT period and shows the unverified carry-over separately', async () => {
      db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
      let events = (await get('2026-10-01', '2026-12-31')).events.filter(e => e.code === 'FR0600');
      assert.deepEqual(events.map(e => e.dueNominal), ['2026-10-25', '2026-11-25', '2026-12-25']);
      assert.equal(events[0].periodEnd, '2026-09-30'); assert.equal(events[0].dueWorkingDay, '2026-10-26');
      assert.equal(events[2].dueWorkingDay, '2026-12-28');
      assert.equal((await put({ code: 'FR0600', period: 'QUARTER' })).status, 200);
      events = (await get('2026-01-01', '2027-12-31')).events.filter(e => e.code === 'FR0600');
      assert.deepEqual(events.slice(0, 4).map(e => e.dueNominal), ['2026-01-25', '2026-04-25', '2026-07-25', '2026-10-25']);
      assert.equal(events[0].periodStart, '2025-10-01'); assert.equal(events[0].periodEnd, '2025-12-31');
      await put({ code: 'FR0600', period: 'HALF' });
      assert.deepEqual((await get('2026-01-01', '2026-12-31')).events.filter(e => e.code === 'FR0600').map(e => e.dueNominal), ['2026-01-25', '2026-07-25']);
    });

    await t.test('manual obligations appear only when enabled, with sourced due dates', async () => {
      assert.equal((await put({ code: 'GPM313', enabled: true })).status, 200);
      assert.equal((await put({ code: 'GPM312', enabled: true })).status, 200);
      assert.equal((await put({ code: 'PLN204', enabled: true })).status, 200);
      const events = (await get('2026-01-01', '2026-12-31')).events;
      assert.deepEqual(events.filter(e => e.code === 'GPM313').slice(0, 2).map(e => e.dueNominal), ['2026-01-15', '2026-02-15']);
      assert.deepEqual(events.filter(e => e.code === 'GPM312').map(e => [e.periodEnd, e.dueNominal]), [['2025-12-31', '2026-02-15']]);
      assert.deepEqual(events.filter(e => e.code === 'PLN204').map(e => e.dueNominal), ['2026-06-15']);
      assert.ok(events.every(e => e.source));
      await put({ code: 'GPM313', enabled: false });
      assert.equal((await get('2026-01-01', '2026-12-31')).events.filter(e => e.code === 'GPM313').length, 0);
    });

    await t.test('filed marks are per company and reversible; input is validated', async () => {
      assert.equal((await put({ code: 'PLN204', periodEnd: '2025-12-31', done: true, note: 'EDS #1' })).status, 200);
      const ev = (await get('2026-06-01', '2026-06-30')).events.find(e => e.code === 'PLN204');
      assert.equal(ev.done, true); assert.ok(ev.doneAt);
      jar.set('active_company_id', '2');
      db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=2").run();
      assert.equal((await get('2026-10-01', '2026-10-31')).events.find(e => e.code === 'FR0600').done, false);
      jar.set('active_company_id', '1');
      assert.equal((await put({ code: 'PLN204', periodEnd: '2025-12-31', done: false })).status, 200);
      assert.equal((await get('2026-06-01', '2026-06-30')).events.find(e => e.code === 'PLN204').done, false);
      for (const bad of [{ code: 'XXX', enabled: true }, { code: 'GPM313', period: 'MONTH' }, { code: 'FR0600', period: 'WEEK' }, { code: 'PLN204', periodEnd: 'nope', done: true }]) assert.equal((await put(bad)).status, 400, JSON.stringify(bad));
      assert.equal((await route.GET(request('GET', null, 'http://localhost:3000/api/tax-calendar?from=2026-13-01&to=2026-12-31'))).status, 400);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
