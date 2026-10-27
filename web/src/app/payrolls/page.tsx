import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { todayVilnius } from '@/lib/dates';
import { rules } from '@/lib/rules';
import { PayrollsClient, type PayrollRules } from './PayrollsClient';

export default async function PayrollsPage() {
  await requirePageAccess();
  const db = getDb();
  const companyId = await getActiveCompanyId();

  const payrolls = db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM PayrollEmployee WHERE payrollId = p.id) as empCount,
      (SELECT SUM(netSalary) FROM PayrollEmployee WHERE payrollId = p.id) as totalNet,
      (SELECT SUM(grossSalary) FROM PayrollEmployee WHERE payrollId = p.id) as totalGross
    FROM Payroll p
    WHERE p.companyId = ?
    ORDER BY p.year DESC, p.month DESC
  `).all(companyId) as any[];

  // Rates of the form estimate (percent), as valid today; provisional registry entries.
  const today = todayVilnius();
  const payrollRules: PayrollRules = { gpm: rules.number('payroll.gpm.rate', today), sodraEmployee: rules.number('payroll.sodra.employee', today), sodraEmployer: rules.number('payroll.sodra.employer', today) };

  return <PayrollsClient initialPayrolls={payrolls} payrollRules={payrollRules} />;
}
