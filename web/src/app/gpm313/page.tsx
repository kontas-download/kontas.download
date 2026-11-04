import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Gpm313Client } from './Gpm313Client';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.gpm313') }; }

export const dynamic = 'force-dynamic';

export default async function Gpm313Page() {
  await requirePageAccess();
  return <Gpm313Client today={todayVilnius()} />;
}
