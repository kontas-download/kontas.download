import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { TaxReportsClient } from './TaxReportsClient';

export default async function TaxReportsPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const company = db.prepare('SELECT id, name, code, vatCode FROM Company WHERE id = ?').get(companyId) as any;

  const salesRaw = db.prepare(`
    SELECT s.id, s.series, s.number, s.saleDate as date, s.clientName as partnerName, s.clientCode as partnerCode, 
           COALESCE(s.clientVatCode, c.vatCode) as partnerVatCode,
           s.sumWithoutVat as net, s.vat as vat, s.sumWithVat as gross
    FROM Sale s
    LEFT JOIN Client c ON c.id = (SELECT c2.id FROM Client c2 WHERE c2.companyId=s.companyId AND (c2.id=s.clientId OR (s.clientId IS NULL AND s.clientCode IS NOT NULL AND c2.code=s.clientCode AND (SELECT COUNT(*) FROM Client c3 WHERE c3.companyId=s.companyId AND c3.code=s.clientCode)=1)) ORDER BY c2.id LIMIT 1)
    WHERE s.companyId = ?
    ORDER BY s.saleDate DESC, s.id DESC
  `).all(companyId) as any[];

  const purchasesRaw = db.prepare(`
    SELECT p.id, p.series, p.number, p.purchaseDate as date, p.clientName as partnerName, p.clientCode as partnerCode, 
           c.vatCode as partnerVatCode,
           p.sumWithoutVat as net, p.vat as vat, p.sumWithVat as gross, p.deductibleVat
    FROM Purchase p
    LEFT JOIN Client c ON c.id = (SELECT c2.id FROM Client c2 WHERE c2.companyId=p.companyId AND (c2.id=p.clientId OR (p.clientId IS NULL AND p.clientCode IS NOT NULL AND c2.code=p.clientCode AND (SELECT COUNT(*) FROM Client c3 WHERE c3.companyId=p.companyId AND c3.code=p.clientCode)=1)) ORDER BY c2.id LIMIT 1)
    WHERE p.companyId = ?
    ORDER BY p.purchaseDate DESC, p.id DESC
  `).all(companyId) as any[];

  return (
    <TaxReportsClient
      companyName={company?.name || 'UAB Įmonė'}
      companyCode={company?.code || ''}
      companyVatCode={company?.vatCode || ''}
      sales={salesRaw}
      purchases={purchasesRaw}
    />
  );
}
