import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { searchPurchases } from '@/lib/purchase-document-attach';

// ?q=: purchases of the active company matching a supplier name, document number, date or amount (newest first, at most 20).
export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    return NextResponse.json({ purchases: searchPurchases(companyId, new URL(request.url).searchParams.get('q')) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
