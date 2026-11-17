import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { getInboxSettings, saveInboxSettings, inboundAddressFor, lastInboundAt } from '@/lib/document-inbox';

// The password is never returned: only `hasPassword`.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    return NextResponse.json({ ...getInboxSettings(companyId), inboundAddress: inboundAddressFor(companyId), lastInboundAt: lastInboundAt(companyId) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// body: { enabled, host, port, secure, username, password? (replaces the stored one), clearPassword?, folder, processedFolder, allowedSenders }
export async function PUT(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Tikimasi objekto');
    return NextResponse.json(saveInboxSettings(await getActiveCompanyId(), body), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
