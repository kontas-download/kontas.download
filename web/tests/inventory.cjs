const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const Database = require('better-sqlite3');
// Temporary database only: the project database is never opened by this test.
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-inventory-'));
process.env.DATABASE_URL = 'file:' + path.join(temp, 'test.db');
const fixture = new Database(process.env.DATABASE_URL.slice(5));
fixture.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
fixture.close();
const options = { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true };
require.extensions['.ts'] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: options }).outputText, filename);
const inv = require('../src/lib/inventory.ts');
const { createInvoice } = require('../src/lib/sales.ts');
const { createPurchase } = require('../src/lib/purchases.ts');
const { insertPurchaseCredit } = require('../src/lib/purchase-credit.ts');
const { getDb } = require('../src/lib/db.ts');
const db = getDb();
after(() => { db.close(); fs.rmSync(temp, { recursive: true, force: true }); });
const addCompany = db.prepare("INSERT INTO Company (id, name, code, currencyCode, isDefault, createdAt, updatedAt) VALUES (?, ?, ?, 'EUR', 0, datetime('now'), datetime('now'))");
for (const id of [1, 2, 3, 4, 5, 6, 7, 8]) addCompany.run(id, 'C' + id, String(id));
const addItem = (companyId, code, remainder = 0, cost = 0) => Number(db.prepare('INSERT INTO StockItem(name,code,companyId,stock,remainder,cost) VALUES(?,?,?,?,?,?)').run('Preke ' + code, code, companyId, remainder, remainder, cost).lastInsertRowid);
let seq = 0;
const buy = (companyId, date, qty, total, code = 'P1') => createPurchase(companyId, { number: 'P' + (++seq), purchaseDate: date, items: [{ itemName: 'x', itemCode: code, quantity: qty, price: total / qty, vatRate: 0 }] }).purchaseId;
const sell = (companyId, date, qty, code = 'P1') => createInvoice(companyId, { number: 'S' + (++seq), saleDate: date, items: [{ itemName: 'x', itemCode: code, quantity: qty, price: 10, vatRate: 0 }] }).saleId;
const moves = (itemId) => db.prepare('SELECT * FROM InventoryMovement WHERE stockItemId=? ORDER BY id').all(itemId);
const setMethod = (companyId, method) => inv.saveInventorySettings(db, companyId, { method, startDate: '2026-01-01' }, null);
const cogs = (itemId) => moves(itemId).filter(m => m.kind === 'ISSUE' && m.sourceType === 'SALE').map(m => m.amount);

test('off by default: documents do not touch stock or ledger', () => {
  const item = addItem(1, 'P1', 5, 2);
  assert.equal(inv.inventorySettings(db, 1).method, 'OFF');
  buy(1, '2026-02-01', 10, 100);
  sell(1, '2026-02-02', 3);
  assert.equal(moves(item).length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM GeneralEntry WHERE sourceType='INVENTORY'").get().n, 0);
  const row = db.prepare('SELECT remainder,cost FROM StockItem WHERE id=?').get(item);
  assert.deepEqual([row.remainder, row.cost], [5, 2]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM InventorySettings').get().n, 0);
});

test('weighted average cost with opening balance and COGS ledger entries', () => {
  const item = addItem(2, 'P1', 10, 1);
  setMethod(2, 'AVERAGE');
  buy(2, '2026-02-01', 10, 30); // 10@1 + 10@3 => 20 units, value 40, average 2
  sell(2, '2026-02-02', 5);
  assert.deepEqual(cogs(item), [10]);
  sell(2, '2026-02-03', 15);
  assert.deepEqual(cogs(item), [10, 30]); // the last issue empties the stock: exact remaining value
  const last = moves(item).at(-1);
  assert.deepEqual([last.balanceQty, last.balanceValue], [0, 0]);
  const entries = db.prepare("SELECT debitAccount,creditAccount,amount FROM GeneralEntry WHERE companyId=2 AND sourceType='INVENTORY' ORDER BY id").all();
  assert.deepEqual(entries.filter(e => e.debitAccount === '6000').map(e => e.amount), [10, 30]);
  assert.ok(entries.some(e => e.debitAccount === '2040' && e.creditAccount === '6118' && e.amount === 30));
  assert.equal(db.prepare('SELECT remainder FROM StockItem WHERE id=?').get(item).remainder, 0);
});

test('FIFO cost consumes the oldest layers first', () => {
  const item = addItem(3, 'P1');
  setMethod(3, 'FIFO');
  buy(3, '2026-02-01', 10, 10); // 1.00 each
  buy(3, '2026-02-02', 10, 30); // 3.00 each
  sell(3, '2026-02-03', 15); // 10*1 + 5*3 = 25
  sell(3, '2026-02-04', 5); // 5*3 = 15
  assert.deepEqual(cogs(item), [25, 15]);
  assert.equal(moves(item).at(-1).balanceValue, 0);
});

test('negative stock guard rolls the whole sale back', () => {
  const item = addItem(3, 'N1');
  buy(3, '2026-03-01', 2, 4, 'N1');
  const before = db.prepare('SELECT COUNT(*) n FROM Sale WHERE companyId=3').get().n;
  assert.throws(() => sell(3, '2026-03-02', 3, 'N1'), /Nepakanka atsarg/);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Sale WHERE companyId=3').get().n, before);
  assert.equal(moves(item).length, 1);
  assert.throws(() => inv.adjustInventory(db, 3, { stockItemId: item, kind: 'ADJUST_QTY', quantity: -5, reason: 'test' }, 1), /Nepakanka atsarg/);
});

test('manual adjustments need a reason, are audited and never rewrite history', () => {
  const item = addItem(4, 'P1');
  setMethod(4, 'AVERAGE');
  buy(4, '2026-02-01', 10, 20);
  assert.throws(() => inv.adjustInventory(db, 4, { stockItemId: item, kind: 'ADJUST_COST', amount: 5 }, 7), /priežast/);
  const first = moves(item)[0];
  const id = inv.adjustInventory(db, 4, { stockItemId: item, kind: 'ADJUST_COST', amount: 10, reason: 'Pervertinimas', date: '2026-02-10' }, 7);
  const m = db.prepare('SELECT * FROM InventoryMovement WHERE id=?').get(id);
  assert.deepEqual([m.balanceQty, m.balanceValue, m.actorId, m.reason], [10, 30, 7, 'Pervertinimas']);
  assert.equal(m.unitCost, 3);
  assert.deepEqual(moves(item)[0], first);
  assert.equal(db.prepare("SELECT actorId FROM AccountingAudit WHERE entity='InventoryMovement' AND recordId=?").get(id).actorId, 7);
  assert.equal(db.prepare("SELECT amount FROM GeneralEntry WHERE sourceType='INVENTORY' AND sourceId=?").get(id).amount, 10);
  inv.adjustInventory(db, 4, { stockItemId: item, kind: 'ADJUST_QTY', quantity: -2, reason: 'Brokas' }, 7);
  assert.equal(moves(item).at(-1).balanceValue, 24);
  assert.throws(() => db.prepare('UPDATE InventoryMovement SET amount=1 WHERE id=?').run(id), /INVENTORY_MOVEMENT_IMMUTABLE/);
  assert.throws(() => db.prepare('DELETE FROM InventoryMovement WHERE id=?').run(id), /INVENTORY_MOVEMENT_IMMUTABLE/);
  // The method cannot be switched once movements exist; settings changes are audited.
  assert.throws(() => setMethod(4, 'FIFO'), /keisti negalima/);
  assert.ok(db.prepare("SELECT 1 FROM AccountingAudit WHERE entity='InventorySettings' AND companyId=4").get());
});

test('posted documents are protected and credit notes reverse the stock effect', () => {
  const item = addItem(5, 'P1');
  setMethod(5, 'AVERAGE');
  const purchaseId = buy(5, '2026-02-01', 10, 50);
  const saleId = sell(5, '2026-02-02', 4);
  assert.deepEqual(cogs(item), [20]);
  assert.throws(() => db.prepare('DELETE FROM Sale WHERE id=?').run(saleId), /INVENTORY_DOCUMENT_POSTED/);
  // Sales credit note: goods return at the original issue cost.
  const cn = Number(db.prepare("INSERT INTO Sale(companyId,series,number,saleDate,docType,originalSaleId,sumWithoutVat,vat,sumWithVat,currencyCode,warehouseName,createdAt) VALUES(5,'KS','K1','2026-02-05','KS',?,-10,0,-10,'EUR','Pagrindinis',datetime('now'))").run(saleId).lastInsertRowid);
  db.prepare('INSERT INTO SaleItem(saleId,itemName,itemCode,quantity,price,priceWithVat,vatRate,sumWithoutVat,sumWithVat,warehouseName) VALUES(?,?,?,?,?,?,?,?,?,?)').run(cn, 'x', 'P1', 1, 10, 10, 0, -10, -10, 'Pagrindinis');
  assert.equal(inv.postDocumentInventory(db, 5, 'SALE', cn), 1);
  const ret = moves(item).at(-1);
  assert.deepEqual([ret.kind, ret.amount, ret.balanceQty, ret.balanceValue, ret.debitAccount, ret.creditAccount], ['RECEIPT', 5, 7, 35, '2040', '6000']);
  // Supplier credit note: goods leave the stock, and an overdrawn return is refused.
  const credit = (qty, no) => insertPurchaseCredit(db, 5, purchaseId, { number: no, purchaseDate: '2026-02-06', reason: 'Grazinta', items: [{ itemName: 'x', itemCode: 'P1', quantity: qty, price: 5, vatRate: 0 }] });
  credit(2, 'PK1');
  const out = moves(item).at(-1);
  assert.deepEqual([out.kind, out.balanceQty, out.balanceValue], ['ISSUE', 5, 25]);
  assert.throws(() => credit(6, 'PK2'), /Nepakanka atsarg/);
});

test('FIFO value adjustment never drives a layer below zero', () => {
  const item = addItem(1, 'FA1');
  setMethod(1, 'FIFO');
  buy(1, '2026-03-01', 1, 1, 'FA1');
  buy(1, '2026-03-02', 1, 100, 'FA1');
  const adjust = (amount) => inv.adjustInventory(db, 1, { stockItemId: item, kind: 'ADJUST_COST', amount, reason: 'Nukainojimas' }, null);
  const layers = () => db.prepare('SELECT remainingValue v FROM InventoryLayer WHERE stockItemId=? ORDER BY id').all(item).map(l => l.v);
  adjust(-10);
  assert.deepEqual(layers(), [0, 91]);
  adjust(5);
  assert.deepEqual(layers(), [2.5, 93.5]);
  assert.throws(() => db.prepare('UPDATE InventoryLayer SET remainingValue=-1 WHERE stockItemId=?').run(item), /INVENTORY_LAYER_NEGATIVE/);
});

test('purchase receipt includes non-deductible VAT and the ledger inventory account empties after the sale', () => {
  db.prepare("UPDATE Company SET isVatPayer=1, taxMode='STANDARD_VAT' WHERE id IN (6)").run();
  const account = (companyId) => db.prepare("SELECT COALESCE(SUM(CASE WHEN debitAccount='2040' THEN amount ELSE 0 END)-SUM(CASE WHEN creditAccount='2040' THEN amount ELSE 0 END),0) v FROM GeneralEntry WHERE companyId=?").get(companyId).v;
  for (const [companyId, percent, expected] of [[6, 0, 121], [6, 100, 100]]) {
    const item = addItem(companyId, 'NV' + percent);
    if (percent === 0) setMethod(companyId, 'AVERAGE');
    createPurchase(companyId, { number: 'NV' + (++seq), purchaseDate: '2026-04-01', debitAccount: '2040', deductionPercent: percent, items: [{ itemName: 'x', itemCode: 'NV' + percent, quantity: 1, price: 100, vatRate: 21 }] });
    assert.equal(moves(item)[0].amount, expected);
  }
  const item = db.prepare("SELECT id FROM StockItem WHERE companyId=6 AND code='NV0'").get().id;
  assert.equal(account(6), 221);
  sell(6, '2026-04-02', 1, 'NV0');
  assert.deepEqual(cogs(item), [121]);
  assert.equal(account(6), 100);
});

test('stock card lookup is unambiguous across warehouses', () => {
  setMethod(7, 'AVERAGE');
  const mk = (code, wh) => Number(db.prepare('INSERT INTO StockItem(name,code,companyId,stock,remainder,cost,warehouseName) VALUES(?,?,?,?,?,?,?)').run('K ' + code + wh, code, 7, 0, 0, 0, wh).lastInsertRowid);
  const one = mk('WH1', 'Pagrindinis');
  buy(7, '2026-05-01', 1, 5, 'WH1'); // single card in the document's warehouse
  assert.equal(moves(one).length, 1);
  mk('WH5', 'Kitas');
  assert.throws(() => buy(7, '2026-05-01', 1, 5, 'WH5'), /sandėlyje „Kitas“/); // single card in another warehouse is no longer a fallback
  const a = mk('WH2', 'Pagrindinis'); mk('WH2', 'Kitas');
  buy(7, '2026-05-02', 1, 5, 'WH2'); // exact warehouse match among several
  assert.equal(moves(a).length, 1);
  mk('WH3', 'A'); mk('WH3', 'B');
  assert.throws(() => buy(7, '2026-05-03', 1, 5, 'WH3'), /sandėliuose/);
  mk('WH4', 'Pagrindinis'); mk('WH4', 'Pagrindinis');
  assert.throws(() => buy(7, '2026-05-04', 1, 5, 'WH4'), /kartojasi/);
});

const { assertQuantitiesWithinOriginal } = require('../src/lib/credit-rules.ts');
test('credit notes are limited by original line quantities; unmatched goods are refused, services pass', () => {
  addItem(8, 'Q1');
  const sale = createInvoice(8, { number: 'QS1', saleDate: '2026-03-01', items: [{ itemName: 'Prekė', itemCode: 'Q1', quantity: 1, price: 100, vatRate: 0 }, { itemName: 'Paslauga', quantity: 2, price: 10, vatRate: 0 }] }).saleId;
  const check = items => assertQuantitiesWithinOriginal(db, 8, 'SALE', sale, items);
  assert.throws(() => check([{ itemName: 'Prekė', itemCode: 'Q1', quantity: 100, price: 1, vatRate: 0 }]), /viršija/);
  check([{ itemName: 'Paslauga', quantity: 3, price: 1, vatRate: 0 }]); // services: sums only
  check([{ itemName: 'Prekė', itemCode: 'Q1', quantity: 1, price: 100, vatRate: 0 }, { itemName: 'Paslauga', quantity: 2, price: 5, vatRate: 0 }]);
  const stocked = addItem(8, 'Q2');
  assert.ok(stocked);
  assert.throws(() => check([{ itemName: 'Q2 prekė', itemCode: 'Q2', quantity: 1, price: 1, vatRate: 0 }]), /neatitinka/);
  // supplier side with accumulated earlier credits
  const purchase = buy(8, '2026-03-02', 4, 40, 'Q1');
  insertPurchaseCredit(db, 8, purchase, { number: 'QK1', purchaseDate: '2026-03-03', reason: 'x', items: [{ itemName: 'x', itemCode: 'Q1', quantity: 3, price: 1, vatRate: 0 }] });
  assert.throws(() => insertPurchaseCredit(db, 8, purchase, { number: 'QK2', purchaseDate: '2026-03-04', reason: 'x', items: [{ itemName: 'x', itemCode: 'Q1', quantity: 2, price: 1, vatRate: 0 }] }), /viršija/);
});

test('non-deductible purchase VAT is spread by each line own VAT, not by net value', () => {
  const goods = addItem(6, 'V1');
  setMethod(6, 'AVERAGE');
  const id = Number(db.prepare("INSERT INTO Purchase(companyId,series,number,purchaseDate,sumWithoutVat,vat,sumWithVat,deductibleVat,currencyCode,createdAt) VALUES(6,'','VP1','2026-03-01',200,21,221,0,'EUR',datetime('now'))").run().lastInsertRowid);
  const ins = db.prepare('INSERT INTO PurchaseItem(purchaseId,itemName,itemCode,quantity,price,sumWithoutVat,sumWithVat,vatRate) VALUES(?,?,?,?,?,?,?,?)');
  ins.run(id, 'Prekė', 'V1', 1, 100, 100, 100, 0);
  ins.run(id, 'Paslauga', null, 1, 100, 100, 121, 21);
  inv.postDocumentInventory(db, 6, 'PURCHASE', id);
  assert.equal(moves(goods)[0].amount, 100);
});

test('a single matching stock card must be in the document warehouse', () => {
  db.prepare("INSERT INTO StockItem(name,code,companyId,stock,remainder,cost,warehouseName) VALUES('Sand','W1',7,5,5,1,'Antras')").run();
  setMethod(7, 'AVERAGE');
  assert.throws(() => sell(7, '2026-03-01', 1, 'W1'), /Antras/);
});

test('purchases receive into the chosen warehouse; supplier returns follow it; NULL means Pagrindinis', () => {
  const company = 6;
  const mk = (wh) => Number(db.prepare('INSERT INTO StockItem(name,code,companyId,stock,remainder,cost,warehouseName) VALUES(?,?,?,?,?,?,?)').run('Sand ' + wh, 'PW1', company, 0, 0, 0, wh).lastInsertRowid);
  const main = mk('Pagrindinis'), second = mk('Antras');
  setMethod(company, 'AVERAGE');
  const buyIn = (warehouseName, qty, total) => createPurchase(company, { number: 'PW' + (++seq), purchaseDate: '2026-06-01', warehouseName, items: [{ itemName: 'x', itemCode: 'PW1', quantity: qty, price: total / qty, vatRate: 0 }] }).purchaseId;
  const legacy = buyIn(undefined, 2, 20); // omitted = Pagrindinis
  db.prepare('UPDATE Purchase SET warehouseName=NULL WHERE id=?').run(legacy);
  assert.equal(moves(main).length, 1);
  assert.equal(moves(second).length, 0);
  const inSecond = buyIn('Antras', 5, 100);
  assert.equal(moves(second).length, 1);
  assert.equal(moves(main).length, 1);
  assert.equal(db.prepare('SELECT warehouseName FROM Purchase WHERE id=?').get(inSecond).warehouseName, 'Antras');
  assert.throws(() => buyIn('Neegzistuoja', 1, 1), /nerastas/);
  // Supplier return inherits the original purchase's warehouse.
  const cn = insertPurchaseCredit(db, company, inSecond, { number: 'PWK' + (++seq), purchaseDate: '2026-06-02', reason: 'Grąžinimas', items: [{ itemName: 'x', itemCode: 'PW1', quantity: 2, price: 20, vatRate: 0 }] });
  assert.equal(db.prepare('SELECT warehouseName FROM Purchase WHERE id=?').get(cn).warehouseName, 'Antras');
  assert.deepEqual(moves(second).map(m => m.kind), ['RECEIPT', 'ISSUE']);
  assert.equal(moves(main).length, 1);
  // Return of a legacy (NULL) purchase leaves the main warehouse.
  insertPurchaseCredit(db, company, legacy, { number: 'PWK' + (++seq), purchaseDate: '2026-06-02', reason: 'Grąžinimas', items: [{ itemName: 'x', itemCode: 'PW1', quantity: 1, price: 10, vatRate: 0 }] });
  assert.deepEqual(moves(main).map(m => m.kind), ['RECEIPT', 'ISSUE']);
  // A card that exists only in another warehouse is still rejected for a main-warehouse purchase.
  db.prepare("INSERT INTO StockItem(name,code,companyId,stock,remainder,cost,warehouseName) VALUES('Tik antras','PW2',?,0,0,0,'Antras')").run(company);
  assert.throws(() => createPurchase(company, { number: 'PW' + (++seq), purchaseDate: '2026-06-03', items: [{ itemName: 'x', itemCode: 'PW2', quantity: 1, price: 1, vatRate: 0 }] }), /sandėlyje „Antras“/);
});
