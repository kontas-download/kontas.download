import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, currentUser, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany, currentErrorLang, HttpError, translateServerError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { FieldErrorsError } from '@/lib/purchase-recognition';
import { attachDocumentToPurchase } from '@/lib/purchase-document-attach';

// body: { purchaseId, role: 'PAYMENT_RECEIPT' | 'ATTACHMENT', confirmMismatch? }. The document joins an existing purchase: no new purchase is created.
// A different supplier or total answers 409 with { fields: { confirmMismatch }, mismatch: ['SUPPLIER' | 'AMOUNT'] } until confirmMismatch is true.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const { companyId: formCompanyId, ...body } = await request.json();
    assertFormCompany(formCompanyId, companyId);
    const user = await currentUser();
    try {
      const result = await withCurrentActor(() => attachDocumentToPurchase(companyId, id, Number(body.purchaseId), body.role, user?.id ?? null, { confirmMismatch: body.confirmMismatch === true }));
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof FieldErrorsError) {
        const lang = await currentErrorLang();
        const fields = Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, translateServerError(v, lang)]));
        return NextResponse.json({ error: translateServerError(error.message, lang), fields, mismatch: (error as FieldErrorsError & { mismatch?: string[] }).mismatch }, { status: error.status });
      }
      throw error;
    }
  } catch (err) {
    return apiError(err);
  }
}
