import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { pln204Draft, pln204DueDate } from '@/lib/pln204';
import { NextResponse } from 'next/server';

const headers = { 'Cache-Control': 'no-store' };

// Working draft of the annual PLN204 corporate income tax declaration for checking and exporting .ffdata to VMI EDS.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year') || '';
    const year = Number(yearParam);
    if (!/^\d{4}$/.test(yearParam) || year < 2000 || year > 2100) {
      return NextResponse.json(
        { error: 'Nurodykite mokestinius metus: year (YYYY)', code: 'PLN204_BAD_YEAR' },
        { status: 400, headers },
      );
    }
    const f20 = Number(url.searchParams.get('f20') || 0) || 0;
    const f26 = Number(url.searchParams.get('f26') || 0) || 0;
    const f45 = Number(url.searchParams.get('f45') || 0) || 0;
    const tariffParam = url.searchParams.get('tariffCode');
    const tariffCode = tariffParam === '2' || tariffParam === '3' ? tariffParam : '1';
    const empParam = url.searchParams.get('employees');
    const employees = empParam !== null && empParam !== '' ? Number(empParam) : undefined;

    const companyId = await getActiveCompanyId();
    const db = getDb();
    const company = db
      .prepare('SELECT name, code FROM Company WHERE id = ?')
      .get(companyId) as { name: string; code: string | null } | undefined;

    return NextResponse.json(
      {
        dueDate: pln204DueDate(year),
        header: { name: company?.name || '', code: company?.code || '', year },
        draft: pln204Draft(db, companyId, year, { employees, f20, f26, f45, tariffCode }),
        notice: 'Juodraštis — pateikti per EDS; patikrina buhalteris.',
      },
      { headers },
    );
  } catch (err) {
    return apiError(err);
  }
}
