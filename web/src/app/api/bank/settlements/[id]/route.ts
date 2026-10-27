import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { NextResponse } from 'next/server';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const db = getDb();
    const companyId = await getActiveCompanyId();
    db.transaction(() => {
      db.prepare("DELETE FROM GeneralEntry WHERE companyId=? AND sourceType='SETTLEMENT' AND sourceId=?").run(companyId, id);
      const res = db.prepare('DELETE FROM ManualSettlement WHERE id=? AND companyId=?').run(id, companyId);
      if (!res.changes) throw new HttpError(404, 'Įrašas nerastas');
    })();
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
