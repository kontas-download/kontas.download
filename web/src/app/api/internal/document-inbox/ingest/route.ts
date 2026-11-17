import { NextResponse } from 'next/server';
import { bridgeAuthorized } from '@/lib/bridge-auth';
import { apiError, HttpError } from '@/lib/errors';
import { ingestInbound } from '@/lib/document-inbox';
import { defaultInboxDeps } from '@/lib/document-inbox-runtime';
import { rawR2 } from '@/lib/document-remote';

export const runtime = 'nodejs';

// Called by the Cloudflare Worker for every message it received (and by its cron for the ones still pending): the raw .eml is in R2
// under inbound/. Same processing as the IMAP poll; idempotent per R2 key.
export async function POST(request: Request) {
  if (!bridgeAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const body = await request.json().catch(() => null) as { companyId?: unknown; r2Key?: unknown } | null;
    if (!body || !Number.isInteger(body.companyId) || typeof body.r2Key !== 'string') throw new HttpError(400, 'Neteisinga užklausa');
    const r2 = rawR2();
    if (!r2) throw new HttpError(503, 'R2 saugykla nepasiekiama');
    const result = await ingestInbound(Number(body.companyId), body.r2Key, r2, defaultInboxDeps);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err);
  }
}
