import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { id: idStr } = await context.params;
    const id = Number(idStr);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const companyId = await getActiveCompanyId();
    if (!getDb().prepare('SELECT id FROM StockItem WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const body = await request.json();
    const { name, code, barcode, warehouseName, stock, remainder, price, cost, clientName } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Pavadinimas privalomas' }, { status: 400 });
    }

    const db = getDb();
    // Under inventory accounting the quantity and cost come from the movements; they are changed only by documents or adjustments.
    const tracked = db.prepare('SELECT stock, remainder, cost FROM StockItem s WHERE id = ? AND EXISTS(SELECT 1 FROM InventoryMovement m WHERE m.stockItemId = s.id)').get(id) as { stock: number; remainder: number; cost: number } | undefined;
    db.prepare(`
      UPDATE StockItem SET
        name = ?,
        code = ?,
        barcode = ?,
        warehouseName = ?,
        stock = ?,
        remainder = ?,
        price = ?,
        cost = ?,
        clientName = ?
      WHERE id = ? AND companyId = ?
    `).run(
      name.trim(),
      code ? code.trim() : null,
      barcode ? barcode.trim() : null,
      warehouseName || 'Pagrindinis',
      tracked ? tracked.stock : Number(stock || remainder || 0),
      tracked ? tracked.remainder : Number(remainder !== undefined ? remainder : (stock || 0)),
      Number(price || 0),
      tracked ? tracked.cost : Number(cost || 0),
      clientName || null,
      id,
      companyId
    );

    const updated = db.prepare('SELECT * FROM StockItem WHERE id = ? AND companyId = ?').get(id, companyId);
    return NextResponse.json({ success: true, stockItem: updated });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { id: idStr } = await context.params;
    const id = Number(idStr);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const companyId = await getActiveCompanyId();
    if (!getDb().prepare('SELECT id FROM StockItem WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const db = getDb();
    db.prepare('DELETE FROM StockItem WHERE id = ? AND companyId = ?').run(id, companyId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
