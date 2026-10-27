import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { ClientsClient } from './ClientsClient';

export default async function ClientsPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  // Load clients with their total invoice sum and count for the active company
  const clients = db.prepare(`
    SELECT c.*,
      COUNT(s.id) as salesCount,
      COALESCE(SUM(s.sumWithVat), 0) as totalSalesSum
    FROM Client c
    LEFT JOIN Sale s ON s.clientId = c.id AND s.companyId = ?
    WHERE c.companyId = ?
    GROUP BY c.id
    ORDER BY totalSalesSum DESC, c.name ASC
  `).all(companyId, companyId) as any[];

  return <ClientsClient initialClients={clients} />;
}
