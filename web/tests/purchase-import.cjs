const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-ubl-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'UAB Pirkėjas', '111111111', 'LT111111119');
company.run(2, 'UAB Kita', '222222222', 'LT222222229');
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
const { parseUblInvoice } = require('../src/lib/ubl-invoice.ts');
const db = getDb();
const request = (method, body) => new Request('http://localhost:3000/api/test', { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

const line = (id, name, qty, price, net, pct, cat = 'S') => `<cac:InvoiceLine><cbc:ID>${id}</cbc:ID><cbc:InvoicedQuantity unitCode="C62">${qty}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="EUR">${net}</cbc:LineExtensionAmount><cac:Item><cbc:Name>${name}</cbc:Name><cac:SellersItemIdentification><cbc:ID>SKU-${id}</cbc:ID></cac:SellersItemIdentification><cac:ClassifiedTaxCategory><cbc:ID>${cat}</cbc:ID><cbc:Percent>${pct}</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="EUR">${price}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`;
const invoice = (over = {}) => {
  const o = { number: 'TIEK-100', type: '380', currency: 'EUR', buyerVat: 'LT111111119', buyerCode: '111111111', supplierName: 'UAB Tiekėjas &amp; Ko', supplierCode: '300000001', supplierVat: 'LT100000000011', lines: [line(1, 'Biuro popierius', 10, '2.50', '25.00', 21), line(2, 'Knyga', 2, '7.50', '15.00', 9)], net: '40.00', tax: '6.60', gross: '46.60', root: 'Invoice', extra: '', ...over };
  return `<?xml version="1.0" encoding="UTF-8"?><${o.root} xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"><cbc:ID>${o.number}</cbc:ID><cbc:IssueDate>2026-10-20</cbc:IssueDate><cbc:DueDate>2026-11-03</cbc:DueDate><cbc:InvoiceTypeCode>${o.type}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>${o.currency}</cbc:DocumentCurrencyCode>${o.extra}<cac:AccountingSupplierParty><cac:Party><cac:PartyName><cbc:Name>${o.supplierName}</cbc:Name></cac:PartyName><cac:PartyTaxScheme><cbc:CompanyID>${o.supplierVat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>${o.supplierName}</cbc:RegistrationName><cbc:CompanyID>${o.supplierCode}</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty><cac:AccountingCustomerParty><cac:Party><cac:PartyTaxScheme><cbc:CompanyID>${o.buyerVat}</cbc:CompanyID></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>UAB Pirkėjas</cbc:RegistrationName><cbc:CompanyID>${o.buyerCode}</cbc:CompanyID></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty><cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${o.tax}</cbc:TaxAmount></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${o.net}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${o.net}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${o.gross}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${o.gross}</cbc:PayableAmount></cac:LegalMonetaryTotal>${o.lines.join('')}</${o.root}>`;
};

// Credit note: CreditNote root, CreditNoteLine/CreditedQuantity, BillingReference to the original invoice.
const reference = (number, date) => `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${number}</cbc:ID>${date ? `<cbc:IssueDate>${date}</cbc:IssueDate>` : ''}</cac:InvoiceDocumentReference></cac:BillingReference>`;
const creditNote = (over = {}) => {
  const { ref = reference('TIEK-100', '2026-10-20'), date = '2026-10-20', ...rest } = over;
  const xml = invoice({ root: 'CreditNote', type: '381', number: 'KR-1', lines: [line(1, 'Biuro popierius', 4, '2.50', '10.00', 21)], net: '10.00', tax: '2.10', gross: '12.10', extra: ref, ...rest });
  return xml.replace(/InvoiceTypeCode/g, 'CreditNoteTypeCode').replace(/InvoiceLine/g, 'CreditNoteLine').replace(/InvoicedQuantity/g, 'CreditedQuantity').replace('<cbc:IssueDate>2026-10-20</cbc:IssueDate>', `<cbc:IssueDate>${date}</cbc:IssueDate>`);
};

test('UBL parser maps a valid invoice and refuses what it cannot map', () => {
  const ok = parseUblInvoice(invoice());
  assert.deepEqual(ok.issues, []);
  const inv = ok.invoice;
  assert.equal(inv.number, 'TIEK-100'); assert.equal(inv.supplier.name, 'UAB Tiekėjas & Ko'); assert.equal(inv.supplier.regNumber, '300000001'); assert.equal(inv.supplier.vatCode, 'LT100000000011');
  assert.equal(inv.lines.length, 2); assert.equal(inv.lines[0].unitPrice, 2.5); assert.equal(inv.lines[1].rate, 9); assert.equal(inv.totals.gross, 46.6); assert.equal(inv.dueDate, '2026-11-03');
  const refused = {
    'credit note root with invoice type': invoice({ root: 'CreditNote' }), 'debit note type': invoice({ type: '383' }), 'credit note foreign currency': creditNote({ currency: 'USD' }),
    'credit note two references': creditNote({ ref: reference('A-1') + reference('A-2') }), 'credit note empty reference': creditNote({ ref: '<cac:BillingReference><cac:InvoiceDocumentReference><cbc:IssueDate>2026-10-20</cbc:IssueDate></cac:InvoiceDocumentReference></cac:BillingReference>' }),
    'credit note negative line': creditNote({ lines: [line(1, 'x', 1, '-5.00', '-5.00', 21)], net: '-5.00', tax: '-1.05', gross: '-6.05' }), 'credit note doctype': creditNote().replace('<CreditNote', '<!DOCTYPE a [<!ENTITY x "y">]><CreditNote'), 'foreign currency': invoice({ currency: 'USD' }),
    'line sum mismatch': invoice({ net: '41.00', gross: '47.60' }), 'gross mismatch': invoice({ gross: '47.00' }),
    'reverse charge': invoice({ lines: [line(1, 'x', 1, '10.00', '10.00', 0, 'AE')], net: '10.00', tax: '0.00', gross: '10.00' }),
    'document allowance': invoice({ extra: '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount>1</cbc:Amount></cac:AllowanceCharge>' }),
    'no lines': invoice({ lines: [], net: '0.00', tax: '0.00', gross: '0.00' }),
    'doctype': '<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY x "y">]><Invoice><ID>1</ID></Invoice>', 'not xml': 'hello', 'not an invoice': '<Order><ID>1</ID></Order>', 'empty': '  ',
  };
  const cr = parseUblInvoice(creditNote());
  assert.deepEqual(cr.issues, []); assert.equal(cr.invoice.kind, 'credit'); assert.deepEqual(cr.invoice.reference, { number: 'TIEK-100', issueDate: '2026-10-20' }); assert.equal(cr.invoice.lines[0].quantity, 4); assert.equal(cr.invoice.totals.gross, 12.1);
  assert.equal(parseUblInvoice(creditNote({ ref: '' })).invoice.reference, null);
  assert.equal(parseUblInvoice(invoice({ type: '381' })).invoice.kind, 'credit'); // Invoice root with type 381
  assert.equal(ok.invoice.kind, 'invoice');
  for (const [label, xml] of Object.entries(refused)) { const r = parseUblInvoice(xml); assert.equal(r.invoice, null, label); assert.ok(r.issues.length, label); }
});

test('XML purchase import', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'u@example.test','U','unused','admin',datetime('now'))").run();
    jar.set('auth_session', auth.createSessionToken({ id: 1 })); jar.set('active_company_id', '1');
    db.prepare("UPDATE Company SET taxMode='STANDARD_VAT',isVatPayer=1 WHERE id IN (1,2)").run();
    const route = require('../src/app/api/purchases/import-xml/route.ts');
    const post = body => route.POST(request('POST', body));
    const good = invoice();

    await t.test('dry run changes nothing; supplier must be confirmed; commit stores purchase, supplier, journal and original XML', async () => {
      const dry = await (await post({ xml: good })).json();
      assert.equal(dry.ok, true); assert.equal(dry.needsSupplier, true); assert.equal(dry.invoice.gross, 46.6);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, 0);
      assert.equal((await post({ xml: good, commit: true })).status, 409);
      const done = await post({ xml: good, commit: true, createSupplier: true, filename: 'tiek-100.xml' });
      const body = await done.json(); assert.equal(done.status, 200, JSON.stringify(body));
      const p = body.purchase;
      assert.equal(p.number, 'TIEK-100'); assert.equal(p.sumWithoutVat, 40); assert.equal(p.vat, 6.6); assert.equal(p.sumWithVat, 46.6); assert.equal(p.purchaseDate, '2026-10-20');
      assert.equal(p.deductionPercent, 100); assert.equal(p.deductibleVat, 6.6); assert.match(p.notes, /apmokėti iki 2026-11-03/);
      assert.deepEqual(body.items.map(i => [i.itemName, i.sumWithoutVat, i.vatRate]), [['Biuro popierius', 25, 21], ['Knyga', 15, 9]]);
      const client = db.prepare('SELECT * FROM Client WHERE id=?').get(p.clientId);
      assert.equal(client.name, 'UAB Tiekėjas & Ko'); assert.equal(client.code, '300000001'); assert.equal(client.vatCode, 'LT100000000011'); assert.equal(client.companyId, 1);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='PURCHASE' AND sourceId=?").get(p.id).n, 2);
      const source = db.prepare('SELECT * FROM PurchaseSource WHERE purchaseId=?').get(p.id);
      assert.equal(source.xml, good); assert.equal(source.filename, 'tiek-100.xml');
      assert.throws(() => db.prepare('UPDATE PurchaseSource SET xml=? WHERE id=?').run('x', source.id), /immutable/);
      assert.throws(() => db.prepare('DELETE FROM PurchaseSource WHERE id=?').run(source.id), /immutable/);
    });

    await t.test('the same file or the same supplier invoice number is refused; existing supplier is matched by code', async () => {
      const again = await post({ xml: good, commit: true, createSupplier: true }); const againBody = await again.json();
      assert.equal(again.status, 422); assert.ok(againBody.issues.some(i => /jau importuotas/.test(i)));
      const reworded = good.replace('Biuro popierius', 'Biuro popierius A4');
      const dup = await (await post({ xml: reworded })).json();
      assert.equal(dup.ok, false); assert.ok(dup.issues.some(i => /jau yra pirkimuose/.test(i))); assert.equal(dup.needsSupplier, false);
      const next = await (await post({ xml: invoice({ number: 'TIEK-101' }), commit: true })).json();
      assert.equal(next.committed, true); assert.equal(next.purchase.clientId, db.prepare('SELECT id FROM Client WHERE code=?').get('300000001').id);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM Client WHERE code='300000001'").get().n, 1);
    });

    await t.test('wrong buyer, rounding mismatch and bad structure are refused without side effects', async () => {
      const before = { p: db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, c: db.prepare('SELECT COUNT(*) n FROM Client').get().n, s: db.prepare('SELECT COUNT(*) n FROM PurchaseSource').get().n };
      const wrongBuyer = await post({ xml: invoice({ number: 'X-1', buyerVat: 'LT999999999', buyerCode: '999999999', supplierCode: '300000777', supplierVat: 'LT300000777' }), commit: true, createSupplier: true });
      assert.equal(wrongBuyer.status, 422);
      const threeLines = [1, 2, 3].map(i => line(i, 'Mažmena ' + i, 1, '0.50', '0.50', 21));
      const rounding = await post({ xml: invoice({ number: 'X-2', lines: threeLines, net: '1.50', tax: '0.32', gross: '1.82', supplierCode: '300000888', supplierVat: 'LT300000888' }), commit: true, createSupplier: true });
      const roundingBody = await rounding.json(); assert.equal(rounding.status, 422); assert.ok(roundingBody.issues.some(i => /PVM po perskaičiavimo pagal eilutes/.test(i)));
      assert.equal((await post({ xml: 'nonsense', commit: true })).status, 422);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, before.p); assert.equal(db.prepare('SELECT COUNT(*) n FROM Client').get().n, before.c); assert.equal(db.prepare('SELECT COUNT(*) n FROM PurchaseSource').get().n, before.s);
    });

    const creditRoute = require('../src/app/api/purchases/[id]/credit/route.ts');
    const { createPurchase } = require('../src/lib/purchases.ts');
    const manualCredit = (id, body) => creditRoute.POST(request('POST', body), { params: Promise.resolve({ id: String(id) }) });
    const counts = () => ({ p: db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, s: db.prepare('SELECT COUNT(*) n FROM PurchaseSource').get().n, c: db.prepare('SELECT COUNT(*) n FROM Client').get().n, g: db.prepare('SELECT COUNT(*) n FROM GeneralEntry').get().n });
    const ledger = id => db.prepare("SELECT debitAccount d, creditAccount c, amount a FROM GeneralEntry WHERE sourceType='PURCHASE' AND sourceId=? ORDER BY debitAccount, creditAccount, amount").all(id);
    const shape = id => ({
      p: (({ sumWithoutVat, vat, sumWithVat, deductionPercent, deductibleVat, debitAccount, clientId, clientName, buyerVatMode, docType, currencyCode, companyId }) => ({ sumWithoutVat, vat, sumWithVat, deductionPercent, deductibleVat, debitAccount, clientId, clientName, buyerVatMode, docType, currencyCode, companyId }))(db.prepare('SELECT * FROM Purchase WHERE id=?').get(id)),
      items: db.prepare('SELECT itemName,itemCode,quantity,price,sumWithoutVat,sumWithVat,vatRate FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(id), ledger: ledger(id),
    });
    const importInvoice = async number => { const r = await (await post({ xml: invoice({ number }), commit: true })).json(); assert.equal(r.committed, true, JSON.stringify(r)); return r.purchase; };
    const issuesOf = async xml => { const r = await post({ xml, commit: true }); const b = await r.json(); assert.equal(r.status, 422, JSON.stringify(b)); return b.issues.join(' | '); };

    await t.test('credit note preview names the original and the effect and stores nothing; commit equals the manual KS route', async () => {
      const base = await importInvoice('TIEK-103'); const twin = await importInvoice('TIEK-104');
      const xml = creditNote({ number: 'KR-10', ref: reference('TIEK-103', '2026-10-20') });
      const before = counts();
      const dry = await (await post({ xml })).json();
      assert.equal(dry.ok, true, JSON.stringify(dry)); assert.equal(dry.kind, 'credit'); assert.equal(dry.needsSupplier, false); assert.equal(dry.credit.original.id, base.id); assert.equal(dry.credit.original.number, 'TIEK-103');
      assert.deepEqual(dry.credit.effect, { net: 10, vat: 2.1, gross: 12.1, deductionPercent: 100, deductibleVatReversed: 2.1 });
      assert.deepEqual(counts(), before);
      const done = await post({ xml, commit: true, filename: 'kr-10.xml' }); const body = await done.json(); assert.equal(done.status, 200, JSON.stringify(body));
      const k = body.purchase;
      assert.equal(k.docType, 'KS'); assert.equal(k.originalPurchaseId, base.id); assert.equal(k.number, 'KR-10'); assert.equal(k.sumWithoutVat, -10); assert.equal(k.vat, -2.1); assert.equal(k.sumWithVat, -12.1); assert.equal(k.deductibleVat, -2.1); assert.equal(k.purchaseDate, '2026-10-20');
      const source = db.prepare('SELECT * FROM PurchaseSource WHERE purchaseId=?').get(k.id); assert.equal(source.xml, xml); assert.equal(source.docNumber, 'KR-10');
      assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='PURCHASE' AND sourceId=?").get(k.id).n > 0, true);
      // the same data through the manual route on an identical purchase gives identical rows and ledger postings
      const manual = await manualCredit(twin.id, { number: 'MAN-10', purchaseDate: '2026-10-20', reason: 'x', items: [{ itemName: 'Biuro popierius', itemCode: 'SKU-1', quantity: 4, price: 2.5, vatRate: 21 }] });
      assert.equal(manual.status, 200, JSON.stringify(await manual.clone().json()));
      const m = (await manual.json()).purchase;
      assert.deepEqual(shape(k.id), shape(m.id)); assert.ok(shape(k.id).ledger.length > 0);
      // cumulative rule: a second credit on the same original is capped by what is left
      const second = await post({ xml: creditNote({ number: 'KR-11', ref: reference('TIEK-103'), lines: [line(1, 'Biuro popierius', 6, '2.50', '15.00', 21)], net: '15.00', tax: '3.15', gross: '18.15' }), commit: true });
      assert.equal(second.status, 200); assert.equal((await second.json()).purchase.deductibleVat, -3.15);
    });

    await t.test('full credit zeroes the original: VAT reversal takes the exact remainder', async () => {
      const full = creditNote({ number: 'KR-FULL', ref: reference('TIEK-100'), lines: [line(1, 'Biuro popierius', 10, '2.50', '25.00', 21), line(2, 'Knyga', 2, '7.50', '15.00', 9)], net: '40.00', tax: '6.60', gross: '46.60' });
      const dry = await (await post({ xml: full })).json(); assert.equal(dry.ok, true, JSON.stringify(dry)); assert.equal(dry.credit.effect.deductibleVatReversed, 6.6);
      const k = (await (await post({ xml: full, commit: true })).json()).purchase;
      const orig = db.prepare("SELECT id FROM Purchase WHERE number='TIEK-100' AND companyId=1").get().id;
      const total = db.prepare('SELECT SUM(sumWithVat) g, SUM(deductibleVat) d FROM Purchase WHERE id=? OR originalPurchaseId=?').get(orig, orig);
      assert.equal(Math.round(total.g * 100), 0); assert.equal(Math.round(total.d * 100), 0); assert.equal(k.originalPurchaseId, orig);
    });

    await t.test('credit note refusals: original, supplier, amounts, rates, dates, duplicates, structure', async () => {
      const before = counts();
      assert.match(await issuesOf(creditNote({ number: 'KR-20', ref: reference('NEZINOMAS-1') })), /nerast/);
      assert.match(await issuesOf(creditNote({ number: 'KR-21', ref: reference('TIEK-101', '2026-01-01') })), /data nesutampa/);
      assert.match(await issuesOf(creditNote({ number: 'KR-22', ref: reference('TIEK-101'), lines: [line(1, 'Biuro popierius', 20, '2.50', '50.00', 21)], net: '50.00', tax: '10.50', gross: '60.50' })), /viršija/);
      assert.match(await issuesOf(creditNote({ number: 'KR-23', ref: reference('TIEK-101'), lines: [line(1, 'Biuro popierius', 4, '2.50', '10.00', 5)], net: '10.00', tax: '0.50', gross: '10.50' })), /PVM tarifo 5%/);
      assert.match(await issuesOf(creditNote({ number: 'KR-24', ref: reference('TIEK-101'), date: '2026-10-19' })), /ankstesnė už pradinį/);
      assert.match(await issuesOf(creditNote({ number: 'KR-25', ref: reference('TIEK-101'), net: '11.00', gross: '13.10' })), /Eilučių suma/);
      const three = [1, 2, 3].map(i => line(i, 'Mažmena ' + i, 1, '0.50', '0.50', 21));
      assert.match(await issuesOf(creditNote({ number: 'KR-26', ref: reference('TIEK-101'), lines: three, net: '1.50', tax: '0.32', gross: '1.82' })), /po perskaičiavimo pagal eilutes/);
      assert.match(await issuesOf(creditNote({ number: 'KR-27', ref: reference('TIEK-101'), currency: 'USD' })), /EUR/);
      assert.match(await issuesOf(creditNote({ number: 'KR-28', ref: reference('TIEK-101'), buyerVat: 'LT999999999', buyerCode: '999999999' })), /kitam asmeniui/);
      assert.match(await issuesOf(creditNote({ number: 'KR-29', ref: reference('TIEK-101'), supplierCode: '300000999', supplierVat: 'LT300000999' })), /Tiekėjas nerastas/);
      assert.match(await issuesOf(creditNote({ number: 'TIEK-101', ref: reference('TIEK-103') })), /jau yra pirkimuose/);
      // a credit cannot be credited, so a reference to a KS does not resolve
      assert.match(await issuesOf(creditNote({ number: 'KR-30', ref: reference('KR-10') })), /nerast/);
      assert.deepEqual(counts(), before);
      // wrong supplier: the referenced invoice exists but belongs to another supplier
      const other = (await (await post({ xml: invoice({ number: 'OTHER-1', supplierName: 'UAB Kitas', supplierCode: '300000555', supplierVat: 'LT300000555' }), commit: true, createSupplier: true })).json()).purchase;
      assert.match(await issuesOf(creditNote({ number: 'KR-31', ref: reference('OTHER-1') })), /kitam tiekėjui/);
      const afterOther = counts();
      assert.match(await issuesOf(creditNote({ number: 'KR-31', ref: '' })), /nėra nuorodos/);
      // an explicit pick of another supplier's purchase is refused too
      const pick = await (await post({ xml: creditNote({ number: 'KR-32', ref: '' }), originalPurchaseId: other.id })).json();
      assert.equal(pick.ok, false); assert.match(pick.issues.join(' '), /nerastas tarp šio tiekėjo/);
      assert.deepEqual(counts(), afterOther);
      // The reference is matched as series + number: a bare number never picks a purchase of another series,
      // "A DUP-1" (with a space) finds series A; two purchases whose series+number read the same are ambiguous.
      const supplierId = db.prepare("SELECT id FROM Client WHERE companyId=1 AND code='300000001'").get().id;
      const small = { lines: [line(1, 'x', 1, '1.00', '1.00', 21)], net: '1.00', tax: '0.21', gross: '1.21' };
      createPurchase(1, { series: 'A', number: 'DUP-1', purchaseDate: '2026-10-01', clientId: supplierId, clientName: 'UAB Tiekėjas & Ko', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 21 }] });
      assert.match(await issuesOf(creditNote({ number: 'KR-33', ref: reference('DUP-1'), ...small })), /nerast/);
      const seriesPreview = await (await post({ xml: creditNote({ number: 'KR-33', ref: reference('A DUP-1'), ...small }) })).json();
      assert.equal(seriesPreview.credit.original.series, 'A');
      createPurchase(1, { series: '', number: 'ADUP-1', purchaseDate: '2026-10-01', clientId: supplierId, clientName: 'UAB Tiekėjas & Ko', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 21 }] });
      assert.match(await issuesOf(creditNote({ number: 'KR-33', ref: reference('A DUP-1'), ...small })), /keli pirkimai/);
    });

    await t.test('credit note without a reference: the user picks the original explicitly; duplicate import is refused', async () => {
      const noRef = creditNote({ number: 'KR-40', ref: '' });
      const first = await (await post({ xml: noRef })).json();
      assert.equal(first.ok, false); assert.equal(first.credit.original, null); assert.ok(first.credit.candidates.length >= 2); assert.ok(first.credit.candidates.every(c => c.id));
      assert.equal((await post({ xml: noRef, commit: true })).status, 422);
      const target = db.prepare("SELECT id FROM Purchase WHERE number='TIEK-101' AND companyId=1").get().id;
      const picked = await (await post({ xml: noRef, originalPurchaseId: target })).json();
      assert.equal(picked.ok, true, JSON.stringify(picked)); assert.equal(picked.credit.original.id, target);
      const done = await post({ xml: noRef, commit: true, originalPurchaseId: target, filename: 'kr-40.xml' }); assert.equal(done.status, 200);
      assert.equal((await done.json()).purchase.originalPurchaseId, target);
      const again = await post({ xml: noRef, commit: true, originalPurchaseId: target }); const body = await again.json();
      assert.equal(again.status, 422); assert.match(body.issues.join(' '), /jau importuotas/);
      // a reference in the file wins: a different pick is refused
      const mismatch = await (await post({ xml: creditNote({ number: 'KR-41', ref: reference('TIEK-101') }), originalPurchaseId: db.prepare("SELECT id FROM Purchase WHERE number='TIEK-103'").get().id })).json();
      assert.equal(mismatch.ok, false); assert.match(mismatch.issues.join(' '), /nesutampa su faile nurodyta nuoroda/);
      assert.equal((await post({ xml: noRef, originalPurchaseId: 'abc' })).status, 400);
    });

    await t.test('company scope: another company may import the same file; non-VAT company keeps VAT as expense', async () => {
      jar.set('active_company_id', '2');
      db.prepare("UPDATE Company SET taxMode='NON_VAT',isVatPayer=0 WHERE id=2").run();
      const own = await (await post({ xml: invoice({ number: 'Z-1', buyerVat: 'LT222222229', buyerCode: '222222222' }), commit: true, createSupplier: true })).json();
      assert.equal(own.committed, true); assert.equal(own.purchase.companyId, 2); assert.equal(own.purchase.vat, 6.6); assert.equal(own.purchase.deductibleVat, 0);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM Client WHERE code='300000001' AND companyId=2").get().n, 1);
      const foreign = await post({ xml: good });
      assert.equal((await foreign.json()).ok, false);
      // credit notes are scoped to the company too: company 1's TIEK-100 is invisible here, company 2's own purchase is creditable
      const c2 = { buyerVat: 'LT222222229', buyerCode: '222222222' };
      const hidden = await post({ xml: creditNote({ number: 'KR-Z0', ref: reference('TIEK-100'), ...c2 }), commit: true });
      assert.equal(hidden.status, 422); assert.match((await hidden.json()).issues.join(' '), /nerast/);
      const own2 = await (await post({ xml: creditNote({ number: 'KR-Z1', ref: reference('Z-1'), ...c2 }), commit: true })).json();
      assert.equal(own2.committed, true, JSON.stringify(own2)); assert.equal(own2.purchase.companyId, 2); assert.equal(own2.purchase.sumWithVat, -12.1); assert.equal(own2.purchase.deductibleVat, 0);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM PurchaseSource WHERE companyId=2 AND docNumber='KR-Z1'").get().n, 1);
    });
    await t.test('company guard (preview and commit) and warehouse selection against a second-warehouse stock card', async () => {
      jar.set('active_company_id', '1');
      const xml = invoice({ number: 'WH-1' });
      for (const commit of [false, true]) assert.equal((await post({ xml, commit, companyId: 2 })).status, 409);
      assert.equal((await post({ xml, companyId: 1 })).status, 200);
      const src = require('node:fs').readFileSync(path.join(__dirname, '../src/components/PurchaseXmlImport.tsx'), 'utf8');
      assert.match(src, /JSON\.stringify\(\{ companyId, warehouseName/);
      assert.match(require('node:fs').readFileSync(path.join(__dirname, '../src/app/purchases/PurchasesClient.tsx'), 'utf8'), /<PurchaseXmlImport companyId=\{companyId\} warehouses=\{warehouses\} \/>/);
      require('../src/lib/inventory.ts').saveInventorySettings(db, 1, { method: 'AVERAGE', startDate: '2026-01-01' }, null);
      db.prepare("INSERT INTO StockItem(name,code,companyId,stock,remainder,cost,warehouseName) VALUES('Popierius','SKU-1',1,0,0,0,'Antras')").run();
      const flagged = await (await post({ xml })).json();
      assert.equal(flagged.ok, false); assert.ok(flagged.issues.some(i => /sandėlyje „Antras“/.test(i)));
      assert.equal((await post({ xml, commit: true })).status, 422);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM Purchase WHERE number='WH-1'").get().n, 0);
      assert.equal((await (await post({ xml, warehouseName: 'Antras' })).json()).ok, true);
      const done = await post({ xml, commit: true, warehouseName: 'Antras' }); const body = await done.json();
      assert.equal(done.status, 200, JSON.stringify(body)); assert.equal(body.purchase.warehouseName, 'Antras');
      assert.equal(db.prepare("SELECT COUNT(*) n FROM InventoryMovement WHERE sourceType='PURCHASE' AND sourceId=?").get(body.purchase.id).n, 1);
    });
  } finally { db.close(); fs.rmSync(temp, { recursive: true, force: true }); }
});
