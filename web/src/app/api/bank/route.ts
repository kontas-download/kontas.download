import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, assertFormCompany } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const transactions = db.prepare('SELECT * FROM BankTransaction WHERE companyId = ? ORDER BY date DESC, id DESC LIMIT 500').all(companyId);
    return NextResponse.json({ transactions });
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
    const { companyId: formCompanyId, ...body } = await request.json();
    assertFormCompany(formCompanyId, companyId);
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

    if (!date || sum === undefined) {
      return NextResponse.json({ error: 'Data ir suma privalomos' }, { status: 400 });
    }

    const db = getDb();
    const res = db.prepare(`
      INSERT INTO BankTransaction (
        companyId, date, number, clientName, clientCode, sum,
        correspondenceAccountCode, accountingBankInternalName, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      companyId,
      date,
      number ? String(number).trim() : null,
      clientName ? String(clientName).trim() : null,
      clientCode ? String(clientCode).trim() : null,
      Number(sum),
      correspondenceAccountCode ? String(correspondenceAccountCode).trim() : '2710',
      accountingBankInternalName ? String(accountingBankInternalName).trim() : 'Bank',
      notes ? String(notes).trim() : null
    );

    const created = db.prepare('SELECT * FROM BankTransaction WHERE id = ?').get(res.lastInsertRowid);
    return NextResponse.json({ success: true, transaction: created });
  } catch (err: any) {
    return apiError(err);
  }
}
