const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-recognition-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
company.run(1, 'UAB Pirkėjas', '111111111', 'LT111111119');
company.run(2, 'UAB Kita', '222222222', 'LT222222229');
company.run(3, 'MB Be PVM', '333333333', null);
fixture.close();
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { getDb } = require('../src/lib/db.ts');
const rec = require('../src/lib/purchase-recognition.ts');
const { RecognitionError } = require('../src/lib/recognition/types.ts');
const { codesFor } = require('../src/lib/tax-codes.ts');
const { decryptSecret } = require('../src/lib/company-mail.ts');
const db = getDb();
db.prepare('UPDATE Company SET isVatPayer=1 WHERE id IN (1,2)').run();
db.prepare('UPDATE Company SET isVatPayer=0 WHERE id=3').run();
const CODE = codesFor('PURCHASE')[0];
const EXPENSE = db.prepare("SELECT code FROM ChartOfAccount WHERE code GLOB '[6-7]*' AND code NOT LIKE '27%' ORDER BY code LIMIT 1").get().code;

let counter = 0;
const pdf = (tag = '') => Buffer.from(`%PDF-1.4 ${tag || ++counter} ${crypto.randomUUID()}`);
const extracted = (over = {}) => ({
  docKind: 'INVOICE',
  supplier: { name: 'UAB Tiekėjas', code: '300000001', vatCode: 'LT100000000011', address: 'Vilnius' },
  buyer: { name: 'UAB Pirkėjas', code: '111111111', vatCode: 'LT111111119' },
  series: null, number: 'TIEK-1', issueDate: '2026-10-20', dueDate: '2026-11-03', currency: 'EUR',
  lines: [{ name: 'Popierius', quantity: 2, unitPrice: 10, net: 20, vatRate: 21, vat: 4.2, gross: 24.2 }],
  totals: { net: 20, vat: 4.2, gross: 24.2 }, vatBreakdown: [{ rate: 21, net: 20, vat: 4.2 }],
  receipt: null, payment: { method: null, cardLast4: null }, uncertainFields: [], notes: null, ...over,
});
const fake = result => ({ calls: [], async recognize(file, opts) { this.calls.push({ file, opts }); if (result instanceof Error) throw result; return typeof result === 'function' ? result() : result; } });
rec.saveRecognitionSettings(1, { enabled: true, apiKey: 'sk-test-secret-key', model: '' });
rec.saveRecognitionSettings(3, { enabled: true, apiKey: 'sk-test-secret-key-3' });

async function extractedDoc(companyId, data, companyExtracted = extracted()) {
  const row = rec.storeDocument(companyId, { buffer: pdf(), fileName: 'a.pdf', mimeType: 'application/pdf' });
  const out = await rec.recognizeDocument(companyId, row.id, fake(companyExtracted));
  assert.equal(out.status, 'EXTRACTED');
  return row.id;
}
const good = (over = {}) => ({
  supplier: { name: 'UAB Tiekėjas', code: '300000001', vatCode: 'LT100000000011', address: 'Vilnius', create: true },
  series: '', number: 'TIEK-1', issueDate: '2026-10-20',
  lines: [{ itemName: 'Popierius', quantity: 2, net: 20, vat: 4.2, gross: 24.2, vatRate: 21, taxCode: CODE }],
  totals: { net: 20, vat: 4.2, gross: 24.2 }, ...over,
});
const fieldsOf = fn => { try { fn(); } catch (e) { return e.fields; } assert.fail('expected a refusal'); };
const counts = () => ({ p: db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, c: db.prepare('SELECT COUNT(*) n FROM Client').get().n });

test('store: keeps the original byte for byte, write-once, refuses duplicates and unsupported files', () => {
  const data = pdf('same');
  const row = rec.storeDocument(1, { buffer: data, fileName: '../../evil name.pdf', mimeType: 'application/pdf' });
  assert.equal(row.status, 'NEW'); assert.equal(row.fileName, 'evil name.pdf'); assert.equal(row.mimeType, 'application/pdf'); assert.equal(row.sha256, crypto.createHash('sha256').update(data).digest('hex'));
  assert.match(row.storagePath, /^1\/\d{4}\/[a-f0-9]{64}\.pdf$/);
  assert.deepEqual(rec.readDocumentFile(1, row.id).data, data);
  assert.ok(fs.existsSync(path.join(temp, 'documents', row.storagePath)));
  assert.throws(() => rec.storeDocument(1, { buffer: data, fileName: 'again.pdf', mimeType: 'application/pdf' }), e => e.status === 409 && e.message.includes(`Nr. ${row.id}`));
  // The same file in another company is a separate document.
  assert.equal(rec.storeDocument(2, { buffer: data, fileName: 'x.pdf', mimeType: 'application/pdf' }).companyId, 2);
  assert.throws(() => rec.getDocument(2, row.id), e => e.status === 404);
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]);
  assert.equal(rec.storeDocument(1, { buffer: heic, fileName: 'a.heic', mimeType: 'image/heic' }).mimeType, 'image/heic', 'HEIC photos are accepted and stored as they are');
  assert.throws(() => rec.storeDocument(1, { buffer: heic, fileName: 'a.jpg', mimeType: 'image/jpeg' }), e => e.status === 415);
  assert.throws(() => rec.storeDocument(1, { buffer: Buffer.from('MZ not a document'), fileName: 'a.pdf', mimeType: 'application/pdf' }), e => e.status === 415);
  assert.throws(() => rec.storeDocument(1, { buffer: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20)]), fileName: 'a.pdf', mimeType: 'application/pdf' }), e => e.status === 415);
  assert.throws(() => rec.storeDocument(1, { buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(20 * 1024 * 1024)]), fileName: 'big.pdf', mimeType: 'application/pdf' }), e => e.status === 413);
  assert.throws(() => rec.storeDocument(1, { buffer: Buffer.alloc(0), fileName: 'e.pdf' }), e => e.status === 400);
  const jpeg = rec.storeDocument(1, { buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(30)]), fileName: 'photo.jpg', mimeType: 'application/octet-stream' });
  assert.equal(jpeg.mimeType, 'image/jpeg');
  const webp = rec.storeDocument(1, { buffer: Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), crypto.randomBytes(20)]), fileName: 'p.webp', mimeType: 'image/webp' });
  assert.equal(webp.mimeType, 'image/webp');
});

test('settings: the API key is encrypted, round-trips and is never returned', () => {
  const settings = rec.getRecognitionSettings(1);
  assert.deepEqual(settings, { enabled: true, model: '', hasKey: true, monthlyLimitEur: null });
  assert.ok(!JSON.stringify(settings).includes('sk-test'));
  const stored = db.prepare('SELECT apiKeyEncrypted FROM CompanyRecognitionSettings WHERE companyId=1').get().apiKeyEncrypted;
  assert.ok(stored && !stored.includes('sk-test'));
  assert.equal(decryptSecret(stored, 1), 'sk-test-secret-key');
  assert.throws(() => decryptSecret(stored, 2), e => e.status === 503);
  assert.throws(() => rec.saveRecognitionSettings(2, { enabled: true }), e => e.status === 400);
  assert.deepEqual(rec.saveRecognitionSettings(1, { enabled: true, model: 'model-x' }), { enabled: true, model: 'model-x', hasKey: true, monthlyLimitEur: null });
  assert.equal(decryptSecret(db.prepare('SELECT apiKeyEncrypted FROM CompanyRecognitionSettings WHERE companyId=1').get().apiKeyEncrypted, 1), 'sk-test-secret-key');
  assert.throws(() => rec.saveRecognitionSettings(1, { enabled: true, model: 'bad model!' }), e => e.status === 400);
  rec.saveRecognitionSettings(1, { enabled: true, model: '' });
});

test('recognize: success stores the extraction, failure keeps the error, disabled company is refused', async () => {
  const row = rec.storeDocument(1, { buffer: pdf(), fileName: 'a.pdf', mimeType: 'application/pdf' });
  const provider = fake(extracted());
  const done = await rec.recognizeDocument(1, row.id, provider);
  assert.equal(done.status, 'EXTRACTED'); assert.equal(done.storagePath, undefined); assert.equal(done.extractedJson, undefined);
  assert.equal(provider.calls[0].opts.apiKey, 'sk-test-secret-key'); assert.equal(provider.calls[0].file.mimeType, 'application/pdf');
  assert.deepEqual(JSON.parse(db.prepare('SELECT extractedJson FROM PurchaseDocument WHERE id=?').get(row.id).extractedJson).supplier.name, 'UAB Tiekėjas');
  const bad = rec.storeDocument(1, { buffer: pdf(), fileName: 'b.pdf', mimeType: 'application/pdf' });
  const failed = await rec.recognizeDocument(1, bad.id, fake(new RecognitionError('AUTH', 'Neteisingas atpažinimo paslaugos API raktas. Patikrinkite nustatymus.')));
  assert.equal(failed.status, 'FAILED'); assert.match(failed.error, /API raktas/); assert.ok(!JSON.stringify(failed).includes('sk-test'));
  const crash = rec.storeDocument(1, { buffer: pdf(), fileName: 'c.pdf', mimeType: 'application/pdf' });
  const origError = console.error; console.error = () => {};
  try { assert.equal((await rec.recognizeDocument(1, crash.id, fake(new Error('boom sk-test-secret-key')))).status, 'FAILED'); } finally { console.error = origError; }
  assert.ok(!db.prepare('SELECT error FROM PurchaseDocument WHERE id=?').get(crash.id).error.includes('sk-test'));
  assert.equal((await rec.recognizeDocument(1, bad.id, fake({ nonsense: true }))).status, 'FAILED');
  assert.equal((await rec.recognizeDocument(1, bad.id, fake(extracted()))).status, 'EXTRACTED');
  const other = rec.storeDocument(2, { buffer: pdf(), fileName: 'd.pdf', mimeType: 'application/pdf' });
  await assert.rejects(rec.recognizeDocument(2, other.id, fake(extracted())), e => e.status === 409);
  await assert.rejects(rec.recognizeDocument(1, other.id, fake(extracted())), e => e.status === 404);
  assert.equal((await rec.recognizeDocument(1, row.id, fake(extracted()))).status, 'EXTRACTED', 'a reviewed-but-unconfirmed document may be recognized again');
});

test('preview: supplier match, new supplier, arithmetic, buyer, duplicates, suggestions and the missing map', async () => {
  db.prepare("INSERT INTO Client(companyId,name,code,vatCode,createdAt,updatedAt) VALUES(1,'UAB Senas Tiekėjas','400000004','LT400000000041',datetime('now'),datetime('now'))").run();
  const known = db.prepare("SELECT id FROM Client WHERE code='400000004'").get().id;
  let id = await extractedDoc(1, null, extracted({ supplier: { name: 'Kitaip parašyta', code: '400000004', vatCode: null, address: null } }));
  let p = rec.previewDocument(1, id);
  assert.equal(p.supplier.clientId, known); assert.equal(p.needsSupplier, false); assert.equal(p.buyerMatches, true);
  id = await extractedDoc(1, null, extracted({ supplier: { name: 'Pagal PVM', code: null, vatCode: 'lt 400000000041', address: null } }));
  assert.equal(rec.previewDocument(1, id).supplier.clientId, known);
  id = await extractedDoc(1, null, extracted());
  p = rec.previewDocument(1, id);
  assert.equal(p.needsSupplier, true); assert.equal(p.suggestedEvidenceType, 'INVOICE'); assert.deepEqual(p.warnings, []);
  assert.ok(p.missing['lines.0.taxCode'] && p.missing['supplier.name'] === undefined);
  assert.equal(p.draft.lines[0].taxCode, null);

  id = await extractedDoc(1, null, extracted({ totals: { net: 20, vat: 4.2, gross: 25 }, lines: [{ name: 'x', quantity: 1, unitPrice: 20, net: 20, vatRate: 21, vat: 4.2, gross: 24.2 }], vatBreakdown: [{ rate: 21, net: 20, vat: 5 }] }));
  p = rec.previewDocument(1, id);
  assert.ok(p.warnings.some(w => w.includes('nesutampa su bendra suma')));
  assert.ok(p.warnings.some(w => w.includes('nesudaro')));
  assert.ok(p.warnings.some(w => w.includes('tarifo')));
  assert.ok(rec.previewDocument(1, await extractedDoc(1, null, extracted({ totals: { net: 20.01, vat: 4.2, gross: 24.21 } }))).warnings.length === 0, '0.01 tolerance');

  id = await extractedDoc(1, null, extracted({ docKind: 'RECEIPT', buyer: { name: null, code: null, vatCode: null }, receipt: { cashRegisterNo: 'KA123456', receiptNo: '0042', time: '14:05', storeAddress: 'Kaunas' }, payment: { method: 'CARD', cardLast4: '1234' }, number: null }));
  p = rec.previewDocument(1, id);
  assert.equal(p.suggestedEvidenceType, 'RECEIPT'); assert.equal(p.suggestedDeductionPercent, 0); assert.equal(p.draft.deductionPercent, 0);
  assert.equal(p.draft.number, '0042'); assert.equal(p.draft.series, 'KA123456'); assert.equal(p.draft.paidBy, 'COMPANY'); assert.equal(p.draft.cardLast4, '1234'); assert.equal(p.draft.documentTime, '14:05');
  assert.ok(p.warnings.some(w => w.includes('kvitą')));
  id = await extractedDoc(1, null, extracted({ buyer: { name: 'X', code: '999', vatCode: null }, number: 'NOVAT-1' }));
  assert.equal(rec.previewDocument(1, id).suggestedEvidenceType, 'RECEIPT');

  id = await extractedDoc(1, null, extracted({ buyer: { name: 'Kita', code: '222222222', vatCode: 'LT222222229' }, number: 'BUY-1' }));
  p = rec.previewDocument(1, id);
  assert.equal(p.buyerMatches, false); assert.ok(p.warnings.some(w => w.includes('nesutampa su įmonės')));

  id = await extractedDoc(3, null, extracted({ number: 'NP-1' }));
  p = rec.previewDocument(3, id);
  assert.equal(p.companyVatPayer, false); assert.equal(p.suggestedDeductionPercent, 0); assert.ok(p.warnings.some(w => w.includes('nėra PVM mokėtoja')));

  id = await extractedDoc(1, null, extracted({ uncertainFields: ['dueDate'], number: 'UNC-1' }));
  assert.deepEqual(rec.previewDocument(1, id).uncertainFields, ['dueDate']);
  const fresh = rec.storeDocument(1, { buffer: pdf(), fileName: 'n.pdf', mimeType: 'application/pdf' });
  const empty = rec.previewDocument(1, fresh.id);
  assert.equal(empty.recognized, false);
  assert.equal(empty.draft.lines.length, 1); assert.equal(empty.draft.paidBy, 'COMPANY'); assert.equal(empty.draft.issueDate, '');
  // Not pre-ticked: switching the currency to USD must show the ECB rate block, not "amounts already in euro".
  assert.equal(empty.draft.amountsInEur, false);
  for (const key of ['supplier.name', 'issueDate', 'number', 'lines.0.itemName']) assert.ok(empty.missing[key], key);
});

test('confirm: edited values win, supplier and purchase are created together, codes and receipt data stored', async () => {
  const id = await extractedDoc(1, null, extracted({ number: 'WRONG-NUMBER', totals: { net: 1, vat: 0, gross: 1 } }));
  const before = counts();
  const out = rec.confirmDocument(1, id, 7, good({ number: 'EDIT-77', notes: 'tikrinta', debitAccount: undefined, paidBy: 'PERSON', paidByName: 'Jonas Jonaitis', paymentMethod: 'CASH', evidenceType: 'INVOICE' }));
  assert.equal(out.purchase.number, 'EDIT-77'); assert.equal(out.purchase.sumWithVat, 24.2); assert.equal(out.purchase.vat, 4.2); assert.equal(out.purchase.clientName, 'UAB Tiekėjas');
  assert.equal(out.createdSupplier, true); assert.deepEqual(counts(), { p: before.p + 1, c: before.c + 1 });
  const client = db.prepare('SELECT * FROM Client WHERE id=?').get(out.purchase.clientId);
  assert.equal(client.code, '300000001'); assert.equal(client.vatCode, 'LT100000000011'); assert.equal(client.address, 'Vilnius');
  assert.equal(out.purchase.paidBy, 'PERSON'); assert.equal(out.purchase.paidByName, 'Jonas Jonaitis'); assert.equal(out.purchase.reimbursedAt, null); assert.equal(out.purchase.evidenceType, 'INVOICE'); assert.equal(out.purchase.paymentMethod, 'CASH');
  assert.equal(out.purchase.deductionPercent, 100); assert.equal(out.purchase.deductibleVat, 4.2);
  assert.equal(db.prepare("SELECT taxCode FROM TaxLineCode WHERE kind='PURCHASE' AND itemId=?").get(out.items[0].id).taxCode, CODE);
  const doc = db.prepare('SELECT * FROM PurchaseDocument WHERE id=?').get(id);
  assert.equal(doc.status, 'CONFIRMED'); assert.equal(doc.purchaseId, out.purchase.id); assert.equal(doc.confirmedBy, 7); assert.ok(doc.confirmedAt);
  assert.throws(() => rec.confirmDocument(1, id, 7, good()), e => e.status === 409);
  assert.throws(() => rec.deleteDocument(1, id), e => e.status === 409);
  assert.throws(() => rec.rejectDocument(1, id), e => e.status === 409);
  // The original survives deletion of the purchase.
  db.prepare('DELETE FROM PurchaseItem WHERE purchaseId=?').run(out.purchase.id);
  db.prepare('DELETE FROM Purchase WHERE id=?').run(out.purchase.id);
  const kept = db.prepare('SELECT purchaseId, status FROM PurchaseDocument WHERE id=?').get(id);
  assert.equal(kept.purchaseId, null); assert.equal(kept.status, 'CONFIRMED');
  assert.ok(rec.readDocumentFile(1, id).data.length > 0);
  // Same supplier is reused (no second client) and the next preview suggests its code and account.
  const id2 = await extractedDoc(1, null, extracted({ number: 'TIEK-2' }));
  const out2 = rec.confirmDocument(1, id2, 7, good({ number: 'TIEK-2', debitAccount: EXPENSE, supplier: { clientId: client.id, name: 'UAB Tiekėjas' } }));
  assert.equal(out2.createdSupplier, false); assert.equal(out2.purchase.clientId, client.id); assert.equal(out2.purchase.debitAccount, EXPENSE);
  const id3 = await extractedDoc(1, null, extracted({ number: 'TIEK-3' }));
  const p3 = rec.previewDocument(1, id3);
  assert.equal(p3.draft.lines[0].suggestedTaxCode, CODE); assert.equal(p3.suggestions.debitAccount, EXPENSE); assert.equal(p3.draft.lines[0].taxCode, null); assert.ok(p3.missing['lines.0.taxCode']);
  // Duplicate number of the same supplier is refused with a field error.
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id3, 7, good({ number: 'TIEK-2', supplier: { clientId: client.id, name: 'x' } }))).number);
});

test('confirm refuses incomplete input with a field map and creates nothing', async () => {
  const id = await extractedDoc(1, null, extracted({ number: 'RB-1', supplier: { name: 'UAB Naujas', code: '500000005', vatCode: null, address: null } }));
  const foreignClient = db.prepare("INSERT INTO Client(companyId,name,createdAt,updatedAt) VALUES(2,'Svetimas',datetime('now'),datetime('now'))").run().lastInsertRowid;
  const before = counts();
  const refuse = (input) => { const f = fieldsOf(() => rec.confirmDocument(1, id, 7, input)); assert.deepEqual(counts(), before); assert.equal(rec.getDocument(1, id).status, 'EXTRACTED'); return f; };
  const base = good({ supplier: { name: 'UAB Naujas', code: '500000005', create: true } });
  assert.ok(refuse({ ...base, supplier: { name: '', code: '500000005', create: true } })['supplier.name']);
  assert.ok(refuse({ ...base, supplier: { name: 'UAB Naujas', code: '', create: true } })['supplier.code']);
  assert.ok(refuse({ ...base, supplier: { name: 'UAB Naujas', code: '500000005' } }).supplier);
  assert.ok(refuse({ ...base, issueDate: '' }).issueDate);
  assert.ok(refuse({ ...base, issueDate: '2026-02-31' }).issueDate);
  assert.ok(refuse({ ...base, number: '' }).number);
  assert.ok(refuse({ ...base, lines: [] }).lines);
  const line = base.lines[0];
  const bad = over => refuse({ ...base, lines: [{ ...line, ...over }] });
  assert.ok(bad({ itemName: ' ' })['lines.0.itemName']);
  assert.ok(bad({ net: undefined })['lines.0.net']);
  assert.ok(bad({ vat: undefined })['lines.0.vat']);
  assert.ok(bad({ gross: undefined })['lines.0.gross']);
  assert.ok(bad({ vatRate: undefined })['lines.0.vatRate']);
  assert.ok(bad({ taxCode: '' })['lines.0.taxCode']);
  assert.ok(bad({ taxCode: 'NOPE' })['lines.0.taxCode']);
  assert.ok(bad({ vat: 5, gross: 25 })['lines.0.vat']);
  assert.ok(bad({ gross: 30 })['lines.0.gross']);
  assert.ok(refuse({ ...base, totals: { net: 20, vat: 4.2, gross: 99 } })['totals.gross']);
  assert.ok(refuse({ ...base, totals: { net: 20, vat: 4.2 } })['totals.gross']);
  assert.ok(refuse({ ...base, paidBy: 'PERSON' }).paidByName);
  assert.ok(refuse({ ...base, paidBy: 'COMPANY', reimbursedAt: '2026-10-25' }).reimbursedAt);
  assert.ok(refuse({ ...base, debitAccount: '4492' }).debitAccount);
  assert.ok(refuse({ ...base, deductionPercent: 150 }).deductionPercent);
  const several = refuse({ ...base, number: '', issueDate: '', lines: [{ ...line, taxCode: '' }] });
  assert.ok(several.number && several.issueDate && several['lines.0.taxCode'], 'all problems are reported together');
  const err = (() => { try { rec.confirmDocument(1, id, 7, { ...base, number: '' }); } catch (e) { return e; } })();
  assert.equal(err.status, 400);
  // The preview reports the same fields the confirmation would refuse.
  const p = rec.previewDocument(1, id);
  assert.ok(p.missing['lines.0.taxCode']);
  // Foreign currency needs an explicit EUR confirmation; a credit note needs its original purchase (see purchase-document-credit.cjs).
  const usd = await extractedDoc(1, null, extracted({ currency: 'USD', number: 'USD-1' }));
  assert.ok(fieldsOf(() => rec.confirmDocument(1, usd, 7, good({ number: 'USD-1' }))).currency);
  const credit = await extractedDoc(1, null, extracted({ docKind: 'CREDIT_NOTE', number: 'KR-9' }));
  assert.ok(fieldsOf(() => rec.confirmDocument(1, credit, 7, good({ number: 'KR-9' })))['credit.original']);
  // Another company cannot confirm this document or pick this company's client.
  assert.throws(() => rec.confirmDocument(2, id, 7, base), e => e.status === 404);
  assert.ok(refuse({ ...base, supplier: { clientId: Number(foreignClient), name: 'x' } }).supplier);
});

test('confirm: receipt data, receipt number fallback and the non-PVM buyer rule', async () => {
  const receipt = extracted({ docKind: 'RECEIPT', number: null, buyer: { name: null, code: null, vatCode: null }, receipt: { cashRegisterNo: 'KA777', receiptNo: '555', time: '09:30', storeAddress: 'Vilnius' }, payment: { method: 'CARD', cardLast4: '4242' }, supplier: { name: 'UAB Parduotuvė', code: null, vatCode: null, address: null } });
  const base = good({ supplier: { name: 'UAB Parduotuvė', create: true }, number: '', series: '', evidenceType: 'RECEIPT', paymentMethod: 'CARD', cardLast4: '4242', cashRegisterNo: 'KA777', receiptNo: '555', documentTime: '09:30' });
  const id = await extractedDoc(1, null, receipt);
  const out = rec.confirmDocument(1, id, 7, base);
  const p = out.purchase;
  assert.equal(p.number, '555'); assert.equal(p.series, 'KA777'); assert.equal(p.evidenceType, 'RECEIPT'); assert.equal(p.deductionPercent, 0); assert.equal(p.deductibleVat, 0);
  assert.equal(p.paymentMethod, 'CARD'); assert.equal(p.cardLast4, '4242'); assert.equal(p.cashRegisterNo, 'KA777'); assert.equal(p.receiptNo, '555'); assert.equal(p.documentTime, '09:30'); assert.equal(p.paidBy, null);
  // Typed series/number win over the receipt fallback.
  const id2 = await extractedDoc(1, null, { ...receipt, receipt: { ...receipt.receipt, receiptNo: '556' } });
  const out2 = rec.confirmDocument(1, id2, 7, { ...base, supplier: { clientId: p.clientId, name: 'UAB Parduotuvė' }, series: 'SER', number: 'N-1', receiptNo: '556' });
  assert.equal(out2.purchase.series, 'SER'); assert.equal(out2.purchase.number, 'N-1'); assert.equal(out2.purchase.receiptNo, '556');
  // Company card data only with a card payment.
  const id3 = await extractedDoc(1, null, { ...receipt, receipt: { ...receipt.receipt, receiptNo: '557' } });
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id3, 7, { ...base, paymentMethod: 'CASH', receiptNo: '557' })).cardLast4);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id3, 7, { ...base, documentTime: '25:99', receiptNo: '557' })).documentTime);
  // A buyer that is not a PVM payer never gets deductible VAT.
  const np = await extractedDoc(3, null, extracted({ number: 'NP-9' }));
  assert.ok(fieldsOf(() => rec.confirmDocument(3, np, 7, good({ number: 'NP-9', deductionPercent: 100 }))).deductionPercent);
  const ok = rec.confirmDocument(3, np, 7, good({ number: 'NP-9' }));
  assert.equal(ok.purchase.deductionPercent, 0); assert.equal(ok.purchase.deductibleVat, 0);
});

test('paidBy rules, reimbursement and the unreimbursed list', async () => {
  const { values, errors } = rec.normalizePurchaseExtras({ paidBy: 'PERSON', paidByName: ' Petras ', reimbursedAt: '2026-10-25' });
  assert.deepEqual(errors, {}); assert.equal(values.paidByName, 'Petras');
  assert.ok(rec.normalizePurchaseExtras({ paidBy: 'PERSON' }).errors.paidByName);
  assert.ok(rec.normalizePurchaseExtras({ paidBy: 'COMPANY', paidByName: 'X' }).errors.paidByName);
  assert.ok(rec.normalizePurchaseExtras({ reimbursedAt: '2026-10-25' }).errors.reimbursedAt);
  assert.ok(rec.normalizePurchaseExtras({ paidBy: 'X' }).errors.paidBy);
  assert.deepEqual(rec.normalizePurchaseExtras({ paidBy: 'COMPANY', paymentMethod: 'CARD', cardLast4: '1234' }).errors, {});
  const make = async (number, paidBy, name) => {
    const id = await extractedDoc(1, null, extracted({ number }));
    return rec.confirmDocument(1, id, 7, good({ number, supplier: { name: 'UAB Tiekėjas', code: '300000001', create: true }, paidBy, paidByName: name })).purchase;
  };
  const a = await make('PB-1', 'PERSON', 'Ona Onaitė');
  const b = await make('PB-2', 'PERSON', 'Ona Onaitė');
  const c = await make('PB-3', 'COMPANY');
  const owed = rec.unreimbursedPurchases(1);
  assert.deepEqual(owed.people, [{ name: 'Ona Onaitė', owed: 48.4 }]); assert.equal(owed.purchases.length, 2);
  assert.throws(() => rec.reimbursePurchase(1, c.id, '2026-10-30'), e => e.status === 409);
  assert.throws(() => rec.reimbursePurchase(1, a.id, 'bad'), e => e.status === 400);
  assert.throws(() => rec.reimbursePurchase(1, a.id, '2026-10-01'), e => e.status === 400);
  assert.throws(() => rec.reimbursePurchase(2, a.id, '2026-10-30'), e => e.status === 404);
  assert.equal(rec.reimbursePurchase(1, a.id, '2026-10-30').reimbursedAt, '2026-10-30');
  assert.throws(() => rec.reimbursePurchase(1, a.id, '2026-10-31'), e => e.status === 409);
  assert.deepEqual(rec.unreimbursedPurchases(1).people, [{ name: 'Ona Onaitė', owed: 24.2 }]);
  assert.equal(b.paidBy, 'PERSON');
});

test('inbox counts, listing, reject and delete', async () => {
  const before = rec.documentCounts(2);
  const row = rec.storeDocument(2, { buffer: pdf(), fileName: 'l.pdf', mimeType: 'application/pdf' });
  assert.equal(rec.documentCounts(2).NEW, before.NEW + 1); assert.equal(rec.documentCounts(2).awaiting, before.awaiting + 1);
  assert.ok(rec.listDocuments(2, 'NEW').some(d => d.id === row.id && d.storagePath === undefined));
  assert.equal(rec.rejectDocument(2, row.id).status, 'REJECTED');
  assert.equal(rec.documentCounts(2).REJECTED, before.REJECTED + 1); assert.equal(rec.documentCounts(2).awaiting, before.awaiting);
  const full = path.join(temp, 'documents', row.storagePath);
  assert.ok(fs.existsSync(full));
  rec.deleteDocument(2, row.id);
  assert.ok(!fs.existsSync(full));
  assert.throws(() => rec.getDocument(2, row.id), e => e.status === 404);
  const c1 = rec.documentCounts(1);
  assert.equal(c1.awaiting, c1.NEW + c1.EXTRACTED + c1.FAILED);
});

test('the cloud vendor is named only inside the provider adapter (and its one-line factory)', () => {
  const vendor = new RegExp(['anthro', 'pic'].join(''), 'i');
  const root = path.join(__dirname, '../src');
  const hits = [];
  const walk = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else if (vendor.test(fs.readFileSync(full, 'utf8')) || vendor.test(entry.name)) hits.push(path.relative(root, full).replace(/\\/g, '/')); } };
  walk(root);
  assert.deepEqual(hits.sort(), ['lib/help/pages-recognition.ts', 'lib/recognition/factory.ts', ['lib/recognition/provider-anthro', 'pic.ts'].join('')]);
  // Model names live in one small constant module; the UI imports the labels from it and never spells them.
  const model = new RegExp(['clau', 'de'].join(''), 'i');
  const modelHits = [];
  const walkModels = dir => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.name.startsWith('.')) continue; else if (entry.isDirectory()) walkModels(full); else if (model.test(fs.readFileSync(full, 'utf8'))) modelHits.push(path.relative(root, full).split(path.sep).join('/')); } };
  walkModels(root);
  assert.deepEqual(modelHits.sort(), ['lib/help/pages-recognition.ts', 'lib/recognition/models.ts']);
  const core = fs.readFileSync(path.join(root, 'lib/purchase-recognition.ts'), 'utf8');
  assert.ok(!/provider-|factory/.test(core));
});

test('manual entry: a NEW and a FAILED document are confirmed without recognition and the original is linked', async () => {
  const manual = (n) => ({
    supplier: { name: 'UAB Rankinis', code: '300000777', vatCode: 'LT300000777', address: '', create: true }, series: '', number: n, issueDate: '2026-10-21',
    lines: [{ itemName: 'Popierius', quantity: 1, net: 10, vat: 2.1, gross: 12.1, vatRate: 21, taxCode: CODE }], totals: { net: 10, vat: 2.1, gross: 12.1 },
    evidenceType: 'INVOICE', paidBy: 'COMPANY', amountsInEur: true,
  });
  const fresh = rec.storeDocument(1, { buffer: pdf(), fileName: 'man.pdf', mimeType: 'application/pdf' });
  assert.equal(fresh.status, 'NEW');
  const out = rec.confirmDocument(1, fresh.id, 7, manual('MAN-1'));
  assert.equal(out.document.status, 'CONFIRMED'); assert.equal(out.document.purchaseId, out.purchase.id); assert.equal(out.createdSupplier, true);
  // A never-recognised document must not be labelled as recognised in the PVM code history.
  assert.equal(db.prepare("SELECT note FROM TaxLineCode WHERE kind='PURCHASE' AND itemId=?").get(out.items[0].id).note, 'Pagal gautą dokumentą (įvesta rankiniu būdu)');

  const failed = rec.storeDocument(1, { buffer: pdf(), fileName: 'fail.pdf', mimeType: 'application/pdf' });
  await rec.recognizeDocument(1, failed.id, fake(new RecognitionError('API', 'boom')));
  assert.equal(rec.getDocument(1, failed.id).status, 'FAILED');
  const again = rec.confirmDocument(1, failed.id, 7, manual('MAN-2'));
  assert.equal(again.document.status, 'CONFIRMED'); assert.equal(again.createdSupplier, false);

  assert.throws(() => rec.confirmDocument(1, fresh.id, 7, manual('MAN-3')), e => e.status === 409);
  const rejected = rec.storeDocument(1, { buffer: pdf(), fileName: 'rej.pdf', mimeType: 'application/pdf' });
  rec.rejectDocument(1, rejected.id);
  assert.throws(() => rec.confirmDocument(1, rejected.id, 7, manual('MAN-4')), e => e.status === 409);
});

test('supplier lookup by company code and VAT code', () => {
  const hit = rec.lookupSupplier(1, '300000777', '');
  assert.ok(hit); assert.equal(hit.name, 'UAB Rankinis');
  assert.equal(rec.lookupSupplier(1, '', 'lt 300000777').id, hit.id);
  assert.equal(rec.lookupSupplier(1, '999', 'LT999'), null);
  assert.equal(rec.lookupSupplier(2, '300000777', ''), null, 'other company');
});

test('expense account: supplier history pre-fill, validated model suggestion, precedence and the audit source', async () => {
  const [A, B, C] = db.prepare("SELECT code FROM ChartOfAccount WHERE code GLOB '6[0-9][0-9][0-9]' ORDER BY code LIMIT 3").all().map(r => r.code);
  assert.ok(A && B && C, 'the test chart has three expense accounts');
  const sup = { code: '600000006', vatCode: null, name: 'UAB Istorija', address: null };
  const confirm = async (number, date, input, over = {}) => {
    const id = await extractedDoc(1, null, extracted({ number, issueDate: date, supplier: sup, ...over }));
    const out = rec.confirmDocument(1, id, 7, good({ number, issueDate: date, ...input }));
    return { id, out };
  };
  // The first purchase creates the supplier; later ones are filed under it with different dates and accounts.
  const first = await confirm('IST-1', '2026-09-01', { supplier: { name: sup.name, code: sup.code, create: true }, debitAccount: A });
  const clientId = first.out.purchase.clientId;
  const ref = { clientId, name: sup.name };
  await confirm('IST-2', '2026-10-01', { supplier: ref, debitAccount: B });
  await confirm('IST-3', '2026-10-15', { supplier: ref }); // newest, but without an account: skipped
  assert.equal(db.prepare('SELECT accountSource FROM PurchaseDocument WHERE id=?').get(first.id).accountSource, 'USER');

  // History: the most recent NON-EMPTY account wins, the label data names the source purchase, nothing but the account is pre-filled.
  const withModel = extracted({ number: 'IST-4', supplier: sup, suggestedAccount: { code: C, reason: 'Kuras' } });
  const id4 = await extractedDoc(1, null, withModel);
  const p4 = rec.previewDocument(1, id4);
  assert.equal(p4.draft.debitAccount, B); assert.equal(p4.draft.accountSource, 'HISTORY');
  assert.equal(p4.draft.accountInfo.number, 'IST-2'); assert.equal(p4.draft.accountInfo.date, '2026-10-01'); assert.ok(p4.draft.accountInfo.purchaseId);
  assert.equal(p4.draft.lines[0].taxCode, null, 'VAT codes stay a hint');
  assert.equal(p4.suggestions.modelAccount.code, C, 'history beats the model, the suggestion stays available to the client');
  assert.equal(rec.lookupSupplier(1, sup.code, '').accountHistory.account, B);
  assert.equal(rec.supplierAccountHistory(db, 2, clientId), null, 'history never crosses companies');

  // No history: the validated model suggestion is pre-filled; the reason is cut to 120 characters and cleaned.
  const fresh = (n, code, reason) => extracted({ number: n, supplier: { name: 'UAB Naujokas', code: '700000007', vatCode: null, address: null }, suggestedAccount: { code, reason } });
  const long = 'Kuras\n' + 'x'.repeat(200);
  const pm = rec.previewDocument(1, await extractedDoc(1, null, fresh('NJ-1', C, long)));
  assert.equal(pm.draft.debitAccount, C); assert.equal(pm.draft.accountSource, 'MODEL');
  assert.ok(pm.draft.accountInfo.reason.length <= 120 && !pm.draft.accountInfo.reason.includes('\n'));
  // Unknown, reserved and out-of-class codes are discarded: the field stays empty (6118 by default).
  for (const code of ['9999', '4492', '2444', '2410', '5001', 'abc', null]) {
    const id = await extractedDoc(1, null, fresh('NJ-' + code, code, 'Netinka'));
    const p = rec.previewDocument(1, id);
    assert.equal(p.draft.debitAccount, null, String(code)); assert.equal(p.draft.accountSource, null); assert.equal(p.suggestions.modelAccount, null);
    assert.equal(JSON.parse(rec.getDocument(1, id).extractedJson).suggestedAccount, null, 'dropped before it is stored');
  }
  // A recognition result without the field (older extractions) still previews.
  assert.equal(rec.previewDocument(1, await extractedDoc(1, null, extracted({ number: 'NJ-OLD', supplier: { name: 'UAB Senas', code: '800000008', vatCode: null, address: null } }))).draft.debitAccount, null);

  // The provider gets a compact chart of accounts a purchase may be posted to.
  const spy = fake(extracted({ number: 'NJ-SPY' }));
  const spyRow = rec.storeDocument(1, { buffer: pdf(), fileName: 's.pdf', mimeType: 'application/pdf' });
  await rec.recognizeDocument(1, spyRow.id, spy);
  const offered = spy.calls[0].opts.accounts;
  assert.ok(offered.length > 3 && offered.every(a => a.code && a.name));
  assert.ok(offered.some(a => a.code === A) && !offered.some(a => /^(44|27|5)/.test(a.code) || a.code === '2410' || a.code === '2444'));

  // Audit: the server verifies the claimed source against the facts.
  const audit = async (number, input, over = {}) => {
    const r = await confirm(number, '2026-10-20', { supplier: ref, ...input }, over);
    return db.prepare('SELECT accountSource FROM PurchaseDocument WHERE id=?').get(r.id).accountSource;
  };
  assert.equal(await audit('AU-1', { debitAccount: B, accountSource: 'HISTORY' }), 'HISTORY');
  assert.equal(await audit('AU-2', { debitAccount: A, accountSource: 'HISTORY' }), 'USER', 'not the latest account of the supplier');
  assert.equal(await audit('AU-3', { debitAccount: C, accountSource: 'MODEL' }, { suggestedAccount: { code: C, reason: 'Kuras' } }), 'MODEL');
  assert.equal(await audit('AU-4', { debitAccount: C, accountSource: 'MODEL' }), 'USER', 'no such suggestion on the document');
  assert.equal(await audit('AU-5', { debitAccount: A }), 'USER');
  assert.equal(await audit('AU-6', { debitAccount: undefined, accountSource: 'HISTORY' }), null, 'empty account has no source');
  assert.equal(await audit('AU-7', { debitAccount: '', accountSource: 'USER' }), null);
});
