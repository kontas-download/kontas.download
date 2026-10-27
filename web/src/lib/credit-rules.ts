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

const lineKey = (code: unknown, name: unknown) => {
  const c = typeof code === 'string' ? code.trim() : '';
  return c ? 'c:' + c : 'n:' + (typeof name === 'string' ? name.trim() : '');
};

// Credited quantity of every original line (matched by item code, else item name) may not exceed the original quantity across all credit notes.
// Applies to goods with a stock card (their credit returns stock); a credit line with no original counterpart is refused. Services keep the sum-only control.
export function assertQuantitiesWithinOriginal(db: Database.Database, companyId: number, kind: 'SALE' | 'PURCHASE', originalId: number, items: { itemCode?: unknown; itemName?: unknown; quantity?: unknown; price?: unknown; vatRate?: unknown }[]) {
  const sale = kind === 'SALE';
  const table = sale ? 'SaleItem' : 'PurchaseItem', key = sale ? 'saleId' : 'purchaseId', parent = sale ? 'Sale' : 'Purchase', link = sale ? 'originalSaleId' : 'originalPurchaseId';
  type Row = { itemCode: string | null; itemName: string | null; quantity: number };
  const original = db.prepare(`SELECT itemCode,itemName,quantity FROM ${table} WHERE ${key}=?`).all(originalId) as Row[];
  if (!original.length) return;
  const prior = db.prepare(`SELECT itemCode,itemName,quantity FROM ${table} WHERE ${key} IN (SELECT id FROM ${parent} WHERE ${link}=? AND companyId=?)`).all(originalId, companyId) as Row[];
  const left = new Map<string, number>();
  for (const r of original) { const k = lineKey(r.itemCode, r.itemName); left.set(k, (left.get(k) ?? 0) + Math.abs(Number(r.quantity) || 0)); }
  for (const r of prior) { const k = lineKey(r.itemCode, r.itemName); if (left.has(k)) left.set(k, left.get(k)! - Math.abs(Number(r.quantity) || 0)); }
  for (const item of items) {
    const k = lineKey(item.itemCode, item.itemName);
    const qty = Math.abs(calculateLine(item).qty);
    const label = String(item.itemCode || item.itemName || '').trim();
    const code = typeof item.itemCode === 'string' ? item.itemCode.trim() : '';
    const goods = !!code && !!db.prepare('SELECT 1 FROM StockItem WHERE companyId=? AND (TRIM(code)=? OR TRIM(barcode)=?)').get(companyId, code, code);
    if (!goods) continue; // services keep the sum-only control (value corrections of a service line are legitimate)
    if (!left.has(k)) {
      throw new HttpError(400, `Prekės „${label}“ pirminiame dokumente nėra: kreditinio dokumento eilutė neatitinka nė vienos pirminės eilutės`);
    }
    const remaining = left.get(k)!;
    if (qty > remaining + 1e-9) throw new HttpError(400, `Kreditinio dokumento kiekis („${label}“: ${qty}) viršija pirminiame dokumente likusį kiekį (${Math.max(0, Math.round(remaining * 1e6) / 1e6)})`);
    left.set(k, remaining - qty);
  }
}
