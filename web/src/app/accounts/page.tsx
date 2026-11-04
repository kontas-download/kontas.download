import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { AccountsClient } from './AccountsClient';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.accounts') }; }

export default async function AccountsPage() {
  await requirePageAccess();
  const db = getDb();
  const accounts = db.prepare('SELECT * FROM ChartOfAccount ORDER BY code ASC').all() as any[];

  return <AccountsClient initialAccounts={accounts} />;
}
