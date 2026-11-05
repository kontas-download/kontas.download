import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { lookupSupplier } from '@/lib/purchase-recognition';

// ?code=&vatCode= -> the existing supplier of the active company with that company code / VAT code, or { supplier: null }.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const code = (params.get('code') || '').slice(0, 50), vatCode = (params.get('vatCode') || '').slice(0, 50);
    const supplier = code.trim() || vatCode.trim() ? lookupSupplier(await getActiveCompanyId(), code, vatCode) : null;
    return NextResponse.json({ supplier }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
