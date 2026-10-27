import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { issueRecurring } from '@/lib/recurring';
import { NextResponse } from 'next/server';

// Issues the invoice for the template's current period after the user confirms. Optional body: { number?, saleDate? }.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const body = await request.json().catch(() => ({}));
    const result = issueRecurring(await getActiveCompanyId(), id, { number: typeof body?.number === 'string' ? body.number : undefined, saleDate: typeof body?.saleDate === 'string' ? body.saleDate : undefined });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
