import type Database from 'better-sqlite3';

export type CatalogItem = { name: string; code: string | null; price: number; uses: number; lastDate: string | null };

// Placeholder names of the old import and of empty forms; they are not real services and are never suggested.
const GENERIC = ['paslauga', 'paslauga (vnt.)', 'paslauga (1)', 'paslaugos suteikimas', 'darbuotojas'];

/**
 * Items and services to pick on invoice and template lines: stock items of the company, then every concrete service name from
 * earlier invoices with the price of its latest use (most used first). Matching is case-insensitive on the trimmed name.
 */
export function itemCatalog(db: Database.Database, companyId: number, limit = 1000): CatalogItem[] {
  const sold = db.prepare(`
    WITH lines AS (
      SELECT TRIM(si.itemName) AS name, NULLIF(TRIM(si.itemCode), '') AS code, si.price, s.saleDate,
             ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(si.itemName)) ORDER BY s.saleDate DESC, si.id DESC) AS rn,
             COUNT(*) OVER (PARTITION BY LOWER(TRIM(si.itemName))) AS uses
      FROM SaleItem si JOIN Sale s ON s.id = si.saleId
      WHERE s.companyId = ? AND COALESCE(s.docType, 'SF') <> 'KS' AND TRIM(COALESCE(si.itemName, '')) <> '' AND si.price > 0)
    SELECT name, code, price, uses, saleDate AS lastDate FROM lines WHERE rn = 1 ORDER BY uses DESC, lastDate DESC LIMIT ?`).all(companyId, limit) as CatalogItem[];
  const stock = db.prepare(`SELECT TRIM(name) AS name, NULLIF(TRIM(code), '') AS code, COALESCE(price, 0) AS price, 0 AS uses, NULL AS lastDate
    FROM StockItem WHERE companyId = ? AND TRIM(COALESCE(name, '')) <> '' ORDER BY name LIMIT ?`).all(companyId, limit) as CatalogItem[];
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const item of [...stock, ...sold]) {
    const key = item.name.toLowerCase();
    if (GENERIC.includes(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...item, price: Math.round(Number(item.price) * 100) / 100 });
  }
  return out.slice(0, limit);
}

/** The catalog entry whose name equals the typed text (case-insensitive), if any. */
export const findCatalogItem = (catalog: CatalogItem[], name: string) => {
  const key = name.trim().toLowerCase();
  return key ? catalog.find(c => c.name.toLowerCase() === key) : undefined;
};
