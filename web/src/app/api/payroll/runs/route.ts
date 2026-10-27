import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, assertFormCompany } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { createRun, getRun, listRuns } from '@/lib/payroll-runs';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    return NextResponse.json({ runs: listRuns(getDb(), companyId) });
  } catch (err) {
    return apiError(err);
  }
}

// Body: {year, month}. Creates a draft calculation for the active employees of the month.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    assertFormCompany(body?.companyId, companyId);
    const db = getDb();
    const id = createRun(db, companyId, body?.year, body?.month, (await currentUser())?.id ?? null);
    return NextResponse.json(getRun(db, companyId, id));
  } catch (err) {
    return apiError(err);
  }
}
