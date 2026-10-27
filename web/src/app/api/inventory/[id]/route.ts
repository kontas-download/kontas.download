import { requireApiAccess } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { itemMovements } from '@/lib/inventory';

// Movement history (inventory card) of one stock item of the active company.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const item = db.prepare('SELECT id,name,code,warehouseName FROM StockItem WHERE id=? AND companyId=?').get(id, companyId);
    if (!item) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    return NextResponse.json({ item, movements: itemMovements(db, companyId, id) });
  } catch (err) {
    return apiError(err);
  }
}
