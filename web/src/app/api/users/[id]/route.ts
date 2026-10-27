import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { requireAdminApi, checkOrigin, currentUser } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError, HttpError } from '@/lib/errors';
import { updateUser, deleteUser } from '@/lib/users';
type Context = { params: Promise<{ id: string }> };

async function userId(context: Context) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
  return id;
}

// Name, role, disable/enable and password reset (a generated password is returned once).
export async function PATCH(request: Request, context: Context) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await userId(context);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Neteisingi duomenys');
    const actor = await currentUser();
    const token = (await cookies()).get('auth_session')?.value || '';
    return NextResponse.json(await updateUser(getDb(), actor!.id, id, body, token), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}

// Deletes a user who never acted in the books; otherwise the user is disabled (deleted: false).
export async function DELETE(request: Request, context: Context) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await userId(context);
    const actor = await currentUser();
    return NextResponse.json(deleteUser(getDb(), actor!.id, id), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
