import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { unreimbursedPurchases } from '@/lib/purchase-recognition';

// Purchases paid from own funds that the company has not repaid yet, with the amount owed per person.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json(unreimbursedPurchases(await getActiveCompanyId()));
  } catch (err) {
    return apiError(err);
  }
}
