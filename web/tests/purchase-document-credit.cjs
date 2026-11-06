const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const env = require('./helpers/recognition-env.cjs')('erp-doc-credit-');
const { db, rec, src, CODE, extractedDoc, extracted, good, fieldsOf } = env;
const form = src('purchase-document-form.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

const EXPENSE = db.prepare("SELECT code FROM ChartOfAccount WHERE code GLOB '[6-7]*' AND code NOT LIKE '27%' ORDER BY code LIMIT 1").get().code;
const credit = (number, sign, net, over = {}) => {
  const vat = Math.round(net * 21) / 100;
  return extracted({
    docKind: 'CREDIT_NOTE', number, issueDate: '2026-10-25', referencedDocument: 'TIEK-1',
    lines: [{ name: 'Popierius (grąžinimas)', quantity: 1, unitPrice: sign * net, net: sign * net, vatRate: 21, vat: sign * vat, gross: sign * (net + vat) }],
    totals: { net: sign * net, vat: sign * vat, gross: sign * (net + vat) }, vatBreakdown: [{ rate: 21, net: sign * net, vat: sign * vat }], ...over,
  });
};
const creditBody = (number, sign, net, originalId, over = {}) => {
  const vat = Math.round(net * 21) / 100;
  return {
    supplier: { clientId: over.clientId, name: 'UAB Tiekėjas' }, series: '', number, issueDate: '2026-10-25', docKind: 'CREDIT_NOTE',
    lines: [{ itemName: 'Popierius (grąžinimas)', quantity: 1, net: sign * net, vat: sign * vat, gross: sign * (net + vat), vatRate: 21, taxCode: CODE }],
    totals: { net: sign * net, vat: sign * vat, gross: sign * (net + vat) }, credit: originalId === undefined ? undefined : { originalPurchaseId: originalId }, ...over.extra,
  };
};
const journal = id => db.prepare("SELECT debitAccount d, creditAccount c, amount a FROM GeneralEntry WHERE sourceType='PURCHASE' AND sourceId=? ORDER BY debitAccount, creditAccount").all(id);

test('credit note from a document: original suggested by the printed number, confirmed through the shared credit path', async () => {
  const originalDoc = await extractedDoc(1, extracted({ number: 'TIEK-1' }));
  const original = rec.confirmDocument(1, originalDoc, 5, good({ debitAccount: EXPENSE }));
  const clientId = original.purchase.clientId;
  const id = await extractedDoc(1, credit('KR-1', -1, 10));
  const preview = rec.previewDocument(1, id);
  // Printed minus signs are shown as positive amounts; the original is not chosen for the person.
  assert.equal(preview.draft.docKind, 'CREDIT_NOTE'); assert.equal(preview.draft.referencedDocument, 'TIEK-1');
  assert.equal(preview.draft.lines[0].net, 10); assert.equal(preview.draft.lines[0].gross, 12.1); assert.equal(preview.draft.totals.gross, 12.1);
  assert.ok(preview.missing['credit.original']); assert.equal(preview.missing.docKind, undefined);
  const found = rec.creditCandidates(1, clientId, ' tiek-1 ');
  assert.equal(found.suggestedId, original.purchase.id);
  assert.deepEqual(found.candidates.map(c => c.number), ['TIEK-1']);
  assert.equal(rec.creditCandidates(1, clientId, 'KITAS-9').suggestedId, null);
  assert.equal(rec.creditCandidates(1, null, 'TIEK-1').candidates.length, 0);
  // Without the original: refused, nothing is created.
  const before = db.prepare('SELECT COUNT(*) n FROM Purchase').get().n;
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, creditBody('KR-1', -1, 10, undefined, { clientId })))['credit.original']);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, creditBody('KR-1', -1, 10, 999999, { clientId }))).credit);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, before);
  const out = rec.confirmDocument(1, id, 5, creditBody('KR-1', -1, 10, original.purchase.id, { clientId }));
  const p = out.purchase;
  assert.equal(p.docType, 'KS'); assert.equal(p.originalPurchaseId, original.purchase.id); assert.equal(p.clientId, clientId);
  assert.equal(p.sumWithoutVat, -10); assert.equal(p.vat, -2.1); assert.equal(p.sumWithVat, -12.1); assert.equal(p.deductibleVat, -2.1);
  assert.equal(p.number, 'KR-1'); assert.match(p.correctionReason, /Kreditinis dokumentas KR-1/);
  assert.equal(out.createdSupplier, false); assert.equal(out.credit.originalPurchaseId, original.purchase.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Client').get().n, 1);
  assert.equal(db.prepare("SELECT taxCode FROM TaxLineCode WHERE kind='PURCHASE' AND itemId=?").get(out.items[0].id).taxCode, CODE);
  const doc = db.prepare('SELECT * FROM PurchaseDocument WHERE id=?').get(id);
  assert.equal(doc.status, 'CONFIRMED'); assert.equal(doc.purchaseId, p.id);
  // The ledger holds the reversal of 10 + 2.1 VAT.
  assert.deepEqual(journal(p.id).map(e => e.a).sort((x, y) => x - y), [-10, -2.1]);
  assert.throws(() => rec.confirmDocument(1, id, 5, creditBody('KR-1', -1, 10, original.purchase.id, { clientId })), e => e.status === 409);

  // Positive printed amounts work as well; the shared limits stop a credit above what is left (10 + 10 > 20).
  const second = await extractedDoc(1, credit('KR-2', 1, 10));
  assert.equal(rec.previewDocument(1, second).draft.lines[0].net, 10);
  const ok = rec.confirmDocument(1, second, 5, creditBody('KR-2', 1, 10, original.purchase.id, { clientId }));
  assert.equal(ok.purchase.sumWithVat, -12.1);
  const third = await extractedDoc(1, credit('KR-3', 1, 1));
  const f = fieldsOf(() => rec.confirmDocument(1, third, 5, creditBody('KR-3', 1, 1, original.purchase.id, { clientId })));
  assert.match(f.credit, /viršija/);
  assert.equal(db.prepare("SELECT status FROM PurchaseDocument WHERE id=?").get(third).status, 'EXTRACTED');
});

test('credit note from a document: supplier, date, currency and kind rules', async () => {
  const originalDoc = await extractedDoc(1, extracted({ number: 'ORIG-2', supplier: { name: 'UAB Antras', code: '300000002', vatCode: 'LT100000000022', address: 'Kaunas' } }));
  const original = rec.confirmDocument(1, originalDoc, 5, good({ number: 'ORIG-2', supplier: { name: 'UAB Antras', code: '300000002', vatCode: 'LT100000000022', create: true } }));
  const clientId = original.purchase.clientId;
  const other = db.prepare("INSERT INTO Client(companyId,name,code,createdAt,updatedAt) VALUES(1,'UAB Kitas','300000009',datetime('now'),datetime('now'))").run().lastInsertRowid;
  const doc = () => extractedDoc(1, credit('KR-20', 1, 5, { referencedDocument: 'ORIG-2', supplier: { name: 'UAB Antras', code: '300000002', vatCode: 'LT100000000022', address: null } }));
  // Another supplier than the original's.
  const a = await doc();
  assert.ok(fieldsOf(() => rec.confirmDocument(1, a, 5, creditBody('KR-20', 1, 5, original.purchase.id, { clientId: Number(other) })))['supplier']);
  // A new supplier cannot own a credit of an existing purchase either.
  const b = await doc();
  assert.ok(fieldsOf(() => rec.confirmDocument(1, b, 5, { ...creditBody('KR-20', 1, 5, original.purchase.id, {}), supplier: { name: 'UAB Naujas', code: '999', create: true } }))['supplier']);
  // Earlier than the original.
  const c = await doc();
  assert.match(fieldsOf(() => rec.confirmDocument(1, c, 5, { ...creditBody('KR-20', 1, 5, original.purchase.id, { clientId }), issueDate: '2026-10-01' })).credit, /ankstesnė/);
  // Foreign currency credit note and a foreign currency original.
  assert.ok(fieldsOf(() => rec.confirmDocument(1, c, 5, { ...creditBody('KR-20', 1, 5, original.purchase.id, { clientId }), foreign: { currency: 'USD', rate: 1.1 } })).currency);
  db.prepare("UPDATE Purchase SET currencyCode='USD' WHERE id=?").run(original.purchase.id);
  assert.match(fieldsOf(() => rec.confirmDocument(1, c, 5, creditBody('KR-20', 1, 5, original.purchase.id, { clientId })))['credit.original'], /USD/);
  db.prepare("UPDATE Purchase SET currencyCode='EUR' WHERE id=?").run(original.purchase.id);
  // Stock/asset cards are not created for a credit note.
  assert.ok(Object.keys(fieldsOf(() => rec.confirmDocument(1, c, 5, creditBody('KR-20', 1, 5, original.purchase.id, { clientId, extra: { lines: [{ itemName: 'x', quantity: 1, net: 5, vat: 1.05, gross: 6.05, vatRate: 21, taxCode: CODE, stock: { create: true, code: 'N1' } }] } })))).length);
  // The same document as an ordinary invoice (kind overridden by the person) is the old flow and needs no original.
  const d = await extractedDoc(1, credit('KR-21', 1, 5));
  const asInvoice = rec.confirmDocument(1, d, 5, good({ number: 'KR-21', docKind: 'INVOICE', totals: { net: 20, vat: 4.2, gross: 24.2 } }));
  assert.equal(asInvoice.purchase.docType == null || asInvoice.purchase.docType === 'SF', true);
  // A credit note of company 2 cannot use company 1's purchase.
  const e = rec.storeDocument(2, { buffer: env.pdf(), fileName: 'k.pdf', mimeType: 'application/pdf' }).id;
  assert.ok(fieldsOf(() => rec.confirmDocument(2, e, 5, creditBody('KR-22', 1, 5, original.purchase.id, { clientId, extra: { supplier: { name: 'UAB Antras', create: true } } }))));
});

test('review form: credit note switch, original and payload', () => {
  const draft = { docKind: 'CREDIT_NOTE', referencedDocument: 'TIEK-1', issueDate: '2026-10-25', number: 'KR', supplier: { name: 'T', clientId: 4 }, lines: [{ itemName: 'x', quantity: 1, net: 10, vat: 2.1, gross: 12.1, vatRate: 21, taxCode: CODE }], totals: { net: 10, vat: 2.1, gross: 12.1 } };
  const f = form.draftToForm(draft);
  assert.equal(f.isCredit, true); assert.equal(f.creditReference, 'TIEK-1'); assert.equal(f.creditOriginalId, '');
  const ctx = { extractedSupplierCode: null, docKind: 'CREDIT_NOTE', currency: 'EUR', allowedTaxCodes: [CODE], companyVatPayer: true };
  assert.equal(form.validateForm(f, ctx)['credit.original'].key, 'docs.v_creditOriginal');
  assert.equal(form.validateForm(f, ctx).docKind, undefined);
  const chosen = { ...f, creditOriginalId: '12' };
  assert.deepEqual(Object.keys(form.validateForm(chosen, ctx)), []);
  const payload = form.formToPayload(chosen);
  assert.equal(payload.docKind, 'CREDIT_NOTE'); assert.deepEqual(payload.credit, { originalPurchaseId: 12 });
  assert.equal(form.formToPayload({ ...chosen, isCredit: false }).docKind, 'INVOICE');
  assert.equal(form.formToPayload({ ...chosen, isCredit: false }).credit, undefined);
});
