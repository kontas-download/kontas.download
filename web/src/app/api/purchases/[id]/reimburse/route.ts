import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { reimbursePurchase } from '@/lib/purchase-recognition';

// body: { date } - the day the company repaid the person who paid from own funds.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    const purchase = await withCurrentActor(() => reimbursePurchase(companyId, id, body?.date));
    return NextResponse.json({ success: true, purchase });
  } catch (err) {
    return apiError(err);
  }
}
