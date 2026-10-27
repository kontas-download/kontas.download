import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { id: idStr } = await context.params;
    const id = Number(idStr);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const companyId = await getActiveCompanyId();
    if (!getDb().prepare('SELECT id FROM Payroll WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    // A payroll posted from a payroll calculation (/payroll) is changed only there.
    if (getDb().prepare('SELECT 1 FROM PayrollRun WHERE payrollId = ?').get(id)) return NextResponse.json({ error: 'Šis žiniaraštis užregistruotas iš DU skaičiavimo; keiskite jį skiltyje „DU skaičiavimas“' }, { status: 409 });
    const body = await request.json();
    validateBody(body, 'payrolls', companyId);
    const { year, month, employees = [] } = body;

    const db = getDb();

    let totalGross = 0;
    for (const emp of employees) {
      totalGross += Number(emp.grossSalary || 0);
    }

    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE Payroll SET
          year = ?,
          month = ?,
          sumWithVat = ?
        WHERE id = ? AND companyId = ?
      `).run(
        Number(year),
        Number(month),
        totalGross,
        id,
        companyId
      );

      // Replace employees
      db.prepare('DELETE FROM PayrollEmployee WHERE payrollId = ?').run(id);

      const insertEmp = db.prepare(`
        INSERT INTO PayrollEmployee (
          payrollId, employeeName, employeeCode, grossSalary,
          netSalary, gpm, sodraEmployee, sodraEmployer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const emp of employees) {
        insertEmp.run(
          id,
          emp.employeeName || 'Darbuotojas',
          emp.employeeCode || null,
          Number(emp.grossSalary || 0),
          Number(emp.netSalary || 0),
          Number(emp.gpm || 0),
          Number(emp.sodraEmployee || 0),
          Number(emp.sodraEmployer || 0)
        );
      }
    });

    updateTx();

    const updated = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM PayrollEmployee WHERE payrollId = p.id) as empCount,
        (SELECT SUM(netSalary) FROM PayrollEmployee WHERE payrollId = p.id) as totalNet,
        (SELECT SUM(grossSalary) FROM PayrollEmployee WHERE payrollId = p.id) as totalGross
      FROM Payroll p
      WHERE p.id = ? AND p.companyId = ?
    `).get(id, companyId);

    return NextResponse.json({ success: true, payroll: updated });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { id: idStr } = await context.params;
    const id = Number(idStr);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const companyId = await getActiveCompanyId();
    if (!getDb().prepare('SELECT id FROM Payroll WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    // A payroll posted from a payroll calculation (/payroll) is changed only there.
    if (getDb().prepare('SELECT 1 FROM PayrollRun WHERE payrollId = ?').get(id)) return NextResponse.json({ error: 'Šis žiniaraštis užregistruotas iš DU skaičiavimo; keiskite jį skiltyje „DU skaičiavimas“' }, { status: 409 });
    const db = getDb();

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM PayrollEmployee WHERE payrollId = ?').run(id);
      db.prepare('DELETE FROM Payroll WHERE id = ? AND companyId = ?').run(id, companyId);
    });

    deleteTx();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
