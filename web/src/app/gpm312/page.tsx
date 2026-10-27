import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Gpm312Client } from './Gpm312Client';

export const dynamic = 'force-dynamic';

export default async function Gpm312Page() {
  await requirePageAccess();
  return <Gpm312Client today={todayVilnius()} />;
}
