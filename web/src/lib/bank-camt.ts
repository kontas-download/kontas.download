import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import type { ParseResult, ParsedRow } from './bank-import';

// ISO 20022 camt.053 (bank-to-customer statement) reader, the standard export of Lithuanian banks.
// The direction of every entry comes from CdtDbtInd, the account from the IBAN, and the file is rejected when
// opening balance + booked entries does not equal the closing balance, so a truncated or edited file cannot be imported.
export interface CamtStatement { iban: string; fromDate: string | null; toDate: string | null; opening: number | null; closing: number | null; entries: number; skipped: number; reconciled: boolean | null; }
export interface CamtResult extends ParseResult { statements: CamtStatement[]; warnings: string[]; }

const MAX_BYTES = 8_000_000;
const cents = (v: number) => Math.round(v * 100);
const arr = <T,>(v: T | T[] | undefined | null): T[] => v === undefined || v === null ? [] : Array.isArray(v) ? v : [v];
const text = (v: any): string => v === undefined || v === null ? '' : typeof v === 'object' ? text(v['#text']) : String(v).trim();
const money = (v: any): number | null => { const t = text(v); return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null; };
const fold = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9а-я]+/g, ' ').trim();
const isoDate = (v: any): string | null => { const t = text(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) && new Date(t + 'T00:00:00Z').toISOString().slice(0, 10) === t ? t : null; };
const dateOf = (node: any) => node ? (isoDate(node.Dt) || isoDate(node.DtTm)) : null;

export function looksLikeXml(input: string) {
  return input.replace(/^﻿/, '').trimStart().startsWith('<');
}

function entryStatus(entry: any): string {
  const s = entry.Sts;
  return (typeof s === 'object' ? text(s.Cd) || text(s['#text']) : text(s)).toUpperCase() || 'BOOK';
}

export function parseCamt053(xml: string, companyId: number): CamtResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const fail = (message: string): CamtResult => ({ rows: [], errors: [message, ...errors], columns: {}, ambiguousDirection: false, statements: [], warnings });
  if (Buffer.byteLength(xml) > MAX_BYTES) return fail('Failas per didelis (daugiausia 8 MB)');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return fail('XML su DOCTYPE/ENTITY nepriimamas');
  let doc: any;
  try {
    doc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: true }).parse(xml);
  } catch {
    return fail('Failas nėra teisingas XML');
  }
  const stmts = arr<any>(doc?.Document?.BkToCstmrStmt?.Stmt);
  if (!stmts.length) return fail(doc?.Document?.BkToCstmrAcctRpt ? 'Tai tarpinė ataskaita camt.052, reikalingas išrašas camt.053' : 'Nerastas išrašas camt.053 (elementas BkToCstmrStmt/Stmt)');

  const rows: ParsedRow[] = [];
  const statements: CamtStatement[] = [];
  const seen = new Map<string, number>();

  stmts.forEach((stmt, si) => {
    const where = `Išrašas ${si + 1}`;
    const iban = text(stmt.Acct?.Id?.IBAN).replace(/\s+/g, '').toUpperCase() || text(stmt.Acct?.Id?.Othr?.Id);
    if (!iban) { errors.push(`${where}: nenurodyta sąskaita (IBAN)`); return; }
    const ccy = text(stmt.Acct?.Ccy);
    if (ccy && ccy !== 'EUR') { errors.push(`${where}: sąskaitos valiuta ${ccy}, priimamos tik EUR sąskaitos`); return; }

    const balance = (code: string) => {
      const b = arr<any>(stmt.Bal).find(x => text(x.Tp?.CdOrPrtry?.Cd) === code);
      if (!b) return null;
      const value = money(b.Amt);
      if (value === null) return null;
      return (text(b.CdtDbtInd) === 'DBIT' ? -value : value);
    };
    const opening = balance('OPBD'), closing = balance('CLBD');

    let sum = 0, count = 0, skipped = 0, minDate: string | null = null, maxDate: string | null = null;
    arr<any>(stmt.Ntry).forEach((entry, ei) => {
      const label = `${where}, operacija ${ei + 1}`;
      const status = entryStatus(entry);
      if (status !== 'BOOK') { skipped++; return; }
      const amount = money(entry.Amt);
      const entryCcy = typeof entry.Amt === 'object' ? text(entry.Amt['@_Ccy']) : '';
      const dir = text(entry.CdtDbtInd);
      const date = dateOf(entry.BookgDt) || dateOf(entry.ValDt);
      if (amount === null) { errors.push(`${label}: neteisinga suma`); return; }
      if (amount === 0) { skipped++; warnings.push(`${label}: praleista 0,00 operacija`); return; }
      if (dir !== 'CRDT' && dir !== 'DBIT') { errors.push(`${label}: nenurodyta kryptis (CdtDbtInd)`); return; }
      if (!date) { errors.push(`${label}: neteisinga data`); return; }
      if (entryCcy && entryCcy !== 'EUR') { errors.push(`${label}: valiuta ${entryCcy}, priimamas tik EUR`); return; }
      const signed = dir === 'DBIT' ? -amount : amount;

      const tx = arr<any>(entry.NtryDtls).flatMap(d => arr<any>(d.TxDtls));
      const party = (t: any) => {
        const side = dir === 'CRDT' ? t.RltdPties?.Dbtr : t.RltdPties?.Cdtr;
        return text(side?.Nm) || text(side?.Pty?.Nm);
      };
      const names = [...new Set(tx.map(party).filter(Boolean))];
      const remittance = tx.flatMap(t => arr<any>(t.RmtInf?.Ustrd).map(text)).filter(Boolean);
      const details = [...remittance, text(entry.AddtlNtryInf), ...tx.map(t => text(t.AddtlTxInf))].filter(Boolean).join(' ').slice(0, 1000);
      // Only the bank's account-servicer reference identifies a booking across statements. NtryRef is often a per-statement sequence number.
      const ref = text(entry.AcctSvcrRef) || tx.map(t => text(t.Refs?.AcctSvcrRef)).find(Boolean) || '';
      const ntryRef = text(entry.NtryRef);
      const e2e = tx.map(t => text(t.Refs?.EndToEndId)).find(x => x && x !== 'NOTPROVIDED') || '';

      // A bank reference identifies the booking across files; without one the usual content key is used.
      const base = ref ? [companyId, iban, 'ref', ref].join('|') : [companyId, iban, date, cents(signed), fold(names.join(' ')), fold(details)].join('|');
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      rows.push({ date, sum: signed, clientName: names.join('; ').slice(0, 256), details, reference: (ref || ntryRef || e2e).slice(0, 100), line: si * 100000 + ei + 1, hash: createHash('sha256').update(base + '|' + n).digest('hex'), account: iban });
      sum += cents(signed); count++;
      if (!minDate || date < minDate) minDate = date;
      if (!maxDate || date > maxDate) maxDate = date;
    });

    let reconciled: boolean | null = null;
    if (opening !== null && closing !== null) {
      reconciled = cents(opening) + sum === cents(closing);
      if (!reconciled) errors.push(`${where} (${iban}): pradžios likutis ${opening.toFixed(2)} + operacijos ${(sum / 100).toFixed(2)} nelygu pabaigos likučiui ${closing.toFixed(2)}: faile trūksta dalies operacijų arba jis pakeistas`);
    } else warnings.push(`${where} (${iban}): faile nėra pradžios/pabaigos likučių, išrašo išsamumo patikrinti negalima`);
    if (skipped) warnings.push(`${where} (${iban}): praleista operacijų, kurių bankas nepatvirtino (ne BOOK): ${skipped}`);
    statements.push({ iban, fromDate: dateOf(stmt.FrToDt?.FrDtTm ? { DtTm: stmt.FrToDt.FrDtTm } : null) || minDate, toDate: dateOf(stmt.FrToDt?.ToDtTm ? { DtTm: stmt.FrToDt.ToDtTm } : null) || maxDate, opening, closing, entries: count, skipped, reconciled });
  });

  if (!errors.length && !rows.length && !statements.every(s => s.entries === 0)) errors.push('Faile nėra operacijų');
  return { rows, errors, columns: {}, ambiguousDirection: false, statements, warnings };
}
