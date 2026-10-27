import { domesticTaxCode, totalsMismatch, type IsafDocument } from './isaf';
import { BASE_UNKNOWN, codedLineProblem, droppedText, EU_VAT_PREFIXES, isLt, PARTY_TEXT, partyFits, partyKind, taxCodeSide, type FrField, type TaxCodeSide } from './tax-codes';
import { vatOnNetCents } from './money';
import { rules } from './rules/registry';

// Draft of the FR0600 amounts that can be derived with confidence. Field numbers and rules: VMI guide KM1739 and the VMI table
// "FR0600 + i.SAF kodas". Domestic taxed lines are classified automatically; other lines count only when the accountant assigned
// an i.SAF code (catalogue in tax-codes.ts). Everything that cannot be derived is reported in `manual`.
// `fields` keeps the original set (11, 25, 29, 29A, 30, 31, 35, 36); the other fields fed by coded lines are in `extended`.
// Field 36 is 29 + 29A + 30 + 31 − 35. When fields 32–34 (VAT the buyer calculates) are not zero, the official formula of field 36
// is not given in the VMI sources available here (KM1739: "apskaičiuojamas automatiškai"), so f36 is null and EDS computes it.
export interface Fr0600Draft {
  fields: { f11: number; f25: number; f29: number; f29a: number; f30: number; f31: number; f35: number; f36: number | null };
  extended: { f12: number; f13: number; f14: number; f15: number; f16: number; f17: number; f18: number; f19: number; f20: number; f21: number; f22: number; f23: number; f24: number; f32: number; f33: number; f34: number };
  // FR0564 (EU supplies report) amounts for information only; f18 is an upper bound (only services to EU VAT payers count).
  fr0564: { f13: number; f14: number; f18: number };
  // VAT the buyer calculates itself (no VAT on the supplier's document): net × rate of the code, per document and code.
  computed: { document: string; code: string; net: number; vat: number }[];
  complete: boolean;
  manual: string[];
  unreviewed: string[];
  notes: string[];
}

const cents = (value: number) => Math.round(value * 100);
const money = (c: number) => c / 100;
const FIELD_BY_CODE: Record<string, 'f29' | 'f29a' | 'f30' | 'f31'> = { PVM1: 'f29', PVM58: 'f29a', PVM2: 'f30', PVM3: 'f31' };
const EXTENDED = ['f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f23', 'f24', 'f32', 'f33', 'f34'] as const;

const vatCodeOf = (doc: IsafDocument) => doc.vatCode.replace(/\s+/g, '').toUpperCase();
function foreignVat(doc: IsafDocument) {
  const vat = vatCodeOf(doc);
  return Boolean(vat) && !/^(LT)?\d+$/.test(vat);
}
const euParty = (doc: IsafDocument) => { const vat = vatCodeOf(doc); return Boolean(vat) && !vat.startsWith('LT') && EU_VAT_PREFIXES.has(vat.slice(0, 2)); };

export function fr0600Draft(sales: IsafDocument[], purchases: IsafDocument[]): Fr0600Draft {
  const t: Record<FrField | 'f35', number> = { f11: 0, f12: 0, f13: 0, f14: 0, f15: 0, f16: 0, f17: 0, f18: 0, f19: 0, f20: 0, f21: 0, f22: 0, f23: 0, f24: 0, f25: 0, f29: 0, f29a: 0, f30: 0, f31: 0, f32: 0, f33: 0, f34: 0, f35: 0 };
  const fr0564 = { f13: 0, f14: 0, f18: 0 };
  const manual: string[] = [];
  const unreviewed: string[] = [];
  const notes: string[] = [];
  const computed: Fr0600Draft['computed'] = [];

  // Lines with an explicit code of one document, grouped by code. Returns false when a line is invalid (listed in `manual`).
  const coded = (doc: IsafDocument, kind: 'SALE' | 'PURCHASE', label: string) => {
    const groups = new Map<string, { side: TaxCodeSide; net: number; vat: number }>();
    for (const line of doc.lines) {
      if (!line.taxCode) continue;
      const side = taxCodeSide(line.taxCode, kind);
      const net = cents(line.net), vat = cents(line.gross) - net;
      if (!side) { manual.push(`${label}: kodas ${line.taxCode} netaikomas ${kind === 'SALE' ? 'pardavimams' : 'pirkimams'}`); continue; }
      const problem = codedLineProblem(line.taxCode, side, { rate: line.rate, net, vat }, doc.date.slice(0, 10), doc.docType === 'KS');
      if (problem) { manual.push(`${label}: ${problem}`); continue; }
      const g = groups.get(line.taxCode) || { side, net: 0, vat: 0 };
      g.net += net; g.vat += vat; groups.set(line.taxCode, g);
    }
    for (const [code, g] of groups) {
      const { side } = g;
      // Ordinary domestic purchases coded explicitly (VAT on the document) follow the per-document rule for fields 25 and 35 below.
      if (kind === 'PURCHASE' && side.vat === 'charged') continue;
      if (side.isaf === 'excluded') { notes.push(`${label}: eilutės neįtrauktos į i.SAF; jei tai importas, 26/27 ir 35 laukus užpildykite pagal importo deklaraciją`); continue; }
      if (side.frManual) { manual.push(`${label}: ${code} — ${side.frManual} (dokumento suma ${money(g.net).toFixed(2)} €)`); continue; }
      let vat = g.vat;
      if (side.vat === 'selfAssessed') {
        vat = vatOnNetCents(g.net, side.rate as number);
        computed.push({ document: doc.number || '#' + doc.id, code, net: money(g.net), vat: money(vat) });
      }
      for (const f of [...side.base, ...(euParty(doc) ? side.baseIfEuParty || [] : [])]) t[f] += g.net;
      for (const f of side.vatFields) t[f] += vat;
      if (BASE_UNKNOWN[code]) manual.push(`${label}: ${code} — ${BASE_UNKNOWN[code]} (${money(g.net).toFixed(2)} €)`);
      if (side.deductible && vat !== 0 && (side.vat === 'selfAssessed' || kind === 'SALE')) unreviewed.push(`${label}: ${code} — PVM ${money(vat).toFixed(2)} €: atskaitos teisė nepatikrinta, į 35 lauką neįtraukta`);
      if (side.fr0564) fr0564[`f${side.fr0564.field}`] += g.net;
    }
  };

  // A document whose codes were dropped by an edit, or whose explicit codes do not fit the counterparty (the i.SAF export refuses
  // the same), is listed for manual handling and not summed at all.
  const blocked = (doc: IsafDocument, kind: 'SALE' | 'PURCHASE', label: string) => {
    if (doc.codesDropped) { manual.push(`${label}: ${droppedText(doc.codesDropped)}`); return true; }
    const party = partyKind(doc);
    const wrong = [...new Set(doc.lines.map(l => l.taxCode).filter((c): c is string => Boolean(c)))].filter(code => { const side = taxCodeSide(code, kind); return side && !partyFits(side.party, party); });
    for (const code of wrong) manual.push(`${label}: kodas ${code} leidžiamas tik ${PARTY_TEXT[taxCodeSide(code, kind)!.party]}; dokumentas neįtrauktas`);
    return wrong.length > 0;
  };

  for (const doc of sales) {
    const label = `Pardavimas ${doc.number || '#' + doc.id}`;
    if (!doc.lines.length) { manual.push(`${label}: dokumente nėra eilučių, sumos nenustatytos`); continue; }
    if (totalsMismatch(doc)) { manual.push(`${label}: dokumento suma nelygi eilučių sumai, patikrinkite dokumentą`); continue; }
    if (blocked(doc, 'SALE', label)) continue;
    for (const line of doc.lines) {
      if (line.taxCode) continue;
      const net = cents(line.net);
      const vat = cents(line.gross) - net;
      const code = line.rate != null && line.rate > 0 && vat !== 0 ? domesticTaxCode(line.rate, doc.date) : null;
      if (!code) { manual.push(`${label}: eilutė be apskaičiuoto PVM arba su ${line.rate ?? '—'}% tarifu (12–20 laukus pildykite rankiniu būdu)`); continue; }
      if (foreignVat(doc)) { manual.push(`${label}: pirkėjas su užsienio PVM kodu (17–20 laukus pildykite rankiniu būdu)`); continue; }
      t.f11 += net;
      t[FIELD_BY_CODE[code]] += vat;
    }
    coded(doc, 'SALE', label);
  }
  for (const doc of purchases) {
    const label = `Pirkimas ${doc.number || '#' + doc.id}`;
    if (!doc.lines.length) { manual.push(`${label}: dokumente nėra eilučių, sumos nenustatytos`); continue; }
    if (totalsMismatch(doc)) { manual.push(`${label}: dokumento suma nelygi eilučių sumai, patikrinkite dokumentą`); continue; }
    if (blocked(doc, 'PURCHASE', label)) continue;
    coded(doc, 'PURCHASE', label);
    // Lines without an explicit code and lines coded as ordinary domestic purchases (VAT on the document) keep the original rule:
    // their VAT goes to field 25 and the reviewed deduction of the document to field 35.
    // An explicitly coded line that fails its check (wrong rate) is already listed in `manual` and is not summed here.
    const plain = doc.lines.filter(l => !l.taxCode || (FIELD_BY_CODE[l.taxCode] && !codedLineProblem(l.taxCode, taxCodeSide(l.taxCode, 'PURCHASE')!, { rate: l.rate, net: cents(l.net), vat: cents(l.gross) - cents(l.net) }, doc.date.slice(0, 10), doc.docType === 'KS')));
    if (!plain.length) continue;
    let vatCents = 0;
    let taxed = false;
    for (const line of plain) {
      const vat = cents(line.gross) - cents(line.net);
      if (vat !== 0) { taxed = true; vatCents += vat; }
    }
    if (plain.some(l => !l.taxCode) && foreignVat(doc)) { manual.push(`${label}: tiekėjas su užsienio PVM kodu (21–24 ir 32–34 laukus pildykite rankiniu būdu)`); continue; }
    if (plain.some(l => !l.taxCode) && !vatCodeOf(doc) && !isLt(doc)) { manual.push(`${label}: užsienio tiekėjas be PVM kodo — priskirkite eilutėms i.SAF kodą (21–24 ir 32–34 laukai)`); continue; }
    if (!taxed) continue;
    t.f25 += vatCents;
    if (doc.deductibleVat == null) unreviewed.push(`${label}: atskaitos teisė nepatikrinta, į 35 lauką neįtraukta`);
    else t.f35 += cents(doc.deductibleVat);
  }
  const selfAssessed = t.f32 !== 0 || t.f33 !== 0 || t.f34 !== 0;
  const f36 = selfAssessed ? null : t.f29 + t.f29a + t.f30 + t.f31 - t.f35;
  const extended = Object.fromEntries(EXTENDED.map(f => [f, money(t[f])])) as Fr0600Draft['extended'];
  if (selfAssessed) notes.push('Užpildyti 32–34 laukai (pirkėjo apskaičiuotas PVM): 36 laukas čia neskaičiuojamas — mokėtiną (grąžintiną) sumą apskaičiuos EDS.');
  else if (EXTENDED.some(f => t[f] !== 0)) notes.push('Užpildyti 12–24 laukai: patikrinkite galutinę mokėtiną (grąžintiną) sumą EDS.');
  if (fr0564.f13) notes.push(`FR0564: 13 laukas — ${money(fr0564.f13).toFixed(2)} € (prekių tiekimas ES PVM mokėtojams).`);
  if (fr0564.f14) notes.push(`FR0564: 14 laukas — ${money(fr0564.f14).toFixed(2)} € (trikampė prekyba).`);
  if (fr0564.f18) notes.push(`FR0564: 18 laukas — ne daugiau kaip ${money(fr0564.f18).toFixed(2)} € (tik paslaugos ES PVM mokėtojams, teikiamos kitoje ES šalyje; patikrinkite).`);
  return {
    fields: { f11: money(t.f11), f25: money(t.f25), f29: money(t.f29), f29a: money(t.f29a), f30: money(t.f30), f31: money(t.f31), f35: money(t.f35), f36: f36 === null ? null : money(f36) },
    extended,
    fr0564: { f13: money(fr0564.f13), f14: money(fr0564.f14), f18: money(fr0564.f18) },
    computed,
    complete: !manual.length && !unreviewed.length,
    manual: [...new Set(manual)],
    unreviewed,
    notes,
  };
}

// Monthly period only: the due day of the next month (rules registry vat.return.dueDay, 25), without weekend/holiday carry-over.
export function monthlyDueDate(start: string, end: string): string | null {
  const first = /^(\d{4})-(\d{2})-01$/.exec(start);
  if (!first) return null;
  const last = new Date(Date.UTC(Number(first[1]), Number(first[2]), 0)).toISOString().slice(0, 10);
  if (end !== last) return null;
  const next = new Date(Date.UTC(Number(first[1]), Number(first[2]), rules.number('vat.return.dueDay', end)));
  return next.toISOString().slice(0, 10);
}
