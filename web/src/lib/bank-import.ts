import { createHash } from 'node:crypto';

export interface ParsedRow { date: string; sum: number; clientName: string; details: string; reference: string; hash: string; line: number; account?: string; }
export interface ParseResult { rows: ParsedRow[]; errors: string[]; columns: Record<string, string>; ambiguousDirection: boolean; }

const ALIASES: Record<string, string[]> = {
  date: ['date', 'booking date', 'transaction date', 'data', 'operacijos data', 'mokejimo data', 'dата', 'дата', 'дата операции'],
  sum: ['amount', 'sum', 'suma', 'summa', 'сумма'],
  debit: ['debit', 'debetas', 'debet', 'дебет', 'isleista', 'paid out'],
  credit: ['credit', 'kreditas', 'kredit', 'кредит', 'gauta', 'paid in'],
  name: ['counterparty', 'name', 'beneficiary', 'payer', 'gavejas', 'mokejas', 'gavejas/mokejas', 'kontrahentas', 'контрагент', 'получатель', 'плательщик'],
  details: ['details', 'description', 'purpose', 'paskirtis', 'mokejimo paskirtis', 'aprasymas', 'назначение', 'описание'],
  indicator: ['d/k', 'dk', 'd k', 'debetas/kreditas', 'debit/credit', 'dc', 'cr/dr', 'cdt dbt', 'kryptis', 'direction', 'дебет/кредит', 'направление'],
  reference: ['reference', 'document no', 'dokumento nr', 'dokumento numeris', 'nr', 'номер', 'номер документа'],
};
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9а-я/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

function splitLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) { if (c === '"' && line[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === delimiter) { cells.push(cell); cell = ''; }
    else cell += c;
  }
  cells.push(cell);
  return cells.map(c => c.trim());
}

export function parseAmount(raw: string): number | null {
  let text = raw.replace(/[^\d,.\-+()]/g, '');
  if (!text) return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  if (text.startsWith('-')) { negative = !negative; text = text.slice(1); }
  text = text.replace(/^\+/, '');
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  else if (lastComma >= 0) text = /,\d{1,2}$/.test(text) ? text.replace(/,/g, '.') : text.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Math.round(Number(text) * 100) / 100;
  return negative ? -value : value;
}

export function parseDate(raw: string): string | null {
  const text = raw.trim().slice(0, 10);
  let y: string, m: string, d: string;
  let match = /^(\d{4})[-./](\d{2})[-./](\d{2})$/.exec(text);
  if (match) [, y, m, d] = match;
  else if ((match = /^(\d{2})[-./](\d{2})[-./](\d{4})$/.exec(text))) [, d, m, y] = match;
  else return null;
  const iso = `${y}-${m}-${d}`;
  const parsed = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

const DEBIT = new Set(['d', 'deb', 'debet', 'debetas', 'debit', 'dr', 'dbit', 'дебет', 'd.', '-']);
const CREDIT = new Set(['k', 'kred', 'kreditas', 'credit', 'cr', 'crdt', 'c', 'кредит', 'k.', '+']);
// Opening/closing balance and turnover rows look like transactions (date + amount) but are not.
const SUMMARY_ROW = /^(pradinis likutis|galutinis likutis|likutis laikotarpio pradzioje|likutis laikotarpio pabaigoje|opening balance|closing balance|turnover|apyvarta|is viso|total)$|^(pradinis|galutinis) likutis|^(opening|closing) balance/;

// Generic CSV statement parser. Any invalid row is reported; the caller must not import a partially valid file.
export function parseBankCsv(text: string, companyId: number, account = 'Bank'): ParseResult {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const errors: string[] = [];
  if (lines.length < 2) return { rows: [], errors: ['Failas tuščias arba jame nėra duomenų eilučių'], columns: {}, ambiguousDirection: false };
  if (lines.length > 20001) return { rows: [], errors: ['Failas per didelis: daugiausia 20000 operacijų'], columns: {}, ambiguousDirection: false };
  const counts = { ';': 0, ',': 0, '\t': 0 };
  for (const d of Object.keys(counts) as (keyof typeof counts)[]) counts[d] = splitLine(lines[0], d).length;
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]) as string;
  const header = splitLine(lines[0], delimiter).map(fold);
  const index: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    const at = header.findIndex(h => names.map(fold).includes(h));
    if (at >= 0) index[field] = at;
  }
  if (index.date === undefined) errors.push('Nerastas datos stulpelis');
  if (index.sum === undefined && (index.debit === undefined || index.credit === undefined)) errors.push('Nerastas sumos stulpelis (arba debit/credit pora)');
  if (errors.length) return { rows: [], errors, columns: {}, ambiguousDirection: false };

  const rows: ParsedRow[] = [];
  let sawNegative = false;
  const seen = new Map<string, number>();
  lines.slice(1).forEach((line, i) => {
    const cells = splitLine(line, delimiter);
    const lineNo = i + 2;
    const date = parseDate(cells[index.date] || '');
    let sum: number | null;
    if (index.sum !== undefined) sum = parseAmount(cells[index.sum] || '');
    else {
      const debit = (cells[index.debit] || '').trim() ? parseAmount(cells[index.debit]) : 0;
      const credit = (cells[index.credit] || '').trim() ? parseAmount(cells[index.credit]) : 0;
      sum = debit === null || credit === null ? null : Math.round((Math.abs(credit) - Math.abs(debit)) * 100) / 100;
    }
    if (!date) { errors.push(`Eilutė ${lineNo}: neteisinga data`); return; }
    if (sum === null || sum === 0) { errors.push(`Eilutė ${lineNo}: neteisinga arba nulinė suma`); return; }
    const clientName = (cells[index.name] || '').slice(0, 256);
    const details = (cells[index.details] || '').slice(0, 1000);
    const reference = (cells[index.reference] || '').slice(0, 100);
    if (index.indicator !== undefined) {
      const flag = fold(cells[index.indicator] || '');
      if (DEBIT.has(flag)) sum = -Math.abs(sum);
      else if (CREDIT.has(flag)) sum = Math.abs(sum);
      else { errors.push(`Eilutė ${lineNo}: neatpažinta kryptis «${cells[index.indicator] || ''}» (tikimasi D/K)`); return; }
    }
    if (SUMMARY_ROW.test(fold(clientName)) || SUMMARY_ROW.test(fold(details)) || SUMMARY_ROW.test(fold(reference))) { errors.push(`Eilutė ${lineNo}: panašu į likučio ar sumos eilutę, o ne į operaciją: pašalinkite ją iš failo`); return; }
    if (sum < 0) sawNegative = true;
    // Identical legitimate rows in one file get an occurrence counter, so re-importing the same file adds nothing.
    const base = [companyId, date, Math.round(sum * 100), fold(clientName), fold(details), fold(reference)].join('|');
    const occurrence = (seen.get(base) || 0) + 1;
    seen.set(base, occurrence);
    rows.push({ date, sum, clientName, details, reference, line: lineNo, hash: createHash('sha256').update(base + '|' + occurrence).digest('hex') });
  });
  // All amounts positive and no direction column: outgoing payments would be booked as incoming, so the user must confirm.
  const ambiguousDirection = !errors.length && rows.length > 0 && index.indicator === undefined && index.sum !== undefined && !sawNegative;
  return { rows, errors, columns: Object.fromEntries(Object.entries(index).map(([k, v]) => [k, header[v]])), ambiguousDirection };
}
