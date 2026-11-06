import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { creditCandidates } from '@/lib/purchase-recognition';

// ?clientId=12&reference=SF-123 -> the supplier's purchases a credit note can refer to, and the one whose number equals the printed reference.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    const params = new URL(request.url).searchParams;
    const raw = params.get('clientId');
    const clientId = raw ? Number(raw) : null;
    if (clientId !== null && !Number.isSafeInteger(clientId)) throw new HttpError(400, 'Neteisingas ID');
    return NextResponse.json(creditCandidates(companyId, clientId, params.get('reference')), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
