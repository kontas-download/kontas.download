import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { getRecognitionSettings, saveRecognitionSettings } from '@/lib/purchase-recognition';

// The stored key is never returned: only `hasKey`.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json(getRecognitionSettings(await getActiveCompanyId()), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// body: { enabled, model?, apiKey? (replaces the stored key), clearKey? }
export async function PUT(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Tikimasi objekto');
    return NextResponse.json(saveRecognitionSettings(await getActiveCompanyId(), body), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
