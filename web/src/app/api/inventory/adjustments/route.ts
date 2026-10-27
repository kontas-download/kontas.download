import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { adjustInventory } from '@/lib/inventory';

// Manual quantity or cost correction by an admin or accountant; the reason and the user are kept in the audit history.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const user = await currentUser();
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const id = adjustInventory(db, companyId, await request.json(), user?.id ?? null);
    return NextResponse.json({ success: true, movement: db.prepare('SELECT * FROM InventoryMovement WHERE id=?').get(id) });
  } catch (err) {
    return apiError(err);
  }
}
