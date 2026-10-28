import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { fr0600Draft, monthlyDueDate } from '@/lib/fr0600';
import { loadTaxDocuments, standardVatIssues } from '@/lib/tax-documents';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

// Working draft for checking against the declaration prepared in EDS. It is not a filed or fileable document.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const url = new URL(request.url);
    const start = url.searchParams.get('start') || '';
    const end = url.searchParams.get('end') || '';
    if (!validTaxDate(start) || !validTaxDate(end) || start > end) return NextResponse.json({ error: 'Nurodykite laikotarpį start ir end (YYYY-MM-DD)', code: 'FR0600_BAD_PERIOD' }, { status: 400, headers });
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const issues = standardVatIssues(db, companyId, start, end);
    if (issues.length) return NextResponse.json({ error: 'FR0600 neskaičiuojama', code: 'FR0600_NOT_APPLICABLE', issues }, { status: 409, headers });
    const company = db.prepare('SELECT name, code, vatCode FROM Company WHERE id = ?').get(companyId) as { name: string; code: string | null; vatCode: string | null } | undefined;
    const vatCode = (company?.vatCode || '').replace(/\s+/g, '').toUpperCase();
    const { sales, purchases } = loadTaxDocuments(db, companyId, start, end);
    return NextResponse.json({
      period: { start, end },
      dueDate: monthlyDueDate(start, end),
      header: { name: company?.name || '', code: company?.code || '', vatCode: vatCode.startsWith('LT') ? vatCode.slice(2) : vatCode },
      draft: fr0600Draft(sales, purchases),
      notice: 'Projektas patikrai. Deklaracija teikiama tik per EDS. 12–24 ir 32–34 laukai skaičiuojami tik pagal eilutes su priskirtu i.SAF kodu; 26–28 laukai čia neskaičiuojami.',
    }, { headers });
  } catch (err) {
    return apiError(err);
  }
}
