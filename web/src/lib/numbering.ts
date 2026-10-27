/**
 * Next document number = highest trailing number among matching documents + 1.
 * Leading-zero width of the highest existing number is preserved.
 */
export function getNextDocumentNumber(
  items: any[],
  numberKey: string,
  options: { seriesKey?: string; series?: string; prefix?: string; defaultWidth?: number } = {}
): string {
  const { seriesKey, series, prefix = '', defaultWidth = 6 } = options;

  let maxNum = 0;
  let width = defaultWidth;

  for (const item of items) {
    if (seriesKey && (item[seriesKey] || '') !== series) continue;

    const raw = String(item[numberKey] || '');
    if (prefix && !raw.startsWith(prefix)) continue;

    const digits = raw.match(/\d+$/);
    if (!digits) continue;

    const value = parseInt(digits[0], 10);
    if (value > maxNum) {
      maxNum = value;
      width = Math.max(digits[0].length, 1);
    }
  }

  return `${prefix}${String(maxNum + 1).padStart(width, '0')}`;
}
