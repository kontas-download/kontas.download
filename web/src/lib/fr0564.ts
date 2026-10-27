import { totalsMismatch, type IsafDocument } from './isaf';
import { codedLineProblem, droppedText, EU_VAT_PREFIXES, isoCountry, normalizedVat, partyKind, taxCodeSide } from './tax-codes';
import { rules } from './rules/registry';

// Draft of the monthly FR0564 report (supplies of goods and services to other EU member states). Rules: VMI order VA-34 as amended
// by VA-40 (in force from 2025-05-01, docs/vmi/AR_2025-05-01.pdf): one main-sheet row per buyer VAT code (field 11 country prefix,
// 12 code without prefix, 13 goods, 14 goods in triangular trade, 18 services); amounts in whole euro (49 cents down, 50 up);
// credit notes reduce the amounts (negative sums are allowed). Fields are fed by the existing i.SAF code catalogue (tax-codes.ts,
// `fr0564`): goods (PVM13) → 13, triangular trade (PVM19) → 14, services outside the scope of LT VAT (PVM15, PVM34) → 18, the last
// only conditionally. Lines the application cannot classify are listed in `manual`; nothing is guessed.
export interface Fr0564Row {
  country: string; // field 11
  vatCode: string; // field 12 (without the country prefix)
  // exact amounts in euro and the whole-euro values for the form
  f13: number; f14: number; f18: number;
  r13: number; r14: number; r18: number;
  customers: string[];
  documents: string[];
}
export interface Fr0564Draft {
  rows: Fr0564Row[];
  totals: { r13: number; r14: number; r18: number };
  complete: boolean;
  manual: string[];
  notes: string[];
  // Fields of the form that the application cannot fill; the accountant completes them in EDS.
  notFilled: string[];
}

export const FR0564_NOT_FILLED = [
  'FR0564R / FR0564T / FR0564TP priedai (prekių išvežimas pagal pareikalavimą, perkėlimas, grąžinimas) — programa nevaldo šių duomenų',
  '13 laukas: ne tik 0 % tiekimai pagal PVMĮ 49 str. 1 d., bet ir 4.2 punkto perkėlimai savo reikmėms bei 4.1.3 punkto atvejai — programa jų nepažįsta',
  '18 laukas: programa nežino, ar paslaugos teikimo vieta yra kita valstybė narė ir ar paslauga ten neapmokestinama; avansai (4.5 p.) ir ankstesnio mėnesio avanso atėmimas neskaičiuojami',
  'Pirkėjo PVM kodo struktūros ir galiojimo (VIES) patikra',
  '1–3, 7, 8 laukai pildomi EDS pagal įmonės rekvizitus (3 laukas — PVM kodas be „LT“); didelių ataskaitų papildomi lapai (FR0564P) sudaromi EDS',
];

const cents = (value: number) => Math.round(value * 100);
// Whole euro: 49 cents and less are dropped, 50 and more count as a whole euro (same rule for negative sums, by magnitude).
const wholeEuro = (c: number) => (c < 0 ? -1 : 1) * Math.floor((Math.abs(c) + 50) / 100);

export function fr0564Draft(sales: IsafDocument[]): Fr0564Draft {
  const manual: string[] = [];
  const notes: string[] = [];
  const groups = new Map<string, { country: string; vatCode: string; f13: number; f14: number; f18: number; customers: Set<string>; documents: Set<string> }>();

  for (const doc of sales) {
    const label = `Pardavimas ${doc.number || '#' + doc.id}`;
    if (!doc.lines.length) { manual.push(`${label}: dokumente nėra eilučių, sumos nenustatytos`); continue; }
    if (totalsMismatch(doc)) { manual.push(`${label}: dokumento suma nelygi eilučių sumai, patikrinkite dokumentą`); continue; }
    const vat = normalizedVat(doc);
    const kind = partyKind(doc);
    const euCountry = kind === 'LT' ? null : (isoCountry(doc) && EU_VAT_PREFIXES.has(isoCountry(doc)!) ? isoCountry(doc) : null);
    // Without an EU VAT code the supply is not an FR0564 supply; a document the accountant coded for FR0564 or an EU buyer
    // without a VAT code is flagged instead of being dropped silently.
    if (kind !== 'EU_VAT') {
      const flagged = doc.lines.some(l => (l.taxCode && taxCodeSide(l.taxCode, 'SALE')?.fr0564) || (euCountry && !vat && !l.taxCode && cents(l.gross) === cents(l.net)));
      if (flagged) manual.push(`${label}: pirkėjas ${doc.name || doc.code || '—'} neturi kitos ES šalies PVM kodo — FR0564 eilutė nesudaroma; įrašykite pirkėjo PVM kodą arba patikrinkite, ar tiekimas ataskaitoje reikalingas`);
      continue;
    }
    if (doc.codesDropped) { manual.push(`${label}: ${droppedText(doc.codesDropped)}`); continue; }
    const country = vat.slice(0, 2) === 'EL' ? 'EL' : vat.slice(0, 2);
    const code = vat.slice(2).replace(/[^A-Z0-9]/g, '');
    const key = country + code;
    const g = groups.get(key) || { country, vatCode: code, f13: 0, f14: 0, f18: 0, customers: new Set<string>(), documents: new Set<string>() };
    let used = false;
    for (const line of doc.lines) {
      const net = cents(line.net), lineVat = cents(line.gross) - net;
      const side = line.taxCode ? taxCodeSide(line.taxCode, 'SALE') : undefined;
      if (!line.taxCode) {
        if (lineVat === 0) manual.push(`${label}: eilutė be PVM ir be i.SAF kodo — priskirkite kodą (prekės PVM13, trikampė prekyba PVM19, paslaugos PVM15 / PVM34), kad būtų galima priskirti 13, 14 ar 18 laukui`);
        continue;
      }
      if (!side?.fr0564) continue;
      const problem = codedLineProblem(line.taxCode, side, { rate: line.rate, net, vat: lineVat }, doc.date.slice(0, 10), doc.docType === 'KS');
      if (problem) { manual.push(`${label}: ${problem}`); continue; }
      g[`f${side.fr0564.field}`] += net;
      used = true;
      if (side.fr0564.conditional) notes.push(`${label}: ${line.taxCode} suma įtraukta į 18 lauką — tikrinkite, ar tai paslaugos ES PVM mokėtojui, kurių teikimo vieta yra kita valstybė narė`);
    }
    if (used) { g.customers.add(doc.name || doc.code || '—'); g.documents.add(label); groups.set(key, g); }
  }

  const rows: Fr0564Row[] = [...groups.values()].sort((a, b) => (a.country + a.vatCode).localeCompare(b.country + b.vatCode)).map(g => ({
    country: g.country, vatCode: g.vatCode,
    f13: g.f13 / 100, f14: g.f14 / 100, f18: g.f18 / 100,
    r13: wholeEuro(g.f13), r14: wholeEuro(g.f14), r18: wholeEuro(g.f18),
    customers: [...g.customers], documents: [...g.documents],
  }));
  const totals = rows.reduce((t, r) => ({ r13: t.r13 + r.r13, r14: t.r14 + r.r14, r18: t.r18 + r.r18 }), { r13: 0, r14: 0, r18: 0 });
  if (rows.some(r => r.r13 < 0 || r.r14 < 0 || r.r18 < 0)) notes.push('Yra neigiamų sumų: kreditinės sąskaitos viršija mėnesio tiekimus (leidžiama, 32 punktas); ataskaitą tikslinkite pagal taisykles');
  return { rows, totals, complete: !manual.length, manual: [...new Set(manual)], notes: [...new Set(notes)], notFilled: FR0564_NOT_FILLED };
}

// Monthly period: the due day of the next month (rules registry calendar.fr0564.dueDay, 25), without weekend/holiday carry-over.
export function fr0564DueDate(start: string, end: string): string | null {
  const first = /^(\d{4})-(\d{2})-01$/.exec(start);
  if (!first) return null;
  const last = new Date(Date.UTC(Number(first[1]), Number(first[2]), 0)).toISOString().slice(0, 10);
  if (end !== last) return null;
  return new Date(Date.UTC(Number(first[1]), Number(first[2]), rules.number('calendar.fr0564.dueDay', end))).toISOString().slice(0, 10);
}
