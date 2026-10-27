import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
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
    if (!getDb().prepare('SELECT id FROM GeneralEntry WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const body = await request.json();
    validateBody(body, 'ledger', companyId);
    const { date, docNumber, debitAccount, creditAccount, amount, clientName, description } = body;

    const db = getDb();
    const entry = db.prepare('SELECT sourceType FROM GeneralEntry WHERE id = ? AND companyId = ?').get(id, companyId) as { sourceType: string };
    if (entry.sourceType !== 'MANUAL') return NextResponse.json({ error: 'Pakeiskite pirminį dokumentą vietoj automatinio įrašo' }, { status: 409 });
    await withCurrentActor(() => db.prepare(`
      UPDATE GeneralEntry SET
        date = ?,
        docNumber = ?,
        debitAccount = ?,
        creditAccount = ?,
        amount = ?,
        clientName = ?,
        description = ?,
        updatedAt = datetime('now')
      WHERE id = ? AND companyId = ?
    `).run(
      date,
      docNumber ? String(docNumber).trim() : null,
      String(debitAccount).trim(),
      String(creditAccount).trim(),
      Number(amount),
      clientName ? String(clientName).trim() : null,
      description ? String(description).trim() : null,
      id,
      companyId
    ));

    const updated = db.prepare('SELECT * FROM GeneralEntry WHERE id = ? AND companyId = ?').get(id, companyId);
    return NextResponse.json({ success: true, entry: updated });
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
    if (!getDb().prepare('SELECT id FROM GeneralEntry WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const db = getDb();
    const entry = db.prepare('SELECT sourceType FROM GeneralEntry WHERE id = ? AND companyId = ?').get(id, companyId) as { sourceType: string };
    if (entry.sourceType !== 'MANUAL') return NextResponse.json({ error: 'Pakeiskite pirminį dokumentą vietoj automatinio įrašo' }, { status: 409 });
    await withCurrentActor(() => db.prepare('DELETE FROM GeneralEntry WHERE id = ? AND companyId = ?').run(id, companyId));
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
