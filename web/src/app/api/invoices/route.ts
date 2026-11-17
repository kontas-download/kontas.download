import { createInvoice } from '@/lib/sales';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany, HttpError } from '@/lib/errors';
import { parseApiRange, dateRangeSql } from '@/lib/list-period';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

// Optional ?from=&to= (inclusive ISO dates) limit the list by invoice date; without them every sale is returned.
export async function GET(request?: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const range = parseApiRange(request ? new URL(request.url).searchParams : new URLSearchParams());
    if (range.error) throw new HttpError(400, range.error);
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const dates = dateRangeSql('s.saleDate', range.from, range.to);
    const sales = db.prepare(`
      SELECT s.*, 
        (SELECT SUM(amount) FROM PaymentAllocation WHERE saleId = s.id) as paidAmount,
        ROUND(s.sumWithVat + COALESCE((SELECT SUM(c.sumWithVat) FROM Sale c WHERE c.originalSaleId = s.id), 0), 2) as dueAmount,
        (SELECT COUNT(*) FROM SaleItem WHERE saleId = s.id) as itemCount
      FROM Sale s
      WHERE s.companyId = ?${dates.sql}
      ORDER BY s.saleDate DESC, s.id DESC
    `).all(companyId, ...dates.args);

    return NextResponse.json({ sales });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const { companyId: formCompanyId, ...body } = await request.json();
    assertFormCompany(formCompanyId, companyId);
    const { sale, items } = await withCurrentActor(() => createInvoice(companyId, body));
    return NextResponse.json({ success: true, sale, items });
  } catch (err: any) {
    return apiError(err);
  }
}
