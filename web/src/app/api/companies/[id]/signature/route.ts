import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getSignature, saveSignature } from '@/lib/mail-signature';

type Context = { params: Promise<{ id: string }> };
async function companyId(context: Context) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Neteisinga įmonė');
  if (!getDb().prepare('SELECT id FROM Company WHERE id=?').get(id)) throw new HttpError(404, 'Įmonė nerasta');
  return id;
}

// The company e-mail signature added to every letter it sends.
export async function GET(_request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json(getSignature(getDb(), await companyId(context)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) { return apiError(err); }
}

export async function PUT(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await companyId(context);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Neteisingi parašo nustatymai');
    return NextResponse.json(saveSignature(getDb(), id, body));
  } catch (err) { return apiError(err); }
}
