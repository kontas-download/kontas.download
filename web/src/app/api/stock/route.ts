import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const stock = db.prepare('SELECT * FROM StockItem WHERE companyId = ? ORDER BY remainder DESC').all(companyId);
    return NextResponse.json({ stock });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    const { name, code, barcode, warehouseName, stock, remainder, price, cost, clientName } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Pavadinimas privalomas' }, { status: 400 });
    }

    const db = getDb();
    const res = db.prepare(`
      INSERT INTO StockItem (
        companyId, name, code, barcode, warehouseName, stock, remainder,
        price, cost, clientName
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      name.trim(),
      code ? code.trim() : null,
      barcode ? barcode.trim() : null,
      warehouseName || 'Pagrindinis',
      Number(stock || remainder || 0),
      Number(remainder !== undefined ? remainder : (stock || 0)),
      Number(price || 0),
      Number(cost || 0),
      clientName || null
    );

    const created = db.prepare('SELECT * FROM StockItem WHERE id = ?').get(res.lastInsertRowid);
    return NextResponse.json({ success: true, stockItem: created });
  } catch (err: any) {
    return apiError(err);
  }
}
