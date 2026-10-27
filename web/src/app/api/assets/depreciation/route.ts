import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, assertFormCompany } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { postDepreciation, undoDepreciation } from '@/lib/fixed-assets';
import { NextResponse } from 'next/server';

// body: { period: 'YYYY-MM' } - posts every unposted month up to and including the period.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const user = await currentUser();
    const body = await request.json().catch(() => ({}));
    assertFormCompany(body?.companyId, companyId);
    const result = postDepreciation(getDb(), companyId, body?.period, user?.id ?? null);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return apiError(err);
  }
}

// body: { period: 'YYYY-MM' } - undoes the latest posted month only.
export async function DELETE(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const body = await request.json().catch(() => ({}));
    assertFormCompany(body?.companyId, companyId);
    const removed = undoDepreciation(getDb(), companyId, body?.period);
    return NextResponse.json({ success: true, removed });
  } catch (err) {
    return apiError(err);
  }
}
