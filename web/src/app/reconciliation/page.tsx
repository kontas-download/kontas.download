import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { ReconciliationClient } from './ReconciliationClient';

export default async function ReconciliationPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const company = db.prepare('SELECT id, name, code, vatCode, address FROM Company WHERE id = ?').get(companyId) as any;

  const clients = db.prepare(`
    SELECT id, name, code, vatCode, address
    FROM Client
    WHERE companyId = ?
    ORDER BY name ASC
  `).all(companyId) as any[];

  return (
    <ReconciliationClient
      company={{
        name: company?.name || 'UAB Įmonė',
        code: company?.code || '',
        vatCode: company?.vatCode || '',
        address: company?.address || '',
      }}
      clients={clients}
    />
  );
}
