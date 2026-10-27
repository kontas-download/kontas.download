import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
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
    `).all(companyId);

    return NextResponse.json({ payrolls });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    validateBody(body, 'payrolls', companyId);
    const { year, month, employees = [] } = body;

    if (!year || !month) {
      return NextResponse.json({ error: 'Metai ir mėnuo yra privalomi' }, { status: 400 });
    }

    const db = getDb();

    let totalGross = 0;
    for (const emp of employees) {
      totalGross += Number(emp.grossSalary || 0);
    }

    const createPayrollTx = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO Payroll (companyId, year, month, sumWithVat, createdAt)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(
        companyId,
        Number(year),
        Number(month),
        totalGross
      );

      const payrollId = Number(res.lastInsertRowid);

      const insertEmp = db.prepare(`
        INSERT INTO PayrollEmployee (
          payrollId, employeeName, employeeCode, grossSalary,
          netSalary, gpm, sodraEmployee, sodraEmployer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const emp of employees) {
        insertEmp.run(
          payrollId,
          emp.employeeName || 'Darbuotojas',
          emp.employeeCode || null,
          Number(emp.grossSalary || 0),
          Number(emp.netSalary || 0),
          Number(emp.gpm || 0),
          Number(emp.sodraEmployee || 0),
          Number(emp.sodraEmployer || 0)
        );
      }

      return payrollId;
    });

    const newPayrollId = createPayrollTx();
    const created = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM PayrollEmployee WHERE payrollId = p.id) as empCount,
        (SELECT SUM(netSalary) FROM PayrollEmployee WHERE payrollId = p.id) as totalNet,
        (SELECT SUM(grossSalary) FROM PayrollEmployee WHERE payrollId = p.id) as totalGross
      FROM Payroll p
      WHERE p.id = ?
    `).get(newPayrollId);

    return NextResponse.json({ success: true, payroll: created });
  } catch (err: any) {
    return apiError(err);
  }
}
