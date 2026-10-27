import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { StockClient } from './StockClient';

export default async function StockPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const stock = db.prepare('SELECT * FROM StockItem WHERE companyId = ? ORDER BY remainder DESC').all(companyId) as any[];

  return <StockClient initialStock={stock} />;
}
