import { requireApiAccess } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { OBLIGATION_CODES, type ObligationCode } from '@/lib/tax-calendar';
import { prepareObligation } from '@/lib/tax-prepare';
import { NextResponse } from 'next/server';

// Builds the file of one calendar entry for its period and runs the checks. Read-only: nothing is stored or sent to VMI/Sodra.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const code = params.get('code') || '', periodEnd = params.get('periodEnd') || '';
    if (!OBLIGATION_CODES.includes(code as ObligationCode)) throw new HttpError(400, 'Nežinoma prievolė');
    if (!validTaxDate(periodEnd)) throw new HttpError(400, 'Neteisinga laikotarpio pabaigos data');
    const companyId = await getActiveCompanyId();
    return NextResponse.json(prepareObligation(getDb(), companyId, code as ObligationCode, periodEnd), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
