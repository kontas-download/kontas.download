import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { suggestions } from '@/lib/suggestions';
import { getActiveCompany } from '@/lib/company';
import { InvoicesClient } from './InvoicesClient';
import { itemCatalog } from '@/lib/item-catalog';
import { openDocuments } from '@/lib/payments';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.sales') }; }

export default async function InvoicesPage() {
  await requirePageAccess();
  const db = getDb();
  const company = await getActiveCompany();
  const companyId = company.id;

  // Load sales with pre-joined metrics and clientEmail (using indexed subqueries instead of full scans)
  const sales = db.prepare(`
    SELECT s.id, s.series, s.number, s.saleDate, s.payUntil, s.statusName, s.warehouseName,
           s.clientId, s.clientName, s.clientCode, s.clientVatCode, s.sumWithoutVat, s.vat, s.sumWithVat,
           s.notes, s.sellerIsVatPayer, s.sellerVatMode, s.docType, s.originalSaleId, s.correctionReason,
           COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE saleId = s.id), 0) as paidAmount,
           ROUND(s.sumWithVat + COALESCE((SELECT SUM(sumWithVat) FROM Sale WHERE originalSaleId = s.id), 0), 2) as dueAmount,
           COALESCE((SELECT COUNT(*) FROM SaleItem WHERE saleId = s.id), 0) as itemCount,
           cl.email as clientEmail
    FROM Sale s
    LEFT JOIN Client cl ON cl.id = s.clientId
    WHERE s.companyId = ?
    ORDER BY s.saleDate DESC, s.id DESC
  `).all(companyId) as any[];

  // The stored flag is only a hint: an invoice is paid when nothing is left to collect (bank payments, manual settlements),
  // so one entered after payment tracking began shows as unpaid until the money actually arrives.
  const openIds = new Set(openDocuments(db, companyId).filter(d => d.kind === 'SALE').map(d => d.id));
  for (const s of sales) if (s.docType !== 'KS') s.statusName = openIds.has(s.id) ? 'Neapmokėta' : 'Apmokėta';

  // Pre-load items only for the initial visible 50 sales (instant first page expand)
  const initialSaleIds = sales.slice(0, 50).map(s => s.id);
  const itemsBySaleId: Record<number, any[]> = {};
  if (initialSaleIds.length > 0) {
    const placeholders = initialSaleIds.map(() => '?').join(',');
    const items = db.prepare(`SELECT * FROM SaleItem WHERE saleId IN (${placeholders}) ORDER BY id ASC`).all(...initialSaleIds) as any[];
    for (const item of items) {
      (itemsBySaleId[item.saleId] ||= []).push(item);
    }
  }

  // Load client list for fast autocompletion
  const clients = db.prepare(`
    SELECT id, name, code, vatCode, isVatPayer, email, address FROM Client WHERE companyId = ? ORDER BY name ASC
  `).all(companyId) as any[];

  return (
    <InvoicesClient 
      initialSales={sales} 
      itemsBySaleId={itemsBySaleId} 
      company={company} 
      clientsList={clients}
      catalog={itemCatalog(db, companyId)}
      suggest={suggestions(db, companyId, ['saleSeries'])}
    />
  );
}
