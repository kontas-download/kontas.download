import { HttpError } from './errors';
import { getDb } from './db';
import { calculateLine, money } from './money';
export function dateValue(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new HttpError(400, 'Neteisinga data');
}
export function validateBody(body: Record<string, unknown>, kind: string, companyId: number) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Tikimasi objekto');
  const db = getDb();
  if (body.clientId != null && body.clientId !== '') {
    const id = Number(body.clientId);
    if (!Number.isSafeInteger(id) || id <= 0 || !db.prepare('SELECT id FROM Client WHERE id = ? AND companyId = ?').get(id, companyId)) throw new HttpError(400, 'Kontrahentas nepriklauso dabartinei įmonei');
  }
  for (const key of ['date','saleDate','purchaseDate','payUntil']) if (body[key] != null && body[key] !== '') dateValue(body[key]);
  if (kind === 'invoices' || kind === 'purchases') {
    if (typeof body.number !== 'string' || !body.number.trim() || body.number.length > 100) throw new HttpError(400, 'Nurodykite dokumento numerį');
    dateValue(body[kind === 'invoices' ? 'saleDate' : 'purchaseDate']);
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 1000) throw new HttpError(400, 'Dokumentą turi sudaryti nuo 1 iki 1000 eilučių');
    for (const item of body.items) {
      if (!item || typeof item !== 'object' || typeof item.itemName !== 'string' || !item.itemName.trim()) throw new HttpError(400, 'Nurodykite eilutės pavadinimą');
      calculateLine(item);
    }
  }
  if (kind === 'bank' || kind === 'ledger') {
    dateValue(body.date);
    const key = kind === 'bank' ? 'sum' : 'amount';
    body[key] = money(body[key]);
    if (body[key] === 0 || (kind === 'ledger' && Number(body[key]) < 0)) throw new HttpError(400, 'Neteisinga suma');
  }
  if (kind === 'ledger') {
    for (const key of ['debitAccount','creditAccount']) if (typeof body[key] !== 'string' || !db.prepare('SELECT id FROM ChartOfAccount WHERE code = ?').get(body[key])) throw new HttpError(400, 'Nežinoma apskaitos sąskaita');
    if (body.debitAccount === body.creditAccount) throw new HttpError(400, 'Debetas ir kreditas turi skirtis');
  }
  if (kind === 'payrolls') {
    if (!Number.isInteger(Number(body.year)) || Number(body.year) < 1900 || Number(body.year) > 9999 || !Number.isInteger(Number(body.month)) || Number(body.month) < 1 || Number(body.month) > 12) throw new HttpError(400, 'Neteisingas laikotarpis');
    if (!Array.isArray(body.employees) || !body.employees.length || body.employees.length > 1000) throw new HttpError(400, 'Nurodykite darbuotojus');
    for (const employee of body.employees) {
      if (!employee || typeof employee.employeeName !== 'string' || !employee.employeeName.trim()) throw new HttpError(400, 'Nurodykite darbuotojo vardą');
      for (const key of ['grossSalary','netSalary','gpm','sodraEmployee','sodraEmployer']) {
        employee[key] = money(employee[key] ?? 0);
        if (employee[key] < 0) throw new HttpError(400, 'Sukaupimai negali būti neigiami');
      }
      if (Math.round(employee.grossSalary * 100) !== Math.round(employee.netSalary * 100) + Math.round(employee.gpm * 100) + Math.round(employee.sodraEmployee * 100)) throw new HttpError(400, 'Apskaičiuotas atlyginimas nesutampa su išmokama suma ir išskaitomis');
    }
  }
}
