import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { validTaxDate } from '@/lib/tax';
import { gpm313Draft, gpm313DueDate } from '@/lib/gpm313';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

// Working draft of the GPM313 declaration for checking against the form prepared in EDS. It is not a filed or fileable document.
// Payroll does not depend on the VAT regime, so unlike FR0564 there is no STANDARD_VAT check.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const url = new URL(request.url);
    const start = url.searchParams.get('start') || '';
    const end = url.searchParams.get('end') || '';
    if (!validTaxDate(start) || !validTaxDate(end) || !gpm313DueDate(start, end)) return NextResponse.json({ error: 'Nurodykite kalendorinį mėnesį: start ir end (YYYY-MM-DD)', code: 'GPM313_BAD_PERIOD' }, { status: 400, headers });
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const company = db.prepare('SELECT name, code FROM Company WHERE id = ?').get(companyId) as { name: string; code: string | null } | undefined;
    const year = Number(start.slice(0, 4)), month = Number(start.slice(5, 7));
    return NextResponse.json({
      period: { start, end }, dueDate: gpm313DueDate(start, end),
      header: { name: company?.name || '', code: company?.code || '', year, month },
      draft: gpm313Draft(db, companyId, year, month),
      notice: 'Juodraštis — pateikti per EDS; patikrina buhalteris.',
    }, { headers });
  } catch (err) {
    return apiError(err);
  }
}
