import { validateBody } from '@/lib/validation';
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
    if (!getDb().prepare('SELECT id FROM BankTransaction WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const body = await request.json();
    validateBody(body, 'bank', companyId);
    const { 
      date, 
      number, 
      clientName, 
      clientCode, 
      sum, 
      correspondenceAccountCode, 
      accountingBankInternalName, 
      notes 
    } = body;

    const db = getDb();
    db.prepare(`
      UPDATE BankTransaction SET
        date = ?,
        number = ?,
        clientName = ?,
        clientCode = ?,
        sum = ?,
        correspondenceAccountCode = ?,
        accountingBankInternalName = ?,
        notes = ?
      WHERE id = ? AND companyId = ?
    `).run(
      date,
      number ? String(number).trim() : null,
      clientName ? String(clientName).trim() : null,
      clientCode ? String(clientCode).trim() : null,
      Number(sum),
      correspondenceAccountCode ? String(correspondenceAccountCode).trim() : '2710',
      accountingBankInternalName ? String(accountingBankInternalName).trim() : 'Bank',
      notes ? String(notes).trim() : null,
      id,
      companyId
    );

    const updated = db.prepare('SELECT * FROM BankTransaction WHERE id = ? AND companyId = ?').get(id, companyId);
    return NextResponse.json({ success: true, transaction: updated });
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
    if (!getDb().prepare('SELECT id FROM BankTransaction WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const db = getDb();
    db.prepare('DELETE FROM BankTransaction WHERE id = ? AND companyId = ?').run(id, companyId);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
