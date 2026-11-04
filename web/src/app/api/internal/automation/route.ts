import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runAutomation } from '@/lib/automation';

export const runtime = 'nodejs';

// Daily trigger of the automation robot from the Cloudflare Worker cron. Refused unless the shared bridge key matches.
export async function POST(request: Request) {
  const expected = process.env.INTERNAL_BRIDGE_KEY || '';
  const given = request.headers.get('x-d1-bridge-key') || '';
  if (!expected || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const results = await runAutomation(getDb(), { trigger: 'cron' });
  return NextResponse.json({ ran: results.filter(r => r.status !== 'SKIPPED').length, errors: results.filter(r => r.status === 'ERROR').length });
}
