import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, currentErrorLang, HttpError, translateServerError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { testConnection } from '@/lib/document-inbox';
import { defaultInboxDeps } from '@/lib/document-inbox-runtime';

// body: the form values (password optional: without it the stored one is used). Answers { ok: true } or { ok: false, error }.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Tikimasi objekto');
    const result = await testConnection(await getActiveCompanyId(), body, defaultInboxDeps);
    if (!result.ok) result.error = translateServerError(result.error, await currentErrorLang());
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
