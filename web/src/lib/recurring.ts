import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { getDb } from './db';
import { createInvoice } from './sales';
import { getNextDocumentNumber } from './numbering';
import { validTaxDate } from './tax';
import { todayVilnius } from './dates';

export type Frequency = 'MONTH' | 'QUARTER' | 'YEAR';
export interface TemplateLine { itemName: string; itemCode?: string; quantity: number; price: number; vatRate: number; }
export interface Template { id: number; companyId: number; name: string; clientId: number; series: string; frequency: Frequency; nextDate: string; anchorDay: number; endDate: string | null; payDays: number; notes: string | null; items: TemplateLine[]; active: boolean; }

const STEP: Record<Frequency, number> = { MONTH: 1, QUARTER: 3, YEAR: 12 };
const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
export const addDays = (date: string, days: number) => new Date(new Date(date + 'T00:00:00Z').getTime() + days * 86_400_000).toISOString().slice(0, 10);

// Next occurrence keeps the original day of month (clamped to the month length), so 31 Jan -> 28 Feb -> 31 Mar.
export function advance(date: string, anchorDay: number, frequency: Frequency) {
  const total = Number(date.slice(0, 4)) * 12 + (Number(date.slice(5, 7)) - 1) + STEP[frequency];
  const y = Math.floor(total / 12), m = total % 12;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(y, m, Math.min(anchorDay, last));
}

function parseLines(value: unknown): TemplateLine[] {
  if (!Array.isArray(value) || !value.length || value.length > 200) throw new HttpError(400, 'Šablone turi būti nuo 1 iki 200 eilučių');
  return value.map(raw => {
    const line = raw as Partial<TemplateLine>;
    if (!line || typeof line.itemName !== 'string' || !line.itemName.trim() || line.itemName.length > 300) throw new HttpError(400, 'Nurodykite eilutės pavadinimą');
    const quantity = Number(line.quantity), price = Number(line.price), vatRate = Number(line.vatRate ?? 0);
    if (!(quantity > 0) || !(price >= 0) || !Number.isFinite(price) || !(vatRate >= 0 && vatRate <= 100)) throw new HttpError(400, 'Neteisingas kiekis, kaina arba PVM tarifas');
    return { itemName: line.itemName.trim(), itemCode: typeof line.itemCode === 'string' ? line.itemCode.slice(0, 100) : '', quantity, price, vatRate };
  });
}

export function parseTemplate(db: Database.Database, companyId: number, body: any) {
  if (!body || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) throw new HttpError(400, 'Nurodykite šablono pavadinimą');
  const clientId = Number(body.clientId);
  if (!Number.isSafeInteger(clientId) || !db.prepare('SELECT 1 FROM Client WHERE id=? AND companyId=?').get(clientId, companyId)) throw new HttpError(400, 'Klientas nerastas šioje įmonėje');
  if (!['MONTH', 'QUARTER', 'YEAR'].includes(body.frequency)) throw new HttpError(400, 'Periodiškumas: MONTH, QUARTER arba YEAR');
  if (!validTaxDate(body.nextDate)) throw new HttpError(400, 'Neteisinga kitos sąskaitos data');
  if (body.endDate != null && body.endDate !== '' && (!validTaxDate(body.endDate) || body.endDate < body.nextDate)) throw new HttpError(400, 'Neteisinga pabaigos data');
  const payDays = body.payDays == null ? 14 : Number(body.payDays);
  if (!Number.isInteger(payDays) || payDays < 0 || payDays > 365) throw new HttpError(400, 'Apmokėjimo terminas: nuo 0 iki 365 dienų');
  const series = typeof body.series === 'string' && body.series.trim() ? body.series.trim().slice(0, 20) : 'SF';
  return { name: body.name.trim(), clientId, frequency: body.frequency as Frequency, nextDate: body.nextDate as string, anchorDay: Number(body.nextDate.slice(8, 10)), endDate: body.endDate || null, payDays, series, notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null, items: parseLines(body.items) };
}

export function listTemplates(db: Database.Database, companyId: number): (Template & { clientName: string; due: boolean; runs: number })[] {
  const today = todayVilnius();
  const rows = db.prepare(`SELECT r.*, c.name clientName, (SELECT COUNT(*) FROM RecurringRun x WHERE x.recurringId=r.id) runs FROM RecurringInvoice r JOIN Client c ON c.id=r.clientId WHERE r.companyId=? ORDER BY r.active DESC, r.nextDate, r.id`).all(companyId) as any[];
  return rows.map(r => ({ id: r.id, companyId: r.companyId, name: r.name, clientId: r.clientId, clientName: r.clientName, series: r.series, frequency: r.frequency, nextDate: r.nextDate, anchorDay: r.anchorDay, endDate: r.endDate, payDays: r.payDays, notes: r.notes, items: JSON.parse(r.itemsJson), active: Boolean(r.active), runs: r.runs, due: Boolean(r.active) && r.nextDate <= today }));
}

// Issues the invoice for the template's current period. A period can be issued only once (RecurringRun primary key).
export function issueRecurring(companyId: number, id: number, options: { number?: string; saleDate?: string } = {}) {
  const db = getDb();
  const today = todayVilnius();
  return db.transaction(() => {
    const row = db.prepare('SELECT r.*, c.name clientName, c.code clientCode, c.vatCode clientVatCode FROM RecurringInvoice r JOIN Client c ON c.id=r.clientId WHERE r.id=? AND r.companyId=?').get(id, companyId) as any;
    if (!row) throw new HttpError(404, 'Šablonas nerastas');
    if (!row.active) throw new HttpError(409, 'Šablonas išjungtas');
    if (row.nextDate > today) throw new HttpError(409, `Kitos sąskaitos terminas dar neatėjo: ${row.nextDate}`);
    if (db.prepare('SELECT 1 FROM RecurringRun WHERE recurringId=? AND periodDate=?').get(id, row.nextDate)) throw new HttpError(409, 'Sąskaita už šį laikotarpį jau išrašyta');
    const saleDate = options.saleDate ?? today;
    if (!validTaxDate(saleDate)) throw new HttpError(400, 'Neteisinga sąskaitos data');
    const existing = db.prepare('SELECT series, number FROM Sale WHERE companyId=? AND series=?').all(companyId, row.series);
    const number = options.number?.trim() || getNextDocumentNumber(existing, 'number', { seriesKey: 'series', series: row.series, defaultWidth: 6 });
    const { sale, items, saleId } = createInvoice(companyId, {
      series: row.series, number, saleDate, payUntil: addDays(saleDate, row.payDays), statusName: 'Neapmokėta',
      clientId: row.clientId, clientName: row.clientName, clientCode: row.clientCode, clientVatCode: row.clientVatCode,
      notes: row.notes, items: JSON.parse(row.itemsJson),
    });
    db.prepare('INSERT INTO RecurringRun(recurringId,periodDate,saleId,createdAt) VALUES(?,?,?,?)').run(id, row.nextDate, saleId, Date.now());
    const next = advance(row.nextDate, row.anchorDay, row.frequency);
    const finished = row.endDate && next > row.endDate;
    db.prepare('UPDATE RecurringInvoice SET nextDate=?, active=? WHERE id=?').run(next, finished ? 0 : 1, id);
    return { sale, items, nextDate: next, finished: Boolean(finished), periodDate: row.nextDate };
  })();
}
