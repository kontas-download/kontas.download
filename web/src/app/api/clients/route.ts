import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { isDocLang } from '@/lib/doc-language';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const clients = db.prepare(`
      SELECT c.*,
        COUNT(s.id) as salesCount,
        COALESCE(SUM(s.sumWithVat), 0) as totalSalesSum
      FROM Client c
      LEFT JOIN Sale s ON s.clientId = c.id AND s.companyId = ?
      WHERE c.companyId = ?
      GROUP BY c.id
      ORDER BY totalSalesSum DESC, c.name ASC
    `).all(companyId, companyId);

    return NextResponse.json({ clients });
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
    const { name, code, vatCode, email, phone, address, city, countryName } = body;
    if (body.isVatPayer !== undefined && typeof body.isVatPayer !== 'boolean') return NextResponse.json({ error: 'Neteisingas PVM statusas' }, { status: 400 });
    const isVatPayer = body.isVatPayer ?? Boolean(vatCode?.trim());
    // Language of invoices, emails and reminders for this customer: lt, ru, en, or empty for the default (Lithuanian). Omitted = unchanged.
    let documentLang: string | null | undefined;
    if (body.documentLang !== undefined) {
      if (body.documentLang === null || body.documentLang === '') documentLang = null;
      else if (isDocLang(body.documentLang)) documentLang = body.documentLang;
      else return NextResponse.json({ error: 'Neteisinga dokumentų kalba' }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Pavadinimas privalomas' }, { status: 400 });
    }

    const db = getDb();
    const res = db.prepare(`
      INSERT INTO Client (
        companyId, name, code, vatCode, isVatPayer, email, phone, address, city, countryName, documentLang,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      companyId,
      name.trim(),
      code ? code.trim() : null,
      vatCode ? vatCode.trim() : null,
      isVatPayer ? 1 : 0,
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      address ? address.trim() : null,
      city ? city.trim() : null,
      countryName ? countryName.trim() : 'Lietuva',
      documentLang ?? null
    );

    const newClient = db.prepare('SELECT * FROM Client WHERE id = ?').get(res.lastInsertRowid);
    return NextResponse.json({ success: true, client: newClient });
  } catch (err: any) {
    return apiError(err);
  }
}
