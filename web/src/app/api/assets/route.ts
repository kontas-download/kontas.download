import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, assertFormCompany } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { createAsset, getSettings, listAssets } from '@/lib/fixed-assets';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    const db = getDb();
    return NextResponse.json({ assets: listAssets(db, companyId), settings: getSettings(db, companyId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const user = await currentUser();
    const { companyId: formCompanyId, ...body } = await request.json();
    assertFormCompany(formCompanyId, companyId);
    const id = createAsset(getDb(), companyId, body, user?.id ?? null);
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return apiError(err);
  }
}
