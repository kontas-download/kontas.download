import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { settleManually } from '@/lib/payments';
import { NextResponse } from 'next/server';

// Marks a sale or purchase as settled outside the bank (cash at the till, offset). Amount defaults to the whole open balance.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    const id = settleManually(getDb(), await getActiveCompanyId(), { kind: body?.kind, documentId: Number(body?.documentId), method: body?.method, date: typeof body?.date === 'string' ? body.date : undefined, note: typeof body?.note === 'string' ? body.note : undefined, amount: body?.amount, account: typeof body?.account === 'string' ? body.account : undefined });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    return apiError(err);
  }
}
