import { companyTaxMode, purchaseDebitAccount, purchaseTax } from './tax';
import { calculateLine, totalLines } from './money';
import { validateBody } from './validation';
import { HttpError } from './errors';
import { getDb } from './db';

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

  const create = db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO Purchase (
        companyId, series, number, purchaseDate, clientId, clientName,
        clientCode, sumWithoutVat, vat, sumWithVat, currencyCode, notes, buyerVatMode, deductionPercent, deductibleVat, debitAccount,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, datetime('now'))
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
      mode, deductionPercent, deductibleVat, debitAccount
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
    return purchaseId;
  });
  const purchaseId = create();
  return { purchase: db.prepare('SELECT * FROM Purchase WHERE id = ?').get(purchaseId), items: db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(purchaseId), purchaseId };
}
