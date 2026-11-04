import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Fr0564Client } from './Fr0564Client';
import { pageTitle } from '@/lib/i18n/page-title';

export async function generateMetadata() { return { title: await pageTitle('nav.fr0564') }; }

export const dynamic = 'force-dynamic';

export default async function Fr0564Page() {
  await requirePageAccess();
  return <Fr0564Client today={todayVilnius()} />;
}
