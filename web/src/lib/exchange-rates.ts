import { XMLParser } from 'fast-xml-parser';
import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { todayVilnius } from './dates';
import { validCurrencyCode } from './foreign-currency';

// Euro foreign exchange reference rates of the European Central Bank (daily feed for the last 90 days, the full history feed for older dates),
// cached in ExchangeRate. The network call is injected, so tests and offline use never reach the network. The rate of a date is the rate
// published for that date or, when none was published (weekend, holiday), the last earlier one. Quoted as units of currency for 1 EUR.
export const ECB_FEEDS = {
  D90: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml',
  HIST: 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml',
} as const;
export type TextFetcher = (url: string) => Promise<string>;
export interface RateDeps { fetchText?: TextFetcher; now?: () => Date }
export interface RateRow { date: string; currency: string; rate: number }
export interface RateResult { currency: string; rate: number; rateDate: string; source: 'ECB' }

// Rates older than this before the document date are not used silently (a holiday gap is a few days).
const MAX_GAP_DAYS = 10;
// A feed fetched this recently counts as current for today's date (the bank publishes once a day, in the afternoon).
const FRESH_MS = 6 * 60 * 60 * 1000;

export const defaultFetcher: TextFetcher = async url => {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { Accept: 'application/xml, text/xml' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

export function parseEcbRates(xml: string): RateRow[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', removeNSPrefix: true });
  const root = parser.parse(xml)?.Envelope?.Cube;
  const rows: RateRow[] = [];
  for (const day of asArray<Record<string, unknown>>(root?.Cube)) {
    const date = String(day['@_time'] ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (const c of asArray<Record<string, unknown>>(day.Cube as Record<string, unknown> | Record<string, unknown>[] | undefined)) {
      const currency = String(c['@_currency'] ?? '').toUpperCase();
      const rate = Number(c['@_rate']);
      if (validCurrencyCode(currency) && Number.isFinite(rate) && rate > 0) rows.push({ date, currency, rate });
    }
  }
  return rows;
}

function storeFeed(db: Database.Database, feed: keyof typeof ECB_FEEDS, rows: RateRow[], now: Date) {
  const put = db.prepare("INSERT OR REPLACE INTO ExchangeRate(date,currency,rate,source) VALUES(?,?,?,'ECB')");
  const dates = rows.map(r => r.date).sort();
  db.transaction(() => {
    for (const r of rows) put.run(r.date, r.currency, r.rate);
    db.prepare('INSERT OR REPLACE INTO ExchangeRateFeed(feed,fromDate,toDate,fetchedAt) VALUES(?,?,?,?)').run(feed, dates[0], dates[dates.length - 1], now.toISOString());
  })();
}

const dayShift = (date: string, days: number) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

// Is the date inside a feed we already hold? (Then a missing currency is final, not a reason to fetch again.)
function covered(db: Database.Database, date: string, now: Date): boolean {
  const feeds = db.prepare('SELECT fromDate, toDate, fetchedAt FROM ExchangeRateFeed').all() as { fromDate: string; toDate: string; fetchedAt: string }[];
  return feeds.some(f => f.fromDate <= date && (date <= f.toDate || now.getTime() - Date.parse(f.fetchedAt) < FRESH_MS));
}

function cached(db: Database.Database, currency: string, date: string): RateResult | null {
  const row = db.prepare('SELECT date, rate FROM ExchangeRate WHERE currency=? AND date<=? AND date>=? ORDER BY date DESC LIMIT 1').get(currency, date, dayShift(date, -MAX_GAP_DAYS)) as { date: string; rate: number } | undefined;
  return row ? { currency, rate: row.rate, rateDate: row.date, source: 'ECB' } : null;
}

export async function ecbRate(db: Database.Database, currencyInput: unknown, dateInput: unknown, deps: RateDeps = {}): Promise<RateResult> {
  const currency = typeof currencyInput === 'string' ? currencyInput.trim().toUpperCase() : '';
  if (!validCurrencyCode(currency) || currency === 'EUR') throw new HttpError(400, 'Neteisinga valiutos santrumpa');
  const date = typeof dateInput === 'string' ? dateInput : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + 'T00:00:00Z')) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new HttpError(400, 'Neteisinga dokumento data');
  const now = (deps.now ?? (() => new Date()))();
  const known = covered(db, date, now) ? cached(db, currency, date) : null;
  if (known) return known;
  if (!covered(db, date, now)) {
    const today = todayVilnius();
    const feed = date >= dayShift(today, -80) ? 'D90' : 'HIST';
    let rows: RateRow[];
    try {
      rows = parseEcbRates(await (deps.fetchText ?? defaultFetcher)(ECB_FEEDS[feed]));
    } catch {
      throw new HttpError(503, 'Nepavyko gauti Europos centrinio banko kurso (nėra ryšio): įveskite kursą rankiniu būdu');
    }
    if (!rows.length) throw new HttpError(503, 'Nepavyko gauti Europos centrinio banko kurso (nėra ryšio): įveskite kursą rankiniu būdu');
    storeFeed(db, feed, rows, now);
  }
  const found = cached(db, currency, date);
  if (!found) throw new HttpError(404, `Europos centrinis bankas nėra paskelbęs ${currency} kurso ${date} dienai ar ankstesnėms dienoms: įveskite kursą rankiniu būdu`);
  return found;
}

// Is the typed rate the one the bank published for that date? Decides whether a stored rate is labelled ECB or MANUAL.
export function isPublishedRate(db: Database.Database, currency: string, rateDate: string, rate: number): boolean {
  const row = db.prepare('SELECT rate FROM ExchangeRate WHERE currency=? AND date=?').get(currency, rateDate) as { rate: number } | undefined;
  return !!row && Math.abs(row.rate - rate) < 1e-9;
}
