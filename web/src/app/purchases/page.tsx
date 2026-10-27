import { companyTaxMode } from '@/lib/tax';
import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { PurchasesClient } from './PurchasesClient';

export default async function PurchasesPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const purchases = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM PurchaseItem WHERE purchaseId = p.id) as itemCount
    FROM Purchase p
    WHERE p.companyId = ?
    ORDER BY p.purchaseDate DESC, p.id DESC
  `).all(companyId) as any[];

  const clients = db.prepare(`
    SELECT id, name, code, vatCode FROM Client WHERE companyId = ? ORDER BY name ASC
  `).all(companyId) as any[];

  const rows=db.prepare('SELECT i.* FROM PurchaseItem i JOIN Purchase p ON p.id=i.purchaseId WHERE p.companyId=? ORDER BY i.id').all(companyId) as any[];
  const itemsByPurchaseId:Record<number,any[]>={};for(const item of rows)(itemsByPurchaseId[item.purchaseId] ||= []).push(item);
  const accounts=db.prepare("SELECT code,name FROM ChartOfAccount WHERE code NOT LIKE '44%' AND code NOT IN ('2410','2444') ORDER BY code").all() as {code:string;name:string}[];
  const mode=companyTaxMode(companyId,new Date().toISOString().slice(0,10));
  return <PurchasesClient accounts={accounts} companyMode={mode} itemsByPurchaseId={itemsByPurchaseId} initialPurchases={purchases} clientsList={clients} />;
}
