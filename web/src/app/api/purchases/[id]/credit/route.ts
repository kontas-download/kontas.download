import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { insertPurchaseCredit } from '@/lib/purchase-credit';
import { inheritCreditCodes } from '@/lib/tax-line-codes';

// Records a credit note received from a supplier against a purchase. Lines are entered positive and stored negative; the VAT
// deduction follows the original purchase (same percentage), so the correction reverses exactly the share that was deducted.
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
    const body = (await request.json()) ?? {};
    if (body && body.purchaseDate === undefined && typeof body.saleDate === 'string') body.purchaseDate = body.saleDate;
    const purchaseId = insertPurchaseCredit(db, companyId, id, { number: body.number, series: body.series, purchaseDate: body.purchaseDate, reason: typeof body?.reason === 'string' ? body.reason : '', items: body.items });
    // Lines whose i.SAF code could not be taken over from the original (already-inherited lines are skipped, nothing is written again).
    const missingTaxCodes = inheritCreditCodes(db, companyId, 'PURCHASE', id, purchaseId);
    return NextResponse.json({ success: true, purchase: db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId), items: db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(purchaseId), missingTaxCodes });
  } catch (err) {
    return apiError(err);
  }
}
