const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-transfer-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'UAB Šaltinis', '111111111', 'LT111111119');
company.run(2, 'UAB Kita', '222222222', 'LT222222229');
fixture.prepare("INSERT INTO ChartOfAccount(code,name) VALUES('272','Kasa'),('6118','Sąnaudos'),('9999','Specialus')").run();
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
const { packageChecksum, MAX_PACKAGE_BYTES } = require('../src/lib/company-package.ts');
const { csvCell, toCsv, parseCsv } = require('../src/lib/csv.ts');
const { receivables } = require('../src/lib/receivables.ts');
const db = getDb();
const url = 'http://localhost:3000/api/test';
const request = (method, body, query = '') => new Request(url + query, { method, headers: { 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
const context = id => ({ params: Promise.resolve({ id: String(id) }) });
const section = s => ({ params: Promise.resolve({ section: s }) });

const trialBalance = id => Object.fromEntries((db.prepare("SELECT account, ROUND(SUM(d),2) AS balance FROM (SELECT debitAccount AS account, amount AS d FROM GeneralEntry WHERE companyId=? UNION ALL SELECT creditAccount, -amount FROM GeneralEntry WHERE companyId=?) GROUP BY account ORDER BY account").all(id, id)).map(r => [r.account, r.balance]));
const vatTotals = id => ({ sales: db.prepare('SELECT ROUND(SUM(vat),2) AS v, ROUND(SUM(sumWithVat),2) AS g FROM Sale WHERE companyId=?').get(id), purchases: db.prepare('SELECT ROUND(SUM(vat),2) AS v, ROUND(SUM(COALESCE(deductibleVat,vat)),2) AS d FROM Purchase WHERE companyId=?').get(id) });
const counts = id => Object.fromEntries(['Client', 'Sale', 'Purchase', 'BankTransaction', 'Payroll', 'GeneralEntry', 'PaymentAllocation', 'ManualSettlement', 'StockItem'].map(t => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE companyId=?`).get(id).n]));

test('company data transfer', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'d@example.test','D','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
    db.prepare("INSERT INTO CompanyMailSettings(companyId,host,port,secure,sender,username,passwordEncrypted,enabled) VALUES(1,'smtp.example.test',465,1,'a@example.test','user','SECRET-CIPHERTEXT',1)").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,isVatPayer,createdAt,updatedAt) VALUES(1,1,'UAB Pirkėjas','300000001','LT300000001',1,datetime('now'),datetime('now')),(2,1,'UAB Tiekėjas','300000002','LT300000002',1,datetime('now'),datetime('now')),(3,2,'Svetimas','999','',0,datetime('now'),datetime('now'))").run();
    db.prepare("INSERT INTO StockItem(companyId,name,code,remainder,price) VALUES(1,'Prekė','P-1',5,10)").run();
    db.prepare("UPDATE Client SET documentLang='ru' WHERE id=1").run();
    const invoices = require('../src/app/api/invoices/route.ts');
    const saleCredit = require('../src/app/api/invoices/[id]/credit/route.ts');
    const purchases = require('../src/app/api/purchases/route.ts');
    const purchaseCredit = require('../src/app/api/purchases/[id]/credit/route.ts');
    const allocations = require('../src/app/api/bank/allocations/route.ts');
    const settlements = require('../src/app/api/bank/settlements/route.ts');
    const payrolls = require('../src/app/api/payrolls/route.ts');
    const exporter = require('../src/app/api/companies/[id]/export/route.ts');
    const importer = require('../src/app/api/companies/import-package/route.ts');
    const history = require('../src/app/api/companies/[id]/history/route.ts');
    const sectionExport = require('../src/app/api/export/[section]/route.ts');
    const sectionImport = require('../src/app/api/import/[section]/route.ts');
    const backup = require('../src/app/api/admin/backup/route.ts');

    const ok = async res => { const r = await res; assert.equal(r.status, 200, JSON.stringify(await r.clone().json().catch(() => ''))); return r.json(); };
    const sale1 = (await ok(invoices.POST(request('POST', { statusName: 'Neapmokėta', series: 'SF', number: '1', saleDate: '2026-09-01', clientId: 1, clientName: 'UAB Pirkėjas', items: [{ itemName: 'Paslauga', quantity: 1, price: 100, vatRate: 21 }] })))).sale;
    const sale2 = (await ok(invoices.POST(request('POST', { statusName: 'Neapmokėta', series: 'SF', number: '2', saleDate: '2026-09-02', clientId: 1, clientName: 'UAB Pirkėjas', items: [{ itemName: '=HYPERLINK("x")', quantity: 2, price: 50, vatRate: 21 }] })))).sale;
    const purchase = (await ok(purchases.POST(request('POST', { series: '', number: 'T-1', purchaseDate: '2026-09-05', clientId: 2, clientName: 'UAB Tiekėjas', clientCode: '300000002', items: [{ itemName: 'Prekė', quantity: 1, price: 200, vatRate: 21 }] })))).purchase;
    const bankIn = Number(db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes,importHash) VALUES(1,'2026-09-10',121,'UAB Pirkėjas','SF 1','hash-1')").run().lastInsertRowid);
    const bankOut = Number(db.prepare("INSERT INTO BankTransaction(companyId,date,sum,clientName,notes) VALUES(1,'2026-09-11',-100,'UAB Tiekėjas','T-1')").run().lastInsertRowid);
    await ok(allocations.POST(request('POST', { bankTransactionId: bankIn, kind: 'SALE', documentId: sale1.id, amount: 121 })));
    await ok(allocations.POST(request('POST', { bankTransactionId: bankOut, kind: 'PURCHASE', documentId: purchase.id, amount: 100 })));
    await ok(settlements.POST(request('POST', { kind: 'SALE', documentId: sale2.id, method: 'CASH', amount: 60, date: '2026-09-12' })));
    // Credit notes after payment: sale 1 becomes overpaid, which must survive the import.
    await ok(saleCredit.POST(request('POST', { number: 'KS-1', saleDate: '2026-09-15', reason: 'Grąžinta', items: [{ itemName: 'Paslauga', quantity: 1, price: 20, vatRate: 21 }] }), context(sale1.id)));
    await ok(purchaseCredit.POST(request('POST', { number: 'K-1', purchaseDate: '2026-09-16', reason: 'Grąžinta', items: [{ itemName: 'Prekė', quantity: 1, price: 50, vatRate: 21 }] }), context(purchase.id)));
    await ok(payrolls.POST(request('POST', { year: 2026, month: 8, employees: [{ employeeName: 'Jonas', grossSalary: 1000, netSalary: 700, gpm: 200, sodraEmployee: 100, sodraEmployer: 18 }] })));
    db.prepare("INSERT INTO GeneralEntry(companyId,date,docNumber,debitAccount,creditAccount,amount,clientId,description,sourceType) VALUES(1,'2026-09-20','M-1','6118','272',15.5,2,'Rankinis','MANUAL')").run();
    // A legacy posting that differs from today's rules must be kept as it is.
    db.prepare("UPDATE GeneralEntry SET description='Sena eilutė',debitAccount='2412' WHERE companyId=1 AND sourceType='SALE' AND sourceId=?").run(sale2.id);
    db.prepare("INSERT INTO AccountingLock VALUES(1,'2026-08-31','Uždaryta')").run();
    // i.SAF codes assigned to lines travel with the package (line ids remapped).
    const { setLineCodes } = require('../src/lib/tax-line-codes.ts');
    const saleItemId = db.prepare('SELECT id FROM SaleItem WHERE saleId=?').get(sale1.id).id;
    const purchaseItemId = db.prepare('SELECT id FROM PurchaseItem WHERE purchaseId=?').get(purchase.id).id;
    setLineCodes(db, 1, [{ kind: 'SALE', itemId: saleItemId, taxCode: 'PVM1', note: 'patikrinta' }, { kind: 'PURCHASE', itemId: purchaseItemId, taxCode: 'PVM1', note: '' }], 1);

    const source = { counts: counts(1), tb: trialBalance(1), vat: vatTotals(1), recv: receivables(db, 1, '2026-12-31').map(r => [r.label, r.balance]) };
    assert.ok(source.counts.Sale === 3 && source.counts.Purchase === 2 && source.counts.PaymentAllocation === 2 && source.counts.ManualSettlement === 1);

    let pkg;
    await t.test('export package has checksum and no secrets', async () => {
      const res = await exporter.GET(request('GET'), context(1));
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-disposition'), /attachment/);
      const text = await res.text();
      pkg = JSON.parse(text);
      assert.equal(pkg.format, 'kontas-company'); assert.equal(pkg.version, 1); assert.equal(pkg.checksum, packageChecksum(pkg.data));
      assert.ok(!/SECRET-CIPHERTEXT|smtp\.example|passwordHash|passwordEncrypted|tokenHash/i.test(text));
      assert.ok(!('mailSettings' in pkg.data) && !('users' in pkg.data));
      assert.equal(pkg.data.sales.length, 3); assert.equal(pkg.data.clients.length, 2);
      assert.ok(pkg.data.sales.some(s => s.docType === 'KS' && s.originalSaleId === sale1.id));
      assert.ok(pkg.data.auditHistory.some(a => a.entity === 'PaymentAllocation'), 'payment links are now audited');
      assert.deepEqual(pkg.data.accountingLock, { lockedThrough: '2026-08-31', reason: 'Uždaryta' });
    });

    await t.test('import refuses tampered, foreign, duplicate and oversized packages', async () => {
      const tampered = structuredClone(pkg); tampered.data.sales[0].sumWithVat = 1;
      let r = await ok(importer.POST(request('POST', tampered)));
      assert.equal(r.ok, false); assert.equal(r.problems[0].code, 'badChecksum');
      r = await ok(importer.POST(request('POST', { ...pkg, format: 'other' })));
      assert.equal(r.problems[0].code, 'badFormat');
      // A package pointing at another company's rows is not referentially valid.
      const badCode = structuredClone(pkg); badCode.data.taxLineCodes[0].itemId = 999999; badCode.checksum = packageChecksum(badCode.data);
      assert.ok((await ok(importer.POST(request('POST', badCode)))).problems.some(p => p.code === 'brokenLink' && p.params.table === 'taxLineCodes'));
      const foreign = structuredClone(pkg); foreign.data.saleItems[0].saleId = 999999; foreign.checksum = packageChecksum(foreign.data);
      r = await ok(importer.POST(request('POST', foreign)));
      assert.ok(r.problems.some(p => p.code === 'brokenLink'));
      const injected = structuredClone(pkg); injected.data.sales[0].companyId = 2; injected.checksum = packageChecksum(injected.data);
      r = await ok(importer.POST(request('POST', injected)));
      assert.ok(r.problems.some(p => p.code === 'unknownField'));
      const badType = structuredClone(pkg); badType.data.sales[0].sumWithVat = '100'; badType.checksum = packageChecksum(badType.data);
      assert.ok((await ok(importer.POST(request('POST', badType)))).problems.some(p => p.code === 'badValue'));
      // Same name and same code as the existing source company.
      r = await ok(importer.POST(request('POST', pkg)));
      assert.ok(r.problems.some(p => p.code === 'nameTaken')); assert.ok(r.problems.some(p => p.code === 'codeTaken'));
      const committed = await importer.POST(request('POST', pkg, '?commit=1'));
      assert.equal(committed.status, 422);
      const big = await importer.POST(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': String(MAX_PACKAGE_BYTES + 1) }, body: '{}' }));
      assert.equal(big.status, 413);
      const streamed = await importer.POST(new Request(url, { method: 'POST', body: 'x'.repeat(MAX_PACKAGE_BYTES + 10) }));
      assert.equal(streamed.status, 413);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Company').get().n, 2);
    });

    let copyId;
    await t.test('dry run previews, commit creates a new company with equal books', async () => {
      const query = '?name=' + encodeURIComponent('UAB Šaltinis (kopija)') + '&allowDuplicateCode=1';
      const before = db.prepare('SELECT COUNT(*) AS n FROM Company').get().n;
      const auditBefore = db.prepare('SELECT COUNT(*) AS n FROM AccountingAudit').get().n;
      const preview = await ok(importer.POST(request('POST', pkg, query)));
      assert.equal(preview.ok, true, JSON.stringify(preview.problems)); assert.equal(preview.committed, false); assert.equal(preview.counts.sales, 3);
      assert.ok(preview.warnings.some(w => w.code === 'ledgerDiffers'));
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Company').get().n, before, 'preview leaves nothing behind');
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM AccountingAudit').get().n, auditBefore);
      const result = await ok(importer.POST(request('POST', pkg, query + '&commit=1')));
      assert.equal(result.committed, true); copyId = result.companyId;
      assert.ok(copyId > 2);
      assert.deepEqual(counts(copyId), source.counts);
      assert.deepEqual(trialBalance(copyId), source.tb);
      assert.deepEqual(vatTotals(copyId), source.vat);
      assert.deepEqual(receivables(db, copyId, '2026-12-31').map(r => [r.label, r.balance]), source.recv);
      // Historical tax status, links and journal rows belong to the copy.
      const copySales = db.prepare('SELECT * FROM Sale WHERE companyId=? ORDER BY id').all(copyId);
      assert.deepEqual(copySales.map(s => [s.sellerVatMode, s.sellerIsVatPayer, s.docType]), db.prepare('SELECT sellerVatMode,sellerIsVatPayer,docType FROM Sale WHERE companyId=1 ORDER BY id').all().map(s => [s.sellerVatMode, s.sellerIsVatPayer, s.docType]));
      assert.equal(db.prepare("SELECT documentLang d FROM Client WHERE companyId=? AND name='UAB Pirkėjas'").get(copyId).d, 'ru'); // document language travels with the customer
      const ks = copySales.find(s => s.docType === 'KS');
      assert.equal(db.prepare('SELECT companyId FROM Sale WHERE id=?').get(ks.originalSaleId).companyId, copyId);
      assert.ok(copySales.every(s => s.externalId === null && (s.clientId === null || db.prepare('SELECT companyId FROM Client WHERE id=?').get(s.clientId).companyId === copyId)));
      const pks = db.prepare("SELECT * FROM Purchase WHERE companyId=? AND docType='KS'").get(copyId);
      assert.equal(db.prepare('SELECT companyId FROM Purchase WHERE id=?').get(pks.originalPurchaseId).companyId, copyId);
      const tables = { SALE: 'Sale', PURCHASE: 'Purchase', BANK: 'BankTransaction', PAYROLL: 'Payroll', SETTLEMENT: 'ManualSettlement' };
      const entries = db.prepare('SELECT * FROM GeneralEntry WHERE companyId=? AND sourceId IS NOT NULL').all(copyId);
      assert.ok(entries.length > 5);
      for (const e of entries) assert.equal(db.prepare(`SELECT companyId FROM ${tables[e.sourceType]} WHERE id=?`).get(e.sourceId)?.companyId, copyId, `${e.sourceType} ${e.sourceId}`);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM GeneralEntry WHERE companyId=? AND description='Sena eilutė' AND debitAccount='2412'").get(copyId).n, 2, 'legacy posting kept verbatim');
      assert.equal(db.prepare('SELECT companyId FROM Client WHERE id=(SELECT clientId FROM GeneralEntry WHERE companyId=? AND sourceType=\'MANUAL\')').get(copyId).companyId, copyId);
      for (const a of db.prepare('SELECT * FROM PaymentAllocation WHERE companyId=?').all(copyId)) assert.equal(db.prepare('SELECT companyId FROM BankTransaction WHERE id=?').get(a.bankTransactionId).companyId, copyId);
      assert.equal(db.prepare('SELECT importHash FROM BankTransaction WHERE companyId=? AND importHash IS NOT NULL').get(copyId).importHash, 'hash-1');
      assert.deepEqual(db.prepare('SELECT lockedThrough,reason FROM AccountingLock WHERE companyId=?').get(copyId), { lockedThrough: '2026-08-31', reason: 'Uždaryta' });
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM CompanyMailSettings WHERE companyId=?').get(copyId).n, 0);
      assert.equal(db.prepare('SELECT isDefault FROM Company WHERE id=?').get(copyId).isDefault, 0);
      const codes = db.prepare('SELECT kind,itemId,taxCode,note FROM TaxLineCode WHERE companyId=? ORDER BY kind').all(copyId);
      assert.deepEqual(codes.map(c => [c.kind, c.taxCode, c.note]), [['PURCHASE', 'PVM1', ''], ['SALE', 'PVM1', 'patikrinta']]);
      assert.equal(db.prepare('SELECT s.companyId FROM SaleItem i JOIN Sale s ON s.id=i.saleId WHERE i.id=?').get(codes[1].itemId).companyId, copyId);
      assert.equal(db.prepare('SELECT p.companyId FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId WHERE i.id=?').get(codes[0].itemId).companyId, copyId);
      const codeAudit = db.prepare("SELECT recordId FROM AccountingAudit WHERE companyId=? AND entity='SaleTaxCode'").get(copyId);
      assert.equal(codeAudit.recordId, codes[1].itemId, 'history of codes points at the copied line');
      // History: source events plus one IMPORT record; no duplicate trigger noise from the import itself.
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM AccountingAudit WHERE companyId=?').get(copyId).n, pkg.data.auditHistory.length + 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM AccountingAudit WHERE companyId=? AND action='IMPORT'").get(copyId).n, 1);
      // Source untouched; locked period of the copy is protected again.
      assert.deepEqual(counts(1), source.counts);
      assert.throws(() => db.prepare("INSERT INTO GeneralEntry(companyId,date,debitAccount,creditAccount,amount) VALUES(?,'2026-08-01','6118','272',1)").run(copyId), /ACCOUNTING_PERIOD_LOCKED/);
      // Importing the same package again under another name gives another new company, never a merge.
      const again = await ok(importer.POST(request('POST', pkg, '?name=Trecia&allowDuplicateCode=1&commit=1')));
      assert.ok(again.companyId > copyId); assert.deepEqual(counts(again.companyId), source.counts);
    });

    await t.test('form company binding: a form opened for another company is rejected', async () => {
      const salesBefore = db.prepare('SELECT COUNT(*) AS n FROM Sale').get().n, purchasesBefore = db.prepare('SELECT COUNT(*) AS n FROM Purchase').get().n;
      const sale = { series: 'BIND', number: '1', saleDate: '2026-09-20', items: [{ itemName: 'x', quantity: 1, price: 1, vatRate: 0 }] };
      const purchase = { series: 'BIND', number: '1', purchaseDate: '2026-09-20', items: [{ itemName: 'x', quantity: 1, price: 1, vatRate: 0 }] };
      const stale = await invoices.POST(request('POST', { ...sale, companyId: 2 }));
      assert.equal(stale.status, 409); assert.match((await stale.json()).error, /Aktyvi įmonė pasikeitė/);
      assert.equal((await purchases.POST(request('POST', { ...purchase, companyId: 2 }))).status, 409);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Sale').get().n, salesBefore); assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Purchase').get().n, purchasesBefore);
    });

    await t.test('history filters, summaries and company scope', async () => {
      const get = async (id, query = '') => { const r = await history.GET(request('GET', undefined, query), context(id)); return { status: r.status, body: r.headers.get('content-type').includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()).toString('utf8') }; };
      const all = await get(1);
      assert.equal(all.status, 200);
      assert.ok(all.body.total > 0 && all.body.events.every(e => typeof e.summary === 'string'));
      const own = new Set(db.prepare('SELECT id FROM AccountingAudit WHERE companyId=1').all().map(r => r.id));
      const full = await get(1, '?limit=1000');
      assert.ok(full.body.events.every(e => own.has(e.id)), 'only rows of company 1');
      const sales = await get(1, '?entity=Sale');
      assert.ok(sales.body.events.length && sales.body.events.every(e => e.entity === 'Sale'));
      const update = db.prepare("SELECT id FROM AccountingAudit WHERE companyId=1 AND entity='GeneralEntry' AND action='UPDATE'").get();
      const ev = full.body.events.find(e => e.id === update.id);
      assert.ok(ev.changes.some(c => c.field === 'description') && ev.summary.includes('→'));
      assert.equal((await get(1, '?from=2999-01-01')).body.total, 0);
      assert.ok((await get(1, '?to=2000-01-01')).body.total === 0);
      // Dates are Vilnius calendar days; createdAt is UTC (21:30 UTC in summer and 22:30 UTC in winter are already the next day in Vilnius).
      const mark = db.prepare("INSERT INTO AccountingAudit(companyId,entity,recordId,action,beforeJson,afterJson,actorId,createdAt) VALUES(1,'Probe',?,'INSERT',NULL,'{}',NULL,?)");
      // Stored format is ISO with 'T' and 'Z'. Vilnius midnight: summer 2026-07-01T21:00:00Z, winter 2026-12-01T22:00:00Z.
      mark.run(9001, '2026-07-01T20:59:00.000Z'); mark.run(9002, '2026-07-01T21:01:00.000Z');
      mark.run(9003, '2026-12-01T21:59:00.000Z'); mark.run(9004, '2026-12-01T22:01:00.000Z');
      const probe = async q => (await get(1, '?entity=Probe&limit=100' + q)).body.events.map(e => e.recordId).sort();
      assert.deepEqual(await probe('&from=2026-07-01&to=2026-07-01'), [9001]); assert.deepEqual(await probe('&from=2026-07-02&to=2026-07-02'), [9002]);
      assert.deepEqual(await probe('&from=2026-12-01&to=2026-12-01'), [9003]); assert.deepEqual(await probe('&from=2026-12-02&to=2026-12-02'), [9004]);
      assert.deepEqual(await probe('&from=2026-07-02&to=2026-12-01'), [9002, 9003]);
      db.prepare("DELETE FROM AccountingAudit WHERE entity='Probe'").run();
      assert.equal((await get(1, '?from=bad')).status, 400);
      assert.equal((await get(1, '?limit=0')).status, 400);
      assert.equal((await get(424242)).status, 404);
      const page = await get(1, '?limit=2&offset=1');
      assert.equal(page.body.events.length, 2); assert.equal(page.body.events[0].id, full.body.events[1].id);
      const other = await get(2, '?limit=1000');
      assert.ok(other.body.events.every(e => !own.has(e.id)));
      const csv = await get(1, '?format=csv&entity=Sale');
      assert.ok(csv.body.startsWith('﻿id;createdAt;entity'));
      jar.delete('auth_session');
      assert.equal((await get(1)).status, 401);
      jar.set('auth_session', auth.createSessionToken({ id: 1 }));
    });

    await t.test('section exports: CSV with BOM, safe quoting and formula protection', async () => {
      assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)"); assert.equal(csvCell('+370'), "'+370"); assert.equal(csvCell('-x'), "'-x"); assert.equal(csvCell('@x'), "'@x");
      assert.equal(csvCell(-5), '-5'); assert.equal(csvCell('a;b'), '"a;b"'); assert.equal(csvCell('say "hi"'), '"say ""hi"""'); assert.equal(csvCell('a\nb'), '"a\nb"');
      assert.deepEqual(parseCsv(toCsv(['a', 'b'], [{ a: 'x;y', b: 'line\nbreak "q"' }])), [['a', 'b'], ['x;y', 'line\nbreak "q"']]);
      db.prepare("INSERT INTO Client(companyId,name,code) VALUES(1,'=cmd|calc','777')").run();
      const res = await sectionExport.GET(request('GET', undefined, '?format=csv'), section('clients'));
      assert.equal(res.status, 200); assert.match(res.headers.get('content-type'), /text\/csv/);
      const text = Buffer.from(await res.arrayBuffer()).toString('utf8');
      assert.ok(text.startsWith('﻿id;name;code'));
      assert.ok(text.includes("'=cmd|calc") && !/;=cmd/.test(text));
      const json = await (await sectionExport.GET(request('GET', undefined, '?format=json'), section('sales'))).json();
      assert.equal(json.rows.length, 3); assert.ok(json.rows.every(r => Array.isArray(r.items)));
      const items = await (await sectionExport.GET(request('GET', undefined, '?format=csv'), section('journal'))).text();
      assert.ok(items.split('\r\n').length > 5);
      for (const s of ['stock', 'purchases', 'bank']) assert.equal((await sectionExport.GET(request('GET', undefined, '?format=csv'), section(s))).status, 200);
      assert.equal((await sectionExport.GET(request('GET'), section('users'))).status, 404);
      const other = await (await sectionExport.GET(request('GET', undefined, '?format=json&companyId=2'), section('clients'))).json();
      assert.deepEqual(other.rows.map(r => r.name), ['Svetimas']);
    });

    await t.test('clients and stock CSV import: preview, commit, duplicates skipped', async () => {
      const csv = '﻿name;code;vatCode;phone\r\nUAB Pirkėjas dublis;300000001;;\r\nNaujas;400;LT400;\'+37060000000\r\n"Kitas; su kabliataškiu";401;;\r\nPakartotas;400;;\r\n';
      const before = db.prepare('SELECT COUNT(*) AS n FROM Client WHERE companyId=1').get().n;
      const preview = await ok(sectionImport.POST(request('POST', { csv, commit: false }), section('clients')));
      assert.equal(preview.ok, true); assert.equal(preview.committed, false); assert.equal(preview.toInsert, 2);
      assert.deepEqual(preview.skipped.map(s => s.reason), ['exists', 'repeated']);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Client WHERE companyId=1').get().n, before);
      const done = await ok(sectionImport.POST(request('POST', { csv, commit: true }), section('clients')));
      assert.equal(done.inserted, 2);
      assert.equal(db.prepare("SELECT phone FROM Client WHERE companyId=1 AND code='400'").get().phone, '+37060000000');
      assert.equal(db.prepare("SELECT name FROM Client WHERE companyId=1 AND code='300000001'").get().name, 'UAB Pirkėjas', 'existing row never overwritten');
      const again = await ok(sectionImport.POST(request('POST', { csv, commit: true }), section('clients')));
      assert.equal(again.inserted, 0);
      const bad = await sectionImport.POST(request('POST', { csv: 'name;code\r\n;1\r\n', commit: true }), section('clients'));
      assert.equal(bad.status, 422);
      const stock = await ok(sectionImport.POST(request('POST', { csv: 'name;code;remainder;price\r\nPrekė;P-1;1;1\r\nNauja;P-2;3;"4,50"\r\n', commit: true }), section('stock')));
      assert.equal(stock.inserted, 1); assert.equal(stock.skipped.length, 1);
      assert.equal(db.prepare("SELECT price FROM StockItem WHERE code='P-2'").get().price, 4.5);
      assert.equal((await sectionImport.POST(request('POST', { csv: 'name;sum\r\nx;1\r\n' }), section('bank'))).status, 404);
      assert.equal((await sectionImport.POST(request('POST', { csv: 'name\r\nCross\r\n', commit: true, companyId: 2 }), section('clients'))).status, 200);
      assert.equal(db.prepare("SELECT companyId FROM Client WHERE name='Cross'").get().companyId, 2);
    });

    await t.test('hardening: prototype keys, bad lock date, name with trailing space, repeated numbers carried over with the guard restored', async () => {
      const again = (change) => { const copy = structuredClone(pkg); change(copy.data); copy.checksum = packageChecksum(copy.data); return copy; };
      let r = await ok(importer.POST(request('POST', again(d => { d.sales[0].constructor = 1; }), '?name=Proto')));
      assert.ok(r.problems.some(p => p.code === 'unknownField'));
      r = await ok(importer.POST(request('POST', again(d => { d.accountingLock = { lockedThrough: 'zzzz', reason: 'x' }; }), '?name=Lock')));
      assert.ok(r.problems.some(p => p.code === 'badValue'));
      const source = db.prepare('SELECT name FROM Company WHERE id=1').get().name;
      r = await ok(importer.POST(request('POST', again(d => { d.company.name = source + ' '; }), '?allowDuplicateCode=1')));
      assert.ok(r.problems.some(p => p.code === 'nameTaken'), 'a trailing space does not make the name unique');
      // Old data may hold repeated numbers: the package still imports, with a warning, and the guard is back afterwards.
      const plain = pkg.data.sales.filter(x => x.docType !== 'KS');
      const repeated = again(d => { const [a, b] = d.sales.filter(x => x.docType !== 'KS'); b.series = a.series; b.number = a.number; });
      const copy = await ok(importer.POST(request('POST', repeated, '?name=' + encodeURIComponent('UAB Dublikatai') + '&allowDuplicateCode=1&commit=1')));
      assert.equal(copy.ok, true, JSON.stringify(copy.problems)); assert.ok(copy.warnings.some(w => w.code === 'duplicateNumbers'));
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Sale WHERE companyId=? AND docType IS NOT \'KS\'').get(copy.companyId).n, plain.length);
      for (const name of ['number_Sale_INSERT', 'number_Purchase_INSERT']) assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?").get(name), name + ' is restored');
      const insert = () => db.prepare("INSERT INTO Sale(companyId,series,number,saleDate,sumWithoutVat,vat,sumWithVat,statusName,createdAt) VALUES(?,?,?,?,1,0,1,'Neapmokėta',datetime('now'))").run(copy.companyId, plain[0].series, plain[0].number, '2026-10-01');
      assert.throws(insert, /DUPLICATE_DOCUMENT_NUMBER/);
    });
    await t.test('admin backup is a consistent SQLite snapshot', async () => {
      const res = await backup.GET();
      assert.equal(res.status, 200);
      const file = path.join(temp, 'snapshot.db');
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      const snap = new Database(file, { readonly: true });
      assert.equal(snap.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
      assert.equal(snap.prepare('SELECT COUNT(*) AS n FROM Sale WHERE companyId=1').get().n, 3);
      snap.close();
      jar.delete('auth_session');
      assert.equal((await backup.GET()).status, 401);
    });
  } finally {
    db.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
