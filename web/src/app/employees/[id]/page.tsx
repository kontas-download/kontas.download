import { notFound } from 'next/navigation';
import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { getEmployeeCard } from '@/lib/payroll-runs';
import { pageTitle } from '@/lib/i18n/page-title';
import { EmployeeCardClient } from './EmployeeCardClient';

export async function generateMetadata() { return { title: await pageTitle('nav.employees') }; }
export const dynamic = 'force-dynamic';

export default async function EmployeeCardPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePageAccess();
  const { id: raw } = await params;
  const db = getDb();
  const companyId = await getActiveCompanyId();
  const clients = db.prepare('SELECT id, name FROM Client WHERE companyId=? ORDER BY name COLLATE NOCASE').all(companyId) as { id: number; name: string }[];
  const positions = (db.prepare('SELECT name FROM HrPosition WHERE companyId=? ORDER BY name').all(companyId) as { name: string }[]).map(p => p.name);
  if (raw === 'new') return <EmployeeCardClient card={null} positions={positions} clients={clients} />;
  const id = Number(raw);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  try {
    return <EmployeeCardClient card={getEmployeeCard(db, companyId, id)} positions={positions} clients={clients} />;
  } catch {
    notFound();
  }
}
