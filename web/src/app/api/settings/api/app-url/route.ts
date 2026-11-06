import { NextResponse } from 'next/server';
import { requireAdminApi, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { appBaseUrl, saveBaseUrl } from '@/lib/api-access';

// The public address of this installation (installation-wide, administrator only). body: { baseUrl } ('' removes the setting).
export async function PUT(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Tikimasi objekto');
    const db = getDb();
    const baseUrl = saveBaseUrl(db, body.baseUrl ?? '');
    return NextResponse.json({ baseUrl, effectiveBaseUrl: appBaseUrl(db) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
