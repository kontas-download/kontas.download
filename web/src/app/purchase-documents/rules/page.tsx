import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { pageTitle } from '@/lib/i18n/page-title';
import { RulesClient } from './RulesClient';

export async function generateMetadata() { return { title: await pageTitle('docs.rulesTitle') }; }
export const dynamic = 'force-dynamic';

export default async function SupplierRulesPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const clients = db.prepare('SELECT id, name, code FROM Client WHERE companyId = ? ORDER BY name COLLATE NOCASE').all(companyId) as { id: number; name: string; code: string | null }[];
  // Same list of expense/asset accounts as the review screen.
  const accounts = db.prepare("SELECT code,name FROM ChartOfAccount WHERE code NOT LIKE '44%' AND code NOT IN ('2410','2444') ORDER BY code").all() as { code: string; name: string }[];
  return <RulesClient clients={clients} accounts={accounts} />;
}
