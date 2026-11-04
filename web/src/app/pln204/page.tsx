import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Pln204Client } from './Pln204Client';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.pln204') }; }

export const dynamic = 'force-dynamic';

export default async function Pln204Page() {
  await requirePageAccess();
  return <Pln204Client today={todayVilnius()} />;
}
