import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { unpairDocument } from '@/lib/purchase-document-pairing';

// Splits an invoice from the receipt received with it: both become ordinary queue items.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    return NextResponse.json({ success: true, ...unpairDocument(await getActiveCompanyId(), id) });
  } catch (err) {
    return apiError(err);
  }
}
