import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError, HttpError } from '@/lib/errors';
import { exportCompany } from '@/lib/company-package';
type Context = { params: Promise<{ id: string }> };

// Downloads the company export package (no SMTP settings, users or sessions; see lib/company-package.ts).
export async function GET(_request: Request, context: Context) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const id = Number((await context.params).id);
    const db = getDb();
    if (!Number.isSafeInteger(id) || !db.prepare('SELECT id FROM Company WHERE id=?').get(id)) throw new HttpError(404, 'Įmonė nerasta');
    const pkg = exportCompany(db, id);
    return new NextResponse(JSON.stringify(pkg), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="company-${id}-${pkg.exportedAt.slice(0, 10)}.kontas.json"`, 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
