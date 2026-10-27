import { NextResponse } from 'next/server';
import { requireAdminApi, checkOrigin, currentUser } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError, HttpError } from '@/lib/errors';
import { importCompanyPackage, MAX_PACKAGE_BYTES } from '@/lib/company-package';
import { readLimitedText } from '@/lib/request-body';

// Imports an export package as a NEW company. The body is the package itself. Without ?commit=1 it is a preview: the whole import
// runs and is rolled back. Optional ?name= gives the new company another name; ?allowDuplicateCode=1 confirms a copy whose code or
// VAT code already exists. Nothing is ever written into an existing company.
// (POST /api/companies/import is the older JSON importer of the legacy system and is kept unchanged.)
export async function POST(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const params = new URL(request.url).searchParams;
    const commit = params.get('commit') === '1';
    const text = await readLimitedText(request, MAX_PACKAGE_BYTES);
    let body: unknown;
    try { body = JSON.parse(text); } catch { throw new HttpError(400, 'Neteisingas JSON'); }
    const user = await currentUser();
    const result = importCompanyPackage(getDb(), body, { commit, name: params.get('name')?.slice(0, 200) || undefined, allowDuplicateCode: params.get('allowDuplicateCode') === '1', actorId: user?.id ?? null });
    return NextResponse.json(result, { status: commit && !result.committed ? 422 : 200 });
  } catch (error) { return apiError(error); }
}
