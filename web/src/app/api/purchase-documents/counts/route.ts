import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { documentCounts } from '@/lib/purchase-recognition';

// Counts by status for the inbox badge (`awaiting` = NEW + EXTRACTED + FAILED).
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json(documentCounts(await getActiveCompanyId()));
  } catch (err) {
    return apiError(err);
  }
}
