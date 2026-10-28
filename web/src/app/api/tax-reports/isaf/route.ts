import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { buildIsaf } from '@/lib/isaf';
import { loadTaxDocuments, standardVatIssues } from '@/lib/tax-documents';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const url = new URL(request.url);
    const start = url.searchParams.get('start') || '';
    const end = url.searchParams.get('end') || '';
    if (!validTaxDate(start) || !validTaxDate(end)) return NextResponse.json({ error: 'Nurodykite laikotarpį start ir end (YYYY-MM-DD)', code: 'ISAF_BAD_PERIOD' }, { status: 400, headers });
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const company = db.prepare('SELECT name, code, vatCode FROM Company WHERE id=?').get(companyId) as { name: string; code: string | null; vatCode: string | null };
    const issues = standardVatIssues(db, companyId, start, end);
    if (issues.length) return NextResponse.json({ error: 'i.SAF nesudarytas', code: 'ISAF_NOT_APPLICABLE', issues }, { status: 409, headers });

    const { sales, purchases } = loadTaxDocuments(db, companyId, start, end);
    const result = buildIsaf({ company, period: { start, end }, sales, purchases, software: { company: 'kontas.download', name: 'kontas.download', version: '0.2.1' } });
    if (!result.xml) return NextResponse.json({ error: 'i.SAF nesudarytas: reikalingas rankinis dokumentų patikrinimas', code: 'ISAF_NEEDS_REVIEW', issues: result.issues }, { status: 409, headers });
    return new NextResponse(result.xml, { headers: { ...headers, 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': `attachment; filename="iSAF_${start}_${end}.xml"` } });
  } catch (err) {
    return apiError(err);
  }
}
