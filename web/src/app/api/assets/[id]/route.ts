import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { assetDetails, deleteAsset, updateAsset } from '@/lib/fixed-assets';
import { NextResponse } from 'next/server';

type Context = { params: Promise<{ id: string }> };
const idOf = async (context: Context) => {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
  return id;
};

// Asset card: register data, postings, change log (overrides with reasons) and the remaining schedule.
export async function GET(_request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json(assetDetails(getDb(), await getActiveCompanyId(), await idOf(context)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// body: asset fields; changing method, usefulLifeMonths, residualValue or decliningFactor requires `reason`.
export async function PUT(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await idOf(context);
    const companyId = await getActiveCompanyId();
    const user = await currentUser();
    const changed = updateAsset(getDb(), companyId, id, await request.json(), user?.id ?? null);
    return NextResponse.json({ success: true, changed });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    deleteAsset(getDb(), await getActiveCompanyId(), await idOf(context));
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
