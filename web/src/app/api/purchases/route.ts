import { createPurchase } from '@/lib/purchases';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const purchases = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM PurchaseItem WHERE purchaseId = p.id) as itemCount
      FROM Purchase p
      WHERE p.companyId = ?
      ORDER BY p.purchaseDate DESC, p.id DESC
    `).all(companyId);

    return NextResponse.json({ purchases });
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
    const { purchase, items } = await withCurrentActor(() => createPurchase(companyId, body));
    return NextResponse.json({ success: true, purchase, items });
  } catch (err: any) {
    return apiError(err);
  }
}
