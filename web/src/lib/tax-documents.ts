import type Database from 'better-sqlite3';
import { companyTaxMode } from './tax';
import type { IsafDocument } from './isaf';

// Documents of one company for a tax period, shaped for the VAT registers and the FR0600 draft.
export function standardVatIssues(db: Database.Database, companyId: number, start: string, end: string): string[] {
  const issues: string[] = [];
  const changes = db.prepare('SELECT COUNT(*) n FROM CompanyTaxPeriod WHERE companyId=? AND effectiveFrom>? AND effectiveFrom<=?').get(companyId, start, end) as { n: number };
  if (changes.n) issues.push('Laikotarpiu keitėsi įmonės mokesčių režimas: padalykite laikotarpį pagal režimo keitimo datas');
  if (companyTaxMode(companyId, start) !== 'STANDARD_VAT' || companyTaxMode(companyId, end) !== 'STANDARD_VAT') issues.push('Ataskaita sudaroma tik įmonei, kurios režimas visą laikotarpį yra STANDARD_VAT');
  return issues;
}

type Row = IsafDocument & { series: string | null; origSeries?: string | null; origNumber?: string | null; origDate?: string | null };
// Lines with the tax code the accountant assigned (TaxLineCode); the document itself is never changed.
function lineMap(db: Database.Database, companyId: number, table: string, fk: string, kind: 'SALE' | 'PURCHASE', ids: number[]) {
  const map = new Map<number, IsafDocument['lines']>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    const rows = db.prepare(`SELECT i.id, i.${fk} AS docId, i.vatRate AS rate, i.sumWithoutVat AS net, i.sumWithVat AS gross, i.itemName AS name, t.taxCode, t.note FROM ${table} i LEFT JOIN TaxLineCode t ON t.kind=? AND t.itemId=i.id AND t.companyId=? WHERE i.${fk} IN (${chunk.map(() => '?').join(',')}) ORDER BY i.id`).all(kind, companyId, ...chunk) as { id: number; docId: number; rate: number | null; net: number; gross: number; name: string; taxCode: string | null; note: string | null }[];
    for (const r of rows) (map.get(r.docId) || map.set(r.docId, []).get(r.docId)!).push({ id: r.id, rate: r.rate, net: r.net, gross: r.gross, taxCode: r.taxCode, name: r.name, note: r.note });
  }
  return map;
}
export function loadTaxDocuments(db: Database.Database, companyId: number, start: string, end: string) {
  // Counterparties are joined by id and company, never by code alone.
  const sales = db.prepare(`SELECT s.id, s.series, s.number, s.saleDate AS date, s.clientId, s.docType AS docType, o.series AS origSeries, o.number AS origNumber, o.saleDate AS origDate, s.sumWithoutVat AS headerNet, s.sumWithVat AS headerGross, COALESCE(c.name, s.clientName, '') AS name, COALESCE(c.code, s.clientCode, '') AS code, COALESCE(c.vatCode, s.clientVatCode, '') AS vatCode, COALESCE(c.countryName, '') AS country, (SELECT dropped FROM TaxCodeReview r WHERE r.kind='SALE' AND r.docId=s.id) AS codesDropped FROM Sale s LEFT JOIN Client c ON c.id=s.clientId AND c.companyId=s.companyId LEFT JOIN Sale o ON o.id=s.originalSaleId AND o.companyId=s.companyId WHERE s.companyId=? AND s.saleDate>=? AND s.saleDate<=? ORDER BY s.saleDate, s.id`).all(companyId, start, end + '￿') as Row[];
  const purchases = db.prepare(`SELECT p.id, p.series, p.number, p.purchaseDate AS date, p.clientId, p.deductibleVat, p.docType AS docType, o.series AS origSeries, o.number AS origNumber, o.purchaseDate AS origDate, p.sumWithoutVat AS headerNet, p.sumWithVat AS headerGross, COALESCE(c.name, p.clientName, '') AS name, COALESCE(c.code, p.clientCode, '') AS code, COALESCE(c.vatCode, '') AS vatCode, COALESCE(c.countryName, '') AS country, (SELECT dropped FROM TaxCodeReview r WHERE r.kind='PURCHASE' AND r.docId=p.id) AS codesDropped FROM Purchase p LEFT JOIN Client c ON c.id=p.clientId AND c.companyId=p.companyId LEFT JOIN Purchase o ON o.id=p.originalPurchaseId AND o.companyId=p.companyId WHERE p.companyId=? AND p.purchaseDate>=? AND p.purchaseDate<=? ORDER BY p.purchaseDate, p.id`).all(companyId, start, end + '￿') as Row[];
  const saleLines = lineMap(db, companyId, 'SaleItem', 'saleId', 'SALE', sales.map(s => s.id));
  const purchaseLines = lineMap(db, companyId, 'PurchaseItem', 'purchaseId', 'PURCHASE', purchases.map(p => p.id));
  const docs = (rows: Row[], lines: Map<number, IsafDocument['lines']>): IsafDocument[] => rows.map(r => ({ ...r, number: [r.series, r.number].filter(Boolean).join(' '), lines: lines.get(r.id) || [], docType: r.docType === 'KS' ? 'KS' as const : null, original: r.origNumber && r.origDate ? { number: [r.origSeries, r.origNumber].filter(Boolean).join(' '), date: r.origDate.slice(0, 10) } : null }));
  return { sales: docs(sales, saleLines), purchases: docs(purchases, purchaseLines) };
}
