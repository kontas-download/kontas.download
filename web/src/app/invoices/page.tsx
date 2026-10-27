import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompany } from '@/lib/company';
import { InvoicesClient } from './InvoicesClient';

export default async function InvoicesPage() {
  await requirePageAccess();
  const db = getDb();
  const company = await getActiveCompany();
  const companyId = company.id;

  // Load sales for active company
  const sales = db.prepare(`
    SELECT s.*, 
      (SELECT SUM(amount) FROM PaymentAllocation WHERE saleId = s.id) as paidAmount,
      ROUND(s.sumWithVat + COALESCE((SELECT SUM(c.sumWithVat) FROM Sale c WHERE c.originalSaleId = s.id), 0), 2) as dueAmount,
      (SELECT COUNT(*) FROM SaleItem WHERE saleId = s.id) as itemCount
    FROM Sale s
    WHERE s.companyId = ?
    ORDER BY s.saleDate DESC, s.id DESC
  `).all(companyId) as any[];

  // Load sale items for active company
  const saleItems = db.prepare(`
    SELECT si.* FROM SaleItem si
    JOIN Sale s ON si.saleId = s.id
    WHERE s.companyId = ?
  `).all(companyId) as any[];

  // Load client list for fast autocompletion
  const clients = db.prepare(`
    SELECT id, name, code, vatCode, isVatPayer, email, address FROM Client WHERE companyId = ? ORDER BY name ASC
  `).all(companyId) as any[];

  // Group items by saleId
  const itemsBySaleId: Record<number, any[]> = {};
  for (const item of saleItems) {
    if (!itemsBySaleId[item.saleId]) {
      itemsBySaleId[item.saleId] = [];
    }
    itemsBySaleId[item.saleId].push(item);
  }

  return (
    <InvoicesClient 
      initialSales={sales} 
      itemsBySaleId={itemsBySaleId} 
      company={company} 
      clientsList={clients}
    />
  );
}
