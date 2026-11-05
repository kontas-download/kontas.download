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

const form = require('../src/lib/purchase-document-form.ts');
const pkg = require('../src/lib/company-package.ts');
const docFiles = require('../src/lib/document-files.ts');
const { namespaces } = require('../src/lib/i18n/messages/index.ts');
const { translateServerError } = require('../src/lib/errors.ts');
const { RECOGNITION_MODELS, DEFAULT_RECOGNITION_MODEL } = require('../src/lib/recognition/models.ts');
const extractedDraft = () => ({
  supplier: { clientId: null, name: 'UAB Tiekėjas', code: '300000001', vatCode: '', address: '' },
  number: 'A-1', issueDate: '2026-10-20', evidenceType: 'INVOICE',
  lines: [{ itemName: 'Popierius', quantity: 2, net: 20, vat: 4.2, gross: 24.2, vatRate: 21, taxCode: null, suggestedTaxCode: CODE }],
  totals: { net: 20, vat: 4.2, gross: 24.2 },
});
const ctx = { extractedSupplierCode: '300000001', docKind: 'INVOICE', currency: 'EUR', allowedTaxCodes: [CODE], companyVatPayer: true };

test('review form: a cash receipt shows 0 % VAT deduction, an invoice goes back to the company regime', () => {
  const f = form.draftToForm(extractedDraft());
  assert.equal(f.deductionPercent, '');
  const receipt = form.applyEvidenceType(f, 'RECEIPT');
  assert.equal(receipt.evidenceType, 'RECEIPT'); assert.equal(receipt.deductionPercent, '0');
  const invoice = form.applyEvidenceType(receipt, 'INVOICE');
  assert.equal(invoice.evidenceType, 'INVOICE'); assert.equal(invoice.deductionPercent, '');
  const manual = form.applyEvidenceType({ ...f, deductionPercent: '50' }, 'RECEIPT');
  assert.equal(manual.deductionPercent, '50'); // an explicit value typed by the user is kept
  assert.equal(form.draftToForm({ ...extractedDraft(), evidenceType: 'RECEIPT' }).deductionPercent, '0');
});

test('review form: draft conversion, mirrored validation and payload', () => {
  const f = form.draftToForm(extractedDraft());
  assert.equal(f.lines[0].taxCode, '');
  assert.equal(f.lines[0].suggestedTaxCode, CODE);
  let errors = form.validateForm(f, ctx);
  assert.deepEqual(Object.keys(errors), ['lines.0.taxCode']);
  f.lines[0].taxCode = CODE;
  assert.deepEqual(form.validateForm(f, ctx), {});
  const payload = form.formToPayload(f);
  assert.equal(payload.supplier.create, true);
  assert.equal(payload.lines[0].net, 20);
  assert.equal(payload.dueDate, undefined);
  f.lines[0].vat = '4,3';
  errors = form.validateForm(f, ctx);
  assert.ok(errors['lines.0.gross'] || errors['lines.0.vat']);
  f.lines[0].vat = '4.2';
  f.paidBy = 'PERSON';
  assert.ok(form.validateForm(f, ctx).paidByName);
  f.paidBy = ''; f.cardLast4 = '1234';
  assert.ok(form.validateForm(f, ctx).cardLast4);
  f.cardLast4 = ''; f.documentTime = '25:00';
  assert.ok(form.validateForm(f, ctx).documentTime);
  f.documentTime = ''; f.supplier.code = '';
  assert.ok(form.validateForm(f, ctx)['supplier.code']);
  const bad = form.validateForm(f, { ...ctx, docKind: 'CREDIT_NOTE', currency: 'USD' });
  assert.ok(bad.currency && bad.docKind);
  f.deductionPercent = '50';
  assert.ok(form.validateForm(f, { ...ctx, companyVatPayer: false }).deductionPercent);
  assert.equal(form.isLowQuality(['a', 'b', 'c', 'd'], { net: 1, vat: 1, gross: 2 }), true);
  assert.equal(form.isLowQuality([], { net: null, vat: null, gross: null }), true);
  assert.equal(form.isLowQuality(['a'], { net: 1, vat: 1, gross: 2 }), false);
  const empty = { net: null, vat: null, gross: null };
  assert.equal(form.shouldShowLowQualityBanner({ recognized: false, uncertainFields: [], extracted: { totals: empty } }), false);
  assert.equal(form.shouldShowLowQualityBanner({ recognized: true, uncertainFields: [], extracted: { totals: empty } }), true);
  assert.equal(form.shouldShowLowQualityBanner({ recognized: true, uncertainFields: ['a'], extracted: { totals: { net: 1, vat: 1, gross: 2 } } }), false);
  assert.equal(form.shouldShowLowQualityBanner(null), false);
  assert.deepEqual(form.manualNotice('NEW', false), { messageKey: null, settingsLink: true });
  assert.deepEqual(form.manualNotice('NEW', true), { messageKey: 'docs.manualNew', settingsLink: false });
  assert.deepEqual(form.manualNotice('FAILED', false), { messageKey: 'docs.manualFailed', settingsLink: true });
});

test('review form payload is accepted by the server confirmation', async () => {
  const docId = await extractedDoc(1, null);
  const f = form.draftToForm(rec.previewDocument(1, docId).draft);
  f.lines[0].taxCode = CODE;
  assert.deepEqual(form.validateForm(f, ctx), {});
  const result = rec.confirmDocument(1, docId, null, form.formToPayload(f));
  assert.equal(result.document.status, 'CONFIRMED');
});

test('key test: stored or typed key, provider failure becomes a message, nothing is saved', async () => {
  const calls = [];
  const provider = { async testKey(key, model) { calls.push({ key, model }); if (key === 'bad') throw new RecognitionError('AUTH', 'Neteisingas atpažinimo paslaugos API raktas. Patikrinkite nustatymus.'); } };
  assert.deepEqual(await rec.testRecognitionKey(1, { model: RECOGNITION_MODELS[1].id }, provider), { ok: true });
  assert.deepEqual(calls[0], { key: 'sk-test-secret-key', model: ['clau', 'de-sonnet-5-5'].join('') });
  assert.deepEqual(await rec.testRecognitionKey(1, { apiKey: 'bad' }, provider), { ok: false, error: 'Neteisingas atpažinimo paslaugos API raktas. Patikrinkite nustatymus.' });
  await assert.rejects(rec.testRecognitionKey(2, {}, provider), e => e.status === 400);
  await assert.rejects(rec.testRecognitionKey(1, { apiKey: 'has space' }, provider), e => e.status === 400);
  assert.equal(rec.getRecognitionSettings(1).hasKey, true);
  assert.equal(DEFAULT_RECOGNITION_MODEL, ['clau', 'de-opus-5-5'].join(''));
  assert.deepEqual(RECOGNITION_MODELS.map(m => m.id), [['clau', 'de-opus-5-5'].join(''), ['clau', 'de-sonnet-5-5'].join(''), ['clau', 'de-haiku-5-5'].join('')]);
});

test('list rows carry the extraction summary and server texts translate', async () => {
  const id = await extractedDoc(1, null);
  const row = rec.listDocuments(1).find(d => d.id === id);
  assert.equal(row.summary.supplier, 'UAB Tiekėjas');
  assert.equal(row.summary.gross, 24.2);
  assert.equal(row.storagePath, undefined);
  assert.equal(translateServerError('Eilutė 2: nurodykite pavadinimą', 'en'), 'Line 2: enter the name');
  assert.equal(translateServerError('Bendra suma turi būti teigiama', 'ru'), 'Общая сумма должна быть положительной');
  assert.match(translateServerError('Šis dokumentas jau įkeltas (Nr. 5, a.pdf).', 'en'), /No\. 5/);
});

test('i18n: the docs namespace is complete in three languages', () => {
  const dict = namespaces.docs;
  for (const lang of ['ru', 'en']) assert.deepEqual(Object.keys(dict[lang]).sort(), Object.keys(dict.lt).sort());
  for (const key of ['navTitle', 'blurry', 'testKey', 'keyStored', 'reimbMark']) assert.ok(dict.lt[key] && dict.ru[key] && dict.en[key]);
});

test('company export carries documents and extra purchase fields; import restores them under the new company', () => {
  const buffer = pdf('export');
  const row = rec.storeDocument(1, { buffer, fileName: 'export.pdf', mimeType: 'application/pdf' });
  const purchase = db.prepare("INSERT INTO Purchase(companyId,series,number,purchaseDate,clientName,sumWithoutVat,vat,sumWithVat,paidBy,paidByName,evidenceType) VALUES(1,'X','EXP-1','2026-10-01','Tiek',10,2.1,12.1,'PERSON','Jonas','RECEIPT')").run();
  db.prepare("UPDATE PurchaseDocument SET purchaseId=?, status='CONFIRMED' WHERE id=?").run(purchase.lastInsertRowid, row.id);
  const exported = pkg.exportCompany(db, 1);
  assert.ok(exported.data.documentFiles.some(f => f.sha256 === row.sha256 && Buffer.from(f.data, 'base64').equals(buffer)));
  assert.equal(exported.data.purchaseDocuments.find(d => d.sha256 === row.sha256).confirmedBy, undefined);
  assert.equal(exported.data.purchases.find(p => p.number === 'EXP-1').paidByName, 'Jonas');
  const preview = pkg.importCompanyPackage(db, JSON.parse(JSON.stringify(exported)), { commit: false, name: 'Kopija preview', allowDuplicateCode: true });
  assert.equal(preview.ok, true, JSON.stringify(preview.problems));
  const result = pkg.importCompanyPackage(db, JSON.parse(JSON.stringify(exported)), { commit: true, name: 'Kopija su dokumentais', allowDuplicateCode: true });
  assert.equal(result.ok, true, JSON.stringify(result.problems));
  const copy = db.prepare('SELECT * FROM PurchaseDocument WHERE companyId=? AND sha256=?').get(result.companyId, row.sha256);
  assert.ok(copy.storagePath.startsWith(`${result.companyId}/`));
  assert.deepEqual(fs.readFileSync(path.join(temp, 'documents', copy.storagePath)), buffer);
  const copiedPurchase = db.prepare('SELECT * FROM Purchase WHERE companyId=? AND number=?').get(result.companyId, 'EXP-1');
  assert.equal(copy.purchaseId, copiedPurchase.id);
  assert.equal(copiedPurchase.paidBy, 'PERSON');
  assert.equal(copy.confirmedBy, null);
  const broken = JSON.parse(JSON.stringify(exported));
  broken.data.documentFiles[0].data = Buffer.from('tampered').toString('base64');
  broken.checksum = pkg.packageChecksum(broken.data);
  const refused = pkg.importCompanyPackage(db, broken, { commit: true, name: 'Sugadinta', allowDuplicateCode: true });
  assert.equal(refused.ok, false);
  assert.ok(refused.problems.some(p => p.code === 'badDocumentFile'));
});

test('documents archive and file listing for backups', () => {
  const root = path.join(temp, 'documents');
  const files = docFiles.listDocumentFiles(root);
  assert.ok(files.length > 0 && files.every(f => /^\d+\/\d{4}\/[a-f0-9]{64}\.\w+$/.test(f.rel)));
  const archive = docFiles.createDocumentsArchive(root);
  assert.ok(archive && fs.statSync(archive).size > 0);
  fs.rmSync(archive);
  assert.equal(docFiles.createDocumentsArchive(path.join(temp, 'nothing-here')), null);
});

test('R2 backup uploads only the originals missing in the bucket', async () => {
  const uploaded = [];
  const realFetch = global.fetch;
  const r2 = require('../src/lib/r2-backup.ts');
  const files = docFiles.listDocumentFiles(path.join(temp, 'documents'));
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('list=1')) return new Response(JSON.stringify({ objects: [{ key: 'backups/documents/' + files[0].rel, size: files[0].size, uploaded: '', etag: '', url: '' }] }));
    uploaded.push(decodeURIComponent(u.split('key=')[1]));
    return new Response('{}');
  };
  try {
    const result = await r2.backupDocuments();
    assert.equal(result.total, files.length);
    assert.equal(result.alreadyStored, 1);
    assert.equal(result.uploaded, files.length - 1);
    assert.ok(!uploaded.includes('backups/documents/' + files[0].rel));
  } finally { global.fetch = realFetch; }
});
