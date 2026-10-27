import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { apiError, HttpError } from '@/lib/errors';
import { SECTIONS, sectionRows } from '@/lib/section-transfer';
import { toCsv, csvResponseHeaders } from '@/lib/csv';
type Context = { params: Promise<{ section: string }> };

// Section export of the active company (or ?companyId=). CSV: UTF-8 with BOM, ';' delimiter, formula cells neutralised.
export async function GET(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const { section } = await context.params;
    if (!Object.hasOwn(SECTIONS, section)) throw new HttpError(404, 'Nežinomas skyrius');
    const params = new URL(request.url).searchParams;
    const format = params.get('format') || 'csv';
    if (format !== 'json' && format !== 'csv') throw new HttpError(400, 'Formatas: json arba csv');
    const db = getDb();
    let companyId = await getActiveCompanyId();
    if (params.get('companyId')) {
      companyId = Number(params.get('companyId'));
      if (!Number.isSafeInteger(companyId) || !db.prepare('SELECT id FROM Company WHERE id=?').get(companyId)) throw new HttpError(404, 'Įmonė nerasta');
    }
    const rows = sectionRows(db, section, companyId, format === 'json');
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'csv') return new NextResponse(toCsv(SECTIONS[section].columns, rows), { headers: csvResponseHeaders(`${section}-${companyId}-${date}.csv`) });
    return new NextResponse(JSON.stringify({ section, companyId, exportedAt: new Date().toISOString(), rows }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${section}-${companyId}-${date}.json"`, 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
