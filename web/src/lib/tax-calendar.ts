import type Database from 'better-sqlite3';
import { companyTaxMode } from './tax';

export type ObligationCode = 'FR0600' | 'FR0564' | 'GPM313' | 'GPM312' | 'PLN204';
export type VatPeriod = 'MONTH' | 'QUARTER' | 'HALF';
export interface CalendarEvent { code: ObligationCode; title: string; periodStart: string; periodEnd: string; dueNominal: string; dueWorkingDay: string; source: string; done: boolean; doneAt: number | null; }
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

function vatPeriods(period: VatPeriod, from: number, to: number) {
  const out: { start: string; end: string; due: string }[] = [];
  const step = period === 'MONTH' ? 1 : period === 'QUARTER' ? 3 : 6;
  for (let y = from; y <= to; y++) for (let m = 0; m < 12; m += step) {
    const endMonth = m + step - 1;
    out.push({ start: iso(utc(y, m, 1)), end: iso(utc(y, endMonth, lastDay(y, endMonth))), due: monthsAfter(y, endMonth, 1, 25) });
  }
  return out;
}

export function loadSettings(db: Database.Database, companyId: number, today: string): ObligationSetting[] {
  const rows = new Map((db.prepare('SELECT code, enabled, period FROM CompanyObligation WHERE companyId=?').all(companyId) as { code: ObligationCode; enabled: number; period: VatPeriod | null }[]).map(r => [r.code, r]));
  const standardVat = companyTaxMode(companyId, today) === 'STANDARD_VAT';
  return OBLIGATION_CODES.map(code => {
    const row = rows.get(code);
    if (code === 'FR0600') return { code, enabled: standardVat, period: row?.period || 'MONTH', auto: true, reason: standardVat ? 'Režimas STANDARD_VAT' : 'Ne PVM mokėtojas (NON_VAT/SVS): deklaracija neteikiama' };
    return { code, enabled: Boolean(row?.enabled), period: null, auto: false, reason: row?.enabled ? 'Įjungta rankiniu būdu' : 'Išjungta: įjunkite, jei prievolė taikoma įmonei' };
  });
}

// Events whose nominal due date falls inside [from, to]. Working-day carry-over is shown separately and is not verified against a source.
export function calendarEvents(db: Database.Database, companyId: number, from: string, to: string): CalendarEvent[] {
  const settings = loadSettings(db, companyId, to);
  const done = new Map((db.prepare('SELECT code, periodEnd, doneAt FROM ObligationDone WHERE companyId=?').all(companyId) as { code: string; periodEnd: string; doneAt: number }[]).map(r => [`${r.code}|${r.periodEnd}`, r.doneAt]));
  const y0 = Number(from.slice(0, 4)) - 1, y1 = Number(to.slice(0, 4));
  const events: CalendarEvent[] = [];
  const push = (code: ObligationCode, title: string, start: string, end: string, due: string, source: string) => {
    if (due < from || due > to) return;
    const doneAt = done.get(`${code}|${end}`) ?? null;
    events.push({ code, title, periodStart: start, periodEnd: end, dueNominal: due, dueWorkingDay: nextWorkingDay(due), source, done: doneAt !== null, doneAt });
  };
  for (const s of settings.filter(x => x.enabled)) {
    if (s.code === 'FR0600') for (const p of vatPeriods(s.period || 'MONTH', y0, y1)) push('FR0600', 'PVM deklaracija FR0600', p.start, p.end, p.due, 'VMI KM1112: iki kito laikotarpio pirmo mėnesio 25 d.');
    if (s.code === 'FR0564') for (const p of vatPeriods('MONTH', y0, y1)) push('FR0564', 'Prekių ir paslaugų tiekimo į ES ataskaita FR0564', p.start, p.end, p.due, 'VMI lentelė FR0600 + i.SAF: iki kito mėnesio 25 d.');
    if (s.code === 'GPM313') for (const p of vatPeriods('MONTH', y0, y1)) push('GPM313', 'Mėnesinė pajamų deklaracija GPM313', p.start, p.end, monthsAfter(Number(p.end.slice(0, 4)), Number(p.end.slice(5, 7)) - 1, 1, 15), 'VMI: iki kito mėnesio 15 d.');
    if (s.code === 'GPM312') for (let y = y0; y <= y1; y++) push('GPM312', 'Metinė pajamų deklaracija GPM312', `${y}-01-01`, `${y}-12-31`, `${y + 1}-02-15`, 'VMI: iki kitų metų vasario 15 d.');
    if (s.code === 'PLN204') for (let y = y0; y <= y1; y++) push('PLN204', 'Metinė pelno mokesčio deklaracija PLN204', `${y}-01-01`, `${y}-12-31`, `${y + 1}-06-15`, 'VMI: kalendoriniams metams iki kitų metų birželio 15 d.');
  }
  return events.sort((a, b) => a.dueNominal.localeCompare(b.dueNominal) || a.code.localeCompare(b.code));
}
