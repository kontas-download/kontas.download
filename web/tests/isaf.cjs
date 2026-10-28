const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const { reportMissingXsd, validateIsaf, hasXsd, skipReason } = require('./helpers/isaf-xsd.cjs');
reportMissingXsd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-isaf-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'Company A', '111111111', 'LT111111119');
company.run(2, 'Company B', '222222222', 'LT222222229');
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
const { buildIsaf } = require('../src/lib/isaf.ts');
const db = getDb();

const valid = validateIsaf;
const doc = (over = {}) => ({ id: 1, number: 'SF 1', date: '2026-09-10', clientId: 5, name: 'Klientas UAB', code: '300000001', vatCode: 'LT100000000011', country: '', lines: [{ rate: 21, net: 100, gross: 121 }], ...over });
const input = (over = {}) => ({ company: { name: 'A', code: '111111111', vatCode: 'LT111111119' }, period: { start: '2026-09-01', end: '2026-09-30' }, sales: [doc()], purchases: [], software: { company: 'kontas.download', name: 'kontas.download', version: '0.2.1' }, now: new Date('2026-10-01T10:00:00Z'), ...over });

test('generated i.SAF files satisfy the official XSD 1.2', async t => {
  await t.test('validator rejects a broken file', async st => {
    if (!hasXsd) return st.skip(skipReason);
    const result = await valid('<iSAFFile xmlns="http://www.vmi.lt/cms/imas/isaf"><Header/></iSAFFile>');
    assert.equal(result.valid, false);
  });
  await t.test('sales with several rates group by classifier code', async () => {
    const r = buildIsaf(input({ sales: [doc({ lines: [{ rate: 21, net: 100, gross: 121 }, { rate: 21, net: 50.01, gross: 60.51 }, { rate: 9, net: 10, gross: 10.9 }, { rate: 5, net: 20, gross: 21 }] })] }));
    assert.deepEqual(r.issues, []);
    const result = await valid(r.xml);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.match(r.xml, /<TaxableValue>150\.01<\/TaxableValue><TaxCode>PVM1<\/TaxCode><TaxPercentage>21<\/TaxPercentage><Amount>31\.50<\/Amount>/);
    assert.match(r.xml, /PVM2/); assert.match(r.xml, /PVM3/);
  });
  await t.test('purchases carry the classifier code and stay valid with a private customer', async () => {
    const r = buildIsaf(input({ sales: [doc({ id: 2, clientId: null, name: 'Fizinis asmuo', code: '', vatCode: '' })], purchases: [doc({ id: 3, number: 'TIEK-7', clientId: 6, name: 'Tiekejas', code: '300000002', vatCode: '100000000022' })] }));
    assert.deepEqual(r.issues, []);
    const result = await valid(r.xml);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.match(r.xml, /<VATRegistrationNumber>ND<\/VATRegistrationNumber><RegistrationNumber>ND<\/RegistrationNumber><Country>LT<\/Country>/);
    assert.match(r.xml, /<VATRegistrationNumber>LT100000000022<\/VATRegistrationNumber>/);
    assert.match(r.xml, /<SupplierInfo>[\s\S]*<TaxCode>PVM1<\/TaxCode><TaxPercentage>21<\/TaxPercentage>/);
  });
  await t.test('empty period still gives a valid header-only file', async () => {
    const r = buildIsaf(input({ sales: [] }));
    const result = await valid(r.xml);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  });
  await t.test('xml special characters are escaped', async () => {
    const r = buildIsaf(input({ sales: [doc({ name: 'A & B <UAB> "x"' })] }));
    assert.equal((await valid(r.xml)).valid, true);
    assert.match(r.xml, /A &amp; B &lt;UAB&gt;/);
  });
});

test('12 % rate uses PVM58 only from 2026-01-01', async () => {
  const line = { rate: 12, net: 100, gross: 112 };
  const ok = buildIsaf(input({ sales: [doc({ lines: [line] })] }));
  assert.deepEqual(ok.issues, []);
  assert.match(ok.xml, /<TaxCode>PVM58<\/TaxCode><TaxPercentage>12<\/TaxPercentage>/);
  assert.equal((await valid(ok.xml)).valid, true);
  const early = buildIsaf(input({ period: { start: '2025-09-01', end: '2025-09-30' }, sales: [doc({ date: '2025-09-10', lines: [line] })] }));
  assert.equal(early.xml, null);
});

test('credit notes (KS) are exported with negative amounts and a reference to the corrected invoice', async () => {
  const ks = (over = {}) => doc({ id: 9, number: 'KS 1', date: '2026-09-20', docType: 'KS', original: { number: 'SF 1', date: '2026-09-10' }, lines: [{ rate: 21, net: -40, gross: -48.4 }, { rate: 9, net: -10, gross: -10.9 }], ...over });
  const r = buildIsaf(input({ sales: [doc(), ks()] }));
  assert.deepEqual(r.issues, []);
  const result = await valid(r.xml);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.match(r.xml, /<InvoiceNo>KS 1<\/InvoiceNo>[\s\S]*?<InvoiceType>KS<\/InvoiceType>/);
  assert.match(r.xml, /<References><Reference><ReferenceNo>SF 1<\/ReferenceNo><ReferenceDate>2026-09-10<\/ReferenceDate><\/Reference><\/References>/);
  assert.match(r.xml, /<TaxableValue>-40\.00<\/TaxableValue><TaxCode>PVM1<\/TaxCode><TaxPercentage>21<\/TaxPercentage><Amount>-8\.40<\/Amount>/);
  assert.match(r.xml, /<TaxableValue>-10\.00<\/TaxableValue><TaxCode>PVM2<\/TaxCode><TaxPercentage>9<\/TaxPercentage><Amount>-0\.90<\/Amount>/);
  for (const [label, sale] of [['no original', ks({ original: null })], ['positive amounts', ks({ lines: [{ rate: 21, net: 40, gross: 48.4 }] })], ['mixed signs', ks({ lines: [{ rate: 21, net: -40, gross: -48.4 }, { rate: 21, net: 10, gross: 12.1 }] })], ['zero VAT', ks({ lines: [{ rate: 0, net: -40, gross: -40 }] })]]) {
    const blocked = buildIsaf(input({ sales: [sale] }));
    assert.equal(blocked.xml, null, label); assert.ok(blocked.issues.length, label);
  }
  // a purchase credit note is not supported: negative purchase lines stay refused
  assert.equal(buildIsaf(input({ sales: [], purchases: [ks({ docType: null })] })).xml, null);
});

test('unclassifiable documents block the export instead of guessing', () => {
  const blocked = over => buildIsaf(input(over));
  for (const [label, over] of [
    ['zero-rate line', { sales: [doc({ lines: [{ rate: 0, net: 100, gross: 100 }] })] }],
    ['unknown rate', { sales: [doc({ lines: [{ rate: 7, net: 100, gross: 107 }] })] }],
    ['foreign VAT code', { sales: [doc({ vatCode: 'LV40003009497' })] }],
    ['foreign private person', { sales: [doc({ vatCode: '', country: 'Latvija' })] }],
    ['negative amounts', { sales: [doc({ lines: [{ rate: 21, net: -100, gross: -121 }] })] }],
    ['taxed purchase from a supplier without VAT code', { purchases: [doc({ id: 7, number: 'P-7', vatCode: '', code: '300' })] }],
    ['duplicate number', { sales: [doc(), doc({ id: 2 })] }],
    ['bad company code', { company: { name: 'A', code: 'ABC', vatCode: 'LT1' } }],
    ['period before i.SAF', { period: { start: '2016-01-01', end: '2016-01-31' } }],
  ]) {
    const r = blocked(over);
    assert.equal(r.xml, null, label);
    assert.ok(r.issues.length, label);
  }
  assert.ok(buildIsaf(input({ sales: [doc({ lines: [{ rate: 21, net: -100, gross: -121 }] })] })).issues.some(i => /tik kreditiniame dokumente/.test(i)));
  assert.ok(buildIsaf(input()).xml);
});

test('documents outside the period are excluded', () => {
  const r = buildIsaf(input({ sales: [doc(), doc({ id: 2, number: 'SF 2', date: '2026-10-02' })] }));
  assert.match(r.xml, /SF 1/); assert.doesNotMatch(r.xml, /SF 2/);
});

test('route exports only the active company and refuses non-PVM or mixed periods', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'isaf@example.test','I','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 }));
    const route = require('../src/app/api/tax-reports/isaf/route.ts');
    const get = (company, start = '2026-09-01', end = '2026-09-30') => { jar.set('active_company_id', String(company)); return route.GET(new Request(`http://localhost:3000/api/tax-reports/isaf?start=${start}&end=${end}`)); };
    db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,createdAt,updatedAt) VALUES(10,1,'Klientas A','300000001','LT100000000011',datetime('now'),datetime('now'))").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,createdAt,updatedAt) VALUES(11,2,'Klientas B','300000009','LT100000000099',datetime('now'),datetime('now'))").run();
    db.prepare("INSERT INTO Sale(id,companyId,series,number,saleDate,clientId,clientCode,sumWithoutVat,vat,sumWithVat,createdAt) VALUES(1,1,'SF','1','2026-09-10',10,'300000001',100,21,121,datetime('now'))").run();
    db.prepare("INSERT INTO SaleItem(saleId,itemName,vatRate,sumWithoutVat,sumWithVat) VALUES(1,'Paslauga',21,100,121)").run();
    db.prepare("INSERT INTO Sale(id,companyId,series,number,saleDate,clientId,sumWithoutVat,vat,sumWithVat,createdAt) VALUES(2,2,'SF','1','2026-09-11',11,50,10.5,60.5,datetime('now'))").run();
    db.prepare("INSERT INTO SaleItem(saleId,itemName,vatRate,sumWithoutVat,sumWithVat) VALUES(2,'Kita',21,50,60.5)").run();

    await t.test('non-PVM company gets no file', async () => {
      db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=1").run();
      const r = await get(1);
      assert.equal(r.status, 409);
      assert.equal((await r.json()).code, 'ISAF_NOT_APPLICABLE');
    });
    await t.test('PVM company exports its own documents and counterparties only', async () => {
      db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id=1").run();
      const r = await get(1);
      assert.equal(r.status, 200, await r.clone().text());
      const xml = await r.text();
      assert.equal((await valid(xml)).valid, true);
      assert.match(xml, /Klientas A/); assert.doesNotMatch(xml, /Klientas B|300000009/);
      assert.match(xml, /<InvoiceNo>SF 1<\/InvoiceNo>/);
    });
    await t.test('route exports a stored credit note with its reference to the original invoice', async () => {
      db.prepare("INSERT INTO Sale(id,companyId,series,number,saleDate,clientId,sumWithoutVat,vat,sumWithVat,docType,originalSaleId,correctionReason,createdAt) VALUES(3,1,'KS','1','2026-09-20',10,-40,-8.4,-48.4,'KS',1,'Grąžinta',datetime('now'))").run();
      db.prepare("INSERT INTO SaleItem(saleId,itemName,vatRate,sumWithoutVat,sumWithVat) VALUES(3,'Paslauga',21,-40,-48.4)").run();
      const r = await get(1);
      assert.equal(r.status, 200, await r.clone().text());
      const xml = await r.text();
      assert.equal((await valid(xml)).valid, true);
      assert.match(xml, /<InvoiceType>KS<\/InvoiceType>/); assert.match(xml, /<ReferenceNo>SF 1<\/ReferenceNo><ReferenceDate>2026-09-10<\/ReferenceDate>/);
      db.prepare('DELETE FROM SaleItem WHERE saleId=3').run(); db.prepare('DELETE FROM Sale WHERE id=3').run();
    });
    await t.test('tax regime change inside the period is refused', async () => {
      db.prepare("INSERT INTO CompanyTaxPeriod(companyId,mode,effectiveFrom) VALUES(1,'NON_VAT','2026-09-15')").run();
      const r = await get(1);
      assert.equal(r.status, 409);
    });
    await t.test('fr0600 draft is company scoped and follows the same regime rules', async () => {
      const fr = require('../src/app/api/tax-reports/fr0600/route.ts');
      const call = (company, start, end) => { jar.set('active_company_id', String(company)); return fr.GET(new Request(`http://localhost:3000/api/tax-reports/fr0600?start=${start}&end=${end}`)); };
      db.prepare("DELETE FROM CompanyTaxPeriod").run();
      const ok = await call(1, '2026-09-01', '2026-09-30'); assert.equal(ok.status, 200);
      const body = await ok.json();
      assert.equal(body.draft.fields.f11, 100); assert.equal(body.draft.fields.f29, 21); assert.equal(body.draft.fields.f36, 21);
      assert.equal(body.dueDate, '2026-10-25');
      const other = await (await call(2, '2026-09-01', '2026-09-30')).json();
      assert.equal(other.draft.fields.f11, 50); assert.equal(other.draft.fields.f29, 10.5);
      db.prepare("INSERT INTO CompanyTaxPeriod(companyId,mode,effectiveFrom) VALUES(1,'NON_VAT','2026-09-15')").run();
      assert.equal((await call(1, '2026-09-01', '2026-09-30')).status, 409);
      assert.equal((await call(1, '2026-13-01', '2026-09-30')).status, 400);
    });
    await t.test('bad period is rejected', async () => {
      assert.equal((await get(1, '2026-13-01', '2026-09-30')).status, 400);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
