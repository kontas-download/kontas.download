import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { allocatePayment, suggestMatches } from '@/lib/payments';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json({ suggestions: suggestMatches(getDb(), await getActiveCompanyId()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// Applies every high-confidence suggestion in one transaction (explicit user action).
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const high = suggestMatches(db, companyId).filter(s => s.confidence === 'high');
    let applied = 0;
    const skipped: number[] = [];
    db.transaction(() => {
      for (const s of high) {
        try { allocatePayment(db, companyId, { bankTransactionId: s.bankTransactionId, kind: s.kind, documentId: s.documentId, amount: s.amount }); applied++; } catch { skipped.push(s.bankTransactionId); }
      }
    })();
    return NextResponse.json({ applied, skipped });
  } catch (err) {
    return apiError(err);
  }
}
