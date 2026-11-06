// Shared fixture of the received-document tests: temporary database, TypeScript loader, companies and the fake recognition provider.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');

module.exports = function setup(prefix) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
  process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  const fixture = new Database(process.env.DATABASE_URL.slice(5));
  fixture.exec(fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8'));
  const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
  company.run(1, 'UAB Pirkėjas', '111111111', 'LT111111119');
  company.run(2, 'UAB Kita', '222222222', 'LT222222229');
  fixture.close();
  const realLoad = Module._load;
  Module._load = function(name, parent, isMain) {
    if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
    if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
    if (name.startsWith('@/')) name = path.join(__dirname, '../../src', name.slice(2));
    return realLoad.call(this, name, parent, isMain);
  };
  require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
  const src = file => require(path.join(__dirname, '../../src/lib', file));
  const { getDb } = src('db.ts');
  const rec = src('purchase-recognition.ts');
  const db = getDb();
  db.prepare('UPDATE Company SET isVatPayer=1 WHERE id IN (1,2)').run();
  const CODE = src('tax-codes.ts').codesFor('PURCHASE')[0];
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
  const fake = result => ({ calls: [], async recognize(file, opts) { this.calls.push({ file, opts }); if (result instanceof Error) throw result; return result; } });
  rec.saveRecognitionSettings(1, { enabled: true, apiKey: 'sk-test-secret-key', model: '' });
  async function extractedDoc(companyId, doc = extracted()) {
    const row = rec.storeDocument(companyId, { buffer: pdf(), fileName: 'a.pdf', mimeType: 'application/pdf' });
    const out = await rec.recognizeDocument(companyId, row.id, fake(doc));
    if (out.status !== 'EXTRACTED') throw new Error('not extracted: ' + out.error);
    return row.id;
  }
  const good = (over = {}) => ({
    supplier: { name: 'UAB Tiekėjas', code: '300000001', vatCode: 'LT100000000011', address: 'Vilnius', create: true },
    series: '', number: 'TIEK-1', issueDate: '2026-10-20',
    lines: [{ itemName: 'Popierius', quantity: 2, net: 20, vat: 4.2, gross: 24.2, vatRate: 21, taxCode: CODE }],
    totals: { net: 20, vat: 4.2, gross: 24.2 }, ...over,
  });
  const fieldsOf = fn => { try { fn(); } catch (e) { return e.fields; } throw new Error('expected a refusal'); };
  return { temp, db, rec, src, CODE, pdf, extracted, fake, extractedDoc, good, fieldsOf };
};
