import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { cancelDisposal, disposeAsset } from '@/lib/fixed-assets';
import { NextResponse } from 'next/server';

type Context = { params: Promise<{ id: string }> };
const idOf = async (context: Context) => {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
  return id;
};

// body: { date, reason, proceeds? }
export async function POST(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await idOf(context);
    const companyId = await getActiveCompanyId();
    const user = await currentUser();
    const result = disposeAsset(getDb(), companyId, id, await request.json(), user?.id ?? null);
    return NextResponse.json({ success: true, ...result });
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
    const id = await idOf(context);
    const companyId = await getActiveCompanyId();
    const user = await currentUser();
    cancelDisposal(getDb(), companyId, id, user?.id ?? null);
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
