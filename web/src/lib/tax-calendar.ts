import type Database from 'better-sqlite3';
import { companyTaxMode, validTaxDate } from './tax';
import { HttpError } from './errors';
import { rules } from './rules/registry';
import { todayVilnius } from './dates';

export type ObligationCode = 'FR0600' | 'FR0564' | 'GPM313' | 'GPM312' | 'PLN204';
export type VatPeriod = 'MONTH' | 'QUARTER' | 'HALF';
export interface CalendarEvent { code: ObligationCode; title: string; periodStart: string; periodEnd: string; dueNominal: string; dueWorkingDay: string; source: string; done: boolean; doneAt: number | null; submittedDate: string | null; registrationNo: string | null; note: string | null; }
export interface ObligationSetting { code: ObligationCode; enabled: boolean; period: VatPeriod | null; auto: boolean; reason: string; }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const lastDay = (y: number, m: number) => utc(y, m + 1, 0).getUTCDate();
export const OBLIGATION_CODES: ObligationCode[] = ['FR0600', 'FR0564', 'GPM313', 'GPM312', 'PLN204'];

// Gregorian (Meeus/Jones/Butcher) Easter Sunday.
export function easter(year: number) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1, day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month, day);
}

// Lithuanian public holidays (fixed dates, Easter Sunday/Monday, All Souls' Day on 2 November).
export function isHoliday(date: string) {
  const y = Number(date.slice(0, 4));
  const fixed = ['01-01', '02-16', '03-11', '05-01', '06-24', '07-06', '08-15', '11-01', '11-02', '12-24', '12-25', '12-26'];
  if (fixed.includes(date.slice(5))) return true;
  const sunday = easter(y);
  const monday = new Date(sunday.getTime() + 86_400_000);
  return date === iso(sunday) || date === iso(monday);
}
export function isWorkingDay(date: string) {
  const day = new Date(date + 'T00:00:00Z').getUTCDay();
  return day !== 0 && day !== 6 && !isHoliday(date);
}
export function nextWorkingDay(date: string) {
  let d = new Date(date + 'T00:00:00Z');
  while (!isWorkingDay(iso(d))) d = new Date(d.getTime() + 86_400_000);
  return iso(d);
}

function monthsAfter(y: number, m: number, add: number, day: number) { return iso(utc(y, m + add, Math.min(day, 28))); }

// Deadlines come from the rules registry, as valid on the last day of the period.
const dueDay = (ruleId: string, periodEnd: string) => rules.number(ruleId, periodEnd);
const nextYearDue = (ruleId: string, year: number) => `${year + 1}-${rules.at(ruleId, `${year}-12-31`)}`;

// Periods with the due day `dueRule` in the month after the period.
function vatPeriods(period: VatPeriod, from: number, to: number, dueRule: string) {
  const out: { start: string; end: string; due: string; day: number }[] = [];
  const step = period === 'MONTH' ? 1 : period === 'QUARTER' ? 3 : 6;
  for (let y = from; y <= to; y++) for (let m = 0; m < 12; m += step) {
    const endMonth = m + step - 1;
    const end = iso(utc(y, endMonth, lastDay(y, endMonth)));
    const day = dueDay(dueRule, end);
    out.push({ start: iso(utc(y, m, 1)), end, due: monthsAfter(y, endMonth, 1, day), day });
  }
  return out;
}

// Payroll booked for the year (or one month): GPM313/GPM312 exist only for companies that paid out employment income.
export function hasPayroll(db: Database.Database, companyId: number, year: number, month?: number) {
  const m = month ? ' AND month=?' : '';
  const args = month ? [companyId, year, month] : [companyId, year];
  return Boolean(db.prepare(`SELECT 1 FROM Payroll WHERE companyId=? AND year=?${m}`).get(...args))
    || Boolean(db.prepare(`SELECT 1 FROM PayrollRun WHERE companyId=? AND year=?${m} AND status='POSTED'`).get(...args));
}

// The VAT forms need a VAT payer code; GPM313/GPM312 need payroll once the period is over (a future period cannot be judged yet).
export function obligationRelevant(db: Database.Database, companyId: number, code: ObligationCode, periodStart: string, periodEnd: string, today: string) {
  if (code === 'FR0600' || code === 'FR0564') return hasVatCode(db, companyId);
  if (periodEnd >= today) return true;
  if (code === 'GPM313') return hasPayroll(db, companyId, Number(periodStart.slice(0, 4)), Number(periodStart.slice(5, 7)));
  if (code === 'GPM312') return hasPayroll(db, companyId, Number(periodStart.slice(0, 4)));
  return true;
}
function hasVatCode(db: Database.Database, companyId: number) {
  const row = db.prepare('SELECT vatCode FROM Company WHERE id=?').get(companyId) as { vatCode: string | null } | undefined;
  return Boolean((row?.vatCode || '').trim());
}

export function loadSettings(db: Database.Database, companyId: number, today: string): ObligationSetting[] {
  const rows = new Map((db.prepare('SELECT code, enabled, period FROM CompanyObligation WHERE companyId=?').all(companyId) as { code: ObligationCode; enabled: number; period: VatPeriod | null }[]).map(r => [r.code, r]));
  const vat = hasVatCode(db, companyId);
  const standardVat = companyTaxMode(companyId, today) === 'STANDARD_VAT' && vat;
  return OBLIGATION_CODES.map(code => {
    const row = rows.get(code);
    if (code === 'FR0600') return { code, enabled: standardVat, period: row?.period || 'MONTH', auto: true, reason: standardVat ? 'Režimas STANDARD_VAT' : 'Ne PVM mokėtojas (NON_VAT/SVS arba be PVM kodo): deklaracija neteikiama' };
    if (code === 'FR0564' && !vat) return { code, enabled: false, period: null, auto: true, reason: 'Įmonė neturi PVM mokėtojo kodo: ataskaita neteikiama' };
    return { code, enabled: Boolean(row?.enabled), period: null, auto: false, reason: row?.enabled ? 'Įjungta rankiniu būdu' : 'Išjungta: įjunkite, jei prievolė taikoma įmonei' };
  });
}

// Events whose nominal due date falls inside [from, to]. Working-day carry-over is shown separately and is not verified against a source.
export function calendarEvents(db: Database.Database, companyId: number, from: string, to: string, today: string = todayVilnius()): CalendarEvent[] {
  const settings = loadSettings(db, companyId, to);
  const done = new Map((db.prepare('SELECT code, periodEnd, doneAt FROM ObligationDone WHERE companyId=?').all(companyId) as { code: string; periodEnd: string; doneAt: number }[]).map(r => [`${r.code}|${r.periodEnd}`, r.doneAt]));
  const submissions = new Map((db.prepare('SELECT code, periodEnd, submittedDate, registrationNo, note FROM ObligationSubmission WHERE companyId=?').all(companyId) as { code: string; periodEnd: string; submittedDate: string; registrationNo: string | null; note: string | null }[]).map(r => [`${r.code}|${r.periodEnd}`, r]));
  const y0 = Number(from.slice(0, 4)) - 1, y1 = Number(to.slice(0, 4));
  const events: CalendarEvent[] = [];
  const push = (code: ObligationCode, title: string, start: string, end: string, due: string, source: string) => {
    if (due < from || due > to) return;
    const doneAt = done.get(`${code}|${end}`) ?? null;
    const sub = submissions.get(`${code}|${end}`);
    // A period already marked as filed stays visible even if the relevance rule would now hide it.
    if (doneAt === null && !obligationRelevant(db, companyId, code, start, end, today)) return;
    events.push({ code, title, periodStart: start, periodEnd: end, dueNominal: due, dueWorkingDay: nextWorkingDay(due), source, done: doneAt !== null, doneAt, submittedDate: sub?.submittedDate ?? null, registrationNo: sub?.registrationNo ?? null, note: sub?.note ?? null });
  };
  for (const s of settings.filter(x => x.enabled)) {
    if (s.code === 'FR0600') for (const p of vatPeriods(s.period || 'MONTH', y0, y1, 'vat.return.dueDay')) push('FR0600', 'PVM deklaracija FR0600', p.start, p.end, p.due, `VMI KM1112: iki kito laikotarpio pirmo mėnesio ${p.day} d.`);
    if (s.code === 'FR0564') for (const p of vatPeriods('MONTH', y0, y1, 'calendar.fr0564.dueDay')) push('FR0564', 'Prekių ir paslaugų tiekimo į ES ataskaita FR0564', p.start, p.end, p.due, `VMI lentelė FR0600 + i.SAF: iki kito mėnesio ${p.day} d.`);
    if (s.code === 'GPM313') for (const p of vatPeriods('MONTH', y0, y1, 'calendar.gpm313.dueDay')) push('GPM313', 'Mėnesinė pajamų deklaracija GPM313', p.start, p.end, p.due, `VMI: iki kito mėnesio ${p.day} d.`);
    if (s.code === 'GPM312') for (let y = y0; y <= y1; y++) push('GPM312', 'Metinė pajamų deklaracija GPM312', `${y}-01-01`, `${y}-12-31`, nextYearDue('calendar.gpm312.due', y), 'VMI: iki kitų metų vasario 15 d.');
    if (s.code === 'PLN204') for (let y = y0; y <= y1; y++) push('PLN204', 'Metinė pelno mokesčio deklaracija PLN204', `${y}-01-01`, `${y}-12-31`, nextYearDue('calendar.pln204.due', y), 'VMI: kalendoriniams metams iki kitų metų birželio 15 d.');
  }
  return events.sort((a, b) => a.dueNominal.localeCompare(b.dueNominal) || a.code.localeCompare(b.code));
}

// "Mark as submitted": the date (default today), an optional registration number and note. ObligationDone stays the single source of "done"
// (the calendar and the reminders read it); ObligationSubmission keeps the details.
export function markObligationDone(db: Database.Database, companyId: number, code: ObligationCode, periodEnd: string, input: { submittedDate?: unknown; registrationNo?: unknown; note?: unknown } = {}, today: string = todayVilnius(), now: number = Date.now()) {
  const submittedDate = input.submittedDate == null || input.submittedDate === '' ? today : input.submittedDate;
  if (typeof submittedDate !== 'string' || !validTaxDate(submittedDate)) throw new HttpError(400, 'Neteisinga pateikimo data');
  const text = (value: unknown, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
  const registrationNo = text(input.registrationNo, 100), note = text(input.note, 500);
  db.transaction(() => {
    db.prepare('INSERT OR REPLACE INTO ObligationDone(companyId,code,periodEnd,doneAt,note) VALUES(?,?,?,?,?)').run(companyId, code, periodEnd, now, note);
    db.prepare('INSERT OR REPLACE INTO ObligationSubmission(companyId,code,periodEnd,submittedDate,registrationNo,note,createdAt) VALUES(?,?,?,?,?,?,?)').run(companyId, code, periodEnd, submittedDate, registrationNo, note, now);
  })();
}
export function unmarkObligationDone(db: Database.Database, companyId: number, code: ObligationCode, periodEnd: string) {
  db.transaction(() => {
    db.prepare('DELETE FROM ObligationDone WHERE companyId=? AND code=? AND periodEnd=?').run(companyId, code, periodEnd);
    db.prepare('DELETE FROM ObligationSubmission WHERE companyId=? AND code=? AND periodEnd=?').run(companyId, code, periodEnd);
  })();
}
