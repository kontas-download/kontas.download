import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Fr0564Client } from './Fr0564Client';

export const dynamic = 'force-dynamic';

export default async function Fr0564Page() {
  await requirePageAccess();
  return <Fr0564Client today={todayVilnius()} />;
}
