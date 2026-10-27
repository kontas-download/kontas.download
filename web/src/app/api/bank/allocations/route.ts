import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { allocatePayment, openDocuments, unallocatedTransactions } from '@/lib/payments';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const allocations = db.prepare('SELECT * FROM PaymentAllocation WHERE companyId=? ORDER BY id DESC LIMIT 500').all(companyId);
    return NextResponse.json({ allocations, open: openDocuments(db, companyId), unallocated: unallocatedTransactions(db, companyId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
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
    const id = await withCurrentActor(() => allocatePayment(getDb(), companyId, { bankTransactionId: Number(body?.bankTransactionId), kind: body?.kind, documentId: Number(body?.documentId), amount: body?.amount }));
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return apiError(err);
  }
}
