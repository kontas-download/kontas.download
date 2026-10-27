import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { isDocLang } from '@/lib/doc-language';

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
    if (!getDb().prepare('SELECT id FROM Client WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
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
    db.prepare(`
      UPDATE Client SET
        name = ?,
        code = ?,
        vatCode = ?,
        isVatPayer = ?,
        email = ?,
        phone = ?,
        address = ?,
        city = ?,
        countryName = ?,
        documentLang = CASE WHEN ? = 1 THEN ? ELSE documentLang END,
        updatedAt = datetime('now')
      WHERE id = ? AND companyId = ?
    `).run(
      name.trim(),
      code ? code.trim() : null,
      vatCode ? vatCode.trim() : null,
      isVatPayer ? 1 : 0,
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      address ? address.trim() : null,
      city ? city.trim() : null,
      countryName ? countryName.trim() : 'Lietuva',
      documentLang === undefined ? 0 : 1,
      documentLang ?? null,
      id,
      companyId
    );

    const updated = db.prepare('SELECT * FROM Client WHERE id = ? AND companyId = ?').get(id, companyId);
    return NextResponse.json({ success: true, client: updated });
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
    if (!getDb().prepare('SELECT id FROM Client WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const db = getDb();

    db.transaction(() => {
      for (const table of ['Sale', 'Purchase', 'GeneralEntry']) db.prepare('UPDATE ' + table + ' SET clientId = NULL WHERE clientId = ? AND companyId = ?').run(id, companyId);
      db.prepare('DELETE FROM Client WHERE id = ? AND companyId = ?').run(id, companyId);
    })();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
