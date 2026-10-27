import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { companyId } = await request.json();
    const id = parseInt(String(companyId), 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Neteisingas įmonės ID' }, { status: 400 });
    }

    const db = getDb();
    const company = db.prepare('SELECT * FROM Company WHERE id = ?').get(id);

    if (!company) {
      return NextResponse.json({ error: 'Įmonė nerasta' }, { status: 404 });
    }

    const response = NextResponse.json({
      success: true,
      company
    });

    response.cookies.set({
      name: 'active_company_id',
      value: String(id),
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60 // 1 year
    });

    return response;
  } catch (err: any) {
    return apiError(err);
  }
}
