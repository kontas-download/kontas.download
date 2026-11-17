const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const env = require('./helpers/recognition-env.cjs')('erp-attach-');
const { db, rec, src, good, extracted, extractedDoc, CODE } = env;
const attach = src('purchase-document-attach.ts');
const archive = src('tax-archive.ts');
const pkg = src('company-package.ts');
const bm = src('bank-matching.ts');
const { openDocuments } = src('payments.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

db.prepare("UPDATE Company SET taxMode='STANDARD_VAT' WHERE id IN (1,2)").run();
const purchaseCount = () => db.prepare('SELECT COUNT(*) n FROM Purchase').get().n;
const ledgerCount = () => db.prepare('SELECT COUNT(*) n FROM GeneralEntry').get().n;
const purchaseRow = id => db.prepare('SELECT * FROM Purchase WHERE id=?').get(id);
const docRow = id => db.prepare('SELECT * FROM PurchaseDocument WHERE id=?').get(id);
const attachErr = fn => { try { fn(); } catch (e) { return e; } assert.fail('expected a refusal'); };

const receiptData = (over = {}) => extracted({
  docKind: 'RECEIPT', buyer: { name: null, code: null, vatCode: null }, number: null, issueDate: '2026-10-21',
  receipt: { cashRegisterNo: 'KA-7', receiptNo: '0045', time: '12:30', storeAddress: null },
  payment: { method: 'CARD', cardLast4: '2222' }, ...over,
});

// Purchase created from an invoice (no payment facts filled in).
async function invoicePurchase(number, extra = {}, data = {}) {
  const id = await extractedDoc(1, extracted({ number, ...data }));
  return rec.confirmDocument(1, id, null, good({ number, ...extra })).purchase;
}

test('payment receipt joins an invoice purchase: no new purchase, empty fields filled, nothing overwritten', async () => {
  const p = await invoicePurchase('ATT-1');
  const other = await invoicePurchase('ATT-2', { paymentMethod: 'CARD', cardLast4: '1111' }, { number: 'ATT-2' });
  const receipt = await extractedDoc(1, receiptData());
  const before = { purchases: purchaseCount(), ledger: ledgerCount() };
  const out = attach.attachDocumentToPurchase(1, receipt, p.id, 'PAYMENT_RECEIPT', null);
  assert.equal(purchaseCount(), before.purchases); assert.equal(ledgerCount(), before.ledger);
  assert.equal(out.document.status, 'CONFIRMED'); assert.equal(out.document.role, 'PAYMENT_RECEIPT'); assert.equal(out.document.purchaseId, p.id);
  assert.deepEqual(out.enriched.sort(), ['cardLast4', 'cashRegisterNo', 'documentTime', 'paymentMethod', 'receiptNo']);
  const row = purchaseRow(p.id);
  assert.deepEqual([row.paymentMethod, row.cardLast4, row.cashRegisterNo, row.receiptNo, row.documentTime], ['CARD', '2222', 'KA-7', '0045', '12:30']);
  assert.equal(row.number, 'ATT-1', 'the main number is untouched');
  assert.ok(docRow(receipt).confirmedAt);

  // Existing values win; only the empty ones are filled.
  const second = await extractedDoc(1, receiptData({ receipt: { cashRegisterNo: 'KB-9', receiptNo: '77', time: '08:05', storeAddress: null }, payment: { method: 'CARD', cardLast4: '3333' } }));
  const o2 = attach.attachDocumentToPurchase(1, second, other.id, 'PAYMENT_RECEIPT', null);
  assert.deepEqual(o2.enriched.sort(), ['cashRegisterNo', 'documentTime', 'receiptNo']);
  const r2 = purchaseRow(other.id);
  assert.deepEqual([r2.paymentMethod, r2.cardLast4, r2.cashRegisterNo, r2.receiptNo], ['CARD', '1111', 'KB-9', '77']);
});

test('an attachment only joins the purchase', async () => {
  const p = await invoicePurchase('ATT-3');
  const doc = await extractedDoc(1, extracted({ number: 'ATT-3-COPY' }));
  const out = attach.attachDocumentToPurchase(1, doc, p.id, 'ATTACHMENT', null);
  assert.deepEqual(out.enriched, []); assert.equal(out.document.role, 'ATTACHMENT');
  assert.equal(purchaseRow(p.id).paymentMethod, null);
  assert.equal(attachErr(() => attach.attachDocumentToPurchase(1, doc, p.id, 'ATTACHMENT', null)).status, 409, 'a confirmed document cannot be attached again');
  const next = await extractedDoc(1, extracted({ number: 'ATT-3-X' }));
  assert.equal(attachErr(() => attach.attachDocumentToPurchase(1, next, p.id, 'PRIMARY', null)).status, 400);
});

test('a different total or supplier needs an explicit confirmation', async () => {
  const p = await invoicePurchase('ATT-4');
  const receipt = await extractedDoc(1, receiptData({ totals: { net: 24.8, vat: 5.2, gross: 30 }, lines: [] }));
  const err = attachErr(() => attach.attachDocumentToPurchase(1, receipt, p.id, 'PAYMENT_RECEIPT', null));
  assert.equal(err.status, 409); assert.ok(err.fields.confirmMismatch); assert.deepEqual(err.mismatch, ['AMOUNT']);
  assert.equal(docRow(receipt).status, 'EXTRACTED'); assert.equal(docRow(receipt).purchaseId, null); assert.equal(purchaseRow(p.id).cardLast4, null);
  const ok = attach.attachDocumentToPurchase(1, receipt, p.id, 'PAYMENT_RECEIPT', null, { confirmMismatch: true });
  assert.deepEqual(ok.mismatch, ['AMOUNT']); assert.equal(docRow(receipt).status, 'CONFIRMED');

  const other = await extractedDoc(1, extracted({ number: 'ATT-4-B', supplier: { name: 'UAB Visai Kitas', code: '399999999', vatCode: null, address: null } }));
  const e2 = attachErr(() => attach.attachDocumentToPurchase(1, other, p.id, 'ATTACHMENT', null));
  assert.deepEqual(e2.mismatch, ['SUPPLIER']);
  // Within a cent is the same amount.
  const near = await extractedDoc(1, extracted({ number: 'ATT-4-C', totals: { net: 20, vat: 4.2, gross: 24.21 } }));
  assert.equal(attach.attachDocumentToPurchase(1, near, p.id, 'ATTACHMENT', null).document.status, 'CONFIRMED');
});

test('another company\'s document or purchase is refused', async () => {
  const p = await invoicePurchase('ATT-5');
  const doc = await extractedDoc(1, extracted({ number: 'ATT-5-B' }));
  assert.equal(attachErr(() => attach.attachDocumentToPurchase(2, doc, p.id, 'ATTACHMENT', null)).status, 404, 'document of company 1 seen from company 2');
  env.rec.saveRecognitionSettings(2, { enabled: true, apiKey: 'sk-test-secret-key-2' });
  const foreign = await extractedDoc(2, extracted({ number: 'ATT-5-C', buyer: { name: 'UAB Kita', code: '222222222', vatCode: 'LT222222229' } }));
  assert.equal(attachErr(() => attach.attachDocumentToPurchase(1, foreign, p.id, 'ATTACHMENT', null)).status, 404, 'document of company 2 seen from company 1');
  assert.equal(attachErr(() => attach.attachDocumentToPurchase(2, foreign, p.id, 'ATTACHMENT', null)).status, 404, 'purchase of company 1 seen from company 2');
  assert.equal(attachErr(() => attach.attachDocumentToPurchase(1, doc, 999999, 'ATTACHMENT', null)).status, 404);
  assert.equal(docRow(doc).status, 'EXTRACTED');
});

test('a cash receipt records the cash payment of an unpaid purchase; a card receipt does not', async () => {
  const p = await invoicePurchase('ATT-6');
  assert.ok(openDocuments(db, 1).some(d => d.kind === 'PURCHASE' && d.id === p.id));
  const receipt = await extractedDoc(1, receiptData({ payment: { method: 'CASH', cardLast4: null } }));
  const ledger = ledgerCount();
  const out = attach.attachDocumentToPurchase(1, receipt, p.id, 'PAYMENT_RECEIPT', null);
  assert.deepEqual(out.settlement, { settled: true });
  const s = db.prepare('SELECT * FROM ManualSettlement WHERE purchaseId=?').all(p.id);
  assert.equal(s.length, 1); assert.equal(s[0].method, 'CASH'); assert.equal(s[0].amount, 24.2); assert.equal(s[0].date, '2026-10-21');
  assert.ok(!openDocuments(db, 1).some(d => d.kind === 'PURCHASE' && d.id === p.id));
  assert.equal(ledgerCount(), ledger + 1);
  const entry = db.prepare("SELECT * FROM GeneralEntry WHERE sourceType='SETTLEMENT' AND sourceId=?").get(s[0].id);
  assert.deepEqual([entry.debitAccount, entry.creditAccount, entry.amount], ['4430', '272', 24.2]);

  const card = await invoicePurchase('ATT-6B');
  const cardReceipt = await extractedDoc(1, receiptData());
  assert.equal(attach.attachDocumentToPurchase(1, cardReceipt, card.id, 'PAYMENT_RECEIPT', null).settlement, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ManualSettlement WHERE purchaseId=?').get(card.id).n, 0);

  // Already paid: nothing is recorded twice.
  const again = await extractedDoc(1, receiptData({ payment: { method: 'CASH', cardLast4: null }, receipt: { cashRegisterNo: 'KA-7', receiptNo: '0046', time: null, storeAddress: null } }));
  assert.deepEqual(attach.attachDocumentToPurchase(1, again, p.id, 'PAYMENT_RECEIPT', null).settlement, { settled: false, reason: 'ALREADY_PAID' });
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ManualSettlement WHERE purchaseId=?').get(p.id).n, 1);
});

test('a closed period keeps the document attached but skips the enrichment', async () => {
  const p = await invoicePurchase('ATT-7');
  db.prepare("INSERT INTO AccountingLock(companyId,lockedThrough,reason) VALUES(1,'2026-12-31','test') ON CONFLICT(companyId) DO UPDATE SET lockedThrough=excluded.lockedThrough").run();
  try {
    const receipt = await extractedDoc(1, receiptData());
    const out = attach.attachDocumentToPurchase(1, receipt, p.id, 'PAYMENT_RECEIPT', null);
    assert.equal(out.document.status, 'CONFIRMED'); assert.deepEqual(out.settlement, { settled: false, reason: 'SKIPPED' }); assert.deepEqual(out.enriched, []);
    assert.equal(purchaseRow(p.id).cardLast4, null);
  } finally { db.prepare('UPDATE AccountingLock SET lockedThrough=NULL WHERE companyId=1').run(); }
});

// A purchase made from a cash register receipt (evidenceType RECEIPT, no deductible VAT).
async function receiptPurchase(receiptNo) {
  const id = await extractedDoc(1, receiptData({ receipt: { cashRegisterNo: 'KA-7', receiptNo, time: '12:30', storeAddress: null } }));
  const out = rec.confirmDocument(1, id, null, good({
    number: '', series: '', evidenceType: 'RECEIPT', paymentMethod: 'CARD', cardLast4: '2222', cashRegisterNo: 'KA-7', receiptNo,
  }));
  return { purchase: out.purchase, docId: id };
}
const ledgerOf = id => db.prepare("SELECT debitAccount,creditAccount,ROUND(SUM(amount),2) s FROM GeneralEntry WHERE sourceType='PURCHASE' AND sourceId=? GROUP BY debitAccount,creditAccount ORDER BY debitAccount,creditAccount").all(id);

test('preview offers to make the invoice the main document of a receipt purchase', async () => {
  const { purchase } = await receiptPurchase('0101');
  assert.equal(purchase.evidenceType, 'RECEIPT');
  const inv = await extractedDoc(1, extracted({ number: 'INV-PRE', issueDate: '2026-10-22' }));
  const hit = rec.previewDocument(1, inv).duplicates.find(d => d.kind === 'purchase' && d.id === purchase.id);
  assert.ok(hit); assert.equal(hit.evidenceType, 'RECEIPT'); assert.equal(hit.promotable, true); assert.equal(hit.strength, 'possible');
  const other = await invoicePurchase('INV-OTHER', { issueDate: '2026-10-22' });
  const inv2 = await extractedDoc(1, extracted({ number: 'INV-PRE-2', issueDate: '2026-10-22' }));
  const hit2 = rec.previewDocument(1, inv2).duplicates.find(d => d.id === other.id);
  assert.equal(hit2.promotable, false, 'an invoice purchase is not promoted');
});

test('promoting an invoice rewrites the receipt purchase through the ordinary update and swaps the roles', async () => {
  const { purchase, docId } = await receiptPurchase('0102');
  assert.equal(purchase.deductibleVat, 0);
  const ledgerBefore = ledgerOf(purchase.id);
  assert.ok(ledgerBefore.length > 0);
  const inv = await extractedDoc(1, extracted({ number: 'INV-100', issueDate: '2026-10-22', dueDate: '2026-11-05' }));
  const count = purchaseCount();
  const out = attach.promoteDocumentToPurchase(1, inv, purchase.id, null, good({ number: 'INV-100', issueDate: '2026-10-22', deductionPercent: 100 }));
  assert.equal(purchaseCount(), count, 'no new purchase');
  assert.equal(out.promoted, true); assert.equal(out.purchase.id, purchase.id);
  const row = purchaseRow(purchase.id);
  assert.deepEqual([row.number, row.purchaseDate, row.evidenceType, row.deductionPercent, row.deductibleVat, row.sumWithVat], ['INV-100', '2026-10-22', 'INVOICE', 100, 4.2, 24.2]);
  assert.deepEqual([row.paymentMethod, row.cardLast4, row.cashRegisterNo, row.receiptNo], ['CARD', '2222', 'KA-7', '0102'], 'receipt facts stay');
  assert.match(row.notes, /sąskaita faktūra/);
  assert.equal(docRow(inv).role, 'PRIMARY'); assert.equal(docRow(inv).status, 'CONFIRMED'); assert.equal(docRow(inv).purchaseId, purchase.id);
  assert.equal(docRow(docId).role, 'PAYMENT_RECEIPT'); assert.equal(docRow(docId).purchaseId, purchase.id);
  // Ledger: re-posted by the update triggers exactly like a manual edit (deductible VAT now appears).
  const after = ledgerOf(purchase.id);
  assert.notDeepEqual(after, ledgerBefore);
  assert.deepEqual(ledgerBefore.map(r => [r.debitAccount, r.s]), [[ledgerBefore[0].debitAccount, 24.2]], 'a receipt deducts no VAT');
  assert.deepEqual(after.map(r => [r.debitAccount, r.creditAccount, r.s]).sort(), [['2444', '4430', 4.2], [ledgerBefore[0].debitAccount, '4430', 20]].sort(), 'deductible VAT is posted now');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM PurchaseItem WHERE purchaseId=?').get(purchase.id).n, 1);
  const tax = db.prepare("SELECT taxCode FROM TaxLineCode WHERE kind='PURCHASE' AND itemId IN (SELECT id FROM PurchaseItem WHERE purchaseId=?)").all(purchase.id);
  assert.deepEqual(tax.map(t => t.taxCode), [CODE]);
});

test('promotion refusals: invoice purchase, other number in use, closed period, mismatch', async () => {
  const invoiceBased = await invoicePurchase('PRM-1');
  const a = await extractedDoc(1, extracted({ number: 'PRM-1-B' }));
  assert.equal(attachErr(() => attach.promoteDocumentToPurchase(1, a, invoiceBased.id, null, good({ number: 'PRM-1-B' }))).status, 409);

  const { purchase } = await receiptPurchase('0103');
  const clash = attachErr(() => attach.promoteDocumentToPurchase(1, a, purchase.id, null, good({ number: 'PRM-1' })));
  assert.ok(clash.fields.number, 'the number already belongs to another purchase of the supplier');

  const diff = await extractedDoc(1, extracted({ number: 'PRM-2', totals: { net: 40, vat: 8.4, gross: 48.4 }, lines: [{ name: 'X', quantity: 1, unitPrice: 40, net: 40, vatRate: 21, vat: 8.4, gross: 48.4 }] }));
  const formDiff = good({ number: 'PRM-2', lines: [{ itemName: 'X', quantity: 1, net: 40, vat: 8.4, gross: 48.4, vatRate: 21, taxCode: CODE }], totals: { net: 40, vat: 8.4, gross: 48.4 } });
  const e = attachErr(() => attach.promoteDocumentToPurchase(1, diff, purchase.id, null, formDiff));
  assert.deepEqual(e.mismatch, ['AMOUNT']); assert.equal(purchaseRow(purchase.id).evidenceType, 'RECEIPT');

  db.prepare("INSERT INTO AccountingLock(companyId,lockedThrough,reason) VALUES(1,'2026-12-31','test') ON CONFLICT(companyId) DO UPDATE SET lockedThrough=excluded.lockedThrough").run();
  try {
    const inv = await extractedDoc(1, extracted({ number: 'PRM-3' }));
    const before = purchaseRow(purchase.id);
    assert.throws(() => attach.promoteDocumentToPurchase(1, inv, purchase.id, null, good({ number: 'PRM-3' })), /ACCOUNTING_PERIOD_LOCKED/);
    assert.deepEqual(purchaseRow(purchase.id), before);
    assert.equal(docRow(inv).status, 'EXTRACTED'); assert.equal(docRow(inv).role, null);
  } finally { db.prepare('UPDATE AccountingLock SET lockedThrough=NULL WHERE companyId=1').run(); }
});

test('the archive holds every original of a purchase with its role, the export carries the role', async () => {
  const { purchase, docId } = await receiptPurchase('0104');
  const inv = await extractedDoc(1, extracted({ number: 'ARC-1', issueDate: '2026-10-22' }));
  attach.promoteDocumentToPurchase(1, inv, purchase.id, null, good({ number: 'ARC-1', issueDate: '2026-10-22' }));
  const plan = archive.planTaxArchive(1, '2026-10-22', '2026-10-22');
  const rows = plan.register.filter(r => r.document === 'ARC-1');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(r => r.role), ['pagrindinis dokumentas', 'mokėjimo kvitas']);
  assert.ok(rows[1].zipFile.endsWith('_kvitas.pdf') && !rows[0].zipFile.includes('_kvitas'));
  assert.equal(plan.files.filter(f => rows.some(r => r.zipFile === f.name)).length, 2);
  assert.match(archive.registerCsv(plan.register).split('\n')[0], /Originalo paskirtis/);
  const exported = pkg.exportCompany(db, 1);
  const docs = exported.data.purchaseDocuments.filter(d => d.purchaseId === purchase.id);
  assert.deepEqual(docs.map(d => d.role).sort(), ['PAYMENT_RECEIPT', 'PRIMARY']);
  assert.ok(docs.some(d => d.sha256 === docRow(docId).sha256));
});

test('purchase list API shape: all originals, main one first', async () => {
  const p = await invoicePurchase('LST-1');
  db.prepare("INSERT INTO PurchaseDocument(companyId,purchaseId,fileName,mimeType,size,sha256,storagePath,status) VALUES(1,?,'old.pdf','application/pdf',1,'old-sha','1/2026/old.pdf','CONFIRMED')").run(p.id);
  const receipt = await extractedDoc(1, receiptData({ receipt: { cashRegisterNo: 'KA-7', receiptNo: '0200', time: null, storeAddress: null } }));
  attach.attachDocumentToPurchase(1, receipt, p.id, 'PAYMENT_RECEIPT', null);
  const list = attach.withDocuments(db, 1, db.prepare('SELECT id FROM Purchase WHERE companyId=1').all());
  const mine = list.find(x => x.id === p.id);
  assert.equal(mine.documents.length, 3);
  assert.deepEqual(mine.documents.map(d => d.role), ['PRIMARY', 'PRIMARY', 'PAYMENT_RECEIPT'], 'a missing role reads as PRIMARY');
  assert.equal(mine.documentId, mine.documents[0].id);
  const bare = list.find(x => x.documents.length === 0);
  if (bare) assert.equal(bare.documentId, null);
});

test('purchase search finds by supplier, number, date and amount', async () => {
  const p = await invoicePurchase('SRCH-77');
  const by = q => attach.searchPurchases(1, q).map(r => r.id);
  assert.ok(by('srch-77').includes(p.id)); assert.ok(by('Tiekėjas').includes(p.id)); assert.ok(by('2026-10-20').includes(p.id)); assert.ok(by('24,20').includes(p.id)); assert.ok(by('24.2').includes(p.id));
  assert.ok(!by('nera-tokio').includes(p.id));
  assert.ok(attach.searchPurchases(1, '').length > 0); assert.equal(attach.searchPurchases(2, 'srch-77').length, 0, 'other company');
  assert.ok(attach.searchPurchases(1, '%').every(r => /%/.test(JSON.stringify(r))), 'wildcards are literal');
});

test('card digits from an attached receipt feed the bank matching boost', async () => {
  const p = await invoicePurchase('BNK-1');
  db.prepare("INSERT INTO BankTransaction(companyId,date,number,clientName,sum,correspondenceAccountCode,accountingBankInternalName,notes) VALUES(1,'2026-10-21',NULL,'',-24.2,'2710','Bank','Card ****2222 payment')").run();
  const reasons = () => bm.bankMatchesForPurchase(db, 1, p.id).candidates.find(c => c.documentId === p.id)?.reasons || [];
  assert.ok(!reasons().includes('CARD'));
  const receipt = await extractedDoc(1, receiptData());
  attach.attachDocumentToPurchase(1, receipt, p.id, 'PAYMENT_RECEIPT', null);
  assert.ok(reasons().includes('CARD'), 'the enriched cardLast4 raises the match');
});
