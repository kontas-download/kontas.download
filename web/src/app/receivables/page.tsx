import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { receivables } from '@/lib/receivables';
import { overpaidDocuments } from '@/lib/payments';
import { ReceivablesClient } from './ReceivablesClient';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.receivables') }; }

export const dynamic = 'force-dynamic';

export default async function ReceivablesPage() {
  await requirePageAccess();
  const companyId = await getActiveCompanyId();
  const asOf = todayVilnius();
  return <ReceivablesClient asOf={asOf} rows={receivables(getDb(), companyId, asOf)} overpaid={overpaidDocuments(getDb(), companyId)} />;
}
