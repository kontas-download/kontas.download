import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { BankClient } from './BankClient';

export default async function BankPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const transactions = db.prepare('SELECT * FROM BankTransaction WHERE companyId = ? ORDER BY date DESC, id DESC').all(companyId) as any[];
  const totalCount = db.prepare('SELECT COUNT(*) as c FROM BankTransaction WHERE companyId = ?').get(companyId) as { c: number };

  return <BankClient initialTransactions={transactions} totalCount={totalCount?.c || 0} />;
}
