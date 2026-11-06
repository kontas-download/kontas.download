import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { getDb } from '@/lib/db';
import { lookupSupplier, supplierAccountHistory } from '@/lib/purchase-recognition';

// ?code=&vatCode= -> the existing supplier of the active company with that company code / VAT code (with the debit account of its latest
// purchase), or { supplier: null }. ?clientId= -> only { accountHistory } of that supplier.
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const params = new URL(request.url).searchParams;
    const companyId = await getActiveCompanyId();
    const clientId = Number(params.get('clientId'));
    if (params.get('clientId') !== null) {
      const own = Number.isSafeInteger(clientId) && getDb().prepare('SELECT 1 FROM Client WHERE id=? AND companyId=?').get(clientId, companyId);
      return NextResponse.json({ accountHistory: own ? supplierAccountHistory(getDb(), companyId, clientId) : null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const code = (params.get('code') || '').slice(0, 50), vatCode = (params.get('vatCode') || '').slice(0, 50);
    const supplier = code.trim() || vatCode.trim() ? lookupSupplier(companyId, code, vatCode) : null;
    return NextResponse.json({ supplier }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
