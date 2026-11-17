import type Database from 'better-sqlite3';
import { companyTaxMode, purchaseDebitAccount, purchaseTax, taxMode } from './tax';
import { calculateLine, totalLines } from './money';
import { restoreLineCodes, snapshotLineCodes } from './tax-line-codes';
import { validateBody } from './validation';
import { HttpError } from './errors';
import { getDb } from './db';
import { postDocumentInventory } from './inventory';

// NULL/empty = 'Pagrindinis'. Any other warehouse must already exist as one of the company's stock cards.
export function purchaseWarehouse(db: Database.Database, companyId: number, value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 200) throw new HttpError(400, 'Neteisingas sandėlio pavadinimas');
  const name = value.trim();
  if (!name || name === 'Pagrindinis') return null;
  if (!db.prepare('SELECT 1 FROM StockItem WHERE companyId=? AND warehouseName=?').get(companyId, name)) throw new HttpError(400, `Sandėlys „${name}“ nerastas atsargų kortelėse`);
  return name;
}

// Creates a purchase with its lines and posting in one transaction. Shared by the purchase API and the XML import.
// `currencyCode`: the document currency when the purchase holds EUR amounts converted from it (set by the received documents only).
export function createPurchase(companyId: number, body: any, options: { currencyCode?: string } = {}) {
  validateBody(body, 'purchases', companyId);
  const { series, number, purchaseDate, clientId, clientName, clientCode, notes, items = [] } = body;
  if (!number || !purchaseDate) throw new HttpError(400, 'Numeris ir data privalomi');

  const db = getDb();
  const { sumWithoutVat, sumWithVat, vat } = totalLines(items);
  const mode = companyTaxMode(companyId, purchaseDate);
  const { deductionPercent, deductibleVat } = purchaseTax(vat, mode, body.deductionPercent);
  const debitAccount = purchaseDebitAccount(db, body.debitAccount);
  const warehouseName = purchaseWarehouse(db, companyId, body.warehouseName);

  const create = db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO Purchase (
        companyId, series, number, purchaseDate, clientId, clientName,
        clientCode, sumWithoutVat, vat, sumWithVat, currencyCode, notes, buyerVatMode, deductionPercent, deductibleVat, debitAccount, warehouseName,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      series || '',
      String(number).trim(),
      purchaseDate,
      clientId ? Number(clientId) : null,
      clientName || null,
      clientCode || null,
      sumWithoutVat,
      vat,
      sumWithVat,
      options.currencyCode || 'EUR',
      notes || null,
      mode, deductionPercent, deductibleVat, debitAccount, warehouseName
    );
    const purchaseId = Number(res.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO PurchaseItem (
        purchaseId, itemName, itemCode, quantity, price, sumWithoutVat, sumWithVat, vatRate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const it of items) {
      const { qty, price, vatRate, lineNoVat, lineWithVat } = calculateLine(it);
      insertItem.run(purchaseId, it.itemName || 'Prekė / Paslauga', it.itemCode || null, qty, price, lineNoVat, lineWithVat, vatRate);
    }
    // Stock receipt, when the company keeps inventory accounting.
    postDocumentInventory(db, companyId, 'PURCHASE', purchaseId);
    return purchaseId;
  });
  const purchaseId = create();
  return { purchase: db.prepare('SELECT * FROM Purchase WHERE id = ?').get(purchaseId), items: db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(purchaseId), purchaseId };
}

// Rewrites a purchase header and its lines in one transaction (ledger, period locks and stock rules are enforced by the database triggers).
// Shared by the purchase API and by the promotion of a receipt-based purchase to an invoice. The historical VAT status of the buyer is kept.
// `writeExtras` runs in the same transaction after the header update.
export function updatePurchase(db: Database.Database, companyId: number, id: number, body: any, writeExtras?: () => void) {
  const { series, number, purchaseDate, clientId, clientName, clientCode, notes, items = [] } = body;
  const { sumWithoutVat, sumWithVat, vat } = totalLines(items);
  const snapshot = db.prepare('SELECT buyerVatMode,deductionPercent,debitAccount,warehouseName FROM Purchase WHERE id=? AND companyId=?').get(id, companyId) as { buyerVatMode: string | null; deductionPercent: number | null; debitAccount: string | null; warehouseName: string | null };
  const mode = snapshot.buyerVatMode ? taxMode(snapshot.buyerVatMode) : companyTaxMode(companyId, purchaseDate);
  const { deductionPercent, deductibleVat } = purchaseTax(vat, mode, body.deductionPercent ?? snapshot.deductionPercent ?? undefined);
  const debitAccount = body.debitAccount === undefined ? snapshot.debitAccount : purchaseDebitAccount(db, body.debitAccount);
  const warehouseName = body.warehouseName === undefined ? snapshot.warehouseName : purchaseWarehouse(db, companyId, body.warehouseName);
  let droppedTaxCodes: { itemName: string; taxCode: string }[] = [];
  db.transaction(() => {
    db.prepare(`
      UPDATE Purchase SET
        series = ?, number = ?, purchaseDate = ?, clientId = ?, clientName = ?, clientCode = ?,
        sumWithoutVat = ?, vat = ?, sumWithVat = ?, notes = ?,
        buyerVatMode = ?, deductionPercent = ?, deductibleVat = ?, debitAccount = ?, warehouseName = ?
      WHERE id = ? AND companyId = ?
    `).run(series || '', String(number).trim(), purchaseDate, clientId ? Number(clientId) : null, clientName || null, clientCode || null,
      sumWithoutVat, vat, sumWithVat, notes || null, mode, deductionPercent, deductibleVat, debitAccount, warehouseName, id, companyId);
    if (writeExtras) writeExtras();
    // Replace items
    const codesBefore = snapshotLineCodes(db, 'PURCHASE', id);
    db.prepare('DELETE FROM PurchaseItem WHERE purchaseId = ?').run(id);
    const insertItem = db.prepare(`
      INSERT INTO PurchaseItem (
        purchaseId, itemName, itemCode, quantity, price, sumWithoutVat, sumWithVat, vatRate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const it of items) {
      const { qty, price, vatRate, lineNoVat, lineWithVat } = calculateLine(it);
      insertItem.run(id, it.itemName || 'Prekė / Paslauga', it.itemCode || null, qty, price, lineNoVat, lineWithVat, vatRate);
    }
    // The accountant's i.SAF codes follow the lines; a code that fits no new line is reported and the document is marked for review.
    droppedTaxCodes = restoreLineCodes(db, companyId, 'PURCHASE', id, codesBefore);
  })();
  return { droppedTaxCodes };
}
