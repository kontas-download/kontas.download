import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { pollInbox } from '@/lib/document-inbox';
import { defaultInboxDeps } from '@/lib/document-inbox-runtime';

// "Tikrinti dabar": reads the mailbox of the active company at once.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    return NextResponse.json(await pollInbox(await getActiveCompanyId(), defaultInboxDeps), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
