import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { gpm312Draft, gpm312DueDate } from '@/lib/gpm312';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

// Working draft of the GPM312 declaration for checking against the form prepared in EDS. It is not a filed or fileable document.
// Payroll does not depend on the VAT regime, so unlike FR0564 there is no STANDARD_VAT check.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year') || '';
    const year = Number(yearParam);
    if (!/^\d{4}$/.test(yearParam) || year < 2000 || year > 2100) return NextResponse.json({ error: 'Nurodykite mokestinius metus: year (YYYY)', code: 'GPM312_BAD_YEAR' }, { status: 400, headers });
    const companyId = await getActiveCompanyId();
    const db = getDb();
    const company = db.prepare('SELECT name, code FROM Company WHERE id = ?').get(companyId) as { name: string; code: string | null } | undefined;
    return NextResponse.json({
      dueDate: gpm312DueDate(year),
      header: { name: company?.name || '', code: company?.code || '', year },
      draft: gpm312Draft(db, companyId, year),
      notice: 'Juodraštis — pateikti per EDS; patikrina buhalteris.',
    }, { headers });
  } catch (err) {
    return apiError(err);
  }
}
