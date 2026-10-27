import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { AccountsClient } from './AccountsClient';

export default async function AccountsPage() {
  await requirePageAccess();
  const db = getDb();
  const accounts = db.prepare('SELECT * FROM ChartOfAccount ORDER BY code ASC').all() as any[];

  return <AccountsClient initialAccounts={accounts} />;
}
