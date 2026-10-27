import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { listTemplates } from '@/lib/recurring';
import { RecurringClient } from './RecurringClient';

export const dynamic = 'force-dynamic';

export default async function RecurringPage() {
  await requirePageAccess();
  const companyId = await getActiveCompanyId();
  const db = getDb();
  const clients = db.prepare('SELECT id, name FROM Client WHERE companyId = ? ORDER BY name ASC').all(companyId) as { id: number; name: string }[];
  return <RecurringClient today={todayVilnius()} templates={listTemplates(db, companyId)} clients={clients} />;
}
