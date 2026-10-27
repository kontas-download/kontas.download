import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError, HttpError } from '@/lib/errors';
import { companyHistory, historyFilter } from '@/lib/company-history';
import { toCsv, csvResponseHeaders } from '@/lib/csv';
type Context = { params: Promise<{ id: string }> };

// Change history of one company (AccountingAudit). Administrators only, like the accounting control it extends.
export async function GET(request: Request, context: Context) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const id = Number((await context.params).id);
    const db = getDb();
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT id FROM Company WHERE id=?').get(id)) throw new HttpError(404, 'Įmonė nerasta');
    const params = new URL(request.url).searchParams;
    const format = params.get('format') || 'json';
    if (format !== 'json' && format !== 'csv') throw new HttpError(400, 'Formatas: json arba csv');
    if (format === 'csv' && !params.get('limit')) params.set('limit', '10000');
    const filter = historyFilter(params, format === 'csv' ? 50000 : 1000);
    if (typeof filter === 'string') throw new HttpError(400, filter);
    const history = companyHistory(db, id, filter);
    if (format === 'csv') {
      const rows = history.events.map(e => ({ ...e, actor: e.actorName || e.actorId }));
      return new NextResponse(toCsv(['id', 'createdAt', 'entity', 'recordId', 'action', 'actor', 'summary'], rows), { headers: csvResponseHeaders(`history-company-${id}.csv`) });
    }
    return NextResponse.json({ ...history, limit: filter.limit, offset: filter.offset }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
