import { requireApiAccess, checkOrigin } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { OBLIGATION_CODES, calendarEvents, loadSettings, type ObligationCode } from '@/lib/tax-calendar';
import { NextResponse } from 'next/server';

const day = 86_400_000;
const shift = (date: string, days: number) => new Date(new Date(date + 'T00:00:00Z').getTime() + days * day).toISOString().slice(0, 10);
const code = (value: unknown) => {
  if (typeof value !== 'string' || !OBLIGATION_CODES.includes(value as ObligationCode)) throw new HttpError(400, 'Nežinoma prievolė');
  return value as ObligationCode;
};

// Default window: 60 days back (to see overdue items) to 150 days ahead.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const today = todayVilnius();
    const from = params.get('from') || shift(today, -60);
    const to = params.get('to') || shift(today, 150);
    if (!validTaxDate(from) || !validTaxDate(to) || from > to) throw new HttpError(400, 'Neteisingas laikotarpis');
    const companyId = await getActiveCompanyId();
    const db = getDb();
    return NextResponse.json({ today, settings: loadSettings(db, companyId, today), events: calendarEvents(db, companyId, from, to), notice: 'Terminai nominalūs. Perkėlimas į kitą darbo dieną nurodytas tik informacijai ir šaltinio nepatvirtintas; vadovaukitės ankstesniu terminu.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

// body: { code, enabled?, period? } updates applicability; { code, periodEnd, done: boolean, note? } marks a period as filed.
export async function PUT(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    const obligation = code(body?.code);
    const db = getDb();
    if (typeof body.done === 'boolean') {
      if (!validTaxDate(body.periodEnd)) throw new HttpError(400, 'Neteisinga laikotarpio pabaigos data');
      if (body.done) db.prepare('INSERT OR REPLACE INTO ObligationDone(companyId,code,periodEnd,doneAt,note) VALUES(?,?,?,?,?)').run(companyId, obligation, body.periodEnd, Date.now(), typeof body.note === 'string' ? body.note.slice(0, 500) : null);
      else db.prepare('DELETE FROM ObligationDone WHERE companyId=? AND code=? AND periodEnd=?').run(companyId, obligation, body.periodEnd);
      return NextResponse.json({ success: true });
    }
    const period = body.period == null ? null : body.period;
    if (period !== null && !['MONTH', 'QUARTER', 'HALF'].includes(period)) throw new HttpError(400, 'Neteisingas pateikimo laikotarpis');
    if (period !== null && obligation !== 'FR0600') throw new HttpError(400, 'Laikotarpį galima nustatyti tik FR0600');
    const current = db.prepare('SELECT enabled, period FROM CompanyObligation WHERE companyId=? AND code=?').get(companyId, obligation) as { enabled: number; period: string | null } | undefined;
    const enabled = obligation === 'FR0600' ? 1 : typeof body.enabled === 'boolean' ? (body.enabled ? 1 : 0) : (current?.enabled ?? 0);
    db.prepare('INSERT INTO CompanyObligation(companyId,code,enabled,period) VALUES(?,?,?,?) ON CONFLICT(companyId,code) DO UPDATE SET enabled=excluded.enabled, period=excluded.period').run(companyId, obligation, enabled, obligation === 'FR0600' ? (period || current?.period || 'MONTH') : null);
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
