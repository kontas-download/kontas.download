import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, currentErrorLang, HttpError, translateServerError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { testRecognitionKey } from '@/lib/purchase-recognition';
import { defaultRecognitionProvider } from '@/lib/recognition/factory';

// body: { apiKey? (typed, not saved yet), model? }. Without apiKey the stored key is tested. Answers { ok: true } or { ok: false, error }.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Tikimasi objekto');
    const result = await testRecognitionKey(await getActiveCompanyId(), body, defaultRecognitionProvider);
    if (!result.ok) result.error = translateServerError(result.error, await currentErrorLang());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
