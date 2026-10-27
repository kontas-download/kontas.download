import { HttpError } from './errors';
// Fixed-point decimal arithmetic; amounts are rounded half away from zero to cents.
function scaled(value: unknown, places: number): bigint {
  if (typeof value !== 'number' && typeof value !== 'string') throw new HttpError(400, 'Tikimasi skaičiaus');
  const raw = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 1e9) throw new HttpError(400, 'Neteisingas arba per didelis skaičius');
  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  if (fraction.length > places && /[1-9]/.test(fraction.slice(places))) throw new HttpError(400, 'Per daug skaitmenų po kablelio');
  const result = BigInt(whole) * 10n ** BigInt(places) + BigInt((fraction.slice(0, places)).padEnd(places, '0') || '0');
  return negative ? -result : result;
}
function divideRound(n: bigint, d: bigint) { return n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d; }
export function cents(value: unknown) { return scaled(value, 2); }
export function money(value: unknown): number { return Number(cents(value)) / 100; }
export function calculateLine(item: { quantity?: unknown; price?: unknown; vatRate?: unknown }) {
  const quantity = scaled(item.quantity ?? 1, 6);
  const price = scaled(item.price ?? 0, 6);
  const rate = scaled(item.vatRate ?? 21, 4);
  if (quantity <= 0n || price < 0n || rate < 0n || rate > 1000000n) throw new HttpError(400, 'Kiekis turi būti teigiamas; kaina ir PVM turi būti neneigiami');
  const net = divideRound(quantity * price, 10000000000n);
  const vat = divideRound(net * rate, 1000000n);
  if (net + vat > 100000000000n) throw new HttpError(400, 'Eilutės suma per didelė');
  return { qty: Number(quantity) / 1e6, price: Number(price) / 1e6, vatRate: Number(rate) / 1e4, lineNoVat: Number(net) / 100, lineWithVat: Number(net + vat) / 100 };
}
// VAT in cents on a net amount in cents at a percentage rate, rounded like an invoice line (half away from zero).
export function vatOnNetCents(netCents: number, rate: number): number {
  return Number(divideRound(BigInt(netCents) * scaled(rate, 4), 1000000n));
}
export function totalLines(items: Parameters<typeof calculateLine>[0][]) {
  let net = 0n, gross = 0n;
  for (const item of items) { const line = calculateLine(item); net += cents(line.lineNoVat); gross += cents(line.lineWithVat); }
  if (gross > 100000000000n) throw new HttpError(400, 'Dokumento suma per didelė');
  return { sumWithoutVat: Number(net) / 100, sumWithVat: Number(gross) / 100, vat: Number(gross - net) / 100 };
}
