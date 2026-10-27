// The i.SAF line codes: codes survive document edits (or block the export until reviewed), credit notes inherit
// the codes of the original, the accounting lock protects codes, and company packages refuse invalid codes clearly.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-taxcodes-edit-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Kodai', '111111111', 'LT111111119', 'EUR', 0, datetime('now'), datetime('now'))").run();
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
const { packageChecksum } = require('../src/lib/company-package.ts');
const db = getDb();
const url = 'http://localhost:3000/api/test';
const request = (method, body, query = '') => new Request(url + query, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });
const ok = async res => { const r = await res; const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body; };
const codesOf = (kind, docId) => db.prepare(`SELECT i.itemName, t.taxCode FROM ${kind === 'SALE' ? 'SaleItem i JOIN TaxLineCode t ON t.kind=\'SALE\' AND t.itemId=i.id WHERE i.saleId=?' : 'PurchaseItem i JOIN TaxLineCode t ON t.kind=\'PURCHASE\' AND t.itemId=i.id WHERE i.purchaseId=?'} ORDER BY i.id`).all(docId).map(r => [r.itemName, r.taxCode]);

test('i.SAF codes across edits, credit notes, the accounting lock and packages', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'k@example.test','K','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,createdAt,updatedAt) VALUES(1,1,'SIA Latvija','','LV40003009497',datetime('now'),datetime('now'))").run();
    const invoices = require('../src/app/api/invoices/route.ts');
    const invoice = require('../src/app/api/invoices/[id]/route.ts');
    const saleCredit = require('../src/app/api/invoices/[id]/credit/route.ts');
    const purchases = require('../src/app/api/purchases/route.ts');
    const purchase = require('../src/app/api/purchases/[id]/route.ts');
    const purchaseCredit = require('../src/app/api/purchases/[id]/credit/route.ts');
    const codes = require('../src/app/api/tax-reports/line-codes/route.ts');
    const isaf = require('../src/app/api/tax-reports/isaf/route.ts');
    const fr = require('../src/app/api/tax-reports/fr0600/route.ts');
    const exporter = require('../src/app/api/companies/[id]/export/route.ts');
    const importer = require('../src/app/api/companies/import-package/route.ts');
    const put = body => codes.PUT(request('PUT', body));
    const period = '?start=2026-09-01&end=2026-09-30';
    const isafStatus = async () => (await isaf.GET(request('GET', undefined, period))).status;
    const saleBody = items => ({ statusName: 'Neapmokėta', series: 'SF', number: '1', saleDate: '2026-09-10', clientId: 1, clientName: 'SIA Latvija', items });
    const two = [{ itemName: 'Prekės A', quantity: 1, price: 1000, vatRate: 0 }, { itemName: 'Prekės B', quantity: 2, price: 50, vatRate: 0 }];
    const sale = (await ok(invoices.POST(request('POST', saleBody(two))))).sale;
    const items = db.prepare('SELECT id FROM SaleItem WHERE saleId=? ORDER BY id').all(sale.id).map(r => r.id);
    await ok(put({ items: items.map(itemId => ({ kind: 'SALE', itemId, taxCode: 'PVM13' })) }));
    assert.equal(await isafStatus(), 200);

    await t.test('an edit that keeps the lines keeps their codes (new line ids)', async () => {
      const edited = await ok(invoice.PUT(request('PUT', { ...saleBody(two), notes: 'pakeista pastaba' }), context(sale.id)));
      assert.deepEqual(edited.droppedTaxCodes, []);
      assert.deepEqual(codesOf('SALE', sale.id), [['Prekės A', 'PVM13'], ['Prekės B', 'PVM13']]);
      // reordered lines find their codes by name and amounts
      const swapped = await ok(invoice.PUT(request('PUT', saleBody([two[1], two[0]])), context(sale.id)));
      assert.deepEqual(swapped.droppedTaxCodes, []);
      assert.deepEqual(codesOf('SALE', sale.id), [['Prekės B', 'PVM13'], ['Prekės A', 'PVM13']]);
      assert.equal(await isafStatus(), 200);
    });
    await t.test('a code that fits no new line is reported, recorded and blocks i.SAF and FR0600 until reviewed', async () => {
      const changed = await ok(invoice.PUT(request('PUT', saleBody([two[0], { itemName: 'Prekės B', quantity: 3, price: 50, vatRate: 0 }])), context(sale.id)));
      assert.deepEqual(changed.droppedTaxCodes, [{ itemName: 'Prekės B', taxCode: 'PVM13' }]);
      assert.deepEqual(codesOf('SALE', sale.id), [['Prekės A', 'PVM13']]);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM AccountingAudit WHERE entity='SaleTaxCodeReview' AND recordId=? AND action='INSERT'").get(sale.id).n, 1);
      const refused = await isaf.GET(request('GET', undefined, period));
      assert.equal(refused.status, 409); assert.ok((await refused.json()).issues.some(i => /pašalinti i.SAF kodai \(Prekės B: PVM13\)/.test(i)));
      const draft = (await (await fr.GET(request('GET', undefined, period))).json()).draft;
      assert.equal(draft.extended.f18, 0); assert.ok(draft.manual.some(m => /pašalinti i.SAF kodai/.test(m)));
      const list = (await (await codes.GET(request('GET', undefined, period))).json()).lines;
      assert.ok(list.length === 2 && list.every(l => l.review), 'all lines of the document are shown for review');
      // assigning the code again clears the mark
      const newB = db.prepare("SELECT id FROM SaleItem WHERE saleId=? AND itemName='Prekės B'").get(sale.id).id;
      await ok(put({ items: [{ kind: 'SALE', itemId: newB, taxCode: 'PVM13' }] }));
      assert.equal(await isafStatus(), 200);
      // an explicit confirmation also clears it
      await ok(invoice.PUT(request('PUT', saleBody([two[0], { itemName: 'Prekės B', quantity: 4, price: 50, vatRate: 0 }])), context(sale.id)));
      assert.equal(await isafStatus(), 409);
      assert.equal((await put({ confirm: [{ kind: 'SALE', docId: 999 }] })).status, 404);
      await ok(put({ confirm: [{ kind: 'SALE', docId: sale.id }] }));
      assert.equal(db.prepare('SELECT COUNT(*) n FROM TaxCodeReview').get().n, 0);
      assert.equal(db.prepare("SELECT actorId FROM AccountingAudit WHERE entity='SaleTaxCodeReview' AND action='DELETE' ORDER BY id DESC").get().actorId, 1);
      // the uncoded B line now blocks i.SAF as an ordinary unclassified line, not silently
      assert.equal(await isafStatus(), 409);
      const lineB = db.prepare("SELECT id FROM SaleItem WHERE saleId=? AND itemName='Prekės B'").get(sale.id).id;
      await ok(put({ items: [{ kind: 'SALE', itemId: lineB, taxCode: 'PVM13' }] }));
      assert.equal(await isafStatus(), 200);
    });
    await t.test('usual spellings of Lithuania are recognised as a Lithuanian party', () => {
      const { isLt } = require('../src/lib/tax-codes.ts');
      for (const country of ['', 'LT', 'LTU', 'Lietuva', 'Lietuvos Respublika', 'Lithuania', 'Литва']) assert.equal(isLt({ country }), true, country);
      for (const country of ['Latvija', 'Estonia', 'USA']) assert.equal(isLt({ country }), false, country);
    });
    await t.test('purchase edits keep codes too', async () => {
      const body = { series: '', number: 'LV-1', purchaseDate: '2026-09-12', clientId: 1, clientName: 'SIA Latvija', items: [{ itemName: 'Žaliavos', quantity: 1, price: 200, vatRate: 0 }] };
      const p = (await ok(purchases.POST(request('POST', body)))).purchase;
      const itemId = db.prepare('SELECT id FROM PurchaseItem WHERE purchaseId=?').get(p.id).id;
      await ok(put({ items: [{ kind: 'PURCHASE', itemId, taxCode: 'PVM16' }] }));
      const same = await ok(purchase.PUT(request('PUT', { ...body, notes: 'x' }), context(p.id)));
      assert.deepEqual(same.droppedTaxCodes, []); assert.deepEqual(codesOf('PURCHASE', p.id), [['Žaliavos', 'PVM16']]);
      const other = await ok(purchase.PUT(request('PUT', { ...body, items: [{ itemName: 'Žaliavos', quantity: 1, price: 250, vatRate: 0 }] }), context(p.id)));
      assert.deepEqual(other.droppedTaxCodes, [{ itemName: 'Žaliavos', taxCode: 'PVM16' }]);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM TaxCodeReview WHERE kind='PURCHASE' AND docId=?").get(p.id).n, 1);
      const newId = db.prepare('SELECT id FROM PurchaseItem WHERE purchaseId=?').get(p.id).id;
      await ok(put({ items: [{ kind: 'PURCHASE', itemId: newId, taxCode: 'PVM16' }] }));
      assert.equal(await isafStatus(), 200);
    });
    await t.test('credit notes inherit the codes of the original, ambiguous lines are reported', async () => {
      const ks = await ok(saleCredit.POST(request('POST', { number: 'KS-1', saleDate: '2026-09-20', reason: 'Grąžinta', items: [{ itemName: 'Prekės A', quantity: 1, price: 100, vatRate: 0 }] }), context(sale.id)));
      assert.deepEqual(ks.missingTaxCodes, []);
      assert.deepEqual(codesOf('SALE', ks.sale.id), [['Prekės A', 'PVM13']]);
      assert.equal(await isafStatus(), 200, 'the credit note is exported with the inherited code');
      // a purchase whose 0 % lines carry different codes: the credit line cannot be resolved and is reported
      const mixed = (await ok(purchases.POST(request('POST', { series: '', number: 'LV-2', purchaseDate: '2026-09-13', clientId: 1, clientName: 'SIA Latvija', items: [{ itemName: 'Prekės', quantity: 1, price: 100, vatRate: 0 }, { itemName: 'Paslaugos', quantity: 1, price: 100, vatRate: 0 }] })))).purchase;
      const [goods, services] = db.prepare('SELECT id FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(mixed.id).map(r => r.id);
      await ok(put({ items: [{ kind: 'PURCHASE', itemId: goods, taxCode: 'PVM16' }, { kind: 'PURCHASE', itemId: services, taxCode: 'PVM21' }] }));
      const pks = await ok(purchaseCredit.POST(request('POST', { number: 'K-2', purchaseDate: '2026-09-21', reason: 'Grąžinta', items: [{ itemName: 'Paslaugos', quantity: 1, price: 40, vatRate: 0 }, { itemName: 'Kita', quantity: 1, price: 10, vatRate: 0 }] }), context(mixed.id)));
      assert.deepEqual(codesOf('PURCHASE', pks.purchase.id), [['Paslaugos', 'PVM21']], 'same name: unambiguous');
      assert.deepEqual(pks.missingTaxCodes, ['Kita'], 'other name: two different codes at the same rate');
    });
    await t.test('codes of a closed period cannot be set, changed or cleared', async () => {
      db.prepare("INSERT INTO AccountingLock(companyId,lockedThrough,reason) VALUES(1,'2026-09-30','Uždaryta')").run();
      const lineA = db.prepare("SELECT id FROM SaleItem WHERE saleId=? AND itemName='Prekės A'").get(sale.id).id;
      for (const taxCode of ['PVM12', null]) {
        const r = await put({ items: [{ kind: 'SALE', itemId: lineA, taxCode }] });
        assert.equal(r.status, 409); assert.match((await r.json()).error, /uždaryt/);
      }
      assert.throws(() => db.prepare('DELETE FROM TaxLineCode WHERE kind=? AND itemId=?').run('SALE', lineA), /ACCOUNTING_PERIOD_LOCKED/, 'direct writes are refused by the trigger');
      assert.throws(() => db.prepare("UPDATE TaxLineCode SET taxCode='PVM12' WHERE kind='SALE' AND itemId=?").run(lineA), /ACCOUNTING_PERIOD_LOCKED/);
      assert.deepEqual(codesOf('SALE', sale.id).map(c => c[1]), ['PVM13', 'PVM13']);
      db.prepare('DELETE FROM AccountingLock WHERE companyId=1').run();
    });
    await t.test('a package with an invalid or repeated code gives a clear problem', async () => {
      const pkg = JSON.parse(await (await exporter.GET(request('GET'), context(1))).text());
      assert.ok(pkg.data.taxLineCodes.length >= 4);
      const variant = change => { const copy = structuredClone(pkg); change(copy.data); copy.checksum = packageChecksum(copy.data); return copy; };
      const bad = await ok(importer.POST(request('POST', variant(d => { d.taxLineCodes[0].taxCode = 'PVM99'; }), '?name=Kopija&allowDuplicateCode=1')));
      assert.ok(bad.problems.some(p => p.code === 'badTaxCode'), JSON.stringify(bad.problems));
      const dup = await ok(importer.POST(request('POST', variant(d => { d.taxLineCodes.push({ ...d.taxLineCodes[0] }); }), '?name=Kopija&allowDuplicateCode=1')));
      assert.ok(dup.problems.some(p => p.code === 'duplicateTaxCode'));
      const good = await ok(importer.POST(request('POST', pkg, '?name=Kopija&allowDuplicateCode=1')));
      assert.equal(good.ok, true, JSON.stringify(good.problems));
    });
    await t.test('assigning codes clears the mark only when every dropped code is covered again', async () => {
      const own = (await ok(invoices.POST(request('POST', { ...saleBody(two), number: 'M4-1' })))).sale;
      const lines = () => db.prepare('SELECT id FROM SaleItem WHERE saleId=? ORDER BY id').all(own.id);
      const marks = () => db.prepare("SELECT COUNT(*) n FROM TaxCodeReview WHERE kind='SALE' AND docId=?").get(own.id).n;
      const blocked = async () => ((await (await isaf.GET(request('GET', undefined, period))).json()).issues || []).some(i => /M4-1/.test(i) && /pašalinti i.SAF kodai/.test(i));
      await ok(put({ items: lines().map(r => ({ kind: 'SALE', itemId: r.id, taxCode: 'PVM13' })) }));
      const edited = await ok(invoice.PUT(request('PUT', { ...saleBody([{ itemName: 'Prekės C', quantity: 1, price: 10, vatRate: 0 }, { itemName: 'Prekės D', quantity: 1, price: 20, vatRate: 0 }]), number: 'M4-1' }), context(own.id)));
      assert.equal(edited.droppedTaxCodes.length, 2); assert.equal(marks(), 1); assert.equal(await blocked(), true);
      const [first, second] = lines();
      await ok(put({ items: [{ kind: 'SALE', itemId: first.id, taxCode: 'PVM13' }] }));
      assert.equal(marks(), 1, 'one of the two dropped codes is still missing'); assert.equal(await blocked(), true);
      await ok(put({ items: [{ kind: 'SALE', itemId: second.id, taxCode: 'PVM13' }] }));
      assert.equal(marks(), 0); assert.equal(await blocked(), false);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
