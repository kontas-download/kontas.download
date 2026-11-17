// Period of a document list (purchases, sales). A page opens on the last 12 months so a company with years of history does
// not load everything; "all" keeps the whole history reachable. The list APIs without from/to still return every row.
export const LIST_PERIODS = ['last12', 'year', 'lastYear', 'all', 'custom'] as const;
export type ListPeriodKey = (typeof LIST_PERIODS)[number];
export interface ListPeriod { key: ListPeriodKey; from: string | null; to: string | null }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (d: unknown): d is string => typeof d === 'string' && ISO.test(d) && (t => !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === d)(Date.parse(d + 'T00:00:00Z'));
const pad = (n: number) => String(n).padStart(2, '0');

/** Same day one year earlier; 29 February maps to 28 February (the period then includes the extra day, never loses one). */
export function oneYearBefore(today: string): string {
  const y = Number(today.slice(0, 4)) - 1, m = Number(today.slice(5, 7)), d = Number(today.slice(8, 10));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(d, last))}`;
}

/** Period from the page query (?period=all|year|lastYear|last12, ?from=&to=); no or unknown query gives the last 12 months. */
export function resolveListPeriod(params: { period?: string; from?: string; to?: string }, today: string): ListPeriod {
  const y = Number(today.slice(0, 4));
  const from = isIsoDate(params.from) ? params.from : null, to = isIsoDate(params.to) ? params.to : null;
  if (params.period === 'all') return { key: 'all', from: null, to: null };
  if (params.period === 'year') return { key: 'year', from: `${y}-01-01`, to: `${y}-12-31` };
  if (params.period === 'lastYear') return { key: 'lastYear', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  if (from || to) return from && to && from > to ? { key: 'custom', from: to, to: from } : { key: 'custom', from, to };
  return { key: 'last12', from: oneYearBefore(today), to: today };
}

/** Query string that reproduces a period on the page (the default last12 needs none). */
export function periodQuery(p: ListPeriod): string {
  if (p.key === 'last12') return '';
  if (p.key === 'custom') return '?' + [p.from && `from=${p.from}`, p.to && `to=${p.to}`].filter(Boolean).join('&');
  return `?period=${p.key}`;
}

/** Validates ?from=&to= of a list API; returns the bounds (null = open) or an error text for a 400. */
export function parseApiRange(params: URLSearchParams): { from: string | null; to: string | null; error?: string } {
  const from = params.get('from') || null, to = params.get('to') || null;
  const bad = (from && !isIsoDate(from)) || (to && !isIsoDate(to)) || (from && to && from > to);
  return { from, to, error: bad ? 'Neteisinga data' : undefined };
}

/** Inclusive date-range SQL fragment on a column (compares the first 10 characters); null bound = open. */
export function dateRangeSql(column: string, from: string | null, to: string | null): { sql: string; args: string[] } {
  let sql = ''; const args: string[] = [];
  if (from) { sql += ` AND substr(${column},1,10) >= ?`; args.push(from); }
  if (to) { sql += ` AND substr(${column},1,10) <= ?`; args.push(to); }
  return { sql, args };
}
