import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const accounts = db.prepare('SELECT * FROM ChartOfAccount ORDER BY code ASC').all();
    return NextResponse.json({ accounts });
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
    const body = await request.json();
    const { code, name } = body;

    if (!code || !name) {
      return NextResponse.json({ error: 'Sąskaitos kodas ir pavadinimas yra privalomi' }, { status: 400 });
    }

    const db = getDb();
    const exists = db.prepare('SELECT id FROM ChartOfAccount WHERE code = ?').get(String(code).trim());
    if (exists) {
      return NextResponse.json({ error: `Sąskaita su kodu ${code} jau egzistuoja` }, { status: 400 });
    }

    const res = db.prepare(`
      INSERT INTO ChartOfAccount (code, name) VALUES (?, ?)
    `).run(String(code).trim(), String(name).trim());

    const created = db.prepare('SELECT * FROM ChartOfAccount WHERE id = ?').get(res.lastInsertRowid);
    return NextResponse.json({ success: true, account: created });
  } catch (err: any) {
    return apiError(err);
  }
}
