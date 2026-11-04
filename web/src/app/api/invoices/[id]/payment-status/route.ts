import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { setSalePaymentStatus } from '@/lib/payments';
import { NextResponse } from 'next/server';

// Marks a sales invoice as paid (settled like cash) or unpaid (manual settlements removed).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const body = await request.json().catch(() => ({}));
    const companyId = await getActiveCompanyId();
    const sale = await withCurrentActor(() => setSalePaymentStatus(getDb(), companyId, id, body?.status));
    return NextResponse.json({ success: true, sale });
  } catch (err) {
    return apiError(err);
  }
}
