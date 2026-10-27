import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const { searchParams } = new URL(request.url);

    const fromDate = searchParams.get('fromDate') || '2000-01-01';
    const toDate = searchParams.get('toDate') || '2099-12-31';
    const account = searchParams.get('account') || '';

    let query = `
      SELECT * FROM GeneralEntry
      WHERE companyId = ? AND date >= ? AND date <= ?
    `;
    const params: any[] = [companyId, fromDate, toDate];

    if (account) {
      query += ` AND (debitAccount = ? OR creditAccount = ?)`;
      params.push(account, account);
    }

    query += ` ORDER BY date DESC, id DESC LIMIT 500`;

    const entries = db.prepare(query).all(...params);
    const totalCount = db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total FROM GeneralEntry WHERE companyId = ?').get(companyId) as { cnt: number; total: number };

    return NextResponse.json({
      entries,
      totalCount: totalCount.cnt,
      totalAmount: totalCount.total
    });
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
    validateBody(body, 'ledger', companyId);
    const { 
      date, 
      docNumber, 
      debitAccount, 
      creditAccount, 
      amount, 
      clientId, 
      clientName, 
      description 
    } = body;

    if (!date || !debitAccount || !creditAccount || !amount) {
      return NextResponse.json({ error: 'Data, debetas, kreditas ir suma yra privalomi' }, { status: 400 });
    }

    const db = getDb();
    const res = await withCurrentActor(() => db.prepare(`
      INSERT INTO GeneralEntry (
        companyId, date, docNumber, debitAccount, creditAccount,
        amount, clientId, clientName, description, sourceType,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', datetime('now'), datetime('now'))
    `).run(
      companyId,
      date,
      docNumber ? String(docNumber).trim() : null,
      String(debitAccount).trim(),
      String(creditAccount).trim(),
      Number(amount),
      clientId ? Number(clientId) : null,
      clientName ? String(clientName).trim() : null,
      description ? String(description).trim() : 'Rankinis bendrojo žurnalo įrašas'
    ));

    const created = db.prepare('SELECT * FROM GeneralEntry WHERE id = ?').get(res.lastInsertRowid);
    return NextResponse.json({ success: true, entry: created });
  } catch (err: any) {
    return apiError(err);
  }
}
