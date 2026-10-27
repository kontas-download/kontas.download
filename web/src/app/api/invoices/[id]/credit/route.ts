import { taxMode } from '@/lib/tax';
import { inheritCreditCodes } from '@/lib/tax-line-codes';
import { calculateLine, totalLines } from '@/lib/money';
import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { assertRatesMatch, originalRates } from '@/lib/credit-rules';

interface Original { id: number; series: string | null; number: string; saleDate: string; docType: string | null; clientId: number | null; clientName: string | null; clientCode: string | null; clientVatCode: string | null; sumWithoutVat: number; vat: number; sumWithVat: number; sellerVatMode: string | null; sellerIsVatPayer: number | null; currencyCode: string; warehouseName: string | null; }
const cents = (value: number) => Math.round(value * 100);

// Issues a credit note (KS) against an invoice. Lines are entered as positive amounts and stored negative.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const original = db.prepare('SELECT id,series,number,saleDate,docType,clientId,clientName,clientCode,clientVatCode,sumWithoutVat,vat,sumWithVat,sellerVatMode,sellerIsVatPayer,currencyCode,warehouseName FROM Sale WHERE id=? AND companyId=?').get(id, companyId) as Original | undefined;
    if (!original) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    if (original.docType === 'KS') throw new HttpError(400, 'Kreditinio dokumento pakartotinai koreguoti negalima');

    const body = await request.json();
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason || reason.length > 500) throw new HttpError(400, 'Nurodykite koregavimo priežastį (iki 500 simbolių)');
    const mode = taxMode(original.sellerVatMode, original.sellerIsVatPayer);
    if (Array.isArray(body?.items) && mode !== 'STANDARD_VAT') {
      if (body.items.some((item: { vatRate?: unknown }) => item && Number(item.vatRate ?? 0) !== 0)) throw new HttpError(400, 'Esant režimui be PVM arba SVS, koregavime PVM skaičiuoti negalima');
      body.items = body.items.map((item: object) => ({ ...item, vatRate: 0 }));
    }
    validateBody(body, 'invoices', companyId);
    const { number, saleDate, items } = body;
    if (saleDate < original.saleDate) throw new HttpError(400, 'Koregavimo data negali būti ankstesnė už pirminės sąskaitos datą');

    // Credit may not exceed what is still uncredited on the original invoice.
    const { sumWithoutVat, sumWithVat, vat } = totalLines(items);
    const prior = db.prepare("SELECT COALESCE(SUM(-sumWithoutVat),0) net, COALESCE(SUM(-vat),0) vat, COALESCE(SUM(-sumWithVat),0) gross FROM Sale WHERE originalSaleId=? AND companyId=?").get(id, companyId) as { net: number; vat: number; gross: number };
    assertRatesMatch(originalRates(db, 'SaleItem', 'saleId', id), items);
    if (cents(prior.vat) + cents(vat) > cents(original.vat)) throw new HttpError(400, 'Kreditinių dokumentų PVM viršija pirminės sąskaitos PVM');
    if (cents(prior.net) + cents(sumWithoutVat) > cents(original.sumWithoutVat) || cents(prior.gross) + cents(sumWithVat) > cents(original.sumWithVat)) throw new HttpError(400, 'Kreditinių dokumentų suma viršija pirminės sąskaitos sumą');

    const create = db.transaction(() => {
      const res = db.prepare(`INSERT INTO Sale (companyId, series, number, saleDate, statusName, warehouseName, clientId, clientName, clientCode, clientVatCode, sumWithoutVat, vat, sumWithVat, currencyCode, notes, sellerIsVatPayer, sellerVatMode, docType, originalSaleId, correctionReason, createdAt)
        VALUES (?, ?, ?, ?, 'Kreditinė', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'KS', ?, ?, datetime('now'))`).run(
        companyId, (typeof body.series === 'string' && body.series.trim()) || 'KS', String(number).trim(), saleDate, original.warehouseName || 'Pagrindinis',
        original.clientId, original.clientName, original.clientCode, original.clientVatCode,
        -sumWithoutVat, -vat, -sumWithVat, original.currencyCode || 'EUR', reason, mode !== 'NON_VAT' ? 1 : 0, mode, id, reason);
      const saleId = Number(res.lastInsertRowid);
      const insertItem = db.prepare('INSERT INTO SaleItem (saleId, itemName, itemCode, quantity, price, priceWithVat, vatRate, sumWithoutVat, sumWithVat, warehouseName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      for (const it of items) {
        const line = calculateLine(it);
        insertItem.run(saleId, it.itemName || 'Paslauga', it.itemCode || null, line.qty, line.price, line.lineWithVat / line.qty, line.vatRate, -line.lineNoVat, -line.lineWithVat, original.warehouseName || 'Pagrindinis');
      }
      // The credit note takes over the i.SAF codes of the original lines where they are unambiguous; the rest is reported.
      return { saleId, missingTaxCodes: inheritCreditCodes(db, companyId, 'SALE', id, saleId) };
    });
    const { saleId, missingTaxCodes } = create();
    return NextResponse.json({ success: true, sale: db.prepare('SELECT * FROM Sale WHERE id=?').get(saleId), items: db.prepare('SELECT * FROM SaleItem WHERE saleId=? ORDER BY id').all(saleId), missingTaxCodes });
  } catch (err) {
    return apiError(err);
  }
}
