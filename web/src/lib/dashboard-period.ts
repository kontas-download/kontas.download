// Period of the overview statistics: presets relative to today (Vilnius) or any custom range. The default is this year,
// so a company with many years of history sees current figures; "all" keeps the whole history available.
export const PERIODS = ['month', 'quarter', 'year', 'last12', 'lastYear', 'all', 'custom'] as const;
export type PeriodKey = (typeof PERIODS)[number];
export interface Period { key: PeriodKey; from: string | null; to: string | null }

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const valid = (d: unknown): d is string => typeof d === 'string' && ISO.test(d) && !Number.isNaN(Date.parse(d + 'T00:00:00Z'));
const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1-12

export function resolvePeriod(params: { period?: string; from?: string; to?: string }, today: string): Period {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const key = (PERIODS as readonly string[]).includes(params.period ?? '') ? params.period as PeriodKey : 'year';
  switch (key) {
    case 'month': return { key, from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
    case 'quarter': { const q = Math.floor((m - 1) / 3) * 3 + 1; return { key, from: `${y}-${pad(q)}-01`, to: `${y}-${pad(q + 2)}-${pad(lastDay(y, q + 2))}` }; }
    case 'last12': { const start = new Date(Date.UTC(y, m - 12, 1)); return { key, from: start.toISOString().slice(0, 10), to: today }; }
    case 'lastYear': return { key, from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case 'all': return { key, from: null, to: null };
    case 'custom': {
      const from = valid(params.from) ? params.from : null, to = valid(params.to) ? params.to : null;
      if (!from && !to) return { key: 'year', from: `${y}-01-01`, to: `${y}-12-31` };
      return from && to && from > to ? { key, from: to, to: from } : { key, from, to };
    }
    default: return { key: 'year', from: `${y}-01-01`, to: `${y}-12-31` };
  }
}

/** SQL condition and parameters for a date column within the period (dates compared on their first 10 characters). */
export function periodWhere(column: string, p: Period): { sql: string; args: string[] } {
  const parts: string[] = [], args: string[] = [];
  if (p.from) { parts.push(`substr(${column},1,10) >= ?`); args.push(p.from); }
  if (p.to) { parts.push(`substr(${column},1,10) <= ?`); args.push(p.to); }
  return { sql: parts.length ? ' AND ' + parts.join(' AND ') : '', args };
}
