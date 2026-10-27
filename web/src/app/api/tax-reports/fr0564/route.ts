import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { fr0564Draft, fr0564DueDate } from '@/lib/fr0564';
import { loadTaxDocuments, standardVatIssues } from '@/lib/tax-documents';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

// Working draft of the FR0564 report for checking against the form prepared in EDS. It is not a filed or fileable document.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const url = new URL(request.url);
    const start = url.searchParams.get('start') || '';
    const end = url.searchParams.get('end') || '';
    if (!validTaxDate(start) || !validTaxDate(end) || !fr0564DueDate(start, end)) return NextResponse.json({ error: 'Nurodykite kalendorinį mėnesį: start ir end (YYYY-MM-DD)', code: 'FR0564_BAD_PERIOD' }, { status: 400, headers });
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const issues = standardVatIssues(db, companyId, start, end);
    if (issues.length) return NextResponse.json({ error: 'FR0564 neskaičiuojama', code: 'FR0564_NOT_APPLICABLE', issues }, { status: 409, headers });
    const company = db.prepare('SELECT name, code, vatCode FROM Company WHERE id = ?').get(companyId) as { name: string; code: string | null; vatCode: string | null } | undefined;
    const vatCode = (company?.vatCode || '').replace(/\s+/g, '').toUpperCase();
    const { sales } = loadTaxDocuments(db, companyId, start, end);
    return NextResponse.json({
      period: { start, end }, dueDate: fr0564DueDate(start, end),
      header: { name: company?.name || '', code: company?.code || '', vatCode: vatCode.startsWith('LT') ? vatCode.slice(2) : vatCode, year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) },
      draft: fr0564Draft(sales),
      notice: 'Juodraštis — pateikti per EDS; patikrina buhalteris.',
    }, { headers });
  } catch (err) {
    return apiError(err);
  }
}
