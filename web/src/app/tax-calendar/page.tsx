import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { calendarEvents, loadSettings } from '@/lib/tax-calendar';
import { TaxCalendarClient } from './TaxCalendarClient';

export const dynamic = 'force-dynamic';

const shift = (date: string, days: number) => new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86_400_000).toISOString().slice(0, 10);

export default async function TaxCalendarPage() {
  await requirePageAccess();
  const companyId = await getActiveCompanyId();
  const db = getDb();
  const today = todayVilnius();
  return <TaxCalendarClient today={today} settings={loadSettings(db, companyId, today)} events={calendarEvents(db, companyId, shift(today, -60), shift(today, 150))} />;
}
