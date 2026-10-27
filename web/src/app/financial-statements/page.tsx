import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { FinancialClient } from './FinancialClient';

export default async function FinancialStatementsPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const company = db.prepare('SELECT id, name, code FROM Company WHERE id = ?').get(companyId) as { id: number; name: string; code: string } | undefined;

  const entries = db.prepare(`
    SELECT id, date, debitAccount, creditAccount, amount, description
    FROM GeneralEntry
    WHERE companyId = ?
    ORDER BY date ASC, id ASC
  `).all(companyId) as {
    id: number;
    date: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    description: string | null;
  }[];

  const accounts = db.prepare('SELECT code, name FROM ChartOfAccount ORDER BY code ASC').all() as {
    code: string;
    name: string;
  }[];

  return (
    <FinancialClient
      companyName={company?.name || 'UAB Įmonė'}
      companyCode={company?.code || ''}
      entries={entries}
      accounts={accounts}
    />
  );
}
