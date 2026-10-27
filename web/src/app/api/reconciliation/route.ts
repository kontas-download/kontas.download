import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function GET(req: NextRequest) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb();
    const companyId = await getActiveCompanyId();
    const { searchParams } = new URL(req.url);

    const clientIdStr = searchParams.get('clientId');
    const clientCode = searchParams.get('clientCode');
    const clientName = searchParams.get('clientName');
    const asOfDate = searchParams.get('asOfDate') || new Date().toISOString().split('T')[0];

    let client: any = null;
    if (clientIdStr) {
      client = db.prepare('SELECT * FROM Client WHERE companyId = ? AND id = ?').get(companyId, parseInt(clientIdStr));
    } else if (clientCode) {
      client = db.prepare('SELECT * FROM Client WHERE companyId = ? AND code = ?').get(companyId, clientCode);
    } else if (clientName) {
      client = db.prepare('SELECT * FROM Client WHERE companyId = ? AND name LIKE ?').get(companyId, `%${clientName}%`);
    }

    if (!client && !clientCode && !clientName) {
      return NextResponse.json({ error: 'Nenurodytas klientas' }, { status: 400 });
    }

    const targetCode = client?.code || clientCode;
    const targetName = client?.name || clientName;
    const targetId = client?.id || (clientIdStr ? parseInt(clientIdStr) : null);

    // 1. Fetch Sales (Debet)
    const salesQuery = `
      SELECT id, series, number, saleDate as date, sumWithVat as amount, 'SALE' as type, 'Išrašyta SF' as docType, notes
      FROM Sale
      WHERE companyId = ? AND saleDate <= ? AND (
        (1=0)
        ${targetId ? 'OR clientId = ?' : ''}
        ${targetCode ? 'OR clientCode = ?' : ''}
        ${targetName ? 'OR clientName = ?' : ''}
      )
    `;
    const salesParams: any[] = [companyId, asOfDate];
    if (targetId) salesParams.push(targetId);
    if (targetCode) salesParams.push(targetCode);
    if (targetName) salesParams.push(targetName);

    const sales = db.prepare(salesQuery).all(...salesParams) as any[];

    // 2. Fetch Purchases (Credit)
    const purchasesQuery = `
      SELECT id, series, number, purchaseDate as date, sumWithVat as amount, 'PURCHASE' as type, 'Gauta SF' as docType, notes
      FROM Purchase
      WHERE companyId = ? AND purchaseDate <= ? AND (
        (1=0)
        ${targetId ? 'OR clientId = ?' : ''}
        ${targetCode ? 'OR clientCode = ?' : ''}
        ${targetName ? 'OR clientName = ?' : ''}
      )
    `;
    const purchasesParams: any[] = [companyId, asOfDate];
    if (targetId) purchasesParams.push(targetId);
    if (targetCode) purchasesParams.push(targetCode);
    if (targetName) purchasesParams.push(targetName);

    const purchases = db.prepare(purchasesQuery).all(...purchasesParams) as any[];

    // 3. Fetch Bank Transactions
    const bankQuery = `
      SELECT id, number, date, sum as amount, 'BANK' as type, 'Banko pavedimas' as docType, notes
      FROM BankTransaction
      WHERE companyId = ? AND date <= ? AND (
        (1=0)
        ${targetCode ? 'OR clientCode = ?' : ''}
        ${targetName ? 'OR clientName = ?' : ''}
      )
    `;
    const bankParams: any[] = [companyId, asOfDate];
    if (targetCode) bankParams.push(targetCode);
    if (targetName) bankParams.push(targetName);

    const bankTransactions = db.prepare(bankQuery).all(...bankParams) as any[];

    // Combine and build ledger entries
    interface StatementRow {
      id: string;
      date: string;
      docNumber: string;
      docType: string;
      notes: string;
      debit: number;
      credit: number;
      balance: number;
    }

    const rows: StatementRow[] = [];

    // Sales -> Debit (customer owes us)
    sales.forEach(s => {
      const docNo = `${s.series ? s.series + '-' : ''}${s.number || s.id}`;
      rows.push({
        id: `sale-${s.id}`,
        date: s.date,
        docNumber: docNo,
        docType: 'Išrašyta sąskaita-faktūra',
        notes: s.notes || 'Prekių / paslaugų pardavimas',
        debit: s.amount || 0,
        credit: 0,
        balance: 0,
      });
    });

    // Purchases -> Credit (we owe supplier)
    purchases.forEach(p => {
      const docNo = `${p.series ? p.series + '-' : ''}${p.number || p.id}`;
      rows.push({
        id: `purchase-${p.id}`,
        date: p.date,
        docNumber: docNo,
        docType: 'Gauta pirkimo sąskaita',
        notes: p.notes || 'Prekių / paslaugų pirkimas',
        debit: 0,
        credit: p.amount || 0,
        balance: 0,
      });
    });

    // Bank
    bankTransactions.forEach(b => {
      const isCustomerPayment = b.amount > 0; // Inflow from customer -> reduces customer debt (Credit)
      const isSupplierPayment = b.amount < 0; // Outflow to supplier -> reduces our liability (Debit)
      const absAmount = Math.abs(b.amount || 0);

      rows.push({
        id: `bank-${b.id}`,
        date: b.date,
        docNumber: b.number || `B-${b.id}`,
        docType: isCustomerPayment ? 'Gautas apmokėjimas (įplauka)' : 'Mokėjimas tiekėjui (išmoka)',
        notes: b.notes || 'Banko operacija',
        debit: isSupplierPayment ? absAmount : 0,
        credit: isCustomerPayment ? absAmount : 0,
        balance: 0,
      });
    });

    // Sort chronologically
    rows.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate running balance
    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    rows.forEach(r => {
      runningBalance += (r.debit - r.credit);
      r.balance = runningBalance;
      totalDebit += r.debit;
      totalCredit += r.credit;
    });

    return NextResponse.json({
      client: client || { name: targetName, code: targetCode },
      asOfDate,
      rows,
      totalDebit,
      totalCredit,
      finalBalance: runningBalance,
    });
  } catch (error: any) {
    console.error('Error fetching reconciliation statement:', error);
    return apiError(error);
  }
}
