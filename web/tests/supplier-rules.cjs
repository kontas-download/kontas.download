const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-rules-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
process.env.DOCUMENTS_DIR = path.join(temp, 'documents');
process.env.SMTP_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const company = fixture.prepare("INSERT INTO Company (id, name, code, vatCode, email, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'EUR', ?, datetime('now'), datetime('now'))");
company.run(1, 'UAB Pirkėjas', '111111111', 'LT111111119', null, 1);
company.run(2, 'UAB Kita', '222222222', 'LT222222229', null, 0);
company.run(3, 'MB Be PVM', '333333333', null, null, 0);
fixture.close();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: () => undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const rec = require('../src/lib/purchase-recognition.ts');
const rules = require('../src/lib/supplier-rules.ts');
const { getDb } = require('../src/lib/db.ts');
const { purchaseDebitAccount } = require('../src/lib/tax.ts');
const { codesFor } = require('../src/lib/tax-codes.ts');
const { translateServerError } = require('../src/lib/errors.ts');
const db = getDb();
db.prepare('UPDATE Company SET isVatPayer=1 WHERE id IN (1,2)').run();
db.prepare('UPDATE Company SET isVatPayer=0 WHERE id=3').run();
const [CODE, CODE2] = codesFor('PURCHASE');
const accounts = db.prepare("SELECT code FROM ChartOfAccount WHERE code GLOB '[6-7]*' AND code NOT LIKE '27%' ORDER BY code").all().map(r => r.code).filter(code => { try { return purchaseDebitAccount(db, code) === code; } catch { return false; } });
const [ACC_HISTORY, ACC_RULE, ACC_MODEL] = accounts;
const user = (email, disabled = false) => db.prepare("INSERT INTO User(email,name,passwordHash,role,createdAt,disabledAt) VALUES(?,?,?,?,datetime('now'),?)").run(email, 'Naudotojas', 'x', 'accountant', disabled ? 1 : null);
const client = (companyId, name, over = {}) => Number(db.prepare("INSERT INTO Client(companyId,name,code,vatCode,email,correspondenceEmail,createdAt,updatedAt) VALUES(?,?,?,?,?,?,datetime('now'),datetime('now'))").run(companyId, name, over.code ?? null, over.vatCode ?? null, over.email ?? null, over.correspondenceEmail ?? null).lastInsertRowid);


const uniq = tag => Buffer.from(`${tag} ${crypto.randomUUID()}`);
const pdf = () => Buffer.concat([Buffer.from('%PDF-1.4 '), uniq('pdf')]);
let counter = 0;

const extracted = (over = {}) => ({
  docKind: 'INVOICE',
  supplier: { name: 'UAB Tiekėjas', code: '300000001', vatCode: 'LT100000000011', address: 'Vilnius' },
  buyer: { name: 'UAB Pirkėjas', code: '111111111', vatCode: 'LT111111119' },
  series: null, number: 'N-' + ++counter, issueDate: '2026-10-20', dueDate: '2026-11-03', currency: 'EUR',
  lines: [{ name: 'Popierius', quantity: 2, unitPrice: 10, net: 20, vatRate: 21, vat: 4.2, gross: 24.2 }],
  totals: { net: 20, vat: 4.2, gross: 24.2 }, vatBreakdown: [{ rate: 21, net: 20, vat: 4.2 }],
  receipt: null, payment: { method: null, cardLast4: null }, uncertainFields: [], notes: null, ...over,
});
function doc(companyId, { source = 'UPLOAD', sender = null, originalSender = null, data = extracted() } = {}) {
  const row = rec.storeDocument(companyId, { buffer: pdf(), fileName: 'd.pdf', mimeType: 'application/pdf', source, sender, originalSender });
  db.prepare("UPDATE PurchaseDocument SET status='EXTRACTED', extractedJson=? WHERE id=?").run(JSON.stringify(data), row.id);
  return row.id;
}
const confirmInput = (over = {}) => {
  const n = ++counter;
  return { supplier: { name: 'UAB Tiekėjas', code: '300000001', vatCode: 'LT100000000011', address: 'Vilnius', create: true }, series: '', number: 'C-' + n, issueDate: '2026-10-20',
    lines: [{ itemName: 'Popierius', quantity: 2, net: 20, vat: 4.2, gross: 24.2, vatRate: 21, taxCode: CODE }], totals: { net: 20, vat: 4.2, gross: 24.2 }, ...over };
};

test('rules: validation of the account, the VAT code, the pattern and the supplier; one rule per supplier and per pattern', () => {
  const c = client(1, 'UAB Taisyklių tiekėjas', { code: '600000006' });
  const bad = body => { try { rules.createRule(1, body); } catch (e) { return e; } assert.fail('expected a refusal'); };
  assert.equal(bad({}).status, 400);
  assert.equal(bad({ clientId: c, debitAccount: '4430' }).status, 400, 'not an account a purchase may be posted to');
  assert.equal(bad({ clientId: c, taxCode: 'NO_SUCH_CODE' }).status, 400);
  assert.equal(bad({ senderPattern: 'not an address' }).status, 400);
  assert.equal(bad({ clientId: 999999 }).status, 400);
  assert.equal(bad({ clientId: client(2, 'Kitos įmonės'), debitAccount: ACC_RULE }).status, 400, 'a supplier of another company');
  assert.equal(bad({ clientId: c, evidenceType: 'X' }).status, 400);
  assert.equal(bad({ clientId: c, paymentMethod: 'BITCOIN' }).status, 400);
  assert.equal(bad({ clientId: c, deductionPercent: 101 }).status, 400);
  const rule = rules.createRule(1, { clientId: c, debitAccount: ACC_RULE, taxCode: CODE, evidenceType: 'INVOICE', deductionPercent: '50', notes: ' pastaba ' });
  assert.equal(rule.name, 'UAB Taisyklių tiekėjas'); assert.equal(rule.deductionPercent, 50); assert.equal(rule.notes, 'pastaba');
  assert.equal(bad({ clientId: c }).status, 409);
  const sender = rules.createRule(1, { senderPattern: '@Domenas.LT', debitAccount: ACC_RULE });
  assert.equal(sender.senderPattern, '@domenas.lt'); assert.equal(sender.name, '@domenas.lt');
  assert.equal(bad({ senderPattern: '@domenas.lt' }).status, 409);
  // Update, list, company isolation, delete.
  assert.equal(rules.updateRule(1, rule.id, { clientId: c, debitAccount: ACC_HISTORY }).debitAccount, ACC_HISTORY);
  assert.throws(() => rules.updateRule(2, rule.id, { clientId: c }), e => e.status === 404);
  assert.equal(rules.listRules(2).length, 0);
  assert.equal(rules.listRules(1).length, 2);
  rules.deleteRule(1, sender.id);
  assert.throws(() => rules.deleteRule(1, sender.id), e => e.status === 404);
  assert.match(translateServerError('Šiam tiekėjui arba siuntėjui taisyklė jau yra', 'en'), /already exists/);
  // A company that is not a VAT payer: the deduction is forced to 0.
  const nonPayer = client(3, 'Tiekėjas be PVM', { code: '700000007' });
  assert.equal(rules.createRule(3, { clientId: nonPayer, deductionPercent: 100 }).deductionPercent, 0);
  assert.equal(rules.createRule(3, { senderPattern: 'a@b.lt' }).deductionPercent, null);
  rules.deleteRule(1, rule.id);
});

test('rules: matching order (supplier, then original sender, then sender; exact before domain) and pre-filled values with labels', () => {
  user('buhalteris@imone.lt');
  const sup = client(1, 'UAB Pagal taisyklę', { code: '800000008', vatCode: 'LT800000000081', email: 'tieks@taisykle.lt' });
  const rSender = rules.createRule(1, { senderPattern: 'tieks@taisykle.lt', debitAccount: ACC_RULE });
  const rDomain = rules.createRule(1, { senderPattern: '@taisykle.lt', debitAccount: ACC_HISTORY });
  const rOther = rules.createRule(1, { senderPattern: '@kitas-domenas.lt', debitAccount: ACC_MODEL });
  assert.equal(rules.findRule(db, 1, null, ['tieks@taisykle.lt']).id, rSender.id, 'exact before @domain');
  assert.equal(rules.findRule(db, 1, null, ['kitas@taisykle.lt']).id, rDomain.id);
  assert.equal(rules.findRule(db, 1, null, ['kitas@taisykle.lt', 'tieks@taisykle.lt']).id, rDomain.id, 'earlier address first');
  assert.equal(rules.findRule(db, 1, null, ['x@kitas-domenas.lt']).id, rOther.id);
  assert.equal(rules.findRule(db, 1, null, ['x@niekur.lt', null]), null);
  assert.equal(rules.findRule(db, 2, null, ['tieks@taisykle.lt']), null, 'rules never cross companies');
  const rSupplier = rules.createRule(1, { clientId: sup, debitAccount: ACC_RULE, taxCode: CODE2, evidenceType: 'INVOICE', paymentMethod: 'TRANSFER', deductionPercent: 50 });
  assert.equal(rules.findRule(db, 1, sup, ['tieks@taisykle.lt']).id, rSupplier.id, 'the supplier rule beats the sender rules');

  // Supplier history (ACC_HISTORY) exists, the model suggests ACC_MODEL: the rule still wins, and carries its label.
  rec.confirmDocument(1, doc(1, { data: extracted({ supplier: { name: 'UAB Pagal taisyklę', code: '800000008', vatCode: null, address: null } }) }), 7, confirmInput({ supplier: { clientId: sup, name: 'UAB Pagal taisyklę' }, debitAccount: ACC_HISTORY }));
  const data = extracted({ supplier: { name: 'UAB Pagal taisyklę', code: '800000008', vatCode: null, address: null }, suggestedAccount: { code: ACC_MODEL, reason: 'siūlymas' } });
  const p = rec.previewDocument(1, doc(1, { data }));
  assert.equal(p.draft.debitAccount, ACC_RULE);
  assert.equal(p.draft.accountSource, 'RULE');
  assert.deepEqual(p.draft.accountInfo, { ruleId: rSupplier.id, ruleName: 'UAB Pagal taisyklę' });
  assert.equal(p.suggestions.accountHistory.account, ACC_HISTORY, 'the history stays visible as a suggestion');
  assert.equal(p.draft.lines[0].taxCode, CODE2, 'the code of a rule is pre-filled, unlike a code from history');
  assert.equal(p.draft.paymentMethod, 'TRANSFER');
  assert.equal(p.draft.deductionPercent, 50);
  assert.equal(p.draft.evidenceType, 'INVOICE');
  assert.equal(p.rule.id, rSupplier.id);
  assert.equal(p.missing['lines.0.taxCode'], undefined, 'nothing left to ask for the code');
  // Without a rule account: history beats the model suggestion (existing behaviour).
  rules.updateRule(1, rSupplier.id, { clientId: sup, taxCode: CODE });
  const noAccount = rec.previewDocument(1, doc(1, { data }));
  assert.equal(noAccount.draft.accountSource, 'HISTORY'); assert.equal(noAccount.draft.debitAccount, ACC_HISTORY);
  // A rule whose account is no longer allowed is skipped, not applied.
  db.prepare("UPDATE SupplierDocumentRule SET debitAccount='4430' WHERE id=?").run(rSupplier.id);
  assert.equal(rec.previewDocument(1, doc(1, { data })).draft.accountSource, 'HISTORY');
  // A rule for the sender applies when the supplier is unknown; the original sender of a forward is used.
  const bySender = rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', originalSender: 'x@kitas-domenas.lt', data: extracted({ supplier: { name: 'Nežinomas', code: '999999990', vatCode: null, address: null } }) }));
  assert.equal(bySender.needsSupplier, true);
  assert.equal(bySender.draft.debitAccount, ACC_MODEL); assert.equal(bySender.draft.accountInfo.ruleName, '@kitas-domenas.lt');
  // A rule on the forwarder's own address is never matched through the forward.
  rules.createRule(1, { senderPattern: 'buhalteris@imone.lt', debitAccount: ACC_RULE });
  assert.equal(rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'buhalteris@imone.lt', data: extracted({ supplier: { name: 'Nežinomas', code: '999999991', vatCode: null, address: null } }) })).rule, null);
  // A document kind from the rule replaces the guess; a receipt rule forces deduction 0.
  const rr = rules.createRule(1, { senderPattern: '@kvitai.lt', evidenceType: 'RECEIPT' });
  const receipt = rec.previewDocument(1, doc(1, { source: 'EMAIL', sender: 'x@kvitai.lt', data: extracted({ supplier: { name: 'Kvitų parduotuvė', code: '999999992', vatCode: null, address: null } }) }));
  assert.equal(receipt.draft.evidenceType, 'RECEIPT'); assert.equal(receipt.draft.deductionPercent, 0); assert.equal(receipt.rule.id, rr.id);
});

test('rules: a company that is not a VAT payer never gets a deduction from a rule', () => {
  const nonPayer = client(3, 'Tiekėjas su taisykle', { code: '700000008' });
  db.prepare("INSERT INTO SupplierDocumentRule(companyId,clientId,deductionPercent) VALUES(3,?,80)").run(nonPayer);
  const p = rec.previewDocument(3, doc(3, { data: extracted({ supplier: { name: 'Tiekėjas su taisykle', code: '700000008', vatCode: null, address: null } }) }));
  assert.equal(p.rule.deductionPercent, 80);
  assert.equal(p.draft.deductionPercent, 0);
});

test('confirm with saveRule creates the supplier rule, updates it later, ignores it otherwise; the rule use is recorded', () => {
  const none = rec.confirmDocument(1, doc(1), 7, confirmInput({ supplier: { name: 'UAB Naujas Taisyklei', code: '310000001', create: true }, debitAccount: ACC_RULE }));
  assert.equal(none.rule, null);
  const first = rec.confirmDocument(1, doc(1), 7, confirmInput({ supplier: { name: 'UAB Naujas Taisyklei', code: '310000002', create: true }, debitAccount: ACC_RULE, evidenceType: 'INVOICE', paymentMethod: 'TRANSFER', saveRule: true, accountSource: 'RULE' }));
  assert.equal(first.rule.created, true);
  const supplierId = first.purchase.clientId;
  const saved = db.prepare('SELECT * FROM SupplierDocumentRule WHERE companyId=1 AND clientId=?').get(supplierId);
  assert.equal(saved.debitAccount, ACC_RULE); assert.equal(saved.taxCode, CODE); assert.equal(saved.evidenceType, 'INVOICE'); assert.equal(saved.paymentMethod, 'TRANSFER'); assert.equal(saved.lastUsedAt, null);
  assert.equal(db.prepare('SELECT accountSource FROM PurchaseDocument WHERE id=?').get(first.document.id).accountSource, 'USER', 'a rule value is recorded as chosen by the person');
  // The next document of this supplier is pre-filled from the rule, confirmed without changes, and marks the rule used.
  const next = doc(1, { data: extracted({ supplier: { name: 'UAB Naujas Taisyklei', code: '310000002', vatCode: null, address: null } }) });
  assert.equal(rec.previewDocument(1, next).draft.debitAccount, ACC_RULE);
  const again = rec.confirmDocument(1, next, 7, confirmInput({ supplier: { clientId: supplierId, name: 'UAB Naujas Taisyklei' }, debitAccount: ACC_HISTORY, saveRule: true, lines: [{ itemName: 'A', quantity: 1, net: 10, vat: 2.1, gross: 12.1, vatRate: 21, taxCode: CODE }, { itemName: 'B', quantity: 1, net: 10, vat: 2.1, gross: 12.1, vatRate: 21, taxCode: CODE2 }] }));
  assert.equal(again.rule.created, false); assert.equal(again.rule.id, saved.id);
  const updated = db.prepare('SELECT * FROM SupplierDocumentRule WHERE id=?').get(saved.id);
  assert.equal(updated.debitAccount, ACC_HISTORY); assert.equal(updated.taxCode, null, 'lines with different codes leave no single code');
  assert.ok(updated.lastUsedAt);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM SupplierDocumentRule WHERE companyId=1 AND clientId=?').get(supplierId).n, 1);
  // A refused confirmation saves nothing.
  const before = db.prepare('SELECT COUNT(*) n FROM SupplierDocumentRule').get().n;
  assert.throws(() => rec.confirmDocument(1, doc(1), 7, confirmInput({ supplier: { name: 'UAB Nesutampa', code: '320000001', create: true }, saveRule: true, number: '' })), e => Boolean(e.fields));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM SupplierDocumentRule').get().n, before);
});

test('supplier lookup carries the rule so a picked supplier pre-fills the account', () => {
  const sup = client(1, 'UAB Paieškos tiekėjas', { code: '330000003' });
  const r = rules.createRule(1, { clientId: sup, debitAccount: ACC_RULE, taxCode: CODE });
  const found = rec.lookupSupplier(1, '330000003', '');
  assert.equal(found.rule.id, r.id); assert.equal(found.rule.debitAccount, ACC_RULE);
  assert.equal(rec.lookupSupplier(1, '330000003', '').rule.name, 'UAB Paieškos tiekėjas');
});
