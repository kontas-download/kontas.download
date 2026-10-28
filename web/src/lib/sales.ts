import { companyTaxMode } from './tax';
import { calculateLine, totalLines } from './money';
import { validateBody } from './validation';
import { HttpError } from './errors';
import { getDb } from './db';
import { postDocumentInventory } from './inventory';
import { codedLineProblem, taxCodeSide } from './tax-codes';

// Creates a sales invoice with its lines and posting in one transaction. Shared by the invoice API and recurring invoices.
export function createInvoice(companyId: number, body: any) {
  const mode = companyTaxMode(companyId, body?.saleDate);
  if (Array.isArray(body?.items) && mode !== 'STANDARD_VAT') {
    if (body.items.some((item: { vatRate?: unknown }) => item && Number(item.vatRate ?? 0) !== 0)) throw new HttpError(400, 'Taikant režimą be PVM arba SVS, pardavime mokestis neskaičiuojamas');
    body.items = body.items.map((item: object) => ({ ...item, vatRate: 0 }));
  }
  validateBody(body, 'invoices', companyId);
  const { series, number, saleDate, payUntil, statusName, warehouseName, clientId, clientName, clientCode, clientVatCode, notes, items = [] } = body;
  if (!number || !saleDate) throw new HttpError(400, 'Numeris ir data privalomi');

  const db = getDb();
  const { sumWithoutVat, sumWithVat, vat } = totalLines(items);
  const create = db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO Sale (
        companyId, series, number, saleDate, payUntil, statusName, warehouseName,
        clientId, clientName, clientCode, clientVatCode, sumWithoutVat, vat,
        sumWithVat, currencyCode, notes, sellerIsVatPayer, sellerVatMode, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, datetime('now'))
    `).run(
      companyId,
      series || 'PARD',
      String(number).trim(),
      saleDate,
      payUntil || null,
      statusName || 'Apmokėta',
      warehouseName || 'Pagrindinis',
      clientId ? Number(clientId) : null,
      clientName || null,
      clientCode || null,
      clientVatCode || null,
      sumWithoutVat,
      vat,
      sumWithVat,
      notes || null,
      mode !== 'NON_VAT' ? 1 : 0,
      mode
    );
    const saleId = Number(res.lastInsertRowid);
    const insertItem = db.prepare(`
      INSERT INTO SaleItem (
        saleId, itemName, itemCode, quantity, price, priceWithVat,
        vatRate, sumWithoutVat, sumWithVat, warehouseName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertCode = db.prepare('INSERT INTO TaxLineCode(companyId,kind,itemId,taxCode,note,updatedAt) VALUES(?,\'SALE\',?,?,?,?)');
    const now = Date.now();
    for (const it of items) {
      const { qty, price, vatRate, lineNoVat, lineWithVat } = calculateLine(it);
      const itemRes = insertItem.run(saleId, it.itemName || 'Paslauga', it.itemCode || null, qty, price, lineWithVat / qty, vatRate, lineNoVat, lineWithVat, warehouseName || 'Pagrindinis');
      if (mode === 'STANDARD_VAT' && typeof it.taxCode === 'string' && it.taxCode.trim()) {
        const code = it.taxCode.trim().toUpperCase();
        const side = taxCodeSide(code, 'SALE');
        if (!side) throw new HttpError(400, `Kodas ${code} netaikomas pardavimams`);
        const problem = codedLineProblem(code, side, { rate: vatRate, net: Math.round(lineNoVat * 100), vat: Math.round((lineWithVat - lineNoVat) * 100) }, saleDate, false);
        if (problem) throw new HttpError(400, problem);
        insertCode.run(companyId, Number(itemRes.lastInsertRowid), code, '', now);
      }
    }
    // Cost of goods sold, when the company keeps inventory accounting; an insufficient stock aborts the whole invoice.
    postDocumentInventory(db, companyId, 'SALE', saleId);
    return saleId;
  });
  const saleId = create();
  return { sale: db.prepare('SELECT * FROM Sale WHERE id = ?').get(saleId), items: db.prepare('SELECT * FROM SaleItem WHERE saleId=? ORDER BY id').all(saleId), saleId };
}
