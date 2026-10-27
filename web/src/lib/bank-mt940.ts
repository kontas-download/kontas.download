import { createHash } from 'node:crypto';
import type { ParsedRow } from './bank-import';
import type { CamtResult, CamtStatement } from './bank-camt';

// SWIFT MT940 (customer statement) reader. Same safeguards as the camt.053 reader: direction comes from the D/C mark of every
// entry, the account from field :25:, and a statement whose opening balance + entries differ from the closing balance is refused.
const MAX_BYTES = 8_000_000;
const cents = (v: number) => Math.round(v * 100);
const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9а-я]+/g, ' ').trim();

export function looksLikeMt940(input: string) {
  const text = input.replace(/^﻿/, '').trimStart();
  return !text.startsWith('<') && /(^|\n):20:/.test(text) && /(^|\n):61:/.test(text);
}

interface Field { tag: string; lines: string[]; }

// Fields start with ":NN:" or ":NNA:" at the beginning of a line; a lone "-" ends a message. A SWIFT envelope ({1:...}{4:) is tolerated.
function fields(text: string): Field[][] {
  const messages: Field[][] = [];
  let current: Field[] = [];
  let field: Field | null = null;
  const close = () => { if (current.length) messages.push(current); current = []; field = null; };
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    const tag = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (tag) {
      if (tag[1] === '20' && current.some(f => f.tag === '61' || f.tag.startsWith('62'))) close();
      field = { tag: tag[1], lines: [tag[2]] };
      current.push(field);
    } else if (line === '-' || line === '-}' || line.startsWith('{5:')) close();
    else if (field && line && !/^\{[1-4]:/.test(line)) field.lines.push(line.replace(/\}$/, ''));
  }
  close();
  return messages;
}

function balance(value: string): { amount: number; currency: string; date: string } | null {
  const m = /^([DC])(\d{6})([A-Z]{3})(\d+,\d{0,2})$/.exec(value.trim());
  if (!m) return null;
  const amount = Number(m[4].replace(',', '.'));
  return { amount: m[1] === 'D' ? -amount : amount, currency: m[3], date: yymmdd(m[2]) || '' };
}
function yymmdd(value: string): string | null {
  const iso = `20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
  const parsed = new Date(iso + 'T00:00:00Z');
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso;
}

// :86: carries the purpose and, depending on the bank, the counterparty: "?20..?32" (structured) or "/NAME/.../REMI/..." tags.
function information(lines: string[]): { name: string; details: string } {
  const text = lines.join(lines.some(l => l.startsWith('?')) ? '' : ' ').trim();
  if (/\?\d{2}/.test(text)) {
    const parts = new Map<string, string>();
    for (const m of text.matchAll(/\?(\d{2})([^?]*)/g)) parts.set(m[1], (parts.get(m[1]) || '') + m[2]);
    const pick = (from: number, to: number) => [...parts.entries()].filter(([k]) => Number(k) >= from && Number(k) <= to).sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => v.trim()).filter(Boolean).join(' ');
    return { name: [parts.get('32'), parts.get('33')].map(v => (v || '').trim()).filter(Boolean).join(' '), details: [pick(20, 29), pick(60, 63)].filter(Boolean).join(' ').slice(0, 1000) };
  }
  if (/^\/[A-Z]{3,4}\//.test(text)) {
    const tags = new Map<string, string>();
    for (const m of text.matchAll(/\/([A-Z]{3,4})\/([^/]*(?:\/(?![A-Z]{3,4}\/)[^/]*)*)/g)) tags.set(m[1], (tags.get(m[1]) || '') + ' ' + m[2].replace(/\/+$/, '').trim());
    const name = (tags.get('NAME') || tags.get('ORDP') || tags.get('BENM') || '').trim();
    return { name, details: (tags.get('REMI')?.trim() || text).slice(0, 1000) };
  }
  return { name: '', details: text.slice(0, 1000) };
}

export function parseMt940(input: string, companyId: number): CamtResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (message: string): CamtResult => ({ rows: [], errors: [message, ...errors], columns: {}, ambiguousDirection: false, statements: [], warnings });
  if (Buffer.byteLength(input) > MAX_BYTES) return fail('Failas per didelis (daugiausia 8 MB)');
  const messages = fields(input);
  if (!messages.length) return fail('Nerastas MT940 išrašas (laukai :20:, :25:, :60F:, :61:, :62F:)');

  const rows: ParsedRow[] = [];
  const statements: CamtStatement[] = [];
  const seen = new Map<string, number>();

  messages.forEach((message, si) => {
    const where = `Išrašas ${si + 1}`;
    const account = (message.find(f => f.tag === '25')?.lines.join('').split('/')[0] || '').replace(/\s+/g, '').toUpperCase();
    if (!account) { errors.push(`${where}: nenurodyta sąskaita (laukas :25:)`); return; }
    const opens = message.filter(f => f.tag === '60F' || f.tag === '60M').map(f => balance(f.lines[0]));
    const closes = message.filter(f => f.tag === '62F' || f.tag === '62M').map(f => balance(f.lines[0]));
    if (opens.includes(null) || closes.includes(null)) { errors.push(`${where} (${account}): neteisingas likutis laukuose :60:/:62:`); return; }
    const opening = opens[0] || null, closing = closes[closes.length - 1] || null;
    for (const b of [...opens, ...closes]) if (b && b.currency !== 'EUR') { errors.push(`${where} (${account}): valiuta ${b.currency}, priimamos tik EUR sąskaitos`); return; }

    let sum = 0, count = 0, minDate: string | null = null, maxDate: string | null = null;
    message.forEach((f, index) => {
      if (f.tag !== '61') return;
      const label = `${where}, operacija ${count + 1}`;
      const m = /^(\d{6})(\d{4})?(R?[DC])[A-Z]?(\d+,\d{0,2})([A-Z][A-Z0-9]{3})(.*)$/.exec(f.lines[0]);
      if (!m) { errors.push(`${label}: nepavyko išanalizuoti lauko :61:`); return; }
      const value = yymmdd(m[1]);
      let date = value;
      if (value && m[2]) {
        // the entry date has no year: take the one that puts it closest to the value date (statements around New Year)
        const year = Number(value.slice(0, 4));
        const entryMonth = Number(m[2].slice(0, 2)), valueMonth = Number(value.slice(5, 7));
        const adjusted = entryMonth - valueMonth > 6 ? year - 1 : valueMonth - entryMonth > 6 ? year + 1 : year;
        const candidate = `${adjusted}-${m[2].slice(0, 2)}-${m[2].slice(2, 4)}`;
        date = new Date(candidate + 'T00:00:00Z').toISOString().slice(0, 10) === candidate ? candidate : value;
      }
      if (!date) { errors.push(`${label}: neteisinga data`); return; }
      const amount = Number(m[4].replace(',', '.'));
      if (!Number.isFinite(amount) || amount < 0) { errors.push(`${label}: neteisinga suma`); return; }
      if (amount === 0) { warnings.push(`${label}: praleista 0,00 operacija`); return; }
      // C = credit (money in), D = debit (money out); RC reverses a credit (money out), RD reverses a debit (money in).
      const incoming = m[3] === 'C' || m[3] === 'RD';
      const signed = incoming ? amount : -amount;
      const [customerRef, bankRef = ''] = m[6].split('//');
      const supplementary = f.lines.slice(1).join(' ');
      const info = message[index + 1]?.tag === '86' ? information(message[index + 1].lines) : { name: '', details: '' };
      const details = (info.details || supplementary).slice(0, 1000);
      const reference = (bankRef.trim() || (customerRef.trim() === 'NONREF' ? '' : customerRef.trim())).slice(0, 100);
      const base = bankRef.trim() && bankRef.trim() !== 'NONREF' ? [companyId, account, 'ref', bankRef.trim()].join('|') : [companyId, account, date, cents(signed), fold(info.name), fold(details)].join('|');
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      rows.push({ date, sum: signed, clientName: info.name.slice(0, 256), details, reference, line: si * 100000 + count + 1, hash: createHash('sha256').update(base + '|' + n).digest('hex'), account });
      sum += cents(signed); count++;
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    });

    let reconciled: boolean | null = null;
    if (opening && closing) {
      reconciled = cents(opening.amount) + sum === cents(closing.amount);
      if (!reconciled) errors.push(`${where} (${account}): pradžios likutis ${opening.amount.toFixed(2)} + operacijos ${(sum / 100).toFixed(2)} nelygu pabaigos likučiui ${closing.amount.toFixed(2)}: faile trūksta dalies operacijų arba jis pakeistas`);
    } else warnings.push(`${where} (${account}): faile nėra pradžios/pabaigos likučių, išrašo išsamumo patikrinti negalima`);
    statements.push({ iban: account, fromDate: opening?.date || minDate, toDate: closing?.date || maxDate, opening: opening?.amount ?? null, closing: closing?.amount ?? null, entries: count, skipped: 0, reconciled });
  });

  if (!errors.length && !rows.length && !statements.every(s => s.entries === 0)) errors.push('Faile nėra operacijų');
  return { rows, errors, columns: {}, ambiguousDirection: false, statements, warnings };
}
