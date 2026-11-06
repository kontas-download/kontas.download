import { NextResponse } from 'next/server';
import { bridgeAuthorized } from '@/lib/bridge-auth';
import { pollEnabledInboxes } from '@/lib/document-inbox-runtime';

export const runtime = 'nodejs';

// Triggered by the Cloudflare Worker's 15-minute cron (which wakes the sleeping container): reads every enabled document mailbox once.
export async function POST(request: Request) {
  if (!bridgeAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const results = await pollEnabledInboxes();
  return NextResponse.json({ mailboxes: results.length, failed: results.filter(r => !r.ok).length });
}
