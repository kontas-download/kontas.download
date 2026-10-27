import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { getT } from '@/lib/i18n/server';
import { TrialBalanceClient } from './TrialBalanceClient';

export default async function TrialBalancePage() {
  await requirePageAccess();
  const { t } = await getT();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  // 1. Get all accounts
  const accounts = db.prepare('SELECT code, name FROM ChartOfAccount ORDER BY code ASC').all() as { code: string; name: string }[];
  const accountMap = new Map<string, string>();
  accounts.forEach(a => accountMap.set(a.code, a.name));

  // 2. Aggregate Debits by account
  const debitRows = db.prepare(`
    SELECT debitAccount as code, SUM(amount) as totalDebit
    FROM GeneralEntry
    WHERE companyId = ?
    GROUP BY debitAccount
  `).all(companyId) as { code: string; totalDebit: number }[];

  // 3. Aggregate Credits by account
  const creditRows = db.prepare(`
    SELECT creditAccount as code, SUM(amount) as totalCredit
    FROM GeneralEntry
    WHERE companyId = ?
    GROUP BY creditAccount
  `).all(companyId) as { code: string; totalCredit: number }[];

  // 4. Combine all unique account codes
  const debits = new Map<string, number>();
  debitRows.forEach(r => debits.set(r.code, r.totalDebit || 0));

  const credits = new Map<string, number>();
  creditRows.forEach(r => credits.set(r.code, r.totalCredit || 0));

  const allCodes = new Set<string>();
  accounts.forEach(a => allCodes.add(a.code));
  debits.forEach((_, code) => allCodes.add(code));
  credits.forEach((_, code) => allCodes.add(code));

  const sortedCodes = Array.from(allCodes).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const data = sortedCodes.map(code => {
    const name = accountMap.get(code) || t('trialBalance.accountFallback', { code });
    const tDebit = debits.get(code) || 0;
    const tCredit = credits.get(code) || 0;
    const net = tDebit - tCredit;

    return {
      code,
      name,
      classNum: code.charAt(0) || '0',
      openingDebit: 0,
      openingCredit: 0,
      turnoverDebit: tDebit,
      turnoverCredit: tCredit,
      closingDebit: net > 0 ? net : 0,
      closingCredit: net < 0 ? Math.abs(net) : 0,
    };
  });

  return <TrialBalanceClient initialData={data} />;
}
