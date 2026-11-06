import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { OBLIGATION_CODES, type ObligationCode } from '@/lib/tax-calendar';
import { checkFiling, listAttempts, providerForForm, submitFiling } from '@/lib/filing';

function entry(code: unknown, periodEnd: unknown) {
  if (typeof code !== 'string' || !OBLIGATION_CODES.includes(code as ObligationCode)) throw new HttpError(400, 'Nežinoma prievolė');
  if (typeof periodEnd !== 'string' || !validTaxDate(periodEnd)) throw new HttpError(400, 'Neteisinga laikotarpio pabaigos data');
  return { code: code as ObligationCode, periodEnd };
}

// The provider of the entry, its connection status and the attempt history. Read-only.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const { code, periodEnd } = entry(params.get('code'), params.get('periodEnd'));
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const provider = providerForForm(code);
    return NextResponse.json({
      provider: provider && { id: provider.id, label: provider.label, manualUrl: provider.manualUrl, status: provider.status(db, companyId) },
      attempts: listAttempts(db, companyId, code, periodEnd),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// body: { code, periodEnd, action: 'submit' | 'check' }. Nothing is sent over the network yet: the provider answers NOT_IMPLEMENTED and the attempt is logged.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    const { code, periodEnd } = entry(body?.code, body?.periodEnd);
    if (body.action !== 'submit' && body.action !== 'check') throw new HttpError(400, 'Nežinomas veiksmas');
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const actorId = (await currentUser())?.id ?? null;
    const result = body.action === 'submit' ? await submitFiling(db, companyId, actorId, code, periodEnd) : await checkFiling(db, companyId, actorId, code, periodEnd);
    return NextResponse.json({ result, attempts: listAttempts(db, companyId, code, periodEnd) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
