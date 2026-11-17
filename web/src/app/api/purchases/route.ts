import { createPurchase } from '@/lib/purchases';
import { withDocuments } from '@/lib/purchase-document-attach';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany, HttpError } from '@/lib/errors';
import { parseApiRange } from '@/lib/list-period';
import { purchaseListQuery } from '@/lib/purchases-period';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

// Optional ?from=&to= (inclusive ISO dates) limit the list by purchase date; without them every purchase is returned.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const { from, to, error } = parseApiRange(new URL(request.url).searchParams);
    if (error) throw new HttpError(400, error);
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const query = purchaseListQuery(companyId, from, to);
    const rows = db.prepare(query.sql).all(...query.args) as { id: number }[];
    // Every original of a purchase with its role (PRIMARY, PAYMENT_RECEIPT, ATTACHMENT); documentId is the main one.
    const purchases = withDocuments(db, companyId, rows);

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
