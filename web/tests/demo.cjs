const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const { reportMissingXsd, validateIsaf } = require('./helpers/isaf-xsd.cjs');
reportMissingXsd();
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const chart = JSON.parse(fs.readFileSync(path.join(__dirname, '../scripts/chart-of-accounts.json'), 'utf8'));
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'Company 1', 'C1', 'EUR', 1, datetime('now'), datetime('now'))").run();
for (const [code, name] of chart) fixture.prepare('INSERT INTO ChartOfAccount(code,name) VALUES(?,?)').run(code, name);
fixture.close();
const jar = new Map();
const realLoad = Module._load;
Module._load = function (name, parent, isMain) {
  if (name === 'next/headers') return { cookies: async () => ({ get: key => jar.has(key) ? { value: jar.get(key) } : undefined }) };
  if (name === 'next/navigation') return { redirect: url => { throw new Error('redirect:' + url); } };
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const auth = require('../src/lib/auth.ts');
const { getDb } = require('../src/lib/db.ts');
const { todayVilnius } = require('../src/lib/dates.ts');
const { DEMO_PREFIX, demoStrings } = require('../src/lib/demo-data.ts');
const { loadTaxDocuments, standardVatIssues } = require('../src/lib/tax-documents.ts');
const { buildIsaf, totalsMismatch } = require('../src/lib/isaf.ts');
const { fr0600Draft } = require('../src/lib/fr0600.ts');
const { receivables } = require('../src/lib/receivables.ts');
const { openDocuments, overpaidDocuments, unallocatedTransactions, allocatePayment } = require('../src/lib/payments.ts');
const { listTemplates, issueRecurring } = require('../src/lib/recurring.ts');
const db = getDb();
const demoApi = require('../src/app/api/demo/route.ts');
const companyApi = require('../src/app/api/companies/[id]/route.ts');
const login = require('../src/app/api/auth/login/route.ts');
const request = (method, body, headers = {}) => new Request('http://localhost:3000/api/demo', { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
const signIn = async (email, pass) => (await login.POST(new Request('http://localhost:3000/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pass }) }))).headers.get('set-cookie').match(/auth_session=([^;]+)/)[1];
const cents = value => Math.round(value * 100);
const one = (sql, ...args) => db.prepare(sql).get(...args);

// Lithuanian legal entity code (9 digits): check digit by the weights 1..8, then 3..9,1 when the remainder is 10.
function validCompanyCode(code) {
  const d = code.split('').map(Number);
  let r = d.slice(0, 8).reduce((s, x, i) => s + x * (i + 1), 0) % 11;
  if (r === 10) { r = d.slice(0, 8).reduce((s, x, i) => s + x * (i + 3 > 9 ? i - 6 : i + 3), 0) % 11; if (r === 10) r = 0; }
  return r === d[8];
}
// Every text value of a company's rows in every table that has a companyId column, plus the document and payroll lines.
function companyTexts(companyId) {
  const out = [];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  const push = rows => { for (const row of rows) for (const value of Object.values(row)) if (typeof value === 'string') out.push(value); };
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (columns.includes('companyId')) push(db.prepare(`SELECT * FROM ${table} WHERE companyId=?`).all(companyId));
  }
  push(db.prepare('SELECT * FROM Company WHERE id=?').all(companyId));
  push(db.prepare('SELECT i.* FROM SaleItem i JOIN Sale s ON s.id=i.saleId WHERE s.companyId=?').all(companyId));
  push(db.prepare('SELECT i.* FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId WHERE p.companyId=?').all(companyId));
  push(db.prepare('SELECT e.* FROM PayrollEmployee e JOIN Payroll p ON p.id=e.payrollId WHERE p.companyId=?').all(companyId));
  return out;
}

test('demonstration company', async t => {
  try {
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(1,'admin@example.test','Admin',?,'admin',datetime('now'))").run(await auth.hashPassword('admin-password-1'));
    db.prepare("INSERT INTO User(id,email,name,passwordHash,role,createdAt) VALUES(2,'acc@example.test','Acc',?,'accountant',datetime('now'))").run(await auth.hashPassword('accountant-pass-1'));
    const adminToken = await signIn('admin@example.test', 'admin-password-1');
    const accountantToken = await signIn('acc@example.test', 'accountant-pass-1');
    const today = todayVilnius();
    let id;

    await t.test('only an administrator may create it, from the same origin', async () => {
      jar.delete('auth_session');
      assert.equal((await demoApi.POST(request('POST'))).status, 401);
      jar.set('auth_session', accountantToken);
      assert.equal((await demoApi.POST(request('POST'))).status, 403);
      jar.set('auth_session', adminToken);
      assert.equal((await demoApi.POST(request('POST', null, { Origin: 'https://attacker.invalid' }))).status, 403);
      assert.equal((await demoApi.POST(request('POST', { name: 42 }))).status, 400);
      assert.equal(one('SELECT COUNT(*) n FROM Company').n, 1);
      const response = await demoApi.POST(request('POST'));
      assert.equal(response.status, 200);
      const body = await response.json();
      id = body.companyId;
      assert.equal(body.name, DEMO_PREFIX);
      assert.equal(one('SELECT name FROM Company WHERE id=?', id).name, DEMO_PREFIX);
    });

    await t.test('the designed amount of data is created', () => {
      const count = (sql) => one(sql, id).n;
      assert.equal(count('SELECT COUNT(*) n FROM Client WHERE companyId=?'), 9);
      assert.equal(count('SELECT COUNT(*) n FROM StockItem WHERE companyId=?'), 4);
      assert.equal(count("SELECT COUNT(*) n FROM Sale WHERE companyId=? AND docType='SF'"), 13);
      assert.equal(count("SELECT COUNT(*) n FROM Sale WHERE companyId=? AND docType='KS' AND originalSaleId IS NOT NULL"), 1);
      assert.equal(count('SELECT COUNT(*) n FROM Purchase WHERE companyId=?'), 8);
      assert.equal(count('SELECT COUNT(*) n FROM BankTransaction WHERE companyId=?'), 13);
      assert.equal(count('SELECT COUNT(*) n FROM PaymentAllocation WHERE companyId=?'), 12);
      assert.equal(count('SELECT COUNT(*) n FROM ManualSettlement WHERE companyId=?'), 1);
      assert.equal(count('SELECT COUNT(*) n FROM Payroll WHERE companyId=?'), 1);
      assert.equal(count('SELECT COUNT(*) n FROM PayrollEmployee e JOIN Payroll p ON p.id=e.payrollId WHERE p.companyId=?'), 2);
      assert.equal(count('SELECT COUNT(*) n FROM RecurringInvoice WHERE companyId=?'), 2);
      assert.equal(count("SELECT COUNT(*) n FROM TaxLineCode WHERE companyId=? AND taxCode='PVM15'"), 2);
      assert.equal(count('SELECT COUNT(*) n FROM CompanyMailSettings WHERE companyId=?'), 0, 'no SMTP settings or secrets');
      const company = one('SELECT * FROM Company WHERE id=?', id);
      assert.equal(company.taxMode, 'STANDARD_VAT'); assert.equal(company.isVatPayer, 1); assert.equal(company.isDefault, 0);
      // No phone numbers at all: a made-up number could belong to a real subscriber.
      assert.equal(company.phone, null);
      assert.equal(count("SELECT COUNT(*) n FROM Client WHERE companyId=? AND COALESCE(phone,'')<>''"), 0, 'no client phone numbers');
      assert.ok(!demoStrings().some(s => /\+\d{3}[\d ]{6,}/.test(s)), 'no phone numbers in the demo texts');
      const dates = db.prepare("SELECT saleDate d FROM Sale WHERE companyId=? UNION ALL SELECT purchaseDate FROM Purchase WHERE companyId=? UNION ALL SELECT date FROM BankTransaction WHERE companyId=? UNION ALL SELECT date FROM GeneralEntry WHERE companyId=?").all(id, id, id, id).map(r => r.d);
      assert.ok(dates.every(d => d <= today), 'nothing is dated in the future');
      assert.ok(dates.some(d => d < today.slice(0, 8) + '01'), 'documents span more than the current month');
      assert.ok(db.prepare('SELECT stock FROM StockItem WHERE companyId=?').all(id).every(s => s.stock >= 0));
      assert.ok(db.prepare('SELECT sellerVatMode m, sellerIsVatPayer p FROM Sale WHERE companyId=?').all(id).every(s => s.m === 'STANDARD_VAT' && s.p === 1));
      const rates = new Set(db.prepare('SELECT i.vatRate r FROM SaleItem i JOIN Sale s ON s.id=i.saleId WHERE s.companyId=?').all(id).map(r => r.r));
      assert.deepEqual([...rates].sort((a, b) => a - b), [0, 9, 21]);
    });

    await t.test('documents add up and the ledger is posted by the triggers', () => {
      for (const [header, lines, key] of [['Sale', 'SaleItem', 'saleId'], ['Purchase', 'PurchaseItem', 'purchaseId']]) {
        const rows = db.prepare(`SELECT h.id, h.sumWithoutVat net, h.vat, h.sumWithVat gross, SUM(i.sumWithoutVat) lineNet, SUM(i.sumWithVat) lineGross, COUNT(i.id) n FROM ${header} h JOIN ${lines} i ON i.${key}=h.id WHERE h.companyId=? GROUP BY h.id`).all(id);
        for (const r of rows) {
          assert.ok(r.n > 0);
          assert.equal(cents(r.lineNet), cents(r.net), `${header} ${r.id} net`);
          assert.equal(cents(r.lineGross), cents(r.gross), `${header} ${r.id} gross`);
          assert.equal(cents(r.net) + cents(r.vat), cents(r.gross), `${header} ${r.id} VAT`);
        }
      }
      const accounts = new Set(chart.map(([code]) => code));
      const entries = db.prepare('SELECT debitAccount d, creditAccount c, amount FROM GeneralEntry WHERE companyId=?').all(id);
      assert.ok(entries.length > 30);
      for (const e of entries) assert.ok(accounts.has(e.d) && accounts.has(e.c), `posted only to the public chart of accounts: ${e.d}/${e.c}`);
      const balance = code => entries.reduce((s, e) => s + (e.d === code ? cents(e.amount) : 0) - (e.c === code ? cents(e.amount) : 0), 0);
      assert.equal([...accounts].reduce((s, code) => s + balance(code), 0), 0, 'trial balance: debit = credit');
      // Every document and payment is posted: sales VAT, deductible purchase VAT, payroll.
      assert.equal(-balance('4492'), cents(one('SELECT SUM(vat) v FROM Sale WHERE companyId=?', id).v));
      assert.equal(balance('2444'), cents(one('SELECT SUM(deductibleVat) v FROM Purchase WHERE companyId=?', id).v));
      assert.equal(-balance('5001'), cents(one('SELECT SUM(sumWithoutVat) v FROM Sale WHERE companyId=?', id).v));
      assert.equal(balance('6304'), cents(one('SELECT SUM(grossSalary+sodraEmployer) v FROM PayrollEmployee e JOIN Payroll p ON p.id=e.payrollId WHERE p.companyId=?', id).v));
      assert.equal(balance('272'), cents(one('SELECT SUM(amount) v FROM ManualSettlement WHERE companyId=?', id).v));
      assert.ok(balance('2710') > 0, 'the bank account balance stays positive');
      // Receivables account = open invoices minus the receipt that still waits to be linked.
      const open = openDocuments(db, id).filter(d => d.kind === 'SALE').reduce((s, d) => s + cents(d.balance), 0);
      const waiting = unallocatedTransactions(db, id).reduce((s, t) => s + cents(t.remaining), 0);
      assert.equal(balance('2410'), open - waiting);
      assert.equal(unallocatedTransactions(db, id).length, 1);
    });

    await t.test('payment links respect the guards', () => {
      assert.deepEqual(overpaidDocuments(db, id), []);
      for (const r of db.prepare('SELECT t.sum, SUM(a.amount) linked, COUNT(a.saleId) sales, COUNT(a.purchaseId) purchases FROM BankTransaction t JOIN PaymentAllocation a ON a.bankTransactionId=t.id WHERE t.companyId=? GROUP BY t.id').all(id)) {
        assert.ok(cents(r.linked) <= cents(Math.abs(r.sum)));
        assert.ok(r.sum > 0 ? r.purchases === 0 : r.sales === 0, 'direction');
      }
      const waiting = unallocatedTransactions(db, id)[0];
      const credit = one("SELECT id FROM Sale WHERE companyId=? AND docType='KS'", id).id;
      assert.throws(() => allocatePayment(db, id, { bankTransactionId: waiting.id, kind: 'SALE', documentId: credit, amount: 1 }), /Kreditinio|likutį/);
      const paid = one("SELECT saleId FROM PaymentAllocation WHERE companyId=? AND saleId IS NOT NULL", id).saleId;
      assert.throws(() => allocatePayment(db, id, { bankTransactionId: waiting.id, kind: 'SALE', documentId: paid, amount: 1 }), /likutį/);
    });

    await t.test('receivables include overdue invoices', () => {
      const list = receivables(db, id, today);
      assert.ok(list.length >= 4);
      assert.ok(list.some(r => r.bucket === 'D31_60'));
      assert.ok(list.some(r => r.bucket === 'NOT_DUE'));
      assert.ok(list.every(r => r.clientEmail.endsWith('@example.test')));
    });

    await t.test('i.SAF for the demo period builds without issues and satisfies the XSD; the FR0600 draft is complete', async () => {
      const start = one('SELECT MIN(saleDate) d FROM Sale WHERE companyId=?', id).d.slice(0, 8) + '01';
      assert.deepEqual(standardVatIssues(db, id, start, today), []);
      const company = one('SELECT name, code, vatCode FROM Company WHERE id=?', id);
      const docs = loadTaxDocuments(db, id, start, today);
      assert.equal(docs.sales.length, 14); assert.equal(docs.purchases.length, 8);
      for (const doc of [...docs.sales, ...docs.purchases]) assert.equal(totalsMismatch(doc), false);
      const result = buildIsaf({ company, period: { start, end: today }, sales: docs.sales, purchases: docs.purchases, software: { company: 'kontas.download', name: 'kontas.download', version: '0.2.0' }, now: new Date() });
      assert.deepEqual(result.issues, []);
      const xsdResult = await validateIsaf(result.xml);
      assert.equal(xsdResult.valid, true, JSON.stringify(xsdResult.errors));
      assert.match(result.xml, /<TaxCode>PVM15<\/TaxCode>/);
      assert.match(result.xml, /<InvoiceType>KS<\/InvoiceType>/);
      const again = loadTaxDocuments(db, id, start, today);
      const draft = fr0600Draft(again.sales, again.purchases);
      assert.deepEqual(draft.manual, []); assert.deepEqual(draft.unreviewed, []); assert.equal(draft.complete, true);
      const lineSum = (rate, field) => cents(one(`SELECT COALESCE(SUM(${field}),0) v FROM SaleItem i JOIN Sale s ON s.id=i.saleId WHERE s.companyId=? AND i.vatRate=${rate}`, id).v);
      assert.equal(cents(draft.fields.f11), lineSum(21, 'i.sumWithoutVat') + lineSum(9, 'i.sumWithoutVat'));
      assert.equal(cents(draft.fields.f29), lineSum(21, 'i.sumWithVat-i.sumWithoutVat'));
      assert.equal(cents(draft.fields.f30), lineSum(9, 'i.sumWithVat-i.sumWithoutVat'));
      assert.equal(cents(draft.extended.f20), lineSum(0, 'i.sumWithoutVat'));
      assert.ok(draft.fields.f29 > 0 && draft.fields.f30 > 0 && draft.fields.f35 > 0);
      assert.equal(draft.fields.f25, draft.fields.f35);
      assert.equal(cents(draft.fields.f36), cents(draft.fields.f29) + cents(draft.fields.f30) - cents(draft.fields.f35));
    });

    await t.test('recurring templates are valid and the due one can be issued', () => {
      const templates = listTemplates(db, id);
      assert.equal(templates.length, 2);
      const due = templates.find(x => x.due);
      assert.ok(due);
      const issued = issueRecurring(id, due.id);
      assert.equal(issued.sale.number, '000014');
      assert.equal(issued.sale.saleDate, today);
    });

    await t.test('all demo texts are fictional', () => {
      const texts = [...demoStrings(), ...companyTexts(id)];
      assert.ok(texts.length > 100);
      const deny = ['swed', 'seb', 'luminor', 'revolut', 'paysera', 'gmail'];
      for (const text of texts) {
        for (const email of text.match(/[^\s"'(),;:]+@[^\s"'(),;:]+/g) || []) assert.ok(email.endsWith('@example.test'), `e-mail ${email}`);
        for (const code of text.match(/(?<!\d)\d{9}(?!\d)/g) || []) assert.equal(validCompanyCode(code), false, `${code} must not be a valid company code`);
        for (const word of deny) assert.ok(!text.toLowerCase().includes(word), `"${text}" contains ${word}`);
      }
      assert.ok(validCompanyCode('300000003'), 'checksum self-test');
      const company = one('SELECT vatCode, bankIban FROM Company WHERE id=?', id);
      assert.match(company.vatCode, /^LT0+$/);
      assert.match(company.bankIban, /^LT00[ 0]+$/);
      for (const c of db.prepare('SELECT vatCode FROM Client WHERE companyId=? AND vatCode IS NOT NULL').all(id)) assert.match(c.vatCode, /^(LT|LV)0+\d$/);
    });

    await t.test('further demos get another name and the limit is three', async () => {
      const second = await (await demoApi.POST(request('POST'))).json();
      assert.equal(second.name, DEMO_PREFIX + ' 2');
      const third = await (await demoApi.POST(request('POST', { name: 'Mokymai' }))).json();
      assert.equal(third.name, DEMO_PREFIX + ' (Mokymai)');
      const fourth = await demoApi.POST(request('POST'));
      assert.equal(fourth.status, 409);
      assert.equal(one('SELECT COUNT(*) n FROM Company').n, 4);
      // The demos are independent: the same numbering in each company is allowed.
      assert.equal(one("SELECT COUNT(*) n FROM Sale WHERE companyId=? AND series='SF' AND number='000001'", second.companyId).n, 1);
    });

    await t.test('deleting the demo company removes all its rows', async () => {
      const context = { params: Promise.resolve({ id: String(id) }) };
      jar.set('auth_session', accountantToken);
      assert.equal((await companyApi.DELETE(request('DELETE'), context)).status, 403);
      jar.set('auth_session', adminToken);
      assert.equal((await companyApi.DELETE(request('DELETE'), context)).status, 200);
      assert.equal(one('SELECT COUNT(*) n FROM Company WHERE id=?', id).n, 0);
      // The audit trail is append-only evidence and is kept on purpose, like the invoice archive.
      const kept = new Set(['AccountingAudit']);
      for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
        const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);
        if (columns.includes('companyId') && !kept.has(name)) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${name} WHERE companyId=?`).get(id).n, 0, `${name} rows left`);
      }
      for (const [child, parent, key] of [['SaleItem', 'Sale', 'saleId'], ['PurchaseItem', 'Purchase', 'purchaseId'], ['PayrollEmployee', 'Payroll', 'payrollId'], ['RecurringRun', 'RecurringInvoice', 'recurringId'], ['PaymentAllocation', 'BankTransaction', 'bankTransactionId']]) {
        assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${child} c WHERE NOT EXISTS(SELECT 1 FROM ${parent} p WHERE p.id=c.${key})`).get().n, 0, `${child} orphans`);
      }
      assert.equal(db.prepare("SELECT COUNT(*) n FROM TaxLineCode t WHERE NOT EXISTS(SELECT 1 FROM SaleItem i WHERE i.id=t.itemId) AND t.kind='SALE'").get().n, 0);
      assert.equal(db.prepare('SELECT COUNT(*) n FROM GeneralEntry WHERE companyId NOT IN (SELECT id FROM Company)').get().n, 0);
      // After deleting one demo a new one may be created again.
      assert.equal((await demoApi.POST(request('POST'))).status, 200);
    });
  } finally { db.close(); if (path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('erp-test-')) throw new Error('Unsafe cleanup path'); fs.rmSync(temp, { recursive: true, force: true }); }
});

test('a demo company that was created but not activated is never reported as a failed creation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/app/companies/CompaniesClient.tsx'), 'utf8');
  const handler = source.slice(source.indexOf('const handleCreateDemo'), source.indexOf('const handleImportSubmit'));
  assert.ok(handler.length > 0);
  // 'demo.failed' only while the company is being created; once the switch to it starts, only 'demo.createdNotSwitched'.
  const created = handler.indexOf("fetch('/api/companies/switch'");
  assert.ok(handler.indexOf('companyId = data.companyId') > 0 && created > handler.indexOf('companyId = data.companyId'));
  assert.ok(handler.indexOf("'demo.failed'") < created);
  assert.equal(handler.indexOf("'demo.failed'", created), -1);
  assert.ok(handler.indexOf("'demo.createdNotSwitched'", created) > created);
  const messages = require('../src/lib/i18n/messages/demo.ts').default;
  for (const lang of ['lt', 'ru', 'en']) assert.match(messages[lang].createdNotSwitched, /\{message\}/, lang);
});
