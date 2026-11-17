import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, currentUser, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany, currentErrorLang, HttpError, translateServerError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { FieldErrorsError, type ConfirmInput } from '@/lib/purchase-recognition';
import { confirmDocumentWithPair } from '@/lib/purchase-document-pairing';
import { promoteDocumentToPurchase } from '@/lib/purchase-document-attach';

// body: the reviewed values (supplier, series, number, issueDate, lines with taxCode, totals, paidBy ...). Nothing is booked before this call.
// { promote: true, intoPurchaseId }: the reviewed invoice becomes the main document of an existing receipt-based purchase (the purchase is updated, none is created).
// `pairedReceipt` tells what happened to the receipt received together with the invoice (attached as the payment receipt, or left in the queue).
// Invalid input answers 400 with { error, fields: { fieldName: message } }.
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
      const result = await withCurrentActor(() => (body.promote === true
        ? promoteDocumentToPurchase(companyId, id, Number(body.intoPurchaseId), user?.id ?? null, body as ConfirmInput)
        : confirmDocumentWithPair(companyId, id, user?.id ?? null, body as ConfirmInput)));
      return NextResponse.json({ success: true, ...result });
    } catch (error) {
      if (error instanceof FieldErrorsError) {
        const lang = await currentErrorLang();
        const fields = Object.fromEntries(Object.entries(error.fields).map(([k, v]) => [k, translateServerError(v, lang)]));
        return NextResponse.json({ error: translateServerError(error.message, lang), fields }, { status: error.status });
      }
      throw error;
    }
  } catch (err) {
    return apiError(err);
  }
}
