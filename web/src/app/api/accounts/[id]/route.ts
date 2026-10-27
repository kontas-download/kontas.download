import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const body = await request.json();
    const { code, name } = body;

    if (!code || !name) {
      return NextResponse.json({ error: 'Kodas ir pavadinimas yra privalomi' }, { status: 400 });
    }

    const db = getDb();
    // Check if code taken by another account
    const exists = db.prepare('SELECT id FROM ChartOfAccount WHERE code = ? AND id != ?').get(String(code).trim(), id);
    if (exists) {
      return NextResponse.json({ error: `Sąskaita su kodu ${code} jau egzistuoja` }, { status: 400 });
    }

    db.prepare('UPDATE ChartOfAccount SET code = ?, name = ? WHERE id = ?').run(
      String(code).trim(),
      String(name).trim(),
      id
    );

    const updated = db.prepare('SELECT * FROM ChartOfAccount WHERE id = ?').get(id);
    return NextResponse.json({ success: true, account: updated });
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
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const db = getDb();
    db.prepare('DELETE FROM ChartOfAccount WHERE id = ?').run(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
