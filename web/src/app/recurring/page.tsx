import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { getDb } from '@/lib/db';
import { suggestions } from '@/lib/suggestions';
import { getActiveCompany, getActiveCompanyId } from '@/lib/company';
import { listTemplates } from '@/lib/recurring';
import { RecurringClient } from './RecurringClient';
import { itemCatalog } from '@/lib/item-catalog';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.recurring') }; }

export const dynamic = 'force-dynamic';

export default async function RecurringPage() {
  await requirePageAccess();
  const companyId = await getActiveCompanyId();
  const db = getDb();
  const clients = db.prepare('SELECT id, name FROM Client WHERE companyId = ? ORDER BY name ASC').all(companyId) as { id: number; name: string }[];
  return <RecurringClient today={todayVilnius()} templates={listTemplates(db, companyId)} clients={clients} chargesVat={(await getActiveCompany()).effectiveTaxMode === 'STANDARD_VAT'} catalog={itemCatalog(db, companyId)} suggest={suggestions(db, companyId, ['saleSeries'])} />;
}
