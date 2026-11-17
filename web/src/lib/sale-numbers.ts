// Next document numbers must come from every sale of the company, not from the (period-limited) list the page shows.
export interface NumberBase { series: Record<string, { max: number; width: number }>; credit: number }
interface NumberRow { series?: string | null; number?: string | null; docType?: string | null }

export function buildNumberBase(rows: NumberRow[]): NumberBase {
  const base: NumberBase = { series: {}, credit: 0 };
  for (const s of rows) {
    const digits = String(s.number || '').match(/\d+$/);
    if (digits) {
      const key = s.series || '', val = parseInt(digits[0], 10), cur = base.series[key];
      if (!cur || val > cur.max) base.series[key] = { max: val, width: Math.max(digits[0].length, 1) };
    }
    if (s.docType === 'KS') {
      const n = parseInt(String(s.number).replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > base.credit) base.credit = n;
    }
  }
  return base;
}

/** Next invoice number in a series: highest trailing number + 1, keeping the leading-zero width (default width 6). */
export function nextInvoiceNumber(base: NumberBase, loaded: NumberRow[], series: string): string {
  const mine = buildNumberBase(loaded).series[series], all = base.series[series];
  const best = mine && (!all || mine.max > all.max) ? mine : all;
  return String((best?.max ?? 0) + 1).padStart(best?.width ?? 6, '0');
}

export function nextCreditNumber(base: NumberBase, loaded: NumberRow[]): string {
  return String(Math.max(base.credit, buildNumberBase(loaded).credit) + 1).padStart(6, '0');
}

export function saleNumberBase(db: { prepare(sql: string): { all(...a: unknown[]): unknown[] } }, companyId: number): NumberBase {
  return buildNumberBase(db.prepare('SELECT series, number, docType FROM Sale WHERE companyId = ?').all(companyId) as NumberRow[]);
}
