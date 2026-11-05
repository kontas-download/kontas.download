import { requirePageAccess } from '@/lib/access';
import { getActiveCompanyId } from '@/lib/company';
import { todayVilnius } from '@/lib/dates';
import { unreimbursedPurchases } from '@/lib/purchase-recognition';
import { pageTitle } from '@/lib/i18n/page-title';
import { ReimbursementsClient } from './ReimbursementsClient';

export async function generateMetadata() { return { title: await pageTitle('docs.reimbTitle') }; }
export const dynamic = 'force-dynamic';

export default async function ReimbursementsPage() {
  await requirePageAccess();
  return <ReimbursementsClient initial={unreimbursedPurchases(await getActiveCompanyId())} today={todayVilnius()} />;
}
