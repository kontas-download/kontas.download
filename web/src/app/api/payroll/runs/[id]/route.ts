import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { deleteRun, getRun, overrideLine, postRun, recalculateRun, setLineGross, setRunPayoutDate, unpostRun, verifyRun } from '@/lib/payroll-runs';

async function runId(context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
  return id;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const id = await runId(context);
    return NextResponse.json(getRun(getDb(), await getActiveCompanyId(), id));
  } catch (err) {
    return apiError(err);
  }
}

// Body: {action} with 'recalculate' | 'gross' {lineId, gross} | 'override' {lineId, field, value|null, reason} | 'verify' |
// 'post' | 'unpost' {reason}. Returns the run after the change.
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await runId(context);
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Neteisingi duomenys');
    const db = getDb();
    const actorId = (await currentUser())?.id ?? null;
    const lineId = Number(body.lineId);
    switch (body.action) {
      case 'recalculate': recalculateRun(db, companyId, id, actorId); break;
      case 'gross': setLineGross(db, companyId, id, lineId, body.gross, actorId); break;
      case 'override': overrideLine(db, companyId, id, lineId, body.field, body.value, body.reason, actorId); break;
      case 'verify': verifyRun(db, companyId, id, actorId); break;
      case 'payoutDate': setRunPayoutDate(db, companyId, id, body.payoutDate, actorId); break;
      case 'post': postRun(db, companyId, id, actorId); break;
      case 'unpost': unpostRun(db, companyId, id, body.reason, actorId); break;
      default: throw new HttpError(400, 'Nežinomas veiksmas');
    }
    return NextResponse.json(getRun(db, companyId, id));
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await runId(context);
    deleteRun(getDb(), await getActiveCompanyId(), id, (await currentUser())?.id ?? null);
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
