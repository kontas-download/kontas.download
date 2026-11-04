import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { LedgerClient } from './LedgerClient';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.ledger') }; }

export default async function LedgerPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const entries = db.prepare(`
    SELECT * FROM GeneralEntry
    WHERE companyId = ?
    ORDER BY date DESC, id DESC
    LIMIT 1000
  `).all(companyId) as any[];

  const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM GeneralEntry WHERE companyId = ?').get(companyId) as { cnt: number };
  const accounts = db.prepare('SELECT id, code, name FROM ChartOfAccount ORDER BY code ASC').all() as any[];

  return (
    <LedgerClient 
      initialEntries={entries} 
      totalCount={totalCount?.cnt || 0}
      accountsList={accounts}
    />
  );
}
