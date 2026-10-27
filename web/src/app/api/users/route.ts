import { NextResponse } from 'next/server';
import { requireAdminApi, checkOrigin, currentUser } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError, HttpError } from '@/lib/errors';
import { listUsers, createUser } from '@/lib/users';

// Users of this installation. Administrators only; there is no self-registration.
export async function GET() {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    return NextResponse.json({ users: listUsers(getDb()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Neteisingi duomenys');
    const actor = await currentUser();
    const result = await createUser(getDb(), actor!.id, body);
    return NextResponse.json(result, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
