import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { Gpm313Client } from './Gpm313Client';

export const dynamic = 'force-dynamic';

export default async function Gpm313Page() {
  await requirePageAccess();
  return <Gpm313Client today={todayVilnius()} />;
}
