import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

// The client's latest invoice (not a credit note): series, payment term, notes and lines, to start a recurring template from it.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const clientId = Number(new URL(request.url).searchParams.get('clientId'));
    if (!Number.isSafeInteger(clientId) || clientId <= 0) throw new HttpError(400, 'Neteisingas klientas');
    const db = getDb(), companyId = await getActiveCompanyId();
    const sale = db.prepare("SELECT id, series, number, saleDate, payUntil, notes FROM Sale WHERE companyId=? AND clientId=? AND COALESCE(docType,'SF')<>'KS' ORDER BY saleDate DESC, id DESC LIMIT 1").get(companyId, clientId) as { id: number; series: string | null; number: string; saleDate: string; payUntil: string | null; notes: string | null } | undefined;
    if (!sale) return NextResponse.json({ sale: null, items: [] });
    const items = db.prepare('SELECT itemName, itemCode, quantity, price, vatRate FROM SaleItem WHERE saleId=? ORDER BY id').all(sale.id);
    const payDays = sale.payUntil ? Math.max(0, Math.round((Date.parse(sale.payUntil.slice(0, 10)) - Date.parse(sale.saleDate.slice(0, 10))) / 86_400_000)) : null;
    return NextResponse.json({ sale: { label: `${sale.series ?? ''} ${sale.number}`.trim(), date: sale.saleDate.slice(0, 10), series: sale.series, payDays, notes: sale.notes }, items });
  } catch (err) { return apiError(err); }
}
