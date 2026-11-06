const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const env = require('./helpers/recognition-env.cjs')('erp-doc-xml-');
const ubl = require('./helpers/ubl-fixture.cjs');
const { db, rec, src, pdf, extracted, fake } = env;
const inbox = src('document-inbox.ts');
const pkg = src('company-package.ts');
const { translateServerError } = src('errors.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });
db.prepare("UPDATE Company SET taxMode='STANDARD_VAT' WHERE id IN (1,2)").run();

const xml = (over = {}) => Buffer.from(ubl.invoice(over));
const credit = (over = {}) => Buffer.from(ubl.creditNote(over));
const store = (buffer, name = 'saskaita.xml', extra = {}) => rec.storeDocument(1, { buffer, fileName: name, mimeType: 'application/xml', ...extra });
const count = table => db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;

test('store: UBL XML is accepted by content, the PDF of the same invoice is kept as its visual original', () => {
  assert.equal(rec.detectMime(xml()), 'application/xml');
  assert.equal(rec.detectMime(Buffer.from('﻿' + ubl.invoice())), 'application/xml');
  assert.equal(rec.detectMime(Buffer.from('<?xml version="1.0"?><Order><ID>1</ID></Order>')), null);
  assert.throws(() => store(Buffer.from('<?xml version="1.0"?><Order><ID>1</ID></Order>'), 'order.xml'), e => e.status === 415);
  assert.throws(() => store(xml({ number: 'IM-0' }), 'inv.xml', { mimeType: 'application/pdf' }), e => e.status === 415);
  const visual = pdf('visual');
  const row = store(xml({ number: 'IM-1' }), 'IM-1.xml', { mimeType: 'text/xml', visual: { buffer: visual, fileName: 'IM-1.pdf' } });
  assert.equal(row.mimeType, 'application/xml'); assert.equal(row.status, 'EXTRACTED'); assert.match(row.storagePath, /^1\/\d{4}\/[a-f0-9]{64}\.xml$/);
  assert.equal(row.visualName, 'IM-1.pdf'); assert.equal(row.visualSha256, crypto.createHash('sha256').update(visual).digest('hex'));
  assert.ok(fs.existsSync(path.join(env.temp, 'documents', row.storagePath.replace(/[^/]+$/, row.visualSha256 + '.pdf'))));
  const listed = rec.listDocuments(1).find(d => d.id === row.id);
  assert.equal(listed.hasVisual, true); assert.equal(listed.storagePath, undefined); assert.equal(listed.visualSha256, undefined);
  assert.deepEqual({ supplier: listed.summary.supplier, number: listed.summary.number, gross: listed.summary.gross, docKind: listed.summary.docKind }, { supplier: 'UAB Tiekėjas & Ko', number: 'IM-1', gross: 46.6, docKind: 'INVOICE' });
  const seen = rec.readDocumentFile(1, row.id, 'visual');
  assert.equal(seen.row.mimeType, 'application/pdf'); assert.deepEqual(seen.data, visual);
  assert.equal(rec.readDocumentFile(1, row.id).row.mimeType, 'application/xml');
  assert.throws(() => rec.readDocumentFile(1, store(xml({ number: 'IM-2' }), 'IM-2.xml').id, 'visual'), e => e.status === 404);
  // A PDF that already is a queue document is not attached a second time.
  const own = rec.storeDocument(1, { buffer: pdf('own'), fileName: 'own.pdf', mimeType: 'application/pdf' });
  const dup = store(xml({ number: 'IM-3' }), 'IM-3.xml', { visual: { buffer: rec.readDocumentFile(1, own.id).data, fileName: 'own.pdf' } });
  assert.equal(dup.visualName, null);
  // Deleting the item removes both files.
  rec.deleteDocument(1, row.id);
  assert.ok(!fs.existsSync(path.join(env.temp, 'documents', row.storagePath)));
  assert.ok(!fs.existsSync(path.join(env.temp, 'documents', row.storagePath.replace(/[^/]+$/, row.visualSha256 + '.pdf'))));
});

test('XML queue item: no recognition, preview from the UBL reader, confirmed through the XML import', async () => {
  const row = store(xml({ number: 'IM-10' }), 'IM-10.xml');
  const provider = fake(extracted());
  await assert.rejects(() => rec.recognizeDocument(1, row.id, provider), e => e.status === 409);
  assert.equal(provider.calls.length, 0);
  const preview = rec.previewDocument(1, row.id);
  assert.equal(preview.kind, 'xml'); assert.equal(preview.xml.ok, true); assert.equal(preview.xml.needsSupplier, true);
  assert.deepEqual({ n: preview.xml.invoice.number, g: preview.xml.invoice.gross, l: preview.xml.invoice.lines }, { n: 'IM-10', g: 46.6, l: 2 });
  assert.deepEqual(preview.warnings, []); assert.deepEqual(preview.missing, {});
  // A new supplier needs the explicit confirmation of the XML import.
  const before = count('Purchase');
  assert.throws(() => rec.confirmDocument(1, row.id, 5, {}), e => e.status === 409 && /Tiekėjas nerastas/.test(e.message));
  assert.equal(count('Purchase'), before);
  assert.equal(rec.getDocument(1, row.id).status, 'EXTRACTED');
  const out = rec.confirmDocument(1, row.id, 5, { createSupplier: true, deductionPercent: 100 });
  assert.equal(out.purchase.number, 'IM-10'); assert.equal(out.purchase.sumWithVat, 46.6); assert.equal(out.createdSupplier, true);
  const doc = rec.getDocument(1, row.id);
  assert.equal(doc.status, 'CONFIRMED'); assert.equal(doc.purchaseId, out.purchase.id); assert.equal(doc.confirmedBy, 5);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM PurchaseSource WHERE purchaseId=?').get(out.purchase.id).n, 1);
  assert.throws(() => rec.confirmDocument(1, row.id, 5, {}), e => e.status === 409);
  assert.throws(() => rec.deleteDocument(1, row.id), e => e.status === 409);
  // The same invoice as a second file is reported by the preview, not imported twice.
  const again = store(xml({ number: 'IM-10', supplierName: 'UAB Tiekėjas &amp; Ko ' }), 'IM-10-again.xml');
  assert.equal(rec.previewDocument(1, again.id).xml.ok, false);
  assert.match(rec.previewDocument(1, again.id).xml.issues.join(' '), /jau yra pirkimuose/);
  assert.throws(() => rec.confirmDocument(1, again.id, 5, { createSupplier: true }), e => e.status === 422);
  // Another company cannot see or confirm it.
  assert.throws(() => rec.previewDocument(2, again.id), e => e.status === 404);
  // Bad optional values are refused with a field map.
  const bad = store(xml({ number: 'IM-11' }), 'IM-11.xml');
  assert.throws(() => rec.confirmDocument(1, bad.id, 5, { deductionPercent: 150 }), e => Boolean(e.fields && e.fields.deductionPercent));
});

test('XML credit note in the queue: original found by the reference, or chosen, and the credit rules apply', () => {
  const orig = store(xml({ number: 'IM-20', lines: [ubl.line(1, 'Biuro popierius', 10, '2.50', '25.00', 21)], net: '25.00', tax: '5.25', gross: '30.25' }), 'IM-20.xml');
  const imported = rec.confirmDocument(1, orig.id, 5, { createSupplier: true });
  const creditXml = (number, ref) => credit({ number, ref, lines: [ubl.line(1, 'Biuro popierius', 4, '2.50', '10.00', 21)], net: '10.00', tax: '2.10', gross: '12.10' });
  const withRef = store(creditXml('IM-KR-1', ubl.reference('IM-20', '2026-10-20')), 'kr1.xml');
  const p = rec.previewDocument(1, withRef.id);
  assert.equal(p.xml.kind, 'credit'); assert.equal(p.xml.credit.original.id, imported.purchase.id); assert.equal(p.xml.ok, true);
  assert.equal(rec.listDocuments(1).find(d => d.id === withRef.id).summary.docKind, 'CREDIT_NOTE');
  const out = rec.confirmDocument(1, withRef.id, 5, {});
  assert.equal(out.purchase.docType, 'KS'); assert.equal(out.purchase.sumWithVat, -12.1); assert.equal(out.purchase.originalPurchaseId, imported.purchase.id);
  assert.equal(rec.getDocument(1, withRef.id).purchaseId, out.purchase.id);
  // Without a reference the person chooses the original; nothing is guessed.
  const noRef = store(creditXml('IM-KR-2', ''), 'kr2.xml');
  const np = rec.previewDocument(1, noRef.id);
  assert.equal(np.xml.ok, false); assert.equal(np.xml.credit.original, null); assert.ok(np.xml.credit.candidates.some(c => c.id === imported.purchase.id));
  assert.throws(() => rec.confirmDocument(1, noRef.id, 5, {}), e => e.status === 422);
  const chosen = rec.previewDocument(1, noRef.id, { originalPurchaseId: imported.purchase.id });
  assert.equal(chosen.xml.ok, true);
  const done = rec.confirmDocument(1, noRef.id, 5, { originalPurchaseId: imported.purchase.id });
  assert.equal(done.purchase.sumWithVat, -12.1);
});

// ---------- e-mail ----------
let counter = 0;
function mail(atts, from = 'tiekejas@example.com') {
  const b = 'B' + counter++;
  const lines = [`From: Tiekejas <${from}>`, 'To: saskaitos@imone.lt', 'Subject: Saskaita', `Message-ID: <${crypto.randomUUID()}@example.com>`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${b}"`, '', `--${b}`, 'Content-Type: text/plain', '', 'Saskaita priede.'];
  for (const a of atts) lines.push(`--${b}`, `Content-Type: ${a.type}; name="${a.name}"`, 'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${a.name}"`, '', a.data.toString('base64').replace(/(.{76})/g, '$1\r\n'));
  lines.push(`--${b}--`, '');
  return Buffer.from(lines.join('\r\n'));
}
const att = (name, type, data) => ({ name, type, data });
function server(messages) {
  const s = { messages, recognized: [] };
  s.deps = {
    recognize: async (companyId, id) => { s.recognized.push(id); },
    connect: async () => ({
      open: async () => ({ uidValidity: '1' }),
      listUids: async (after) => s.messages.filter(m => m.uid > after).map(m => m.uid),
      fetchSource: async uid => s.messages.find(m => m.uid === uid).source,
      markDone: async () => undefined,
      close: async () => undefined,
    }),
  };
  return s;
}
const queue = () => db.prepare("SELECT * FROM PurchaseDocument WHERE companyId=2 ORDER BY id").all();
const log = () => db.prepare('SELECT * FROM DocumentInboxMessage WHERE companyId=2 ORDER BY uid').all();

test('e-mail: XML e-invoices are queued without recognition; the PDF of the same invoice becomes its visual original', async () => {
  inbox.saveInboxSettings(2, { enabled: true, host: 'imap.example.com', port: 993, secure: true, username: 'saskaitos@imone.lt', password: 'slaptas-123', folder: 'INBOX', processedFolder: '', allowedSenders: '@example.com' });
  db.prepare("UPDATE Company SET isVatPayer=1 WHERE id=2").run();
  // Company 2 is the buyer of these invoices.
  const buyer = { buyerVat: 'LT222222229', buyerCode: '222222222' };
  const s = server([
    { uid: 1, source: mail([att('IM-30.xml', 'application/xml', xml({ number: 'IM-30', ...buyer })), att('IM-30.pdf', 'application/pdf', pdf('a'))]) },
    { uid: 2, source: mail([att('ataskaita.pdf', 'application/pdf', pdf('b')), att('data.xml', 'text/xml', xml({ number: 'IM-31', ...buyer }))]) },
    { uid: 3, source: mail([att('x.xml', 'application/xml', xml({ number: 'IM-32', currency: 'USD', ...buyer })), att('x.pdf', 'application/pdf', pdf('c'))]) },
    { uid: 4, source: mail([att('p1.xml', 'application/xml', xml({ number: 'IM-33', ...buyer })), att('p2.xml', 'application/xml', xml({ number: 'IM-34', ...buyer })), att('p2.pdf', 'application/pdf', pdf('d')), att('other.pdf', 'application/pdf', pdf('e'))]) },
    { uid: 5, source: mail([att('IM-30-copy.xml', 'application/xml', xml({ number: 'IM-30', ...buyer }))]) },
  ]);
  const result = await inbox.pollInbox(2, s.deps);
  assert.equal(result.messages, 5);
  const rows = queue();
  const byName = Object.fromEntries(rows.map(r => [r.fileName, r]));
  // 1) XML + PDF with the same name: one item, the PDF is the visual original, no recognition call.
  assert.equal(byName['IM-30.xml'].mimeType, 'application/xml'); assert.equal(byName['IM-30.xml'].visualName, 'IM-30.pdf'); assert.equal(byName['IM-30.xml'].source, 'EMAIL');
  assert.equal(byName['IM-30.pdf'], undefined);
  // 2) one XML and one PDF with different names: still paired.
  assert.equal(byName['data.xml'].visualName, 'ataskaita.pdf'); assert.equal(byName['ataskaita.pdf'], undefined);
  // 3) an XML the reader refuses (USD) is not queued; its PDF is an ordinary document (and is not recognized here: the fake has no provider).
  assert.equal(byName['x.xml'], undefined); assert.equal(byName['x.pdf'].mimeType, 'application/pdf'); assert.equal(byName['x.pdf'].visualName, null);
  // 4) several XML and PDF: paired by name, the other PDF stays separate.
  assert.equal(byName['p2.xml'].visualName, 'p2.pdf'); assert.equal(byName['p1.xml'].visualName, null); assert.ok(byName['other.pdf']); assert.equal(byName['p2.pdf'], undefined);
  assert.equal(rows.length, 6, 'IM-30, data, x.pdf, p1, p2, other.pdf');
  // 5) the same invoice file again is a duplicate, not a second item.
  assert.equal(byName['IM-30-copy.xml'], undefined);
  assert.match(log()[4].detail, /Dublikatas: IM-30-copy\.xml/);
  assert.match(log()[2].detail, /XML e-sąskaita nepriimta \(x\.xml\)/);
  assert.match(translateServerError(log()[2].detail.split('\n').find(l => l.startsWith('XML')), 'en'), /XML e-invoice not accepted/);
  // No recognition for XML documents; the PDFs were handed to it (recognition is off here, so nobody is called).
  assert.ok(!s.recognized.includes(byName['IM-30.xml'].id) && !s.recognized.includes(byName['p2.xml'].id));
  // The queue item opens as an XML preview and confirms through the XML import.
  const preview = rec.previewDocument(2, byName['IM-30.xml'].id);
  assert.equal(preview.kind, 'xml'); assert.equal(preview.xml.ok, true); assert.equal(preview.document.hasVisual, true);
  assert.equal(rec.confirmDocument(2, byName['IM-30.xml'].id, 5, { createSupplier: true }).purchase.number, 'IM-30');
});

test('company package: XML originals and their visual PDF travel with the export and are restored', () => {
  const doc = db.prepare("SELECT * FROM PurchaseDocument WHERE companyId=2 AND visualName IS NOT NULL ORDER BY id LIMIT 1").get();
  assert.ok(doc);
  const exported = pkg.exportCompany(db, 2);
  const row = exported.data.purchaseDocuments.find(r => r.sha256 === doc.sha256);
  assert.equal(row.visualSha256, doc.visualSha256); assert.equal(row.visualName, doc.visualName);
  const hashes = new Set(exported.data.documentFiles.map(f => f.sha256));
  assert.ok(hashes.has(doc.sha256) && hashes.has(doc.visualSha256));
  const result = pkg.importCompanyPackage(db, JSON.parse(JSON.stringify(exported)), { commit: true, name: 'UAB Kopija', allowDuplicateCode: true });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  const copy = db.prepare('SELECT * FROM PurchaseDocument WHERE companyId=? AND sha256=?').get(result.companyId, doc.sha256);
  assert.equal(copy.visualSha256, doc.visualSha256);
  assert.deepEqual(rec.readDocumentFile(result.companyId, copy.id, 'visual').data, rec.readDocumentFile(2, doc.id, 'visual').data);
  assert.equal(rec.readDocumentFile(result.companyId, copy.id).row.mimeType, 'application/xml');
});
