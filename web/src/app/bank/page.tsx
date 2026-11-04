import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { suggestions } from '@/lib/suggestions';
import { getActiveCompanyId } from '@/lib/company';
import { BankClient } from './BankClient';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.bank') }; }

export default async function BankPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const transactions = db.prepare('SELECT * FROM BankTransaction WHERE companyId = ? ORDER BY date DESC, id DESC').all(companyId) as any[];
  const totalCount = db.prepare('SELECT COUNT(*) as c FROM BankTransaction WHERE companyId = ?').get(companyId) as { c: number };

  return <BankClient initialTransactions={transactions} totalCount={totalCount?.c || 0} companyId={companyId} suggest={suggestions(db, companyId, ['clients', 'bankNames', 'accounts'])} />;
}
