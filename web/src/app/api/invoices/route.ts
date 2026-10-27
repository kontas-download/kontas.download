import { createInvoice } from '@/lib/sales';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const sales = db.prepare(`
      SELECT s.*, 
        (SELECT SUM(amount) FROM PaymentAllocation WHERE saleId = s.id) as paidAmount,
        ROUND(s.sumWithVat + COALESCE((SELECT SUM(c.sumWithVat) FROM Sale c WHERE c.originalSaleId = s.id), 0), 2) as dueAmount,
        (SELECT COUNT(*) FROM SaleItem WHERE saleId = s.id) as itemCount
      FROM Sale s
      WHERE s.companyId = ?
      ORDER BY s.saleDate DESC, s.id DESC
    `).all(companyId);

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
    const body = await request.json();
    const { sale, items } = createInvoice(companyId, body);
    return NextResponse.json({ success: true, sale, items });
  } catch (err: any) {
    return apiError(err);
  }
}
