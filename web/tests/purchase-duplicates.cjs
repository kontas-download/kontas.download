const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-duplicates-'));
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
const dup = require('../src/lib/purchase-duplicates.ts');
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

rec.saveRecognitionSettings(2, { enabled: true, apiKey: 'sk-test-secret-key-2' });
const confirmWith = (id, over = {}) => rec.confirmDocument(1, id, null, { ...good(), ...over });
const line = (gross) => ({ name: 'X', quantity: 1, unitPrice: gross / 1.21, net: Math.round(gross / 1.21 * 100) / 100, vatRate: 21, vat: Math.round((gross - gross / 1.21) * 100) / 100, gross });
const sup = (name, code) => ({ name, code, vatCode: null, address: null });

test('number normalization ignores case, spaces, dashes and leading zeros; pure classification', () => {
  assert.equal(dup.normalizeDocNumber('SF-0012'), dup.normalizeDocNumber('sf 12'));
  assert.equal(dup.normalizeDocNumber('SF-0012'), dup.normalizeDocNumber('SF12'));
  assert.notEqual(dup.normalizeDocNumber('SF-12'), dup.normalizeDocNumber('SF-120'));
  assert.equal(dup.normalizeDocNumber('0'), '0');
  const base = { series: '', number: 'A-1', receiptNo: '', cashRegisterNo: '', date: '2026-10-20', gross: 10 };
  assert.equal(dup.classifyDuplicate(base, { ...base, number: 'a 01' }), 'strong');
  assert.equal(dup.classifyDuplicate({ ...base, number: 'X' }, { ...base, number: 'Y', date: '2026-10-23', gross: 10.01 }), 'possible');
  assert.equal(dup.classifyDuplicate({ ...base, number: 'X' }, { ...base, number: 'Y', date: '2026-10-24' }), null);
  assert.equal(dup.classifyDuplicate({ ...base, number: 'X' }, { ...base, number: 'Y', gross: 10.5 }), null);
  const receipt = { ...base, number: '', receiptNo: '0045', cashRegisterNo: 'KA-7' };
  assert.equal(dup.classifyDuplicate(receipt, { ...receipt, receiptNo: '45', date: '2026-12-01', gross: 99 }), 'strong');
  assert.equal(dup.classifyDuplicate(receipt, { ...receipt, receiptNo: '45', cashRegisterNo: 'KA-8', date: '2026-12-01', gross: 99 }), null);
});

test('strong duplicate: preview lists it, confirm needs confirmDuplicate and answers 409', async () => {
  const first = await extractedDoc(1, null, extracted({ number: 'DUP-0012' }));
  confirmWith(first, { number: 'DUP-0012' });
  const second = await extractedDoc(1, null, extracted({ number: 'dup 12', issueDate: '2026-10-25' }));
  const preview = rec.previewDocument(1, second);
  assert.equal(preview.duplicates.length, 1);
  assert.equal(preview.duplicates[0].strength, 'strong'); assert.equal(preview.duplicates[0].kind, 'purchase'); assert.equal(preview.duplicates[0].number, 'DUP-0012'); assert.equal(preview.duplicates[0].gross, 24.2);
  const before = counts();
  let refusal;
  try { confirmWith(second, { number: 'dup 12', issueDate: '2026-10-25' }); } catch (e) { refusal = e; }
  assert.equal(refusal.status, 409); assert.ok(refusal.fields.confirmDuplicate);
  assert.deepEqual(counts(), before);
  assert.throws(() => confirmWith(second, { number: 'dup 12', issueDate: '2026-10-25', confirmDuplicate: 'yes' }), e => e.status === 409);
  const done = confirmWith(second, { number: 'dup 12', issueDate: '2026-10-25', confirmDuplicate: true });
  assert.equal(done.document.status, 'CONFIRMED');
  assert.match(done.purchase.notes, /nepaisant galimo dublikato/);
});

test('possible duplicate (same supplier, gross, date within 3 days) only warns', async () => {
  const mk = over => ({ number: 'POSS-1', issueDate: '2026-10-22', lines: [{ itemName: 'X', quantity: 1, net: 55, vat: 11.55, gross: 66.55, vatRate: 21, taxCode: CODE }], totals: { net: 55, vat: 11.55, gross: 66.55 }, ...over });
  const ex = over => extracted({ number: 'POSS-1', issueDate: '2026-10-22', totals: { net: 55, vat: 11.55, gross: 66.55 }, lines: [{ name: 'X', quantity: 1, unitPrice: 55, net: 55, vatRate: 21, vat: 11.55, gross: 66.55 }], ...over });
  const id = await extractedDoc(1, null, ex({}));
  confirmWith(id, mk({}));
  const other = await extractedDoc(1, null, ex({ number: 'POSS-2', issueDate: '2026-10-24' }));
  const preview = rec.previewDocument(1, other);
  assert.deepEqual(preview.duplicates.map(d => d.strength), ['possible']);
  assert.equal(confirmWith(other, mk({ number: 'POSS-2', issueDate: '2026-10-24' })).document.status, 'CONFIRMED');
  const far = await extractedDoc(1, null, ex({ number: 'POSS-3', issueDate: '2026-10-30' }));
  assert.equal(rec.previewDocument(1, far).duplicates.length, 0);
});

test('receipt number + cash register number is a strong duplicate', async () => {
  const receipt = { receiptNo: '0045', cashRegisterNo: 'KA-7', time: '10:15', storeAddress: 'Vilnius' };
  const a = await extractedDoc(1, null, extracted({ docKind: 'RECEIPT', number: null, receipt, supplier: sup('UAB Kvitai', '300000009') }));
  confirmWith(a, { supplier: { name: 'UAB Kvitai', code: '300000009', create: true }, number: '', receiptNo: '0045', cashRegisterNo: 'KA-7', evidenceType: 'RECEIPT' });
  const b = await extractedDoc(1, null, extracted({ docKind: 'RECEIPT', number: null, receipt: { ...receipt, receiptNo: '45' }, issueDate: '2026-12-01', totals: { net: 1, vat: 0.21, gross: 1.21 }, lines: [line(1.21)], supplier: sup('UAB Kvitai', '300000009') }));
  assert.equal(rec.previewDocument(1, b).duplicates[0]?.strength, 'strong');
});

test('another open document of the queue counts (two photos of one receipt); other companies and suppliers do not', async () => {
  const photo1 = await extractedDoc(1, null, extracted({ number: 'Q-77', supplier: sup('UAB Eilė', '300000077') }));
  const photo2 = await extractedDoc(1, null, extracted({ number: 'q 077', supplier: sup('UAB Eilė', '300000077') }));
  assert.deepEqual(rec.previewDocument(1, photo2).duplicates.map(d => [d.kind, d.id, d.strength]), [['document', photo1, 'strong']]);
  assert.equal(rec.previewDocument(1, photo1).duplicates.some(d => d.id === photo1), false);
  rec.rejectDocument(1, photo1);
  assert.equal(rec.previewDocument(1, photo2).duplicates.length, 0);
  const photo3 = await extractedDoc(1, null, extracted({ number: 'Q-77', supplier: sup('UAB Kita Eilė', '300000078') }));
  const photo4 = await extractedDoc(2, null, extracted({ number: 'Q-77', supplier: sup('UAB Eilė', '300000077') }));
  assert.equal(rec.previewDocument(1, photo3).duplicates.length, 0);
  assert.equal(rec.previewDocument(2, photo4).duplicates.length, 0);
});
