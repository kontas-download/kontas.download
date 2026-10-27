// CSV for spreadsheet users: UTF-8 with BOM, ';' delimiter, CRLF, RFC 4180 quoting.
// Text cells that a spreadsheet would run as a formula (=, +, -, @, tab, CR) get a leading apostrophe (OWASP CSV injection).
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (FORMULA.test(text)) text = "'" + text;
  return /[;"\r\n,]|^\s|\s$/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[], headers: string[] = columns): string {
  const lines = [headers.map(csvCell).join(';')];
  for (const row of rows) lines.push(columns.map(c => csvCell(row[c])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Undoes the export protection: "'=1" read back is "=1".
export function uncsvCell(text: string): string {
  return text.length > 1 && text[0] === "'" && FORMULA.test(text.slice(1)) ? text.slice(1) : text;
}

// Parses quoted fields (including embedded delimiters, quotes and line breaks). The delimiter is detected from the header line.
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const count = (d: string) => firstLine.split(d).length;
  const delimiter = [';', ',', '\t'].sort((a, b) => count(b) - count(a))[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } quoted = false; i++; continue; }
      cell += ch; i++; continue;
    }
    if (ch === '"' && cell === '') { quoted = true; i++; continue; }
    if (ch === delimiter) { row.push(cell); cell = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') {
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
      i += ch === '\r' && text[i + 1] === '\n' ? 2 : 1; continue;
    }
    cell += ch; i++;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

export function csvResponseHeaders(filename: string) {
  return { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' };
}
