import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { ecbRate } from '@/lib/exchange-rates';

// ?currency=USD&date=2026-10-20 -> the ECB reference rate of that date (or the last earlier published one), units per 1 EUR.
// Offline or an unpublished currency answers an error: the person then types the rate by hand.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const rate = await ecbRate(getDb(), params.get('currency'), params.get('date'));
    return NextResponse.json(rate, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
