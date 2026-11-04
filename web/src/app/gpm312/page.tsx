import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Gpm312Client } from './Gpm312Client';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.gpm312') }; }

export const dynamic = 'force-dynamic';

export default async function Gpm312Page() {
  await requirePageAccess();
  return <Gpm312Client today={todayVilnius()} />;
}
