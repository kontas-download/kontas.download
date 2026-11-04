import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { listEmployees } from '@/lib/payroll-runs';
import { pageTitle } from '@/lib/i18n/page-title';
import { EmployeesClient } from './EmployeesClient';

export async function generateMetadata() { return { title: await pageTitle('nav.employees') }; }
export const dynamic = 'force-dynamic';

export default async function EmployeesPage() {
  await requirePageAccess();
  const employees = listEmployees(getDb(), await getActiveCompanyId()).map(e => ({ id: e.id, name: e.name, personalCode: e.personalCode, position: e.position, baseSalary: e.baseSalary, startDate: e.startDate, endDate: e.endDate, active: e.active === 1 }));
  return <EmployeesClient employees={employees} />;
}
