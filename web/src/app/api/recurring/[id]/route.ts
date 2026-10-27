import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { parseTemplate } from '@/lib/recurring';
import { NextResponse } from 'next/server';

type Context = { params: Promise<{ id: string }> };
const idOf = async (context: Context) => {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
  return id;
};

// body: full template, or { active: boolean } to pause/resume.
export async function PUT(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await idOf(context);
    const companyId = await getActiveCompanyId();
    const db = getDb();
    if (!db.prepare('SELECT 1 FROM RecurringInvoice WHERE id=? AND companyId=?').get(id, companyId)) throw new HttpError(404, 'Šablonas nerastas');
    const body = await request.json();
    if (body && Object.keys(body).length === 1 && typeof body.active === 'boolean') {
      db.prepare('UPDATE RecurringInvoice SET active=? WHERE id=? AND companyId=?').run(body.active ? 1 : 0, id, companyId);
      return NextResponse.json({ success: true });
    }
    const t = parseTemplate(db, companyId, body);
    const last = db.prepare('SELECT MAX(periodDate) d FROM RecurringRun WHERE recurringId=?').get(id) as { d: string | null };
    if (last.d && t.nextDate <= last.d) throw new HttpError(409, `Sąskaita už laikotarpį ${last.d} jau išrašyta: kita data turi būti vėlesnė`);
    db.prepare('UPDATE RecurringInvoice SET name=?,clientId=?,series=?,frequency=?,nextDate=?,anchorDay=?,endDate=?,payDays=?,notes=?,itemsJson=? WHERE id=? AND companyId=?')
      .run(t.name, t.clientId, t.series, t.frequency, t.nextDate, t.anchorDay, t.endDate, t.payDays, t.notes, JSON.stringify(t.items), id, companyId);
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}

// Deleting a template keeps the invoices it issued (the run history is removed with it).
export async function DELETE(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const res = getDb().prepare('DELETE FROM RecurringInvoice WHERE id=? AND companyId=?').run(await idOf(context), await getActiveCompanyId());
    if (!res.changes) throw new HttpError(404, 'Šablonas nerastas');
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
