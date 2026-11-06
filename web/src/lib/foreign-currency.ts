// Foreign currency amounts of a received document. Pure functions shared by the review form and the server confirmation.
// The rate is quoted the way the European Central Bank publishes it: units of the foreign currency for 1 EUR.
const r2 = (v: number) => (v < 0 ? -1 : 1) * Math.round(Math.abs(v) * 100 + 1e-7) / 100;

export const eurFromForeign = (amount: number, rate: number) => r2(amount / rate);

// A line typed in the document currency -> the EUR line the purchase stores. VAT is calculated from the converted net at the line rate
// (the same way the purchase itself computes it), so the EUR line is always internally consistent.
export function convertLine(line: { net: number; vatRate: number }, rate: number) {
  const net = eurFromForeign(line.net, rate);
  const vat = r2(net * line.vatRate / 100);
  return { net, vat, gross: r2(net + vat) };
}

export const validRate = (rate: unknown): rate is number => typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate <= 1_000_000;
export const validCurrencyCode = (code: unknown): code is string => typeof code === 'string' && /^[A-Z]{3}$/.test(code);
