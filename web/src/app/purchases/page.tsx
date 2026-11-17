import { companyTaxMode } from '@/lib/tax';
import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { suggestions, purchaseCatalog } from '@/lib/suggestions';
import { getActiveCompanyId } from '@/lib/company';
import { PurchasesClient } from './PurchasesClient';
import { withDocuments } from '@/lib/purchase-document-attach';
import { todayVilnius } from '@/lib/dates';
import { purchaseListQuery } from '@/lib/purchases-period';
import { resolveListPeriod } from '@/lib/list-period';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.purchases') }; }

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  // Only the chosen period is loaded (default: the last 12 months); the client switches period through the URL.
  const period = resolveListPeriod(await searchParams, todayVilnius());
  const query = purchaseListQuery(companyId, period.from, period.to);
  const purchaseRows = db.prepare(query.sql).all(...query.args) as any[];
  // Every original of a purchase (invoice, payment receipt, attachments); documentId stays the main one.
  const purchases = withDocuments(db, companyId, purchaseRows);

  const clients = db.prepare(`
    SELECT id, name, code, vatCode FROM Client WHERE companyId = ? ORDER BY name ASC
  `).all(companyId) as any[];

  const rows=db.prepare(`SELECT i.* FROM PurchaseItem i WHERE i.purchaseId IN (SELECT id FROM (${query.sql})) ORDER BY i.id`).all(...query.args) as any[];
  const itemsByPurchaseId:Record<number,any[]>={};for(const item of rows)(itemsByPurchaseId[item.purchaseId] ||= []).push(item);
  const accounts=db.prepare("SELECT code,name FROM ChartOfAccount WHERE code NOT LIKE '44%' AND code NOT IN ('2410','2444') ORDER BY code").all() as {code:string;name:string}[];
  const warehouses=(db.prepare("SELECT DISTINCT COALESCE(warehouseName,'Pagrindinis') AS name FROM StockItem WHERE companyId=? ORDER BY name").all(companyId) as {name:string}[]).map(w=>w.name);
  const mode=companyTaxMode(companyId,new Date().toISOString().slice(0,10));
  return <PurchasesClient key={`${period.from}|${period.to}`} period={period} warehouses={warehouses} accounts={accounts} companyMode={mode} itemsByPurchaseId={itemsByPurchaseId} initialPurchases={purchases} clientsList={clients} companyId={companyId} suggest={suggestions(db, companyId, ['purchaseSeries'])} catalog={purchaseCatalog(db, companyId)} />;
}
