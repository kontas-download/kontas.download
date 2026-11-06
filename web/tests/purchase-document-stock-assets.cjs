const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const env = require('./helpers/recognition-env.cjs')('erp-doc-stock-assets-');
const { db, rec, src, CODE, extractedDoc, extracted, good, fieldsOf } = env;
const inventory = src('inventory.ts');
after(() => { db.close(); fs.rmSync(env.temp, { recursive: true, force: true }); });

const FIXED_ACCOUNT = '1206';
const EXPENSE = db.prepare("SELECT code FROM ChartOfAccount WHERE code GLOB '[6-7]*' AND code NOT LIKE '27%' ORDER BY code LIMIT 1").get().code;
const INVENTORY_ACCOUNT = '2040';
const single = (net, rate = 21) => { const vat = Math.round(net * rate) / 100; return { net, vat, gross: Math.round((net + vat) * 100) / 100, vatRate: rate }; };
const line = (name, qty, net, extra = {}) => ({ name, quantity: qty, unitPrice: net / qty, ...single(net), ...extra });
const extractedLines = (number, lines) => {
  const net = lines.reduce((a, l) => a + l.net, 0), vat = Math.round(lines.reduce((a, l) => a + l.vat, 0) * 100) / 100;
  return extracted({ number, lines, totals: { net, vat, gross: Math.round((net + vat) * 100) / 100 }, vatBreakdown: [{ rate: 21, net, vat }] });
};

test('fixed asset: the card is offered only for fixed asset accounts, created on confirm and linked to the purchase', async () => {
  const id = await extractedDoc(1, extractedLines('IT-1', [line('Nešiojamas kompiuteris', 1, 1000)]));
  const preview = rec.previewDocument(1, id);
  assert.ok(preview.fixedAssetAccounts.some(a => a.code === FIXED_ACCOUNT));
  assert.equal(preview.inventoryActive, false);
  const body = over => good({ number: 'IT-1', lines: [{ itemName: 'Nešiojamas kompiuteris', quantity: 1, ...single(1000), taxCode: CODE, ...over }], totals: { net: 1000, vat: 210, gross: 1210 }, debitAccount: FIXED_ACCOUNT });
  // Not a fixed asset account: refused with a line field.
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, { ...body({ asset: { create: true, category: 'COMPUTER' } }), debitAccount: EXPENSE }))['lines.0.asset']);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, body({ asset: { create: true } })))['lines.0.asset']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM FixedAsset').get().n, 0);
  assert.equal(db.prepare('SELECT status FROM PurchaseDocument WHERE id=?').get(id).status, 'EXTRACTED');
  // Without the request nothing is created (the card is optional per line).
  const plain = await extractedDoc(1, extracted({ number: 'IT-0' }));
  rec.confirmDocument(1, plain, 5, good({ number: 'IT-0', debitAccount: FIXED_ACCOUNT }));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM FixedAsset').get().n, 0);
  const out = rec.confirmDocument(1, id, 5, body({ asset: { create: true, category: 'COMPUTER', commissioningDate: '2026-10-25' } }));
  assert.equal(out.assets.length, 1);
  const card = db.prepare('SELECT * FROM FixedAsset WHERE id=?').get(out.assets[0].id);
  assert.equal(card.name, 'Nešiojamas kompiuteris'); assert.equal(card.cost, 1000); assert.equal(card.category, 'COMPUTER');
  assert.equal(card.acquisitionDate, '2026-10-20'); assert.equal(card.commissioningDate, '2026-10-25');
  assert.equal(card.assetAccount, FIXED_ACCOUNT); assert.equal(card.purchaseId, out.purchase.id); assert.equal(card.purchaseItemId, out.items[0].id);
  assert.equal(card.usefulLifeMonths, 36);
  assert.match(card.code, /^IT-\d+-1$/);
});

test('fixed asset: the cost includes the non-deductible VAT and a taken code is refused before anything is written', async () => {
  const id = await extractedDoc(1, extractedLines('IT-2', [line('Baldai', 1, 500)]));
  const body = asset => good({ number: 'IT-2', lines: [{ itemName: 'Baldai', quantity: 1, ...single(500), taxCode: CODE, asset }], totals: { net: 500, vat: 105, gross: 605 }, debitAccount: FIXED_ACCOUNT, deductionPercent: 50 });
  db.prepare("INSERT INTO FixedAsset(companyId,code,name,category,acquisitionDate,commissioningDate,cost,usefulLifeMonths,method,assetAccount,accumulatedAccount,expenseAccount,disposalAccount) VALUES(1,'TAKEN','x','OTHER','2026-01-01','2026-01-01',10,12,'STRAIGHT_LINE','1206','1209','6306','6810')").run();
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, body({ create: true, category: 'FURNITURE', code: 'TAKEN' })))['lines.0.asset']);
  const before = db.prepare('SELECT COUNT(*) n FROM Purchase').get().n;
  const out = rec.confirmDocument(1, id, 5, body({ create: true, category: 'FURNITURE', usefulLifeMonths: 60, code: 'BALDAI-1' }));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM Purchase').get().n, before + 1);
  assert.equal(out.purchase.deductibleVat, 52.5);
  const card = db.prepare('SELECT * FROM FixedAsset WHERE id=?').get(out.assets[0].id);
  assert.equal(card.cost, 552.5); assert.equal(card.code, 'BALDAI-1'); assert.equal(card.usefulLifeMonths, 60);
});

test('stock: lines are mapped to an existing or a new stock card and the purchase posts the stock receipt', async () => {
  // Inventory accounting off: the mapping is refused.
  const off = await extractedDoc(1, extracted({ number: 'ST-0' }));
  assert.equal(rec.previewDocument(1, off).inventoryActive, false);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, off, 5, good({ number: 'ST-0', lines: [{ ...good().lines[0], stock: { create: true, code: 'X' } }] })))['lines.0.stock']);
  inventory.saveInventorySettings(db, 1, { method: 'AVERAGE', inventoryAccount: INVENTORY_ACCOUNT, cogsAccount: '6000', startDate: '2026-01-01' }, null);
  db.prepare("INSERT INTO StockItem(companyId,name,code,warehouseName,remainder,stock,cost) VALUES(1,'Popierius A4','POP-A4','Pagrindinis',0,0,0)").run();
  const existing = db.prepare("SELECT id FROM StockItem WHERE code='POP-A4'").get().id;
  const id = await extractedDoc(1, extractedLines('ST-1', [line('popierius a4 ', 2, 20), line('Segtuvai', 3, 6), line('Pristatymas', 1, 10)]));
  const preview = rec.previewDocument(1, id);
  assert.equal(preview.inventoryActive, true);
  assert.deepEqual(preview.lineStockItems, [existing, null, null]);
  const doc = stock => good({
    number: 'ST-1', totals: { net: 36, vat: 7.56, gross: 43.56 }, debitAccount: EXPENSE,
    lines: [
      { itemName: 'Popierius A4', quantity: 2, ...single(20), taxCode: CODE, stock: stock[0] },
      { itemName: 'Segtuvai', quantity: 3, ...single(6), taxCode: CODE, stock: stock[1] },
      { itemName: 'Pristatymas', quantity: 1, ...single(10), taxCode: CODE },
    ],
  });
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, doc([{ itemId: 999999 }, undefined])))['lines.0.stock']);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, doc([undefined, { create: true, code: ' ' }])))['lines.1.stock']);
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id, 5, doc([undefined, { create: true, code: 'POP-A4' }])))['lines.1.stock']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM StockItem WHERE companyId=1').get().n, 1);
  const out = rec.confirmDocument(1, id, 5, doc([{ itemId: existing }, { create: true, code: 'SEG-1' }]));
  assert.equal(db.prepare('SELECT itemCode FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(out.purchase.id).map(r => r.itemCode || '').join(','), 'POP-A4,SEG-1,');
  const moves = db.prepare("SELECT s.code, m.quantity, m.amount, m.kind FROM InventoryMovement m JOIN StockItem s ON s.id=m.stockItemId WHERE m.sourceType='PURCHASE' AND m.sourceId=? ORDER BY m.id").all(out.purchase.id);
  assert.deepEqual(moves.map(m => [m.code, m.quantity, m.amount, m.kind]), [['POP-A4', 2, 20, 'RECEIPT'], ['SEG-1', 3, 6, 'RECEIPT']]);
  const created = db.prepare("SELECT name, remainder FROM StockItem WHERE code='SEG-1'").get();
  assert.equal(created.remainder, 3); assert.equal(created.name, 'Segtuvai');
  // Other warehouse: the purchase takes the warehouse of the chosen cards.
  db.prepare("INSERT INTO StockItem(companyId,name,code,warehouseName,remainder,stock,cost) VALUES(1,'Spausdintuvas','SPA-1','Sandėlys 2',0,0,0)").run();
  const wh = db.prepare("SELECT id FROM StockItem WHERE code='SPA-1'").get().id;
  const id2 = await extractedDoc(1, extracted({ number: 'ST-2' }));
  const out2 = rec.confirmDocument(1, id2, 5, good({ number: 'ST-2', lines: [{ ...good().lines[0], stock: { itemId: wh } }] }));
  assert.equal(out2.purchase.warehouseName, 'Sandėlys 2');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM InventoryMovement WHERE sourceType='PURCHASE' AND sourceId=?").get(out2.purchase.id).n, 1);
  // Cards in two warehouses on one document are refused.
  const id3 = await extractedDoc(1, extractedLines('ST-3', [line('a', 1, 10), line('b', 1, 10)]));
  const two = good({ number: 'ST-3', totals: { net: 20, vat: 4.2, gross: 24.2 }, lines: [{ itemName: 'a', quantity: 1, ...single(10), taxCode: CODE, stock: { itemId: wh } }, { itemName: 'b', quantity: 1, ...single(10), taxCode: CODE, stock: { itemId: existing } }] });
  assert.ok(fieldsOf(() => rec.confirmDocument(1, id3, 5, two)).lines);
});

test('review form: stock and asset choices go into the payload and are validated on the client', () => {
  const form = src('purchase-document-form.ts');
  const base = form.draftToForm({ lines: [{ itemName: 'Kompiuteris', quantity: 1, net: 1000, vat: 210, gross: 1210, vatRate: 21, taxCode: CODE }], totals: { net: 1000, vat: 210, gross: 1210 }, issueDate: '2026-10-20', number: 'A1', supplier: { name: 'T' }, debitAccount: FIXED_ACCOUNT });
  assert.equal(form.formToPayload(base).lines[0].stock, undefined);
  assert.equal(form.formToPayload(base).lines[0].asset, undefined);
  const ctx = { extractedSupplierCode: null, docKind: 'INVOICE', currency: 'EUR', allowedTaxCodes: [CODE], companyVatPayer: true, fixedAssetAccounts: [FIXED_ACCOUNT] };
  const withLine = over => ({ ...base, lines: [{ ...base.lines[0], ...over }] });
  assert.equal(form.validateForm(base, ctx)['lines.0.asset'], undefined);
  assert.equal(form.validateForm(withLine({ assetCreate: true }), ctx)['lines.0.asset'].key, 'docs.v_assetCategory');
  assert.equal(form.validateForm(withLine({ assetCreate: true, assetCategory: 'COMPUTER', assetLife: '0' }), ctx)['lines.0.asset'].key, 'docs.v_assetLife');
  assert.equal(form.validateForm(withLine({ assetCreate: true, assetCategory: 'COMPUTER', stockMode: 'NEW', stockCode: 'X' }), ctx)['lines.0.asset'].key, 'docs.v_assetStock');
  assert.equal(form.validateForm({ ...withLine({ assetCreate: true, assetCategory: 'COMPUTER' }), debitAccount: '6118' }, ctx)['lines.0.asset'].key, 'docs.v_assetAccount');
  assert.equal(form.validateForm(withLine({ assetCreate: true, assetCategory: 'COMPUTER', assetLife: '48' }), ctx)['lines.0.asset'], undefined);
  assert.deepEqual(form.formToPayload(withLine({ assetCreate: true, assetCategory: 'COMPUTER', assetLife: '48', assetCommissioning: '2026-10-21' })).lines[0].asset, { create: true, category: 'COMPUTER', usefulLifeMonths: 48, commissioningDate: '2026-10-21', code: undefined });
  assert.equal(form.validateForm(withLine({ stockMode: 'EXISTING' }), ctx)['lines.0.stock'].key, 'docs.v_stockPick');
  assert.equal(form.validateForm(withLine({ stockMode: 'NEW' }), ctx)['lines.0.stock'].key, 'docs.v_stockCode');
  assert.deepEqual(form.formToPayload(withLine({ stockMode: 'EXISTING', stockItemId: '7' })).lines[0].stock, { itemId: 7 });
  assert.deepEqual(form.formToPayload(withLine({ stockMode: 'NEW', stockCode: ' N-1 ' })).lines[0].stock, { create: true, code: 'N-1' });
});
