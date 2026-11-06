import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { linkPurchase, linkReimbursement, linkReliable, purchaseBankSuggestions, RELIABLE_CONFIDENCE } from '@/lib/bank-matching';

// Suggestions only: outgoing bank lines with an unpaid purchase / received document, and own-funds reimbursements.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json({ ...purchaseBankSuggestions(getDb(), await getActiveCompanyId()), reliableThreshold: RELIABLE_CONFIDENCE }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// body: { action: 'link', bankTransactionId, purchaseId } | { action: 'linkReliable' } | { action: 'reimburse', bankTransactionId, purchaseIds }.
// Every call is an explicit user action; nothing is linked by a background job.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const body = await request.json();
    if (body?.action === 'linkReliable') return NextResponse.json(await withCurrentActor(() => linkReliable(db, companyId)));
    if (body?.action === 'link') return NextResponse.json({ success: true, id: await withCurrentActor(() => linkPurchase(db, companyId, Number(body.bankTransactionId), Number(body.purchaseId))) });
    if (body?.action === 'reimburse') {
      const ids = Array.isArray(body.purchaseIds) ? body.purchaseIds.map(Number) : [];
      if (!ids.length || !ids.every((n: number) => Number.isSafeInteger(n))) throw new HttpError(400, 'Neteisingi duomenys');
      return NextResponse.json({ success: true, reimbursed: await withCurrentActor(() => linkReimbursement(db, companyId, Number(body.bankTransactionId), ids)) });
    }
    throw new HttpError(400, 'Neteisingi duomenys');
  } catch (err) {
    return apiError(err);
  }
}
