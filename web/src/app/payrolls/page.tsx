import { requirePageAccess } from '@/lib/access';
import React from 'react';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { PayrollsClient } from './PayrollsClient';

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

  return <PayrollsClient initialPayrolls={payrolls} />;
}
