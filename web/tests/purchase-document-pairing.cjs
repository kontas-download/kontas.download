// An invoice and a receipt that arrive together (one e-mail, one multi-file upload) are paired and confirmed together.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const env = require('./helpers/recognition-env.cjs')('erp-pairing-');
const { db, rec, src, pdf, extracted, fake, good } = env;
const pairing = src('purchase-document-pairing.ts');
const inbox = src('document-inbox.ts');
const remote = src('document-remote.ts');
const share = src('share-target.ts');
const { openDocuments } = src('payments.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });
db.prepare("UPDATE Company SET taxMode='STANDARD_VAT' WHERE id IN (1,2)").run();

const row = id => db.prepare('SELECT * FROM PurchaseDocument WHERE id=?').get(id);
const batch = () => 'batch-' + crypto.randomUUID();
const receiptData = (over = {}) => extracted({
  docKind: 'RECEIPT', buyer: { name: null, code: null, vatCode: null }, number: null, issueDate: '2026-10-20',
  receipt: { cashRegisterNo: 'KA-7', receiptNo: '0045', time: '12:30', storeAddress: null }, payment: { method: 'CASH', cardLast4: null }, ...over,
});
// Stores and recognizes one document of a batch (the fake provider answers with `data`).
async function inBatch(batchId, data) {
  const stored = rec.storeDocument(1, { buffer: pdf(), fileName: 'd.pdf', mimeType: 'application/pdf', batchId });
  await rec.recognizeDocument(1, stored.id, fake(data));
  return stored.id;
}
const fact = (over = {}) => ({ kind: 'INVOICE', code: '300000001', vatCode: 'LT100000000011', name: 'UAB Tiekėjas', gross: 24.2, date: '2026-10-20', ...over });

test('pairing rule: supplier, gross within 0.01 and dates within 3 days', () => {
  const r = fact({ kind: 'RECEIPT' });
  assert.equal(pairing.pairMatches(fact(), r), true);
  assert.equal(pairing.pairMatches(fact(), { ...r, gross: 24.21 }), true);
  assert.equal(pairing.pairMatches(fact(), { ...r, gross: 24.5 }), false, 'amount differs');
  assert.equal(pairing.pairMatches(fact(), { ...r, date: '2026-10-23' }), true);
  assert.equal(pairing.pairMatches(fact(), { ...r, date: '2026-10-25' }), false, 'dates too far apart');
  assert.equal(pairing.pairMatches(fact(), { ...r, code: '999', vatCode: 'LT999', name: 'UAB Kitas' }), false, 'another supplier');
  assert.equal(pairing.pairMatches(fact(), { ...r, code: '', vatCode: '', name: 'uab tiekejas' }), true, 'no codes: the normalized name decides');
  assert.equal(pairing.pairMatches(fact(), { ...r, code: '999', vatCode: 'LT999' }), false, 'differing codes beat an equal name');
  assert.deepEqual(pairing.decidePairing([{ id: 1, facts: fact() }, { id: 2, facts: r }]), { pair: { invoiceId: 1, receiptId: 2 }, noteIds: [] });
  assert.equal(pairing.decidePairing([{ id: 1, facts: fact() }, { id: 2, facts: r }, { id: 3, facts: r }]).pair, null);
  assert.deepEqual(pairing.decidePairing([{ id: 1, facts: fact() }, { id: 2, facts: fact() }]), { pair: null, noteIds: [] });
});

test('a recognized invoice and receipt of one batch are paired and hidden from the queue and the counts once', async () => {
  const b = batch();
  const before = rec.documentCounts(1);
  const inv = await inBatch(b, extracted({ number: 'PR-1' }));
  assert.equal(row(inv).batchId, b);
  assert.equal(rec.documentCounts(1).awaiting, before.awaiting + 1);
  const rcp = await inBatch(b, receiptData());
  pairing.pairBatch(1, b);
  assert.equal(row(rcp).pairedWithId, inv);
  assert.equal(row(rcp).pairNote, null);
  assert.equal(rec.documentCounts(1).awaiting, before.awaiting + 1, 'the paired receipt is not counted twice');
  const list = rec.listDocuments(1);
  assert.ok(list.some(d => d.id === inv && d.pairedReceipt?.id === rcp));
  assert.ok(!list.some(d => d.id === rcp), 'the receipt row is hidden while paired');
  assert.equal(pairing.pairingOf(1, inv).receipt.id, rcp);
  assert.equal(rec.previewDocument(1, inv).duplicates.some(d => d.kind === 'document' && d.id === rcp), false, 'the paired receipt is not a duplicate of its invoice');
  pairing.pairBatch(1, b); // idempotent
  assert.equal(row(rcp).pairedWithId, inv);
});

test('mismatching amount or supplier, and two receipts, are not paired and get the note', async () => {
  const amount = batch();
  const a1 = await inBatch(amount, extracted({ number: 'PR-2' }));
  const a2 = await inBatch(amount, receiptData({ totals: { net: 20, vat: 4.2, gross: 30 } }));
  pairing.pairBatch(1, amount);
  assert.equal(row(a2).pairedWithId, null);
  assert.equal(row(a1).pairNote, pairing.BATCH_NOTE); assert.equal(row(a2).pairNote, pairing.BATCH_NOTE);
  assert.ok(rec.listDocuments(1).some(d => d.id === a2), 'an unpaired receipt stays in the list');

  const supplier = batch();
  const s1 = await inBatch(supplier, extracted({ number: 'PR-3' }));
  const s2 = await inBatch(supplier, receiptData({ supplier: { name: 'UAB Kitas', code: '555', vatCode: null, address: null } }));
  pairing.pairBatch(1, supplier);
  assert.equal(row(s2).pairedWithId, null); assert.equal(row(s1).pairNote, pairing.BATCH_NOTE);

  const two = batch();
  const t1 = await inBatch(two, extracted({ number: 'PR-4' }));
  const t2 = await inBatch(two, receiptData());
  const t3 = await inBatch(two, receiptData());
  pairing.pairBatch(1, two);
  assert.deepEqual([row(t2).pairedWithId, row(t3).pairedWithId], [null, null]);
  assert.deepEqual([t1, t2, t3].map(i => row(i).pairNote), [pairing.BATCH_NOTE, pairing.BATCH_NOTE, pairing.BATCH_NOTE]);
});

test('confirming the invoice attaches the paired receipt: enrichment and the cash settlement', async () => {
  const b = batch();
  const inv = await inBatch(b, extracted({ number: 'PR-5' }));
  const rcp = await inBatch(b, receiptData());
  pairing.pairBatch(1, b);
  const out = pairing.confirmDocumentWithPair(1, inv, null, good({ number: 'PR-5' }));
  assert.equal(out.pairedReceipt.attached, true);
  const r = row(rcp);
  assert.equal(r.status, 'CONFIRMED'); assert.equal(r.role, 'PAYMENT_RECEIPT'); assert.equal(r.purchaseId, out.purchase.id); assert.equal(r.pairedWithId, null);
  const p = db.prepare('SELECT * FROM Purchase WHERE id=?').get(out.purchase.id);
  assert.deepEqual([p.paymentMethod, p.cashRegisterNo, p.receiptNo, p.documentTime], ['CASH', 'KA-7', '0045', '12:30']);
  assert.equal(openDocuments(db, 1).some(d => d.kind === 'PURCHASE' && d.id === out.purchase.id), false, 'the cash receipt settled the purchase');  // Seen live: after pairing, the review screen showed only the invoice. Both originals are listed for the viewer tabs.
  const both = pairing.pairingOf(1, inv).related;
  assert.deepEqual(both.map(d => [d.id, d.role]), [ [rcp, 'PAYMENT_RECEIPT'] ]);
  assert.ok(both[0].mimeType && both[0].fileName);
});

test('an invoice edited so that the receipt no longer matches leaves the receipt in the queue with the note', async () => {
  const b = batch();
  const inv = await inBatch(b, extracted({ number: 'PR-6' }));
  const rcp = await inBatch(b, receiptData());
  pairing.pairBatch(1, b);
  const edited = good({ number: 'PR-6', lines: [{ itemName: 'Popierius', quantity: 2, net: 25, vat: 5.25, gross: 30.25, vatRate: 21, taxCode: env.CODE }], totals: { net: 25, vat: 5.25, gross: 30.25 } });
  const out = pairing.confirmDocumentWithPair(1, inv, null, edited);
  assert.deepEqual([out.pairedReceipt.attached, out.pairedReceipt.reason], [false, 'MISMATCH']);
  const r = row(rcp);
  assert.equal(r.status, 'EXTRACTED'); assert.equal(r.purchaseId, null); assert.equal(r.pairedWithId, null); assert.equal(r.pairNote, pairing.BATCH_NOTE);
  assert.ok(rec.listDocuments(1).some(d => d.id === rcp), 'the receipt is back in the list');
});

test('unpair returns both documents to the queue and the decision sticks', async () => {
  const b = batch();
  const inv = await inBatch(b, extracted({ number: 'PR-7' }));
  const rcp = await inBatch(b, receiptData());
  pairing.pairBatch(1, b);
  const before = rec.documentCounts(1).awaiting;
  pairing.unpairDocument(1, inv);
  assert.equal(rec.documentCounts(1).awaiting, before + 1);
  assert.deepEqual([row(rcp).pairedWithId, row(rcp).batchId, row(inv).batchId], [null, null, null]);
  pairing.pairBatch(1, b);
  assert.equal(row(rcp).pairedWithId, null, 'not paired again');
  const out = pairing.confirmDocumentWithPair(1, inv, null, good({ number: 'PR-7' }));
  assert.equal(out.pairedReceipt, null);
  assert.throws(() => pairing.unpairDocument(1, inv), /pririšto/);
});

test('rejecting the invoice releases the receipt', async () => {
  const b = batch();
  const inv = await inBatch(b, extracted({ number: 'PR-8' }));
  const rcp = await inBatch(b, receiptData());
  pairing.pairBatch(1, b);
  rec.rejectDocument(1, inv);
  assert.equal(row(rcp).pairedWithId, null);
  assert.ok(rec.listDocuments(1).some(d => d.id === rcp));
});

test('a multi-file e-mail (IMAP and direct path share processMessage) gets one batchId and is paired', async () => {
  inbox.saveInboxSettings(1, { enabled: false, host: '', port: 993, secure: true, username: '', folder: 'INBOX', allowedSenders: 'tiekejas@example.com' });
  const store = new Map();
  remote.setDocumentR2({ get: k => store.get(k) ?? null, put: (k, d) => { store.set(k, d); }, remove: k => { store.delete(k); }, size: k => store.get(k)?.length ?? null, list: () => [] });
  const queue = [extracted({ number: 'PR-9' }), receiptData()];
  const deps = { recognize: async (companyId, id) => { await rec.recognizeDocument(companyId, id, fake(queue.shift())); } };
  const b = 'BND' + crypto.randomUUID().slice(0, 8);
  const part = (name, data) => [`--${b}`, `Content-Type: application/pdf; name="${name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${name}"`, '', data.toString('base64')];
  const head = ['From: Tiekejas <tiekejas@example.com>', 'To: saskaitos@imone.lt', 'Subject: Saskaita ir kvitas', `Message-ID: <${crypto.randomUUID()}@example.com>`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${b}"`, ''];
  const raw = Buffer.from([...head, ...part('saskaita.pdf', pdf()), ...part('kvitas.pdf', pdf()), `--${b}--`, ''].join('\r\n'));
  const key = `inbound/2026/11/${crypto.randomUUID()}.eml`;
  store.set(key, raw);
  const settings = rec.getRecognitionSettings(1);
  assert.ok(settings.enabled && settings.hasKey);
  const result = await inbox.ingestInbound(1, key, remote.rawR2(), deps);
  assert.equal(result.outcome, 'IMPORTED');
  const rows = db.prepare('SELECT * FROM PurchaseDocument WHERE batchId=? ORDER BY id').all(key);
  assert.equal(rows.length, 2, 'both attachments share the R2 key as their batch');
  assert.equal(rows[1].pairedWithId, rows[0].id);
  // A single attachment has no batch.
  const single = Buffer.from([...head.map(l => (l.startsWith('Message-ID') ? `Message-ID: <${crypto.randomUUID()}@example.com>` : l)), ...part('s.pdf', pdf()), `--${b}--`, ''].join('\r\n'));
  const key2 = `inbound/2026/11/${crypto.randomUUID()}.eml`;
  store.set(key2, single);
  await inbox.ingestInbound(1, key2, remote.rawR2(), { recognize: null });
  assert.equal(db.prepare('SELECT batchId FROM PurchaseDocument ORDER BY id DESC LIMIT 1').get().batchId, null);
});

test('a multi-file share is one batch; a single file has none', async () => {
  const file = () => new File([Buffer.from('%PDF-1.4 ' + crypto.randomUUID())], 'f.pdf', { type: 'application/pdf' });
  const paired = [];
  const deps = { store: input => rec.storeDocument(1, input), recognize: null, pair: id => paired.push(id) };
  const many = await share.processSharedFiles([file(), file()], 'a@example.org', deps);
  const batches = many.stored.map(id => row(id).batchId);
  assert.ok(batches[0] && batches[0] === batches[1]);
  assert.deepEqual(paired, [batches[0]]);
  const one = await share.processSharedFiles([file()], 'a@example.org', deps);
  assert.equal(row(one.stored[0]).batchId, null);
  assert.equal(paired.length, 1);
});

// ---------- manual pairing ----------
const stored = (companyId = 1) => rec.storeDocument(companyId, { buffer: pdf(), fileName: 'm.pdf', mimeType: 'application/pdf', batchId: null }).id;

test('manual pair: rules (open only, same company, no self, not already paired) and swap', async () => {
  const a = stored(), b = stored(), c = stored();
  assert.throws(() => pairing.pairManually(1, a, a), /pačiu savimi/);
  const other = stored(2);
  assert.throws(() => pairing.pairManually(1, a, other), /nerastas|nerasta/i, 'another company is not visible');
  pairing.pairManually(1, a, b);
  assert.equal(row(b).pairedWithId, a); assert.equal(row(b).pairManual, 1); assert.equal(row(a).pairedWithId, null);
  assert.throws(() => pairing.pairManually(1, a, c), /jau sujungtas/, 'the invoice already has a receipt');
  assert.throws(() => pairing.pairManually(1, c, b), /jau sujungtas/, 'the receipt is already paired');
  assert.throws(() => pairing.pairManually(1, b, c), /jau sujungtas/, 'a paired receipt cannot become an invoice');
  const rejected = stored(); rec.rejectDocument(1, rejected);
  assert.throws(() => pairing.pairManually(1, c, rejected), /neapdorotus/);
  // swap: the second document is the main one
  pairing.unpairDocument(1, a);
  pairing.pairManually(1, b, a);
  assert.equal(row(a).pairedWithId, b);
  const info = pairing.pairingOf(1, b);
  assert.equal(info.receipt.id, a);
});

test('manual pair: the receipt is attached on confirm without recognition data, and unpair works', () => {
  const inv = stored(), rcp = stored();
  pairing.pairManually(1, inv, rcp);
  const list = rec.listDocuments(1);
  assert.ok(list.some(d => d.id === inv && d.pairedReceipt?.id === rcp));
  assert.ok(!list.some(d => d.id === rcp));
  const out = pairing.confirmDocumentWithPair(1, inv, null, good({ number: 'MAN-1' }));
  assert.deepEqual([out.pairedReceipt.attached, out.pairedReceipt.manual], [true, true]);
  const r = row(rcp);
  assert.deepEqual([r.status, r.role, r.purchaseId, r.pairedWithId, r.pairManual], ['CONFIRMED', 'PAYMENT_RECEIPT', out.purchase.id, null, null]);

  const i2 = stored(), r2 = stored();
  pairing.pairManually(1, i2, r2);
  pairing.unpairDocument(1, r2);
  assert.deepEqual([row(r2).pairedWithId, row(r2).pairManual], [null, null]);
  assert.equal(pairing.confirmDocumentWithPair(1, i2, null, good({ number: 'MAN-2' })).pairedReceipt, null);
});

test('a manual pair survives a re-evaluation of its batch, and unpaired batch siblings are exposed', async () => {
  const b = batch();
  const s1 = rec.storeDocument(1, { buffer: pdf(), fileName: 's1.pdf', mimeType: 'application/pdf', batchId: b }).id;
  const s2 = rec.storeDocument(1, { buffer: pdf(), fileName: 's2.pdf', mimeType: 'application/pdf', batchId: b }).id;
  const list = rec.listDocuments(1);
  assert.deepEqual([s1, s2].map(id => list.find(d => d.id === id).batchId), [b, b]);
  assert.deepEqual(pairing.pairingOf(1, s1).siblings.map(s => s.id), [s2]);
  pairing.pairManually(1, s1, s2);
  pairing.pairBatch(1, b);
  assert.equal(row(s2).pairedWithId, s1, 'pairBatch leaves the manual pair alone');
  assert.deepEqual(pairing.pairingOf(1, s1).siblings, []);
});
