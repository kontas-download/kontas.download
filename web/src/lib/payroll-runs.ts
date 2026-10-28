import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { money } from './money';
import { todayVilnius } from './dates';
import { calculatePayslip, isOverrideField, payrollDate, payrollParams, type OverrideField, type PayrollParams, type Payslip, type PayslipOverrides } from './payroll-calc';

// Employees and monthly payroll runs: create a draft from the active employees, recalculate it with the registry parameters of
// the month, let the accountant change gross pay or set any amount by hand (the last word, logged with a reason), mark it
// verified and post it to the ledger through the existing Payroll/PayrollEmployee tables.

export interface EmployeeRow {
  id: number; companyId: number; name: string; personalCode: string | null; position: string | null; baseSalary: number;
  contractType: 'OPEN' | 'FIXED'; applyNpd: number; pensionAccumulation: number; accidentRate: number | null;
  startDate: string | null; endDate: string | null; active: number;
}
interface RunRow {
  id: number; companyId: number; year: number; month: number; status: 'DRAFT' | 'POSTED'; payoutDate: string | null; paramsJson: string; rulesProvisional: number;
  verifiedAt: string | null; verifiedBy: number | null; payrollId: number | null; createdAt: string; updatedAt: string;
}
interface LineRow {
  id: number; runId: number; employeeId: number; employeeName: string; employeeCode: string | null; gross: number;
  ytdGrossBefore: number; ytdSodraBaseBefore: number; settingsJson: string; calcJson: string; overridesJson: string; resultJson: string;
}
interface LineSettings { applyNpd: boolean; pensionAccumulation: boolean; fixedTerm: boolean; accidentRate: number | null }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const text = (value: unknown, max: number) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Neteisingas tekstas');
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpError(400, 'Per ilgas tekstas');
  return trimmed || null;
};
const flag = (value: unknown, fallback: boolean) => value === undefined ? fallback : value === true || value === 1;
const date = (value: unknown) => {
  const v = text(value, 10);
  if (v !== null && (!ISO.test(v) || new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) !== v)) throw new HttpError(400, 'Neteisinga data');
  return v;
};

function log(db: Database.Database, companyId: number, entry: { runId?: number | null; lineId?: number | null; employeeName?: string | null; action: string; field?: string | null; calculatedValue?: number | null; oldValue?: number | null; newValue?: number | null; reason?: string | null; actorId: number | null }) {
  db.prepare('INSERT INTO PayrollLog(companyId,runId,lineId,employeeName,action,field,calculatedValue,oldValue,newValue,reason,actorId) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(companyId, entry.runId ?? null, entry.lineId ?? null, entry.employeeName ?? null, entry.action, entry.field ?? null, entry.calculatedValue ?? null, entry.oldValue ?? null, entry.newValue ?? null, entry.reason ?? null, entry.actorId);
}

// ---------- Employees ----------

export function listEmployees(db: Database.Database, companyId: number): EmployeeRow[] {
  return db.prepare('SELECT * FROM Employee WHERE companyId=? ORDER BY active DESC, name COLLATE NOCASE, id').all(companyId) as EmployeeRow[];
}

function employeeValues(body: Record<string, unknown>, current?: EmployeeRow) {
  const name = text(body.name ?? current?.name, 200);
  if (!name) throw new HttpError(400, 'Nurodykite darbuotojo vardą ir pavardę');
  const contractType = body.contractType ?? current?.contractType ?? 'OPEN';
  if (contractType !== 'OPEN' && contractType !== 'FIXED') throw new HttpError(400, 'Neteisinga sutarties rūšis');
  const baseSalary = money(body.baseSalary ?? current?.baseSalary ?? 0);
  if (baseSalary < 0) throw new HttpError(400, 'Atlyginimas negali būti neigiamas');
  let accidentRate: number | null = body.accidentRate === undefined ? current?.accidentRate ?? null : body.accidentRate === null || body.accidentRate === '' ? null : Number(body.accidentRate);
  if (accidentRate !== null) {
    const p = payrollParams(todayVilnius());
    if (!Number.isFinite(accidentRate) || accidentRate < p.accidentMin || accidentRate > p.accidentMax) throw new HttpError(400, `Nelaimingų atsitikimų tarifas turi būti tarp ${p.accidentMin} ir ${p.accidentMax} %`);
    accidentRate = Math.round(accidentRate * 100) / 100;
  }
  const startDate = body.startDate === undefined ? current?.startDate ?? null : date(body.startDate);
  const endDate = body.endDate === undefined ? current?.endDate ?? null : date(body.endDate);
  if (startDate && endDate && endDate < startDate) throw new HttpError(400, 'Darbo pabaiga negali būti ankstesnė už pradžią');
  return {
    name,
    personalCode: body.personalCode === undefined ? current?.personalCode ?? null : text(body.personalCode, 20),
    position: body.position === undefined ? current?.position ?? null : text(body.position, 200),
    baseSalary,
    contractType,
    applyNpd: flag(body.applyNpd, current ? current.applyNpd === 1 : true) ? 1 : 0,
    pensionAccumulation: flag(body.pensionAccumulation, current ? current.pensionAccumulation === 1 : false) ? 1 : 0,
    accidentRate,
    startDate,
    endDate,
    active: flag(body.active, current ? current.active === 1 : true) ? 1 : 0,
  };
}

export function createEmployee(db: Database.Database, companyId: number, body: Record<string, unknown>): EmployeeRow {
  const v = employeeValues(body);
  const res = db.prepare('INSERT INTO Employee(companyId,name,personalCode,position,baseSalary,contractType,applyNpd,pensionAccumulation,accidentRate,startDate,endDate,active) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(companyId, v.name, v.personalCode, v.position, v.baseSalary, v.contractType, v.applyNpd, v.pensionAccumulation, v.accidentRate, v.startDate, v.endDate, v.active);
  return db.prepare('SELECT * FROM Employee WHERE id=?').get(res.lastInsertRowid) as EmployeeRow;
}

function employee(db: Database.Database, companyId: number, id: number) {
  const row = db.prepare('SELECT * FROM Employee WHERE id=? AND companyId=?').get(id, companyId) as EmployeeRow | undefined;
  if (!row) throw new HttpError(404, 'Darbuotojas nerastas');
  return row;
}

export function updateEmployee(db: Database.Database, companyId: number, id: number, body: Record<string, unknown>): EmployeeRow {
  const v = employeeValues(body, employee(db, companyId, id));
  db.prepare("UPDATE Employee SET name=?,personalCode=?,position=?,baseSalary=?,contractType=?,applyNpd=?,pensionAccumulation=?,accidentRate=?,startDate=?,endDate=?,active=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND companyId=?")
    .run(v.name, v.personalCode, v.position, v.baseSalary, v.contractType, v.applyNpd, v.pensionAccumulation, v.accidentRate, v.startDate, v.endDate, v.active, id, companyId);
  return employee(db, companyId, id);
}

// An employee with payroll lines is kept for the history; deactivate them instead.
export function deleteEmployee(db: Database.Database, companyId: number, id: number) {
  employee(db, companyId, id);
  if (db.prepare('SELECT 1 FROM PayrollRunLine WHERE employeeId=?').get(id)) throw new HttpError(409, 'Darbuotojas turi DU skaičiavimų; vietoje ištrynimo pažymėkite jį neaktyviu');
  db.prepare('DELETE FROM Employee WHERE id=? AND companyId=?').run(id, companyId);
}

// ---------- Runs ----------

const settingsOf = (e: EmployeeRow): LineSettings => ({ applyNpd: e.applyNpd === 1, pensionAccumulation: e.pensionAccumulation === 1, fixedTerm: e.contractType === 'FIXED', accidentRate: e.accidentRate });

function ytd(db: Database.Database, companyId: number, employeeId: number, year: number, month: number) {
  const row = db.prepare(`SELECT COALESCE(SUM(l.gross),0) gross, COALESCE(SUM(l.sodraBase),0) base FROM PayrollRunLine l JOIN PayrollRun r ON r.id=l.runId
    WHERE r.companyId=? AND l.employeeId=? AND r.year=? AND r.month<? AND r.status='POSTED'`).get(companyId, employeeId, year, month) as { gross: number; base: number };
  return { gross: Math.round(row.gross * 100) / 100, base: Math.round(row.base * 100) / 100 };
}

function compute(params: PayrollParams, settings: LineSettings, gross: number, before: { gross: number; base: number }, overrides: PayslipOverrides) {
  const input = { gross, ytdGrossBefore: before.gross, ytdSodraBaseBefore: before.base, ...settings };
  try {
    const calc = calculatePayslip(input, params);
    const result = calculatePayslip(input, params, overrides);
    if (result.net < 0) throw new HttpError(400, 'Išskaitos viršija priskaičiuotą darbo užmokestį');
    return { calc, result };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, error instanceof Error ? error.message : 'Neteisingi duomenys');
  }
}

function writeLine(db: Database.Database, lineId: number, values: { gross: number; before: { gross: number; base: number }; settings: LineSettings; overrides: PayslipOverrides; calc: Payslip; result: Payslip; employeeName?: string; employeeCode?: string | null }) {
  const r = values.result;
  db.prepare(`UPDATE PayrollRunLine SET gross=?,ytdGrossBefore=?,ytdSodraBaseBefore=?,settingsJson=?,calcJson=?,overridesJson=?,resultJson=?,sodraBase=?,npd=?,gpm=?,employeeContributions=?,net=?,employerContributions=?
    ${values.employeeName !== undefined ? ',employeeName=?,employeeCode=?' : ''} WHERE id=?`)
    .run(values.gross, values.before.gross, values.before.base, JSON.stringify(values.settings), JSON.stringify(values.calc), JSON.stringify(values.overrides), JSON.stringify(r), r.sodraBase, r.npd, r.gpm, r.employeeContributions, r.net, r.employerContributions,
      ...(values.employeeName !== undefined ? [values.employeeName, values.employeeCode ?? null] : []), lineId);
}

function run(db: Database.Database, companyId: number, id: number) {
  const row = db.prepare('SELECT * FROM PayrollRun WHERE id=? AND companyId=?').get(id, companyId) as RunRow | undefined;
  if (!row) throw new HttpError(404, 'DU skaičiavimas nerastas');
  return row;
}
function draft(db: Database.Database, companyId: number, id: number) {
  const row = run(db, companyId, id);
  if (row.status !== 'DRAFT') throw new HttpError(409, 'Skaičiavimas jau užregistruotas apskaitoje; pirmiausia atšaukite registravimą');
  return row;
}
const touch = (db: Database.Database, id: number, params?: PayrollParams) => {
  if (params) db.prepare("UPDATE PayrollRun SET paramsJson=?,rulesProvisional=?,verifiedAt=NULL,verifiedBy=NULL,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(JSON.stringify(params), params.provisional ? 1 : 0, id);
  else db.prepare("UPDATE PayrollRun SET verifiedAt=NULL,verifiedBy=NULL,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);
};

function eligible(db: Database.Database, companyId: number, year: number, month: number) {
  const end = payrollDate(year, month);
  const start = `${end.slice(0, 7)}-01`;
  return (db.prepare('SELECT * FROM Employee WHERE companyId=? AND active=1 AND (startDate IS NULL OR startDate<=?) AND (endDate IS NULL OR endDate>=?) ORDER BY name COLLATE NOCASE, id').all(companyId, end, start)) as EmployeeRow[];
}

function paramsFor(year: number, month: number) {
  try { return payrollParams(payrollDate(year, month)); } catch (error) { throw new HttpError(400, error instanceof Error ? error.message : 'Taisyklių registre nėra parametrų'); }
}

function addLine(db: Database.Database, companyId: number, runId: number, year: number, month: number, params: PayrollParams, e: EmployeeRow) {
  const before = ytd(db, companyId, e.id, year, month);
  const settings = settingsOf(e);
  const { calc, result } = compute(params, settings, e.baseSalary, before, {});
  const res = db.prepare("INSERT INTO PayrollRunLine(runId,companyId,employeeId,employeeName,employeeCode,gross,settingsJson,calcJson,resultJson) VALUES(?,?,?,?,?,?,?,'{}','{}')")
    .run(runId, companyId, e.id, e.name, e.personalCode, e.baseSalary, JSON.stringify(settings));
  writeLine(db, Number(res.lastInsertRowid), { gross: e.baseSalary, before, settings, overrides: {}, calc, result });
}

export function createRun(db: Database.Database, companyId: number, yearValue: unknown, monthValue: unknown, actorId: number | null): number {
  const year = Number(yearValue), month = Number(monthValue);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, 'Neteisingi metai arba mėnuo');
  const params = paramsFor(year, month);
  return db.transaction(() => {
    if (db.prepare('SELECT 1 FROM PayrollRun WHERE companyId=? AND year=? AND month=?').get(companyId, year, month)) throw new HttpError(409, 'Šio mėnesio DU skaičiavimas jau yra');
    const res = db.prepare('INSERT INTO PayrollRun(companyId,year,month,paramsJson,rulesProvisional,createdBy) VALUES(?,?,?,?,?,?)').run(companyId, year, month, JSON.stringify(params), params.provisional ? 1 : 0, actorId);
    const runId = Number(res.lastInsertRowid);
    for (const e of eligible(db, companyId, year, month)) addLine(db, companyId, runId, year, month, params, e);
    log(db, companyId, { runId, action: 'CREATE', actorId });
    return runId;
  })();
}

// Recalculates every line with the current parameters, employee settings and earlier posted months; keeps gross pay and the
// accountant's overrides; adds employees who became eligible. Clears the verification.
export function recalculateRun(db: Database.Database, companyId: number, runId: number, actorId: number | null) {
  db.transaction(() => {
    const r = draft(db, companyId, runId);
    const params = paramsFor(r.year, r.month);
    const lines = db.prepare('SELECT * FROM PayrollRunLine WHERE runId=?').all(runId) as LineRow[];
    const present = new Set(lines.map(l => l.employeeId));
    for (const line of lines) {
      const e = db.prepare('SELECT * FROM Employee WHERE id=?').get(line.employeeId) as EmployeeRow;
      const settings = settingsOf(e);
      const before = ytd(db, companyId, e.id, r.year, r.month);
      const overrides = JSON.parse(line.overridesJson) as PayslipOverrides;
      const { calc, result } = compute(params, settings, line.gross, before, overrides);
      writeLine(db, line.id, { gross: line.gross, before, settings, overrides, calc, result, employeeName: e.name, employeeCode: e.personalCode });
    }
    for (const e of eligible(db, companyId, r.year, r.month)) if (!present.has(e.id)) addLine(db, companyId, runId, r.year, r.month, params, e);
    touch(db, runId, params);
    log(db, companyId, { runId, action: 'RECALCULATE', actorId });
  })();
}

function line(db: Database.Database, runId: number, lineId: number) {
  const row = db.prepare('SELECT * FROM PayrollRunLine WHERE id=? AND runId=?').get(lineId, runId) as LineRow | undefined;
  if (!row) throw new HttpError(404, 'Eilutė nerasta');
  return row;
}
function recomputeLine(db: Database.Database, r: RunRow, l: LineRow, gross: number, overrides: PayslipOverrides) {
  const params = JSON.parse(r.paramsJson) as PayrollParams;
  const settings = JSON.parse(l.settingsJson) as LineSettings;
  const before = { gross: l.ytdGrossBefore, base: l.ytdSodraBaseBefore };
  const { calc, result } = compute(params, settings, gross, before, overrides);
  writeLine(db, l.id, { gross, before, settings, overrides, calc, result });
  return { calc, result };
}

export function setLineGross(db: Database.Database, companyId: number, runId: number, lineId: number, grossValue: unknown, actorId: number | null) {
  const gross = money(grossValue);
  if (gross < 0) throw new HttpError(400, 'Atlyginimas negali būti neigiamas');
  db.transaction(() => {
    const r = draft(db, companyId, runId);
    const l = line(db, runId, lineId);
    recomputeLine(db, r, l, gross, JSON.parse(l.overridesJson));
    touch(db, runId);
    log(db, companyId, { runId, lineId, employeeName: l.employeeName, action: 'GROSS', field: 'gross', oldValue: l.gross, newValue: gross, actorId });
  })();
}

// Sets (value) or clears (null) an amount set by hand. A reason is required: the change is kept in the append-only PayrollLog.
export function overrideLine(db: Database.Database, companyId: number, runId: number, lineId: number, field: unknown, value: unknown, reasonValue: unknown, actorId: number | null) {
  if (!isOverrideField(field)) throw new HttpError(400, 'Neteisingas laukas');
  const reason = text(reasonValue, 500);
  if (!reason) throw new HttpError(400, 'Nurodykite rankinio pakeitimo priežastį');
  const amount = value === null || value === undefined || value === '' ? null : money(value);
  if (amount !== null && amount < 0) throw new HttpError(400, 'Suma negali būti neigiama');
  db.transaction(() => {
    const r = draft(db, companyId, runId);
    const l = line(db, runId, lineId);
    const overrides = JSON.parse(l.overridesJson) as PayslipOverrides;
    const old = (JSON.parse(l.resultJson) as Payslip)[field as OverrideField];
    if (amount === null) delete overrides[field]; else overrides[field] = amount;
    const { calc, result } = recomputeLine(db, r, l, l.gross, overrides);
    touch(db, runId);
    log(db, companyId, { runId, lineId, employeeName: l.employeeName, action: amount === null ? 'CLEAR_OVERRIDE' : 'OVERRIDE', field, calculatedValue: calc[field], oldValue: old, newValue: result[field], reason, actorId });
  })();
}

export function verifyRun(db: Database.Database, companyId: number, runId: number, actorId: number | null) {
  db.transaction(() => {
    run(db, companyId, runId);
    if (!(db.prepare('SELECT COALESCE(SUM(gross),0) g FROM PayrollRunLine WHERE runId=?').get(runId) as { g: number }).g) throw new HttpError(400, 'Skaičiavime nėra priskaičiuoto darbo užmokesčio');
    db.prepare("UPDATE PayrollRun SET verifiedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'),verifiedBy=? WHERE id=?").run(actorId, runId);
    log(db, companyId, { runId, action: 'VERIFY', actorId });
  })();
}

// Sets or clears the actual payout date of the monthly payroll run (used to split GPM313 field 6 <= 15th vs field 7 > 15th).
export function setRunPayoutDate(db: Database.Database, companyId: number, runId: number, payoutDateValue: unknown, actorId: number | null) {
  const payoutDate = payoutDateValue === '' ? null : date(payoutDateValue);
  db.transaction(() => {
    run(db, companyId, runId);
    db.prepare("UPDATE PayrollRun SET payoutDate=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(payoutDate, runId);
    log(db, companyId, { runId, action: 'PAYOUT_DATE', field: 'payoutDate', reason: payoutDate, actorId });
  })();
}

// Posts the run to the ledger: one Payroll document with one PayrollEmployee row per line; the existing ledger triggers create
// the entries (6304 against 4480 net pay, 4481 income tax, 4482 employee and employer contributions) on the last day of the month.
export function postRun(db: Database.Database, companyId: number, runId: number, actorId: number | null) {
  db.transaction(() => {
    const r = draft(db, companyId, runId);
    if (db.prepare("SELECT 1 FROM PayrollRun WHERE companyId=? AND year=? AND month>? AND status='POSTED'").get(companyId, r.year, r.month)) throw new HttpError(409, 'Pirmiau atšaukite vėlesnių mėnesių skaičiavimus.');
    const lines = db.prepare('SELECT * FROM PayrollRunLine WHERE runId=? ORDER BY employeeName COLLATE NOCASE, id').all(runId) as (LineRow & { gpm: number; employeeContributions: number; net: number; employerContributions: number })[];
    if (!lines.length) throw new HttpError(400, 'Skaičiavime nėra darbuotojų');
    // The year-to-date values were fixed when the line was calculated; if earlier months changed since, the stored sums are stale.
    for (const l of lines) {
      const now = ytd(db, companyId, l.employeeId, r.year, r.month);
      if (Math.abs(now.gross - l.ytdGrossBefore) > 0.004 || Math.abs(now.base - l.ytdSodraBaseBefore) > 0.004) throw new HttpError(409, 'Ankstesnių mėnesių sumos pasikeitė. Perskaičiuokite skaičiavimą.');
    }
    const totalGross = Math.round(lines.reduce((sum, l) => sum + l.gross * 100, 0)) / 100;
    if (!(totalGross > 0)) throw new HttpError(400, 'Skaičiavime nėra priskaičiuoto darbo užmokesčio');
    const payroll = db.prepare("INSERT INTO Payroll(companyId,year,month,sumWithVat,createdAt) VALUES(?,?,?,?,datetime('now'))").run(companyId, r.year, r.month, totalGross);
    const payrollId = Number(payroll.lastInsertRowid);
    const insert = db.prepare('INSERT INTO PayrollEmployee(payrollId,employeeName,employeeCode,grossSalary,netSalary,gpm,sodraEmployee,sodraEmployer) VALUES(?,?,?,?,?,?,?,?)');
    for (const l of lines) insert.run(payrollId, l.employeeName, l.employeeCode, l.gross, l.net, l.gpm, l.employeeContributions, l.employerContributions);
    db.prepare("UPDATE PayrollRun SET status='POSTED',payrollId=?,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(payrollId, runId);
    log(db, companyId, { runId, action: 'POST', actorId });
  })();
}

// Removes the ledger posting (subject to the accounting period lock) and returns the run to a draft.
export function unpostRun(db: Database.Database, companyId: number, runId: number, reasonValue: unknown, actorId: number | null) {
  const reason = text(reasonValue, 500);
  db.transaction(() => {
    const r = run(db, companyId, runId);
    if (r.status !== 'POSTED') throw new HttpError(409, 'Skaičiavimas neužregistruotas');
    if (db.prepare("SELECT 1 FROM PayrollRun WHERE companyId=? AND year=? AND month>? AND status='POSTED'").get(companyId, r.year, r.month)) throw new HttpError(409, 'Pirmiau atšaukite vėlesnių mėnesių skaičiavimus.');
    db.prepare("UPDATE PayrollRun SET status='DRAFT',payrollId=NULL,verifiedAt=NULL,verifiedBy=NULL,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(runId);
    if (r.payrollId) {
      db.prepare('DELETE FROM PayrollEmployee WHERE payrollId=?').run(r.payrollId);
      db.prepare('DELETE FROM Payroll WHERE id=? AND companyId=?').run(r.payrollId, companyId);
    }
    log(db, companyId, { runId, action: 'UNPOST', reason, actorId });
  })();
}

export function deleteRun(db: Database.Database, companyId: number, runId: number, actorId: number | null) {
  db.transaction(() => {
    draft(db, companyId, runId);
    db.prepare('DELETE FROM PayrollRun WHERE id=? AND companyId=?').run(runId, companyId);
    log(db, companyId, { runId, action: 'DELETE', actorId });
  })();
}

export function listRuns(db: Database.Database, companyId: number) {
  return db.prepare(`SELECT r.id,r.year,r.month,r.status,r.payoutDate,r.rulesProvisional,r.verifiedAt,r.payrollId,
      (SELECT COUNT(*) FROM PayrollRunLine WHERE runId=r.id) AS lineCount,
      (SELECT ROUND(COALESCE(SUM(gross),0),2) FROM PayrollRunLine WHERE runId=r.id) AS totalGross,
      (SELECT ROUND(COALESCE(SUM(net),0),2) FROM PayrollRunLine WHERE runId=r.id) AS totalNet
    FROM PayrollRun r WHERE r.companyId=? ORDER BY r.year DESC, r.month DESC`).all(companyId);
}

export function getRun(db: Database.Database, companyId: number, runId: number) {
  const r = run(db, companyId, runId);
  const lines = (db.prepare('SELECT * FROM PayrollRunLine WHERE runId=? ORDER BY employeeName COLLATE NOCASE, id').all(runId) as LineRow[]).map(l => ({
    id: l.id, employeeId: l.employeeId, employeeName: l.employeeName, gross: l.gross, ytdGrossBefore: l.ytdGrossBefore, ytdSodraBaseBefore: l.ytdSodraBaseBefore,
    settings: JSON.parse(l.settingsJson) as LineSettings, calc: JSON.parse(l.calcJson) as Payslip, result: JSON.parse(l.resultJson) as Payslip, overrides: JSON.parse(l.overridesJson) as PayslipOverrides,
  }));
  const log = db.prepare('SELECT l.*, u.name AS actorName FROM PayrollLog l LEFT JOIN User u ON u.id=l.actorId WHERE l.companyId=? AND l.runId=? ORDER BY l.id DESC').all(companyId, runId);
  const verifiedByName = r.verifiedBy ? (db.prepare('SELECT name FROM User WHERE id=?').get(r.verifiedBy) as { name: string } | undefined)?.name ?? null : null;
  return {
    run: { id: r.id, year: r.year, month: r.month, status: r.status, payoutDate: r.payoutDate ?? null, rulesProvisional: r.rulesProvisional === 1, verifiedAt: r.verifiedAt, verifiedByName, payrollId: r.payrollId, params: JSON.parse(r.paramsJson) as PayrollParams, date: payrollDate(r.year, r.month) },
    lines,
    log,
  };
}
