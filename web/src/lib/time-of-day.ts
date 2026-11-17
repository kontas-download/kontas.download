// Time of day as printed on receipts and invoices: "16:04", "16:04:44", "16.04", "16 04", "9:05", "9.05.07".
// normalizeTimeOfDay returns the canonical "HH:MM" or "HH:MM:SS" (seconds are kept when printed), or null when the text is not a
// valid time of day. Every place that accepts a time (recognition draft, review form, purchase form, attach) uses this one rule.
export function normalizeTimeOfDay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  const m = /^(\d{1,2})\s*[:.\s]\s*(\d{1,2})(?:\s*[:.\s]\s*(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), m[3] === undefined ? null : Number(m[3])];
  if (h > 23 || min > 59 || (s !== null && s > 59)) return null;
  const two = (n: number) => String(n).padStart(2, '0');
  return s === null ? `${two(h)}:${two(min)}` : `${two(h)}:${two(min)}:${two(s)}`;
}
