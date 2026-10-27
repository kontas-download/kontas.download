import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { listLineCodes, parseLineCodeRequest, setLineCodes } from '@/lib/tax-line-codes';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

// Lines of the period that need an i.SAF tax code (no automatic code) or already have one assigned by the accountant.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const url = new URL(request.url);
    const start = url.searchParams.get('start') || '';
    const end = url.searchParams.get('end') || '';
    if (!validTaxDate(start) || !validTaxDate(end) || start > end) return NextResponse.json({ error: 'Nurodykite laikotarpį start ir end (YYYY-MM-DD)', code: 'TAX_CODES_BAD_PERIOD' }, { status: 400, headers });
    const companyId = await getActiveCompanyId();
    return NextResponse.json({ period: { start, end }, lines: listLineCodes(getDb(), companyId, start, end) }, { headers });
  } catch (err) {
    return apiError(err);
  }
}

// Sets or clears codes of lines of the active company. The documents themselves are not changed.
export async function PUT(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const { changes, confirm } = parseLineCodeRequest(await request.json());
    const user = await currentUser();
    const changed = setLineCodes(getDb(), companyId, changes, user?.id ?? null, confirm);
    return NextResponse.json({ success: true, changed }, { headers });
  } catch (err) {
    return apiError(err);
  }
}
