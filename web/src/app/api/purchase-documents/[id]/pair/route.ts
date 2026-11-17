import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { pairManually } from '@/lib/purchase-document-pairing';

// The person pairs two open documents by hand. body: { receiptId } = the other document is the payment receipt of this one (this = the invoice);
// { invoiceId } = the other document is the main one and this one is its payment receipt.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const body = await request.json().catch(() => ({})) as { receiptId?: unknown; invoiceId?: unknown };
    const receiptId = body.receiptId === undefined ? NaN : Number(body.receiptId);
    const invoiceId = body.invoiceId === undefined ? NaN : Number(body.invoiceId);
    const other = Number.isSafeInteger(receiptId) && receiptId > 0 ? receiptId : invoiceId;
    if (!Number.isSafeInteger(other) || other <= 0) throw new HttpError(400, 'Neteisingas ID');
    const companyId = await getActiveCompanyId();
    const result = await withCurrentActor(() => (other === receiptId ? pairManually(companyId, id, receiptId) : pairManually(companyId, invoiceId, id)));
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}
