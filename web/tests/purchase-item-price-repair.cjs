const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const Database = require('better-sqlite3');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-price-repair-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (1, 'UAB Test', '111111111', 'EUR', 1, datetime('now'), datetime('now'))").run();
fixture.close();
const realLoad = Module._load;
Module._load = function(name, parent, isMain) {
  if (name.startsWith('@/')) name = path.join(__dirname, '../src', name.slice(2));
  return realLoad.call(this, name, parent, isMain);
};
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
const { getDb } = require('../src/lib/db.ts');
const { migratePurchaseItemPrices } = require('../src/lib/purchase-item-price-repair-schema.ts');
const db = getDb();
const VERSION = '2026-11-repair-purchase-item-prices';

const purchase = (net, vat, gross, date = '2026-10-01') => db.prepare('INSERT INTO Purchase (purchaseDate, sumWithoutVat, vat, sumWithVat, companyId) VALUES (?,?,?,?,1)').run(date, net, vat, gross).lastInsertRowid;
const item = (pid, qty, price, net, gross, rate = null) => db.prepare('INSERT INTO PurchaseItem (purchaseId, itemName, quantity, price, sumWithoutVat, sumWithVat, vatRate) VALUES (?,?,?,?,?,?,?)').run(pid, 'x', qty, price, net, gross, rate).lastInsertRowid;
const rows = () => db.prepare('SELECT * FROM PurchaseItem ORDER BY id').all();
const headers = () => db.prepare('SELECT * FROM Purchase ORDER BY id').all();
const ledger = () => db.prepare('SELECT * FROM GeneralEntry ORDER BY id').all();
const recorded = () => !!db.prepare('SELECT 1 FROM AppMigration WHERE version=?').get(VERSION);
const reset = () => { db.exec("DELETE FROM AppMigration WHERE version='" + VERSION + "'"); };
const quietly = fn => { const e = console.error; console.error = () => {}; try { return fn(); } finally { console.error = e; } };

test('repairs broken zero-VAT lines, skips VAT/zero-quantity, keeps headers and ledger, is idempotent', () => {
  assert.ok(recorded(), 'empty DB records the migration at start-up');
  reset();
  const p1 = purchase(30, 0, 30);
  const a = item(p1, 3, 0, 0, 10), b = item(p1, 4, 0, 0, 20);
  const p2 = purchase(100, 21, 121);
  const vatLine = item(p2, 2, 0, 0, 121);
  const p3 = purchase(5, 0, 5);
  const zeroQty = item(p3, 0, 0, 0, 5);
  const p4 = purchase(7, 0, 7);
  const fine = item(p4, 1, 7, 7, 7, 0);
  const headersBefore = headers(), ledgerBefore = ledger(), auditBefore = db.prepare('SELECT COUNT(*) n FROM AccountingAudit').get().n;
  const vatBefore = db.prepare('SELECT * FROM PurchaseItem WHERE id IN (?,?,?)').all(vatLine, zeroQty, fine);
  migratePurchaseItemPrices(db);
  const get = id => db.prepare('SELECT * FROM PurchaseItem WHERE id=?').get(id);
  assert.deepEqual([get(a).price, get(a).sumWithoutVat, get(a).sumWithVat, get(a).vatRate], [3.333333, 10, 10, 0]);
  assert.deepEqual([get(b).price, get(b).sumWithoutVat, get(b).vatRate], [5, 20, 0]);
  assert.deepEqual(db.prepare('SELECT * FROM PurchaseItem WHERE id IN (?,?,?)').all(vatLine, zeroQty, fine), vatBefore);
  assert.deepEqual(headers(), headersBefore);
  assert.deepEqual(ledger(), ledgerBefore);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM AccountingAudit').get().n - auditBefore, 2, 'trigger audits exactly the two repaired lines');
  assert.ok(recorded());
  const snapshot = rows();
  reset();
  migratePurchaseItemPrices(db);
  assert.deepEqual(rows(), snapshot);
  assert.ok(recorded());
});

test('rolls back everything and stays unrecorded when a purchase would not match its header', () => {
  reset();
  const good = purchase(10, 0, 10, '2026-10-02');
  const goodLine = item(good, 2, 0, 0, 10);
  const bad = purchase(50, 0, 50, '2026-10-03');
  const badLine = item(bad, 1, 0, 0, 40);
  const before = rows(), headersBefore = headers(), auditBefore = db.prepare('SELECT COUNT(*) n FROM AccountingAudit').get().n;
  quietly(() => migratePurchaseItemPrices(db));
  assert.deepEqual(rows(), before);
  assert.deepEqual(headers(), headersBefore);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM AccountingAudit').get().n, auditBefore);
  assert.equal(recorded(), false);
  // after the data problem is fixed the retry succeeds
  db.prepare('UPDATE PurchaseItem SET sumWithVat=50 WHERE id=?').run(badLine);
  migratePurchaseItemPrices(db);
  assert.equal(db.prepare('SELECT price FROM PurchaseItem WHERE id=?').get(goodLine).price, 5);
  assert.equal(db.prepare('SELECT price FROM PurchaseItem WHERE id=?').get(badLine).price, 50);
  assert.ok(recorded());
});

test('leaves lines of locked periods untouched without failing', () => {
  reset();
  const locked = purchase(9, 0, 9, '2026-09-15');
  const line = item(locked, 3, 0, 0, 9);
  db.prepare("INSERT OR REPLACE INTO AccountingLock (companyId, lockedThrough) VALUES (1, '2026-09-30')").run();
  migratePurchaseItemPrices(db);
  assert.equal(db.prepare('SELECT price FROM PurchaseItem WHERE id=?').get(line).price, 0);
  assert.ok(recorded());
  db.prepare('UPDATE AccountingLock SET lockedThrough=NULL WHERE companyId=1').run();
});
