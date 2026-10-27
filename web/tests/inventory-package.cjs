const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only: the project database is never opened by this test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-invpkg-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
const inv = require('../src/lib/inventory.ts');
const fa = require('../src/lib/fixed-assets.ts');
const { createInvoice } = require('../src/lib/sales.ts');
const { createPurchase } = require('../src/lib/purchases.ts');
const { exportCompany, importCompanyPackage } = require('../src/lib/company-package.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const addCompany = db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
addCompany.run(1, 'Saltinis', '1'); addCompany.run(2, 'Kita', '2');
const fail = (fn, message) => assert.throws(fn, e => String(e.message).includes(message), message);
const rowsOf = (sql, ...args) => db.prepare(sql).all(...args);

test('inventory and fixed assets survive the company package round trip', () => {
  const item = Number(db.prepare("INSERT INTO StockItem(name,code,companyId,stock,remainder,cost) VALUES('Preke','P1',1,0,0,0)").run().lastInsertRowid);
  inv.saveInventorySettings(db, 1, { method: 'FIFO', startDate: '2026-01-01' }, null);
  createPurchase(1, { number: 'P1', purchaseDate: '2026-02-01', items: [{ itemName: 'x', itemCode: 'P1', quantity: 10, price: 5, vatRate: 0 }] });
  createInvoice(1, { number: 'S1', saleDate: '2026-02-05', items: [{ itemName: 'x', itemCode: 'P1', quantity: 4, price: 9, vatRate: 0 }] });
  const assetId = fa.createAsset(db, 1, { code: 'A1', name: 'Stakles', category: 'MACHINERY', acquisitionDate: '2025-01-10', commissioningDate: '2025-01-15', cost: 1200, usefulLifeMonths: 12, residualValue: 0 }, null);
  fa.postDepreciation(db, 1, '2025-04', null);
  assert.ok(rowsOf('SELECT 1 FROM InventoryMovement WHERE companyId=1').length >= 2 && rowsOf('SELECT 1 FROM InventoryLayer WHERE companyId=1').length >= 1);

  const pkg = JSON.parse(JSON.stringify(exportCompany(db, 1)));
  for (const key of ['inventorySettings', 'inventoryMovements', 'inventoryLayers', 'fixedAssets', 'fixedAssetPostings']) assert.ok(pkg.data[key].length > 0, key);
  const result = importCompanyPackage(db, pkg, { commit: true, name: 'Kopija', allowDuplicateCode: true });
  assert.deepEqual(result.problems, []);
  const copy = result.companyId;
  const itemCopy = db.prepare('SELECT id FROM StockItem WHERE companyId=?').get(copy).id;
  assert.notEqual(itemCopy, item);
  const same = sql => assert.deepEqual(rowsOf(sql, copy), rowsOf(sql, 1), sql);
  // Movements point at the copied stock card and copied documents; values are identical.
  same('SELECT kind,quantity,amount,unitCost,balanceQty,balanceValue,date,sourceType FROM InventoryMovement WHERE companyId=? ORDER BY id');
  assert.equal(rowsOf('SELECT 1 FROM InventoryMovement WHERE companyId=? AND stockItemId<>?', copy, itemCopy).length, 0);
  assert.equal(rowsOf("SELECT 1 FROM InventoryMovement m JOIN Sale s ON s.id=m.sourceId WHERE m.companyId=? AND m.sourceType='SALE' AND s.companyId=?", copy, copy).length, rowsOf("SELECT 1 FROM InventoryMovement WHERE companyId=1 AND sourceType='SALE'").length);
  same('SELECT quantity,remainingQty,remainingValue FROM InventoryLayer WHERE companyId=? ORDER BY id');
  same('SELECT method,inventoryAccount,cogsAccount,startDate FROM InventorySettings WHERE companyId=?');
  same('SELECT code,name,cost,usefulLifeMonths,method FROM FixedAsset WHERE companyId=?');
  same('SELECT period,date,kind,amount,bookValueAfter FROM FixedAssetPosting WHERE companyId=? ORDER BY id');
  assert.equal(rowsOf('SELECT 1 FROM FixedAssetPosting p JOIN FixedAsset a ON a.id=p.assetId WHERE p.companyId=? AND a.companyId=?', copy, copy).length, 3);
  // The journal (including INVENTORY and FIXED_ASSET postings) is identical and linked to the copied sources.
  same("SELECT sourceType,debitAccount,creditAccount,amount,date FROM GeneralEntry WHERE companyId=? AND sourceType IN ('INVENTORY','FIXED_ASSET') ORDER BY date,sourceType,amount");
  assert.equal(rowsOf("SELECT 1 FROM GeneralEntry g JOIN InventoryMovement m ON m.id=g.sourceId WHERE g.companyId=? AND g.sourceType='INVENTORY' AND m.companyId=?", copy, copy).length, rowsOf("SELECT 1 FROM GeneralEntry WHERE companyId=? AND sourceType='INVENTORY'", copy).length);
  // The copy is protected like the source.
  fail(() => db.prepare('DELETE FROM StockItem WHERE id=?').run(itemCopy), 'INVENTORY_ITEM_HAS_MOVEMENTS');
  assert.equal(rowsOf('SELECT 1 FROM FixedAsset WHERE id=?', assetId).length, 1);
});

test('inventory schema guards', () => {
  const foreign = Number(db.prepare("INSERT INTO StockItem(name,code,companyId,stock,remainder,cost) VALUES('Svetima','F1',2,0,0,0)").run().lastInsertRowid);
  const insertMove = (companyId, itemId) => db.prepare("INSERT INTO InventoryMovement(companyId,stockItemId,date,kind,method,quantity,amount,unitCost,balanceQty,balanceValue,sourceType) VALUES(?,?,'2026-03-01','RECEIPT','FIFO',1,1,1,1,1,'MANUAL')").run(companyId, itemId);
  fail(() => insertMove(1, foreign), 'INVENTORY_ITEM_COMPANY_MISMATCH');
  const mine = db.prepare('SELECT id FROM InventoryMovement WHERE companyId=1').get().id;
  fail(() => db.prepare("INSERT INTO InventoryLayer(companyId,stockItemId,movementId,date,quantity,remainingQty,remainingValue) VALUES(1,?,?,'2026-03-01',1,1,1)").run(foreign, mine), 'INVENTORY_ITEM_COMPANY_MISMATCH');
  // Company 2 has no settings row, yet a stock card with movements cannot be deleted (no silent cascade).
  assert.equal(rowsOf('SELECT 1 FROM InventorySettings WHERE companyId=2').length, 0);
  insertMove(2, foreign);
  fail(() => db.prepare('DELETE FROM StockItem WHERE id=?').run(foreign), 'INVENTORY_ITEM_HAS_MOVEMENTS');
  assert.equal(rowsOf('SELECT 1 FROM InventoryMovement WHERE stockItemId=?', foreign).length, 1);
});
