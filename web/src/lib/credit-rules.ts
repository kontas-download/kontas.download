import type Database from 'better-sqlite3';
import { calculateLine } from './money';
import { HttpError } from './errors';

const round2 = (v: number) => Math.round(v * 100) / 100;

// VAT rates present on the lines of the original document. Legacy lines without a stored rate use the rate implied by their amounts.
export function originalRates(db: Database.Database, table: 'SaleItem' | 'PurchaseItem', key: 'saleId' | 'purchaseId', id: number): Set<number> {
  const rows = db.prepare(`SELECT vatRate, sumWithoutVat net, sumWithVat gross FROM ${table} WHERE ${key}=?`).all(id) as { vatRate: number | null; net: number; gross: number }[];
  return new Set(rows.map(r => round2(r.vatRate ?? (r.net ? (r.gross / r.net - 1) * 100 : 0))));
}

// A correction may only use rates the original document had, so it cannot reverse VAT that was never charged or deducted.
export function assertRatesMatch(rates: Set<number>, items: { vatRate?: unknown; quantity?: unknown; price?: unknown }[]) {
  if (!rates.size) return; // no stored lines to compare with
  for (const item of items) {
    const rate = round2(calculateLine(item).vatRate);
    if (!rates.has(rate)) throw new HttpError(400, `PVM tarifo ${rate}% pirminiame dokumente nėra (${[...rates].join('%, ')}%)`);
  }
}
