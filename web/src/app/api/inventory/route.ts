import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { inventorySettings, inventoryOverview, saveInventorySettings } from '@/lib/inventory';

// Inventory accounting of the active company: settings and the balance of every stock card. Admins and accountants.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const hasMovements = !!db.prepare('SELECT 1 FROM InventoryMovement WHERE companyId=? LIMIT 1').get(companyId);
    return NextResponse.json({ settings: inventorySettings(db, companyId), hasMovements, items: inventoryOverview(db, companyId) });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const user = await currentUser();
    const companyId = await getActiveCompanyId();
    const settings = saveInventorySettings(getDb(), companyId, await request.json(), user?.id ?? null);
    return NextResponse.json({ success: true, settings });
  } catch (err) {
    return apiError(err);
  }
}
