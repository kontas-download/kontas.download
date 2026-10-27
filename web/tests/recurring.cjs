const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-rec-'));
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
const { advance, addDays } = require('../src/lib/recurring.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });

test('period arithmetic keeps the anchor day', () => {
  assert.equal(advance('2026-01-31', 31, 'MONTH'), '2026-02-28');
  assert.equal(advance('2026-02-28', 31, 'MONTH'), '2026-03-31');
  assert.equal(advance('2028-01-31', 31, 'MONTH'), '2028-02-29');
  assert.equal(advance('2026-11-15', 15, 'QUARTER'), '2027-02-15');
  assert.equal(advance('2028-02-29', 29, 'YEAR'), '2029-02-28');
  assert.equal(advance('2026-12-10', 10, 'MONTH'), '2027-01-10');
  assert.equal(addDays('2026-02-20', 14), '2026-03-06');
});

test('recurring invoice templates', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'rc@example.test','R','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,createdAt,updatedAt) VALUES(1,1,'UAB Klientas','300111222','LT100000000011',datetime('now'),datetime('now'))").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,createdAt,updatedAt) VALUES(2,2,'Svetimas','999',datetime('now'),datetime('now'))").run();
    const list = require('../src/app/api/recurring/route.ts');
    const one = require('../src/app/api/recurring/[id]/route.ts');
    const issue = require('../src/app/api/recurring/[id]/issue/route.ts');
    const invoices = require('../src/app/api/invoices/route.ts');
    const { todayVilnius } = require('../src/lib/dates.ts'); const today = todayVilnius();
    const ago = days => addDays(today, -days);
    const body = (over = {}) => ({ name: 'Priežiūra', clientId: 1, frequency: 'MONTH', nextDate: ago(62), endDate: null, payDays: 10, series: 'SF', items: [{ itemName: 'Mėnesio paslauga', quantity: 1, price: 100, vatRate: 21 }], ...over });
    const create = async b => (await list.POST(request('POST', b)));
    const templates = async () => (await (await list.GET()).json()).templates;

    await t.test('validation and company scope', async () => {
      for (const bad of [body({ name: ' ' }), body({ clientId: 2 }), body({ frequency: 'WEEK' }), body({ nextDate: '2026-13-01' }), body({ endDate: ago(100) }), body({ payDays: 999 }), body({ items: [] }), body({ items: [{ itemName: 'x', quantity: 0, price: 1, vatRate: 21 }] })])
        assert.equal((await create(bad)).status, 400, JSON.stringify(bad).slice(0, 80));
      assert.equal((await templates()).length, 0);
    });

    let id;
    await t.test('issuing creates a normal invoice, then advances the period; every period only once', async () => {
      const made = await create(body()); assert.equal(made.status, 200); id = (await made.json()).id;
      assert.equal((await templates())[0].due, true);
      await (await invoices.POST(request('POST', { series: 'SF', number: '000041', saleDate: ago(100), clientName: 'Senas', items: [{ itemName: 'x', quantity: 1, price: 1, vatRate: 21 }] }))).json();
      const first = await issue.POST(request('POST', {}), context(id)); const firstBody = await first.json();
      assert.equal(first.status, 200, JSON.stringify(firstBody));
      assert.equal(firstBody.sale.number, '000042'); assert.equal(firstBody.sale.statusName, 'Neapmokėta'); assert.equal(firstBody.sale.payUntil, addDays(today, 10));
      assert.equal(firstBody.sale.sumWithoutVat, 100); assert.equal(firstBody.sale.vat, 21); assert.equal(firstBody.sale.clientName, 'UAB Klientas'); assert.equal(firstBody.sale.sellerVatMode, 'STANDARD_VAT');
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='SALE' AND sourceId=?").get(firstBody.sale.id).n, 2);
      assert.equal(firstBody.nextDate, advance(firstBody.periodDate, Number(firstBody.periodDate.slice(8, 10)), 'MONTH'));
      let issued = 1;
      for (;;) { const r = await issue.POST(request('POST', {}), context(id)); if (r.status !== 200) { assert.equal(r.status, 409); break; } issued++; assert.ok(issued < 6); }
      assert.ok(issued >= 2);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM RecurringRun WHERE recurringId=?').get(id).n, issued);
      assert.equal((await templates())[0].due, false);
      const tpl = db.prepare('SELECT nextDate FROM RecurringInvoice WHERE id=?').get(id);
      const odd = ago(3);
      db.prepare('UPDATE RecurringInvoice SET nextDate=? WHERE id=?').run(odd, id);
      db.prepare('INSERT INTO RecurringRun(recurringId,periodDate,saleId,createdAt) VALUES(?,?,?,?)').run(id, odd, db.prepare('SELECT MAX(id) id FROM Sale').get().id, Date.now());
      assert.equal((await issue.POST(request('POST', {}), context(id))).status, 409);
      db.prepare('DELETE FROM RecurringRun WHERE recurringId=? AND periodDate=?').run(id, odd);
      db.prepare('UPDATE RecurringInvoice SET nextDate=? WHERE id=?').run(tpl.nextDate, id);
    });

    await t.test('paused, finished, foreign and non-VAT templates do not issue', async () => {
      db.prepare('UPDATE RecurringInvoice SET nextDate=? WHERE id=?').run(ago(4), id);
      assert.equal((await one.PUT(request('PUT', { active: false }), context(id))).status, 200);
      assert.equal((await issue.POST(request('POST', {}), context(id))).status, 409);
      await one.PUT(request('PUT', { active: true }), context(id));
      jar.set('active_company_id', '2'); assert.equal((await issue.POST(request('POST', {}), context(id))).status, 404); assert.equal((await one.DELETE(request('DELETE'), context(id))).status, 404); jar.set('active_company_id', '1');
      const salesBefore = db.prepare('SELECT COUNT(*) n FROM Sale').get().n;
      db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=1").run();
      assert.equal((await issue.POST(request('POST', {}), context(id))).status, 400);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Sale').get().n, salesBefore); assert.equal(db.prepare('SELECT nextDate FROM RecurringInvoice WHERE id=?').get(id).nextDate, ago(4));
      db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
      const last = (await (await create(body({ nextDate: ago(1), endDate: today }))).json()).id;
      const done = await (await issue.POST(request('POST', {}), context(last))).json();
      assert.equal(done.finished, true); assert.equal((await templates()).find(x => x.id === last).active, false);
      assert.equal((await issue.POST(request('POST', {}), context(last))).status, 409);
    });

    await t.test('closed period blocks issuing without advancing; deleting a template keeps its invoices', async () => {
      const x = (await (await create(body({ nextDate: ago(1) }))).json()).id;
      assert.equal((await one.PUT(request('PUT', body({ name: 'Naujas pavadinimas', nextDate: ago(1) })), context(x))).status, 200);
      assert.equal((await templates()).find(r => r.id === x).name, 'Naujas pavadinimas');
      const controls = require('../src/app/api/companies/[id]/accounting-control/route.ts');
      const before = { sales: db.prepare('SELECT COUNT(*) n FROM Sale').get().n, next: db.prepare('SELECT nextDate FROM RecurringInvoice WHERE id=?').get(x).nextDate };
      assert.equal((await controls.PUT(request('PUT', { lockedThrough: today, reason: 'Laikotarpis patikrintas' }), context(1))).status, 200);
      const blocked = await issue.POST(request('POST', {}), context(x));
      assert.equal(blocked.status, 409);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Sale').get().n, before.sales); assert.equal(db.prepare('SELECT nextDate FROM RecurringInvoice WHERE id=?').get(x).nextDate, before.next); assert.equal(db.prepare('SELECT COUNT(*) n FROM RecurringRun WHERE recurringId=?').get(x).n, 0);
      assert.equal((await controls.PUT(request('PUT', { lockedThrough: null, reason: 'Atrakinta taisymui' }), context(1))).status, 200);
      const sale = (await (await issue.POST(request('POST', {}), context(x))).json()).sale;
      assert.equal((await one.PUT(request('PUT', body({ name: 'Atgal', nextDate: ago(2) })), context(x))).status, 409);
      assert.equal((await one.DELETE(request('DELETE'), context(x))).status, 200);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Sale WHERE id=?').get(sale.id).n, 1);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM RecurringRun WHERE recurringId=?').get(x).n, 0);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
