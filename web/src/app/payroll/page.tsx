import { requirePageAccess } from '@/lib/access';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { listEmployees, listRuns } from '@/lib/payroll-runs';
import { PayrollClient, type EmployeeDto, type RunSummary } from './PayrollClient';

export const dynamic = 'force-dynamic';

// Employees and monthly payroll runs (provisional calculation); available to administrators and accountants.
export default async function PayrollPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();
  return <PayrollClient initialEmployees={listEmployees(db, companyId) as EmployeeDto[]} initialRuns={listRuns(db, companyId) as RunSummary[]} companyId={companyId} />;
}
