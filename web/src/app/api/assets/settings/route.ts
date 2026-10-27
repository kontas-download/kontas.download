import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { getSettings, setSettings } from '@/lib/fixed-assets';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json(getSettings(getDb(), await getActiveCompanyId()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// body: { defaultMethod }
export async function PUT(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const user = await currentUser();
    return NextResponse.json({ success: true, ...setSettings(getDb(), companyId, await request.json().catch(() => ({})), user?.id ?? null) });
  } catch (err) {
    return apiError(err);
  }
}
