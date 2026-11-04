import type Database from 'better-sqlite3';

// Values already entered somewhere in the program, offered as autocomplete on free-text fields (HTML datalist). Every list is
// per company, distinct (case-insensitive), most used first, and capped, so a form never ships an unbounded list.
const LIMIT = 500;
const QUERIES = {
  saleSeries: `SELECT TRIM(series) AS v, COUNT(*) AS n FROM Sale WHERE companyId=@c AND TRIM(COALESCE(series,''))<>'' GROUP BY LOWER(TRIM(series))`,
  purchaseSeries: `SELECT TRIM(series) AS v, COUNT(*) AS n FROM Purchase WHERE companyId=@c AND TRIM(COALESCE(series,''))<>'' GROUP BY LOWER(TRIM(series))`,
  clients: `SELECT TRIM(name) AS v, 1 AS n FROM Client WHERE companyId=@c AND TRIM(COALESCE(name,''))<>'' GROUP BY LOWER(TRIM(name))`,
  cities: `SELECT TRIM(city) AS v, COUNT(*) AS n FROM Client WHERE companyId=@c AND TRIM(COALESCE(city,''))<>'' GROUP BY LOWER(TRIM(city))`,
  countries: `SELECT TRIM(countryName) AS v, COUNT(*) AS n FROM Client WHERE companyId=@c AND TRIM(COALESCE(countryName,''))<>'' GROUP BY LOWER(TRIM(countryName))`,
  warehouses: `SELECT v, SUM(n) AS n FROM (
      SELECT TRIM(warehouseName) AS v, COUNT(*) AS n FROM StockItem WHERE companyId=@c AND TRIM(COALESCE(warehouseName,''))<>'' GROUP BY LOWER(TRIM(warehouseName))
      UNION ALL SELECT TRIM(warehouseName), COUNT(*) FROM Purchase WHERE companyId=@c AND TRIM(COALESCE(warehouseName,''))<>'' GROUP BY LOWER(TRIM(warehouseName))
      UNION ALL SELECT TRIM(warehouseName), COUNT(*) FROM Sale WHERE companyId=@c AND TRIM(COALESCE(warehouseName,''))<>'' GROUP BY LOWER(TRIM(warehouseName)))
    GROUP BY LOWER(v)`,
  bankNames: `SELECT TRIM(accountingBankInternalName) AS v, COUNT(*) AS n FROM BankTransaction WHERE companyId=@c AND TRIM(COALESCE(accountingBankInternalName,''))<>'' GROUP BY LOWER(TRIM(accountingBankInternalName))`,
  entryDescriptions: `SELECT TRIM(description) AS v, COUNT(*) AS n FROM GeneralEntry WHERE companyId=@c AND TRIM(COALESCE(description,''))<>'' AND description NOT LIKE 'DK [%' AND description NOT LIKE 'Payroll %' AND sourceType NOT IN ('SALE','PURCHASE','BANK','PAYROLL','FIXED_ASSET') GROUP BY LOWER(TRIM(description))`,
  assetCategories: `SELECT TRIM(category) AS v, COUNT(*) AS n FROM FixedAsset WHERE companyId=@c AND TRIM(COALESCE(category,''))<>'' GROUP BY LOWER(TRIM(category))`,
  accounts: `SELECT code AS v, name AS l, 1 AS n FROM ChartOfAccount WHERE @c=@c`,
  positions: `SELECT v, SUM(n) AS n FROM (
      SELECT TRIM(name) AS v, 1 AS n FROM HrPosition WHERE companyId=@c
      UNION ALL SELECT TRIM(position), COUNT(*) FROM Employee WHERE companyId=@c AND TRIM(COALESCE(position,''))<>'' GROUP BY LOWER(TRIM(position)))
    GROUP BY LOWER(v)`,
} as const;
export type SuggestionKey = keyof typeof QUERIES;
export type Suggestion = string | { value: string; label: string };
export type Suggestions = Partial<Record<SuggestionKey, Suggestion[]>>;

export function suggestions(db: Database.Database, companyId: number, keys: SuggestionKey[]): Suggestions {
  const out: Suggestions = {};
  for (const key of keys) {
    try {
      const sql = QUERIES[key];
      const rows = db.prepare(`SELECT * FROM (${sql}) ORDER BY n DESC, v COLLATE NOCASE LIMIT ${key === 'accounts' ? 5000 : LIMIT}`).all({ c: companyId }) as { v: string; l?: string }[];
      out[key] = rows.map(r => (r.l ? { value: r.v, label: r.l } : r.v));
    } catch {
      out[key] = []; // a table that does not exist in an older database simply offers nothing
    }
  }
  return out;
}

export type PurchaseCatalogItem = { name: string; code: string | null; price: number };
/** Purchase line names with the price of their latest purchase (most bought first). */
export function purchaseCatalog(db: Database.Database, companyId: number): PurchaseCatalogItem[] {
  return (db.prepare(`WITH lines AS (
      SELECT TRIM(pi.itemName) AS name, NULLIF(TRIM(pi.itemCode),'') AS code, pi.price,
             ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(pi.itemName)) ORDER BY p.purchaseDate DESC, pi.id DESC) AS rn,
             COUNT(*) OVER (PARTITION BY LOWER(TRIM(pi.itemName))) AS uses
      FROM PurchaseItem pi JOIN Purchase p ON p.id=pi.purchaseId
      WHERE p.companyId=? AND COALESCE(p.docType,'SF')<>'KS' AND TRIM(COALESCE(pi.itemName,''))<>'' AND pi.price>0)
    SELECT name, code, ROUND(price,2) AS price FROM lines WHERE rn=1 AND LOWER(name) NOT IN ('paslauga','prekė','preke','paslauga (vnt.)','paslauga (1)')
    ORDER BY uses DESC, name COLLATE NOCASE LIMIT ${LIMIT}`).all(companyId) as PurchaseCatalogItem[]);
}
