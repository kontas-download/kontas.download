import type Database from 'better-sqlite3';
import { companyTaxMode, purchaseDebitAccount, purchaseTax } from './tax';
import { calculateLine, totalLines } from './money';
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
export function createPurchase(companyId: number, body: any) {
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, datetime('now'))
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
