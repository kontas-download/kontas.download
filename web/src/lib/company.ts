import { companyTaxMode } from './tax';
import { requirePageAccess } from './access';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';

export interface Company {
  id: number;
  name: string;
  code?: string | null;
  vatCode?: string | null;
  isVatPayer: number;
  taxMode?: string | null;
  effectiveTaxMode?: string;
  taxPeriods?: {effectiveFrom:string;mode:string}[];
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  bankName?: string | null;
  bankIban?: string | null;
  bankSwift?: string | null;
  currencyCode: string;
  isDefault: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CompanyWithStats extends Company {
  salesCount: number;
  purchasesCount: number;
  clientsCount: number;
  bankCount: number;
  totalRevenue: number;
}

/**
 * Get active company ID from request cookies, falling back to default/first company.
 */
export async function getActiveCompanyId(): Promise<number> {
  await requirePageAccess();
  const db = getDb();
  let activeId: number | null = null;

  try {
    const cookieStore = await cookies();
    const cookieVal = cookieStore.get('active_company_id')?.value;
    if (cookieVal) {
      const parsed = parseInt(cookieVal, 10);
      if (!isNaN(parsed)) {
        activeId = parsed;
      }
    }
  } catch {
    // In contexts where cookies() is not available
  }

  if (activeId !== null) {
    const exists = db.prepare('SELECT id FROM Company WHERE id = ?').get(activeId) as { id: number } | undefined;
    if (exists) {
      return exists.id;
    }
  }

  // Fallback to default company or first company
  const defaultComp = db.prepare('SELECT id FROM Company WHERE isDefault = 1 LIMIT 1').get() as { id: number } | undefined;
  if (defaultComp) {
    return defaultComp.id;
  }

  const firstComp = db.prepare('SELECT id FROM Company ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
  if (firstComp) {
    return firstComp.id;
  }

  // If no company exists at all, create one
  const insert = db.prepare(`
    INSERT INTO Company (name, currencyCode, isDefault, createdAt, updatedAt)
    VALUES ('Mano Įmonė', 'EUR', 1, datetime('now'), datetime('now'))
  `).run();

  return Number(insert.lastInsertRowid);
}

/**
 * Get active company details.
 */
export async function getActiveCompany(): Promise<Company> {
  const db = getDb();
  const id = await getActiveCompanyId();
  const company = db.prepare('SELECT * FROM Company WHERE id = ?').get(id) as Company;
  return {...company,taxPeriods:db.prepare('SELECT effectiveFrom,mode FROM CompanyTaxPeriod WHERE companyId=? ORDER BY effectiveFrom').all(id) as {effectiveFrom:string;mode:string}[],effectiveTaxMode:companyTaxMode(id,new Date().toISOString().slice(0,10))};
}

/**
 * Get all companies with statistics.
 */
export function getAllCompanies(): CompanyWithStats[] {
  const db = getDb();
  const companies = db.prepare('SELECT * FROM Company ORDER BY isDefault DESC, id ASC').all() as Company[];

  return companies.map((c) => {
    const salesStat = db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(sumWithVat), 0) as total FROM Sale WHERE companyId = ?').get(c.id) as { cnt: number; total: number };
    const purchasesStat = db.prepare('SELECT COUNT(*) as cnt FROM Purchase WHERE companyId = ?').get(c.id) as { cnt: number };
    const clientsStat = db.prepare('SELECT COUNT(*) as cnt FROM Client WHERE companyId = ?').get(c.id) as { cnt: number };
    const bankStat = db.prepare('SELECT COUNT(*) as cnt FROM BankTransaction WHERE companyId = ?').get(c.id) as { cnt: number };

    return {
      ...c,
      salesCount: salesStat?.cnt || 0,
      totalRevenue: salesStat?.total || 0,
      purchasesCount: purchasesStat?.cnt || 0,
      clientsCount: clientsStat?.cnt || 0,
      bankCount: bankStat?.cnt || 0,
    };
  });
}
