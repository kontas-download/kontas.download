import type Database from 'better-sqlite3';
import { inheritCreditCodes } from './tax-line-codes';
import { purchaseTax, taxMode } from './tax';
import { calculateLine, totalLines } from './money';
import { validateBody } from './validation';
import { HttpError } from './errors';
import { assertRatesMatch, originalRates } from './credit-rules';

interface Original { id: number; series: string | null; number: string; purchaseDate: string; docType: string | null; clientId: number | null; clientName: string | null; clientCode: string | null; sumWithoutVat: number; vat: number; sumWithVat: number; deductibleVat: number | null; buyerVatMode: string | null; deductionPercent: number | null; debitAccount: string | null; currencyCode: string; }
export interface CreditInput { number: string; series?: string; purchaseDate: string; reason: string; items: any[]; }
export interface CreditPlan {
  original: Original;
  totals: { sumWithoutVat: number; vat: number; sumWithVat: number };
  deductionPercent: number | null;
  // Negative number stored on the credit note (VAT deduction that is reversed); null when the original's deduction was never reviewed.
  deductibleVat: number | null;
}
const cents = (value: number) => Math.round(value * 100);

// Validates a supplier credit note against its original and works out what it will post. Writes nothing.
// Shared by the manual credit route and the XML import so both apply exactly the same rules.
export function planPurchaseCredit(db: Database.Database, companyId: number, originalId: number, input: CreditInput): CreditPlan {
  const original = db.prepare('SELECT id,series,number,purchaseDate,docType,clientId,clientName,clientCode,sumWithoutVat,vat,sumWithVat,deductibleVat,buyerVatMode,deductionPercent,debitAccount,currencyCode FROM Purchase WHERE id=? AND companyId=?').get(originalId, companyId) as Original | undefined;
  if (!original) throw new HttpError(404, 'Įrašas nerastas');
  if (original.docType === 'KS') throw new HttpError(400, 'Kreditinio dokumento pakartotinai koreguoti negalima');
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!reason || reason.length > 500) throw new HttpError(400, 'Nurodykite korekcijos priežastį (iki 500 simbolių)');
  validateBody({ number: input.number, series: input.series, purchaseDate: input.purchaseDate, items: input.items }, 'purchases', companyId);
  const { purchaseDate, items } = input;
  if (purchaseDate < original.purchaseDate) throw new HttpError(400, 'Korekcijos data negali būti ankstesnė už pradinį dokumentą');

  const totals = totalLines(items);
  const { sumWithoutVat, sumWithVat, vat } = totals;
  const prior = db.prepare('SELECT COALESCE(SUM(-sumWithoutVat),0) net, COALESCE(SUM(-vat),0) vat, COALESCE(SUM(-sumWithVat),0) gross, COALESCE(SUM(-deductibleVat),0) ded FROM Purchase WHERE originalPurchaseId=? AND companyId=?').get(originalId, companyId) as { net: number; vat: number; gross: number; ded: number };
  assertRatesMatch(originalRates(db, 'PurchaseItem', 'purchaseId', originalId), items);
  if (cents(prior.vat) + cents(vat) > cents(original.vat)) throw new HttpError(400, 'Kreditinių dokumentų PVM viršija pradinio dokumento PVM');
  if (cents(prior.net) + cents(sumWithoutVat) > cents(original.sumWithoutVat) || cents(prior.gross) + cents(sumWithVat) > cents(original.sumWithVat)) throw new HttpError(400, 'Kreditinių dokumentų suma viršija pradinio dokumento sumą');

  // Deduction: reuse the original's percentage; a legacy purchase with an unreviewed deduction stays unreviewed.
  const mode = taxMode(original.buyerVatMode);
  let deductionPercent: number | null = null;
  let deductibleVat: number | null = null;
  if (original.deductionPercent !== null) {
    const tax = purchaseTax(vat, mode, original.deductionPercent);
    deductionPercent = tax.deductionPercent;
    // Never reverse more than was deducted in total: the last credit takes the exact remainder, earlier ones are capped by it.
    const left = cents(original.deductibleVat ?? 0) - cents(prior.ded);
    const finalCredit = cents(prior.vat) + cents(vat) === cents(original.vat);
    const reversed = finalCredit ? left : Math.min(cents(tax.deductibleVat), left);
    deductibleVat = reversed === 0 ? 0 : -reversed / 100;
  }
  return { original, totals, deductionPercent, deductibleVat };
}

// Stores the credit note (negative purchase) and its lines; the journal rows come from the database triggers.
export function insertPurchaseCredit(db: Database.Database, companyId: number, originalId: number, input: CreditInput): number {
  return db.transaction(() => {
    const { original, totals, deductionPercent, deductibleVat } = planPurchaseCredit(db, companyId, originalId, input);
    const reason = input.reason.trim();
    const res = db.prepare(`INSERT INTO Purchase (companyId, series, number, purchaseDate, clientId, clientName, clientCode, sumWithoutVat, vat, sumWithVat, currencyCode, notes, buyerVatMode, deductionPercent, deductibleVat, debitAccount, docType, originalPurchaseId, correctionReason, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'KS', ?, ?, datetime('now'))`).run(
      companyId, (typeof input.series === 'string' && input.series.trim()) || '', String(input.number).trim(), input.purchaseDate, original.clientId, original.clientName, original.clientCode,
      -totals.sumWithoutVat, -totals.vat, -totals.sumWithVat, original.currencyCode || 'EUR', reason, original.buyerVatMode, deductionPercent, deductibleVat, original.debitAccount, originalId, reason);
    const purchaseId = Number(res.lastInsertRowid);
    const insertItem = db.prepare('INSERT INTO PurchaseItem (purchaseId, itemName, itemCode, quantity, price, sumWithoutVat, sumWithVat, vatRate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const it of input.items) {
      const line = calculateLine(it);
      insertItem.run(purchaseId, it.itemName || 'Prekė / Paslauga', it.itemCode || null, line.qty, line.price, -line.lineNoVat, -line.lineWithVat, line.vatRate);
    }
    // The credit note takes over the i.SAF codes of the original lines where they are unambiguous (callers report the rest).
    inheritCreditCodes(db, companyId, 'PURCHASE', originalId, purchaseId);
    return purchaseId;
  })();
}
