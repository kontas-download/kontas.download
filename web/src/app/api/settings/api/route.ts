import { NextResponse } from 'next/server';
import { requireApiAccess, currentUser } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { appBaseUrl, getStoredBaseUrl, listCredentials } from '@/lib/api-access';

// Access data of the active company (passwords are never returned: only `hasSecret`) and the installation-wide public address.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const company = db.prepare('SELECT name FROM Company WHERE id=?').get(companyId) as { name: string } | undefined;
    return NextResponse.json({
      company: company?.name || '', credentials: listCredentials(db, companyId),
      baseUrl: getStoredBaseUrl(db), effectiveBaseUrl: appBaseUrl(db), admin: (await currentUser())?.role === 'admin',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
