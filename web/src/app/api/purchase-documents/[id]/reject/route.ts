import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { rejectDocument } from '@/lib/purchase-recognition';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    return NextResponse.json({ document: rejectDocument(await getActiveCompanyId(), id) });
  } catch (err) {
    return apiError(err);
  }
}
