const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only: the project database is never opened by this test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-review-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
const { getDb } = require('../src/lib/db.ts');
const { accountCodeUsage, ACCOUNT_CODE_COLUMNS } = require('../src/lib/account-usage.ts');
const { withActor } = require('../src/lib/audit-actor.ts');
const { createInvoice } = require('../src/lib/sales.ts');
const { archiveDeliveredPdf, settleDeliveryArchive } = require('../src/lib/invoice-archive.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'C1', '1', 'EUR', 1, datetime('now'), datetime('now'))").run();
const userId = Number(db.prepare("INSERT INTO User(email,name,passwordHash,role) VALUES('a@b.lt','A','x','admin')").run().lastInsertRowid);
const sale = (n) => createInvoice(1, { number: n, saleDate: '2026-02-01', items: [{ itemName: 'x', quantity: 1, price: 10, vatRate: 0 }] });

test('account usage helper finds every referencing column and ignores unused codes', () => {
  assert.equal(accountCodeUsage(db, '9999'), null);
  for (const [table, column] of ACCOUNT_CODE_COLUMNS) db.prepare(`SELECT ${column} FROM ${table} LIMIT 0`).all(); // columns really exist
  db.prepare("INSERT INTO GeneralEntry(companyId,date,debitAccount,creditAccount,amount,sourceType) VALUES(1,'2026-02-01','7777','2710',1,'MANUAL')").run();
  assert.equal(accountCodeUsage(db, '7777'), 'GeneralEntry.debitAccount');
  db.prepare("UPDATE InventorySettings SET cogsAccount='8888'").run();
  db.prepare("INSERT OR REPLACE INTO InventorySettings(companyId,cogsAccount) VALUES(1,'8888')").run();
  assert.equal(accountCodeUsage(db, '8888'), 'InventorySettings.cogsAccount');
});

test('audit actor is recorded inside withActor and stays NULL (no error) otherwise', () => {
  sale('A1');
  assert.equal(db.prepare("SELECT actorId FROM AccountingAudit WHERE entity='Sale' ORDER BY id DESC LIMIT 1").get().actorId, null);
  withActor(db, userId, () => sale('A2'));
  const rows = db.prepare("SELECT actorId FROM AccountingAudit WHERE entity IN ('Sale','SaleItem') AND recordId IN (SELECT id FROM Sale WHERE number='A2' UNION SELECT id FROM SaleItem WHERE saleId IN (SELECT id FROM Sale WHERE number='A2'))").all();
  assert.ok(rows.length > 0 && rows.every(r => r.actorId === userId));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM AuditContext').get().n, 0);
  sale('A3');
  assert.equal(db.prepare("SELECT actorId FROM AccountingAudit WHERE entity='Sale' ORDER BY id DESC LIMIT 1").get().actorId, null);
  assert.throws(() => withActor(db, userId, () => { throw new Error('boom'); }), /boom/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM AuditContext').get().n, 0);
});

test('archive failure is stored on the delivery row and retried on a duplicate request', async () => {
  const { saleId } = sale('D1');
  const doc = { companyId: 1, id: saleId, number: 'D1', series: '' };
  const requestId = '11111111-1111-1111-1111-111111111111';
  db.prepare("INSERT INTO InvoiceDelivery(companyId,saleId,requestId,recipient,status,messageId,createdAt) VALUES(1,?,?,'x@y.lt','sent','m1',1)").run(saleId, requestId);
  // Failing archive (document cannot be serialised into a filename) must not throw.
  const bad = { ...doc, get number() { throw new Error('archive broken'); } };
  const origError = console.error; console.error = () => {};
  try { assert.equal(archiveDeliveredPdf(bad, Buffer.from('pdf'), { requestId, recipient: 'x@y.lt', messageId: 'm1' }), 'failed'); } finally { console.error = origError; }
  assert.equal(db.prepare('SELECT archiveStatus FROM InvoiceDelivery WHERE requestId=?').get(requestId).archiveStatus, 'failed');
  let renders = 0;
  const renderable = async () => { renders++; return Buffer.from('pdf'); };
  const good = { ...doc, series: 'S', lang: 'lt' };
  const status = await settleDeliveryArchive(good, requestId, renderable);
  assert.equal(renders, 1);
  assert.equal(status, 'ok');
  assert.equal(db.prepare('SELECT archiveStatus FROM InvoiceDelivery WHERE requestId=?').get(requestId).archiveStatus, 'ok');
  assert.equal(await settleDeliveryArchive(good, requestId, renderable), 'ok');
  assert.equal(renders, 1, 'no re-render once archived');
});
