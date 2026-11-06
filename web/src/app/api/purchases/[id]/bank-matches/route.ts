import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { bankMatchesForPurchase, RELIABLE_CONFIDENCE } from '@/lib/bank-matching';

// Bank lines that could be the payment of this purchase, and the payments already linked to it. Undo a link: DELETE /api/bank/allocations/{allocationId}.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    return NextResponse.json({ ...bankMatchesForPurchase(getDb(), await getActiveCompanyId(), id), reliableThreshold: RELIABLE_CONFIDENCE }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
