import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { listTemplates, parseTemplate } from '@/lib/recurring';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json({ templates: listTemplates(getDb(), await getActiveCompanyId()) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const t = parseTemplate(db, companyId, await request.json());
    const res = db.prepare('INSERT INTO RecurringInvoice(companyId,name,clientId,series,frequency,nextDate,anchorDay,endDate,payDays,notes,itemsJson,active,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)')
      .run(companyId, t.name, t.clientId, t.series, t.frequency, t.nextDate, t.anchorDay, t.endDate, t.payDays, t.notes, JSON.stringify(t.items), Date.now());
    return NextResponse.json({ success: true, id: Number(res.lastInsertRowid) });
  } catch (err) {
    return apiError(err);
  }
}
