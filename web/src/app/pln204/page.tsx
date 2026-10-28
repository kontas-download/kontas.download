import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Pln204Client } from './Pln204Client';

export const dynamic = 'force-dynamic';

export default async function Pln204Page() {
  await requirePageAccess();
  return <Pln204Client today={todayVilnius()} />;
}
