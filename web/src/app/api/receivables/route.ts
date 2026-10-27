import { requireApiAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { receivables } from '@/lib/receivables';
import { overpaidDocuments } from '@/lib/payments';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const asOf = new URL(request.url).searchParams.get('asOf') || todayVilnius();
    if (!validTaxDate(asOf)) throw new HttpError(400, 'Neteisinga asOf data');
    const companyId = await getActiveCompanyId();
    const rows = receivables(getDb(), companyId, asOf);
    const totals: Record<string, number> = {};
    for (const r of rows) totals[r.bucket] = Math.round(((totals[r.bucket] || 0) + r.balance) * 100) / 100;
    return NextResponse.json({ asOf, rows, overpaid: overpaidDocuments(getDb(), companyId), totals, total: Math.round(rows.reduce((n, r) => n + Math.round(r.balance * 100), 0)) / 100 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
