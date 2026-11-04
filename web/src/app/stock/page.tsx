import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { suggestions } from '@/lib/suggestions';
import { getActiveCompanyId } from '@/lib/company';
import { StockClient } from './StockClient';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.stock') }; }

export default async function StockPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const stock = db.prepare('SELECT * FROM StockItem WHERE companyId = ? ORDER BY remainder DESC').all(companyId) as any[];

  return <StockClient initialStock={stock} suggest={suggestions(db, companyId, ['warehouses', 'clients'])} />;
}
