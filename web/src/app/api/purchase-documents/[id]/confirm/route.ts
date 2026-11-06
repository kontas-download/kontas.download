import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, currentUser, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany, currentErrorLang, HttpError, translateServerError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { confirmDocument, FieldErrorsError, type ConfirmInput } from '@/lib/purchase-recognition';

// body: the reviewed values (supplier, series, number, issueDate, lines with taxCode, totals, paidBy ...). Nothing is booked before this call.
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
      const result = await withCurrentActor(() => confirmDocument(companyId, id, user?.id ?? null, body as ConfirmInput));
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
