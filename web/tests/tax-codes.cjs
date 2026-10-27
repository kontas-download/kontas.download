const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const { reportMissingXsd, validateIsaf } = require('./helpers/isaf-xsd.cjs');
reportMissingXsd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-taxcodes-'));
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
const { fr0600Draft } = require('../src/lib/fr0600.ts');
const { TAX_CODES, taxCodeSide, codesFor } = require('../src/lib/tax-codes.ts');
const { vatOnNetCents } = require('../src/lib/money.ts');
const db = getDb();

const valid = validateIsaf;
const doc = (over = {}) => ({ id: 1, number: 'SF 1', date: '2026-09-10', clientId: 5, name: 'Klientas', code: '300000001', vatCode: 'LT100000000011', country: '', lines: [{ rate: 21, net: 100, gross: 121 }], ...over });
const input = (over = {}) => ({ company: { name: 'A', code: '111111111', vatCode: 'LT111111119' }, period: { start: '2026-09-01', end: '2026-09-30' }, sales: [], purchases: [], software: { company: 'P', name: 'P', version: '1' }, now: new Date('2026-10-01T10:00:00Z'), ...over });
const eu = (over = {}) => doc({ name: 'SIA Latvija', code: '', vatCode: 'LV40003009497', ...over });
const zero = (net, taxCode) => ({ rate: 0, net, gross: net, taxCode });

test('catalogue: titles in three languages, kinds, rates and the VMI FR0600 mapping', () => {
  const codes = new Set();
  for (const def of TAX_CODES) {
    assert.ok(!codes.has(def.code), def.code); codes.add(def.code);
    assert.match(def.code, /^(PVM\d+|EXCLUDED)$/);
    for (const lang of ['lt', 'ru', 'en']) assert.ok(def.title[lang]?.trim(), `${def.code} ${lang}`);
    assert.ok(def.sale || def.purchase, def.code);
    for (const side of [def.sale, def.purchase].filter(Boolean)) {
      assert.ok(side.rate === null || typeof side.rate === 'number');
      if (side.isaf === 'manual') assert.ok(side.reason, def.code);
    }
  }
  const S = c => taxCodeSide(c, 'SALE'), P = c => taxCodeSide(c, 'PURCHASE');
  const map = side => [side.base.join(','), side.vatFields.join(',')];
  // Sales: VMI table "FR0600 + i.SAF kodas".
  for (const [code, rate, base, vat] of [['PVM1', 21, 'f11', 'f29'], ['PVM58', 12, 'f11', 'f29a'], ['PVM2', 9, 'f11', 'f30'], ['PVM3', 5, 'f11', 'f31'], ['PVM25', null, 'f12', ''], ['PVM13', 0, 'f18', ''], ['PVM19', null, 'f20', ''], ['PVM12', 0, 'f17', ''], ['PVM5', null, 'f13', ''],
    ['PVM32', 21, 'f16', 'f29'], ['PVM52', 9, 'f16', 'f30'], ['PVM53', 5, 'f16', 'f31'], ['PVM33', 0, 'f16', ''], ['PVM14', 0, 'f19', ''], ['PVM15', null, 'f20', ''], ['PVM34', null, 'f20', ''], ['PVM9', 21, 'f15', 'f29,f25'],
    ['PVM6', 21, 'f14', 'f29'], ['PVM59', 12, 'f14', 'f29a'], ['PVM7', 9, 'f14', 'f30'], ['PVM8', 5, 'f14', 'f31']]) {
    assert.deepEqual([S(code).rate, ...map(S(code))], [rate, base, vat], code);
  }
  assert.equal(S('PVM13').fr0564.field, '13'); assert.equal(S('PVM19').fr0564.field, '14'); assert.equal(S('PVM15').fr0564.field, '18'); assert.equal(S('PVM34').fr0564.field, '18');
  assert.equal(S('PVM58').from, '2026-01-01'); assert.equal(S('PVM59').from, '2026-01-01'); assert.ok(S('PVM9').deductible);
  // Purchases.
  for (const [code, rate, base, vat] of [['PVM1', 21, '', 'f25'], ['PVM58', 12, '', 'f25'], ['PVM2', 9, '', 'f25'], ['PVM3', 5, '', 'f25'], ['PVM25', 21, '', 'f25,f33'], ['PVM26', 9, '', 'f25,f33'], ['PVM27', 5, '', 'f25,f33'], ['PVM14', 0, '', ''],
    ['PVM32', 21, '', ''], ['PVM52', 9, '', ''], ['PVM53', 5, '', ''], ['PVM33', 0, '', ''], ['PVM16', 21, 'f21', 'f25,f34'], ['PVM17', 9, 'f21', 'f25,f34'], ['PVM18', 5, 'f21', 'f25,f34'],
    ['PVM21', 21, 'f23,f24', 'f25,f32'], ['PVM20', 21, 'f23', 'f25,f32'], ['PVM43', 21, '', 'f25,f32'], ['PVM44', 9, '', 'f25,f32'], ['PVM45', 5, '', 'f25,f32'], ['PVM60', 12, 'f23', 'f25,f32'], ['PVM19', null, 'f22', '']]) {
    assert.deepEqual([P(code).rate, ...map(P(code))], [rate, base, vat], code);
  }
  assert.deepEqual(P('PVM60').baseIfEuParty, ['f24']); assert.equal(P('PVM60').from, '2026-01-01');
  for (const code of ['PVM25', 'PVM26', 'PVM27', 'PVM16', 'PVM17', 'PVM18', 'PVM20', 'PVM21', 'PVM43', 'PVM44', 'PVM45', 'PVM60']) assert.equal(P(code).vat, 'selfAssessed', code);
  assert.equal(P('EXCLUDED').isaf, 'excluded'); assert.equal(S('EXCLUDED'), undefined); assert.ok(!codesFor('SALE').includes('PVM16'));
  for (const code of ['PVM25', 'PVM19', 'PVM32', 'PVM33', 'PVM52', 'PVM53', 'PVM9', 'PVM6', 'PVM7', 'PVM8', 'PVM59']) assert.equal(S(code).isaf, 'manual', code);
  assert.equal(vatOnNetCents(1005, 21), 211); assert.equal(vatOnNetCents(-1005, 21), -211); assert.equal(vatOnNetCents(250, 9), 23);
});

test('i.SAF with explicit codes validates against the XSD and follows the VMI rules', async () => {
  const r = buildIsaf(input({
    sales: [
      eu({ lines: [zero(1000, 'PVM13'), { rate: 21, net: 10, gross: 12.1, taxCode: 'PVM1' }] }),
      doc({ id: 2, number: 'SF 2', clientId: 6, name: 'Acme Inc', code: 'US-1', vatCode: '', country: 'US', lines: [zero(500, 'PVM12')] }),
      doc({ id: 3, number: 'SF 3', lines: [{ rate: null, net: 80, gross: 80, taxCode: 'PVM5' }, { rate: 21, net: 100, gross: 121 }] }),
    ],
    purchases: [
      eu({ id: 4, number: 'LV-9', clientId: 7, lines: [zero(1000, 'PVM16'), zero(10.05, 'PVM16')] }),
      doc({ id: 5, number: 'DE-1', clientId: 8, name: 'GmbH', vatCode: 'DE123456789', code: '', lines: [zero(200, 'PVM21')] }),
      doc({ id: 6, number: 'IMP-1', clientId: 9, name: 'Customs', vatCode: '', country: 'CN', lines: [zero(300, 'EXCLUDED')] }),
    ],
  }));
  assert.deepEqual(r.issues, []);
  const result = await valid(r.xml);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.match(r.xml, /<TaxableValue>1000\.00<\/TaxableValue><TaxCode>PVM13<\/TaxCode><TaxPercentage>0<\/TaxPercentage><Amount>0\.00<\/Amount>/);
  assert.match(r.xml, /<VATRegistrationNumber>LV40003009497<\/VATRegistrationNumber><Country xsi:nil="true"\/>/);
  assert.match(r.xml, /<VATRegistrationNumber>ND<\/VATRegistrationNumber><RegistrationNumber>US-1<\/RegistrationNumber><Country>US<\/Country>/);
  assert.match(r.xml, /<TaxCode>PVM5<\/TaxCode><TaxPercentage xsi:nil="true"\/><Amount>0\.00<\/Amount>/);
  // Self-assessed VAT: computed on the group total with the invoice rounding (1010.05 × 21 % = 212.11).
  assert.match(r.xml, /<TaxableValue>1010\.05<\/TaxableValue><TaxCode>PVM16<\/TaxCode><TaxPercentage>21<\/TaxPercentage><Amount>212\.11<\/Amount>/);
  assert.match(r.xml, /<TaxCode>PVM21<\/TaxCode><TaxPercentage>21<\/TaxPercentage><Amount>42\.00<\/Amount>/);
  assert.doesNotMatch(r.xml, /IMP-1|Customs/, 'excluded documents are never exported');
  assert.equal((r.xml.match(/<TaxCode>PVM1<\/TaxCode>/g) || []).length, 2);
});

test('doubtful explicit codes block the file', () => {
  const blocked = (label, over, pattern) => { const r = buildIsaf(input(over)); assert.equal(r.xml, null, label); if (pattern) assert.ok(r.issues.some(i => pattern.test(i)), `${label}: ${r.issues}`); };
  blocked('PVM13 to a Lithuanian customer', { sales: [doc({ lines: [zero(10, 'PVM13')] })] }, /leidžiamas tik kontrahentui su kitos ES šalies PVM kodu/);
  blocked('PVM12 to a Lithuanian customer', { sales: [doc({ lines: [zero(10, 'PVM12')] })] }, /užsienio kontrahentui/);
  blocked('PVM20 from an EU VAT payer', { purchases: [eu({ lines: [zero(10, 'PVM20')] })] }, /be ES PVM kodo/);
  blocked('PVM1 on a 0 % line', { sales: [doc({ lines: [zero(10, 'PVM1')] })] }, /reikalingas 21% tarifas/);
  blocked('PVM1 on a 9 % line', { sales: [doc({ lines: [{ rate: 9, net: 10, gross: 10.9, taxCode: 'PVM1' }] })] }, /reikalingas 21% tarifas/);
  blocked('0 % code with VAT', { sales: [eu({ lines: [{ rate: 21, net: 10, gross: 12.1, taxCode: 'PVM13' }] })] }, /be PVM/);
  blocked('self-assessed code with supplier VAT', { purchases: [eu({ lines: [{ rate: 21, net: 10, gross: 12.1, taxCode: 'PVM16' }] })] }, /apskaičiuoja pirkėjas/);
  blocked('purchase code on a sale', { sales: [eu({ lines: [zero(10, 'PVM16')] })] }, /netaikomas pardavimams/);
  blocked('PVM58 before 2026', { period: { start: '2025-09-01', end: '2025-09-30' }, sales: [doc({ date: '2025-09-10', lines: [{ rate: 12, net: 10, gross: 11.2, taxCode: 'PVM58' }] })] }, /tik nuo 2026-01-01/);
  blocked('margin code', { sales: [doc({ lines: [zero(10, 'PVM32')] })] }, /automatiškai neeksportuojamas/);
  blocked('domestic reverse charge on a sale', { sales: [doc({ lines: [zero(10, 'PVM25')] })] }, /automatiškai neeksportuojamas/);
  blocked('negative coded line outside a credit note', { sales: [eu({ lines: [zero(-10, 'PVM13')] })] }, /tik kreditiniame dokumente/);
  blocked('zero net', { sales: [eu({ lines: [zero(0, 'PVM13')] })] }, /nuline verte/);
  blocked('foreign party without ISO country', { sales: [doc({ vatCode: '', country: 'Amerika', lines: [zero(10, 'PVM12')] })] }, /ISO 3166/);
  blocked('mixed excluded and exported lines', { purchases: [eu({ lines: [zero(10, 'EXCLUDED'), zero(10, 'PVM16')] })] }, /dalis eilučių neįtraukta/);
  blocked('uncoded line still needs a Lithuanian party', { sales: [eu({ lines: [zero(10, 'PVM13'), { rate: 21, net: 10, gross: 12.1 }] })] }, /užsienio PVM kodu/);
});

test('credit note reversing a coded sale keeps the negative-sign rule', async () => {
  const ks = eu({ id: 9, number: 'KS 1', date: '2026-09-20', docType: 'KS', original: { number: 'SF 1', date: '2026-09-10' }, lines: [zero(-400, 'PVM13')] });
  const r = buildIsaf(input({ sales: [eu({ lines: [zero(1000, 'PVM13')] }), ks] }));
  assert.deepEqual(r.issues, []);
  assert.equal((await valid(r.xml)).valid, true);
  assert.match(r.xml, /<TaxableValue>-400\.00<\/TaxableValue><TaxCode>PVM13<\/TaxCode><TaxPercentage>0<\/TaxPercentage><Amount>0\.00<\/Amount>/);
  assert.equal(buildIsaf(input({ sales: [eu({ ...ks, lines: [zero(400, 'PVM13')] })] })).xml, null);
  const d = fr0600Draft([eu({ lines: [zero(1000, 'PVM13')] }), ks], []);
  assert.equal(d.extended.f18, 600); assert.equal(d.fr0564.f13, 600);
});

test('FR0600 sums of coded lines: EU supply, export, reverse charge with computed VAT, margin', () => {
  const sales = [
    doc({ lines: [{ rate: 21, net: 100, gross: 121 }] }),
    eu({ id: 2, number: 'SF 2', lines: [zero(1000, 'PVM13')] }),
    doc({ id: 3, number: 'SF 3', vatCode: '', country: 'US', lines: [zero(500, 'PVM12')] }),
    eu({ id: 4, number: 'SF 4', lines: [{ rate: null, net: 70, gross: 70, taxCode: 'PVM15' }] }),
    doc({ id: 5, number: 'SF 5', lines: [zero(300, 'PVM32')] }),
  ];
  const purchases = [
    eu({ id: 6, number: 'P1', deductibleVat: 0, lines: [zero(1000, 'PVM16')] }),
    doc({ id: 7, number: 'P2', vatCode: 'DE1', deductibleVat: 0, lines: [zero(200, 'PVM21')] }),
    doc({ id: 8, number: 'P3', deductibleVat: 0, lines: [zero(100.05, 'PVM25')] }),
    doc({ id: 9, number: 'P4', deductibleVat: 21, lines: [{ rate: 21, net: 100, gross: 121, taxCode: 'PVM1' }] }),
    eu({ id: 10, number: 'P5', deductibleVat: 0, lines: [zero(50, 'PVM60')] }),
  ];
  const d = fr0600Draft(sales, purchases);
  assert.deepEqual(d.fields, { f11: 100, f25: 300.01, f29: 21, f29a: 0, f30: 0, f31: 0, f35: 21, f36: null }, 'field 36 is left to EDS when 32–34 are filled');
  assert.equal(d.extended.f18, 1000); assert.equal(d.extended.f17, 500); assert.equal(d.extended.f20, 70);
  assert.equal(d.extended.f21, 1000); assert.equal(d.extended.f34, 210);
  assert.equal(d.extended.f23, 250); assert.equal(d.extended.f24, 250); assert.equal(d.extended.f32, 48);
  assert.equal(d.extended.f33, 21.01); assert.equal(d.extended.f16, 0, 'margin is not derived from the invoice');
  assert.deepEqual(d.computed.map(c => [c.code, c.vat]), [['PVM16', 210], ['PVM21', 42], ['PVM25', 21.01], ['PVM60', 6]]);
  assert.ok(d.manual.some(m => /SF 5: PVM32/.test(m)));
  assert.equal(d.unreviewed.length, 4, 'deduction of self-assessed VAT is never assumed');
  assert.equal(d.fr0564.f13, 1000); assert.equal(d.fr0564.f18, 70);
  assert.ok(d.notes.some(n => /EDS/.test(n))); assert.ok(d.notes.some(n => /FR0564: 13 laukas/.test(n)));
  assert.equal(d.complete, false);
  // Documents that need no explicit code give exactly the old result.
  const plain = fr0600Draft([doc()], [doc({ id: 2, number: 'P', deductibleVat: 21 })]);
  assert.deepEqual(plain.fields, { f11: 100, f25: 21, f29: 21, f29a: 0, f30: 0, f31: 0, f35: 21, f36: 0 });
  assert.ok(Object.values(plain.extended).every(v => v === 0)); assert.deepEqual(plain.notes, []);
});

test('stored codes: scope, allowed set, audit, clean-up and the API', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'t@example.test','T','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1").run();
    db.prepare("INSERT INTO Client(id,companyId,name,code,vatCode,createdAt,updatedAt) VALUES(10,1,'SIA Latvija','','LV40003009497',datetime('now'),datetime('now')),(11,1,'UAB LT','300000001','LT100000000011',datetime('now'),datetime('now')),(12,2,'Kitas','1','LT1',datetime('now'),datetime('now'))").run();
    db.prepare("INSERT INTO Sale(id,companyId,series,number,saleDate,clientId,sumWithoutVat,vat,sumWithVat,createdAt) VALUES(1,1,'SF','1','2026-09-10',10,1000,0,1000,datetime('now')),(2,1,'SF','2','2026-09-11',11,100,21,121,datetime('now')),(3,2,'SF','1','2026-09-10',12,50,0,50,datetime('now'))").run();
    db.prepare("INSERT INTO SaleItem(id,saleId,itemName,vatRate,sumWithoutVat,sumWithVat) VALUES(1,1,'Prekės',0,1000,1000),(2,2,'Paslauga',21,100,121),(3,3,'Svetima',0,50,50)").run();
    db.prepare("INSERT INTO Purchase(id,companyId,series,number,purchaseDate,clientId,sumWithoutVat,vat,sumWithVat,deductibleVat,createdAt) VALUES(1,1,'','LV-7','2026-09-12',10,200,0,200,0,datetime('now'))").run();
    db.prepare("INSERT INTO PurchaseItem(id,purchaseId,itemName,vatRate,sumWithoutVat,sumWithVat) VALUES(1,1,'Medžiagos',0,200,200)").run();

    await t.test('database triggers', () => {
      assert.throws(() => db.prepare("INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,updatedAt) VALUES(1,'SALE',3,'PVM13',0)").run(), /TAX_CODE_ITEM_SCOPE/);
      assert.throws(() => db.prepare("INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,updatedAt) VALUES(1,'SALE',1,'PVM16',0)").run(), /TAX_CODE_NOT_ALLOWED/);
      assert.throws(() => db.prepare("INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,updatedAt) VALUES(1,'OTHER',1,'PVM13',0)").run());
      db.prepare("INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,updatedAt) VALUES(1,'SALE',1,'PVM13',0)").run();
      assert.throws(() => db.prepare("UPDATE TaxLineCode SET itemId=2 WHERE itemId=1").run(), /TAX_CODE_KEY_IMMUTABLE/);
      db.prepare("DELETE FROM TaxLineCode").run();
    });

    const route = require('../src/app/api/tax-reports/line-codes/route.ts');
    const isaf = require('../src/app/api/tax-reports/isaf/route.ts');
    const fr = require('../src/app/api/tax-reports/fr0600/route.ts');
    const get = () => route.GET(new Request('http://localhost:3000/api/tax-reports/line-codes?start=2026-09-01&end=2026-09-30'));
    const put = (body, headers = {}) => route.PUT(new Request('http://localhost:3000/api/tax-reports/line-codes', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));

    await t.test('API lists lines without an automatic code and blocks the export until coded', async () => {
      const body = await (await get()).json();
      assert.deepEqual(body.lines.map(l => [l.kind, l.itemId, l.taxCode]), [['SALE', 1, null], ['PURCHASE', 1, null]]);
      assert.equal((await isaf.GET(new Request('http://localhost:3000/api/tax-reports/isaf?start=2026-09-01&end=2026-09-30'))).status, 409);
    });
    await t.test('PUT validates, is company scoped and records history', async () => {
      assert.equal((await put({ items: [{ kind: 'SALE', itemId: 1, taxCode: 'PVM16' }] })).status, 400);
      assert.equal((await put({ items: [{ kind: 'X', itemId: 1, taxCode: 'PVM13' }] })).status, 400);
      assert.equal((await put({ items: [] })).status, 400);
      assert.equal((await put({ items: [{ kind: 'SALE', itemId: 3, taxCode: 'PVM13' }] })).status, 404, 'line of another company');
      assert.equal((await put({ items: [{ kind: 'SALE', itemId: 1, taxCode: 'PVM13' }] }, { origin: 'https://evil.example' })).status, 403);
      const ok = await put({ items: [{ kind: 'SALE', itemId: 1, taxCode: 'PVM13', note: 'CMR' }, { kind: 'PURCHASE', itemId: 1, taxCode: 'PVM16' }] });
      assert.equal(ok.status, 200); assert.equal((await ok.json()).changed, 2);
      assert.equal((await (await put({ items: [{ kind: 'SALE', itemId: 1, taxCode: 'PVM13', note: 'CMR' }] })).json()).changed, 0, 'no-op is not rewritten');
      const audit = db.prepare("SELECT entity,recordId,action,actorId FROM AccountingAudit WHERE entity IN ('SaleTaxCode','PurchaseTaxCode') AND actorId IS NOT NULL ORDER BY id").all();
      assert.deepEqual(audit.map(a => [a.entity, a.recordId, a.action, a.actorId]), [['SaleTaxCode', 1, 'INSERT', 1], ['PurchaseTaxCode', 1, 'INSERT', 1]]);
      // The document is unchanged.
      assert.deepEqual(db.prepare('SELECT sumWithoutVat,vat,sumWithVat FROM Sale WHERE id=1').get(), { sumWithoutVat: 1000, vat: 0, sumWithVat: 1000 });
      jar.set('active_company_id', '2');
      assert.equal((await (await get()).json()).lines.every(l => l.itemId === 3), true);
      jar.set('active_company_id', '1');
    });
    await t.test('coded period exports a valid file and an FR0600 draft', async () => {
      const r = await isaf.GET(new Request('http://localhost:3000/api/tax-reports/isaf?start=2026-09-01&end=2026-09-30'));
      assert.equal(r.status, 200, await r.clone().text());
      const xml = await r.text();
      assert.equal((await valid(xml)).valid, true);
      assert.match(xml, /<TaxCode>PVM13<\/TaxCode>/); assert.match(xml, /<TaxCode>PVM16<\/TaxCode><TaxPercentage>21<\/TaxPercentage><Amount>42\.00<\/Amount>/);
      const draft = (await (await fr.GET(new Request('http://localhost:3000/api/tax-reports/fr0600?start=2026-09-01&end=2026-09-30'))).json()).draft;
      assert.equal(draft.extended.f18, 1000); assert.equal(draft.extended.f21, 200); assert.equal(draft.extended.f34, 42); assert.equal(draft.fields.f11, 100);
    });
    await t.test('clearing and deleting a line remove the code', async () => {
      assert.equal((await (await put({ items: [{ kind: 'PURCHASE', itemId: 1, taxCode: null }] })).json()).changed, 1);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM AccountingAudit WHERE entity='PurchaseTaxCode' AND action='DELETE'").get().n, 1);
      db.prepare('DELETE FROM SaleItem WHERE id=1').run();
      assert.equal(db.prepare('SELECT COUNT(*) n FROM TaxLineCode').get().n, 0);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});

// Every exportable code through the XSD, with the expected TaxPercentage and Amount written out by hand.
test('every exportable code: XSD-valid file with the expected TaxPercentage and Amount', async () => {
  const NIL = null;
  const expected = {
    SALE: { PVM1: ['21', '21.00'], PVM58: ['12', '12.00'], PVM2: ['9', '9.00'], PVM3: ['5', '5.00'], PVM5: [NIL, '0.00'], PVM12: ['0', '0.00'], PVM13: ['0', '0.00'], PVM14: ['0', '0.00'], PVM15: [NIL, '0.00'], PVM34: [NIL, '0.00'] },
    PURCHASE: { PVM1: ['21', '21.00'], PVM58: ['12', '12.00'], PVM2: ['9', '9.00'], PVM3: ['5', '5.00'], PVM14: ['0', '0.00'], PVM16: ['21', '21.00'], PVM17: ['9', '9.00'], PVM18: ['5', '5.00'], PVM20: ['21', '21.00'], PVM21: ['21', '21.00'], PVM25: ['21', '21.00'], PVM26: ['9', '9.00'], PVM27: ['5', '5.00'], PVM43: ['21', '21.00'], PVM44: ['9', '9.00'], PVM45: ['5', '5.00'], PVM60: ['12', '12.00'] },
  };
  const party = { LT: {}, ANY: {}, EU_VAT: { vatCode: 'LV40003009497', code: '' }, FOREIGN: { vatCode: '', country: 'US', code: 'US-1' }, NON_EU_VAT: { vatCode: '', country: 'US', code: 'US-1' } };
  for (const kind of ['SALE', 'PURCHASE']) {
    const exported = TAX_CODES.filter(d => (kind === 'SALE' ? d.sale : d.purchase)?.isaf === 'export').map(d => d.code).sort();
    assert.deepEqual(exported, Object.keys(expected[kind]).sort(), `${kind}: exported codes and the expectation table differ`);
    for (const code of exported) {
      const side = taxCodeSide(code, kind);
      const line = side.vat === 'charged' ? { rate: side.rate, net: 100, gross: 100 + side.rate, taxCode: code } : { rate: 0, net: 100, gross: 100, taxCode: code };
      const d = doc({ ...party[side.party], lines: [line] });
      const r = buildIsaf(input(kind === 'SALE' ? { sales: [d] } : { purchases: [d] }));
      assert.deepEqual(r.issues, [], `${kind} ${code}`);
      const result = await valid(r.xml);
      assert.equal(result.valid, true, `${kind} ${code}: ${JSON.stringify(result.errors)}`);
      const [pct, amount] = expected[kind][code];
      const pctXml = pct === null ? '<TaxPercentage xsi:nil="true"/>' : `<TaxPercentage>${pct}</TaxPercentage>`;
      assert.ok(r.xml.includes(`<TaxableValue>100.00</TaxableValue><TaxCode>${code}</TaxCode>${pctXml}<Amount>${amount}</Amount>`), `${kind} ${code}`);
      // Negative cases for the same code: VAT on a document where the code forbids it, a missing VAT where it is required,
      // and a positive line in a credit note.
      const wrong = side.vat === 'charged' ? { rate: 0, net: 100, gross: 100, taxCode: code } : { rate: 21, net: 100, gross: 121, taxCode: code };
      assert.equal(buildIsaf(input(kind === 'SALE' ? { sales: [doc({ ...party[side.party], lines: [wrong] })] } : { purchases: [doc({ ...party[side.party], lines: [wrong] })] })).xml, null, `${kind} ${code} wrong VAT`);
      const ks = doc({ ...party[side.party], docType: 'KS', original: { number: 'SF 0', date: '2026-09-01' }, lines: [line] });
      assert.equal(buildIsaf(input(kind === 'SALE' ? { sales: [ks] } : { purchases: [ks] })).xml, null, `${kind} ${code} positive credit note`);
    }
  }
});

// FR0600 applies the counterparty rules of the i.SAF export.
test('FR0600 refuses codes that do not fit the counterparty, like i.SAF', () => {
  const lt = doc({ lines: [zero(1000, 'PVM13')] });
  const ltExport = doc({ id: 2, number: 'SF 2', lines: [zero(500, 'PVM12')] });
  const euServices = eu({ id: 3, number: 'P1', deductibleVat: 0, lines: [zero(1000, 'PVM20')] });
  const d = fr0600Draft([lt, ltExport], [euServices]);
  assert.equal(d.complete, false);
  assert.equal(d.extended.f18, 0); assert.equal(d.extended.f17, 0); assert.equal(d.extended.f23, 0); assert.equal(d.fields.f25, 0);
  assert.ok(d.manual.some(m => /SF 1: kodas PVM13/.test(m))); assert.ok(d.manual.some(m => /SF 2: kodas PVM12/.test(m))); assert.ok(d.manual.some(m => /P1: kodas PVM20/.test(m)));
  assert.equal(buildIsaf(input({ sales: [lt] })).xml, null);
});

// Field 36 is not guessed when VAT calculated by the buyer is present.
test('FR0600 field 36 is null with a note when fields 32-34 are filled', () => {
  const d = fr0600Draft([], [eu({ id: 3, number: 'DE-1', vatCode: 'DE123456789', deductibleVat: 0, lines: [zero(1000, 'PVM21')] })]);
  assert.equal(d.fields.f25, 210); assert.equal(d.extended.f32, 210); assert.equal(d.fields.f36, null);
  assert.ok(d.notes.some(n => /36 laukas čia neskaičiuojamas/.test(n)));
  assert.equal(fr0600Draft([doc()], []).fields.f36, 21);
});

// FR0600 leaves foreign suppliers without a VAT code and wrongly coded purchases for manual review.
test('FR0600: foreign supplier without a VAT code and wrongly coded ordinary purchases are not summed', () => {
  const foreign = doc({ id: 4, number: 'US-1', vatCode: '', country: 'US', deductibleVat: 0, lines: [zero(300)] });
  const d = fr0600Draft([], [foreign]);
  assert.equal(d.complete, false); assert.ok(d.manual.some(m => /US-1: užsienio tiekėjas be PVM kodo/.test(m)));
  const wrongRate = doc({ id: 5, number: 'P-9', deductibleVat: 0.9, lines: [{ rate: 9, net: 10, gross: 10.9, taxCode: 'PVM1' }] });
  const w = fr0600Draft([], [wrongRate]);
  assert.equal(w.fields.f25, 0); assert.equal(w.fields.f35, 0); assert.ok(w.manual.some(m => /P-9: kodui PVM1 reikalingas 21% tarifas/.test(m)));
  // a domestic purchase without VAT and without a code (a non-VAT payer supplier) stays as before
  assert.equal(fr0600Draft([], [doc({ id: 6, number: 'NP', deductibleVat: 0, lines: [zero(50)] })]).complete, true);
});

// A document marked for review blocks both outputs.
test('a document whose codes were dropped by an edit is refused by i.SAF and FR0600', () => {
  const marked = doc({ codesDropped: JSON.stringify([{ itemName: 'Prekės', taxCode: 'PVM13' }]) });
  const r = buildIsaf(input({ sales: [marked] }));
  assert.equal(r.xml, null); assert.ok(r.issues.some(i => /pašalinti i.SAF kodai \(Prekės: PVM13\)/.test(i)));
  const d = fr0600Draft([marked], []);
  assert.equal(d.fields.f11, 0); assert.ok(d.manual.some(m => /pašalinti i.SAF kodai/.test(m)));
});
