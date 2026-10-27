import { codedLineProblem, droppedText, isLt, isoCountry, normalizedVat, PARTY_TEXT, partyFits, partyKind, taxCodeSide, type PartyRule, type TaxCodeSide } from './tax-codes';
import { vatOnNetCents } from './money';

// i.SAF 1.2 (VMI) register builder. Domestic (LT) documents taxed at the standard/reduced rates are classified automatically;
// other lines need a tax code assigned by the accountant (TaxLineCode, catalogue in tax-codes.ts). Anything doubtful is
// reported in `issues` and no file is produced, so a wrong tax code is never sent.
export interface IsafLine { id?: number; rate: number | null; net: number; gross: number; taxCode?: string | null; name?: string; note?: string | null; }
export interface IsafDocument {
  id: number;
  number: string;
  date: string;
  clientId: number | null;
  name: string;
  code: string;
  vatCode: string;
  country: string;
  lines: IsafLine[];
  deductibleVat?: number | null;
  headerNet?: number;
  headerGross?: number;
  // Sales credit note (KS): negative amounts are allowed only here (VMI check TAXABLE_VALUE_NEGATIVE) and the corrected invoice must be referenced.
  docType?: 'KS' | null;
  original?: { number: string; date: string } | null;
  // Codes of the accountant dropped by an edit of the document (lines replaced); the document needs review before export.
  codesDropped?: string | null;
}
export interface IsafInput {
  company: { name: string; code: string | null; vatCode: string | null };
  period: { start: string; end: string };
  sales: IsafDocument[];
  purchases: IsafDocument[];
  software: { company: string; name: string; version: string };
  now?: Date;
}
export interface IsafResult { xml: string | null; issues: string[]; }

// Codes from VMI table "Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas" (2025-12-17).
// The 12 % rate exists from 2026-01-01.
export function domesticTaxCode(rate: number, date: string): string | null {
  if (rate === 21) return 'PVM1';
  if (rate === 9) return 'PVM2';
  if (rate === 5) return 'PVM3';
  if (rate === 12 && date >= '2026-01-01') return 'PVM58';
  return null;
}

const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c] as string));
const cents = (value: number) => Math.round(value * 100);
const money = (c: number) => (c / 100).toFixed(2);
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(value).toISOString().slice(0, 10) === value;
const tag = (name: string, value: string) => `<${name}>${esc(value)}</${name}>`;
const nil = (name: string) => `<${name} xsi:nil="true"/>`;
const cut = (value: string, max: number) => Array.from(value).slice(0, max).join('');

interface Party { id: string; vat: string; reg: string; country: string | null; name: string; }
type Kind = 'sales' | 'purchases';
const sideOf = (code: string, kind: Kind) => taxCodeSide(code, kind === 'sales' ? 'SALE' : 'PURCHASE');

// The code a line gets without an explicit assignment: domestic taxed rates for a Lithuanian counterparty only.
export function autoTaxCode(doc: IsafDocument, line: IsafLine): string | null {
  const vat = cents(line.gross) - cents(line.net);
  const vatCode = normalizedVat(doc);
  if (line.rate == null || !(line.rate > 0) || vat === 0 || (vatCode ? !vatCode.startsWith('LT') : !isLt(doc))) return null;
  return domesticTaxCode(line.rate, (doc.date || '').slice(0, 10));
}

// rules: the party requirement of every line's code; a line without an explicit code (code null) requires a Lithuanian party, as before.
function party(doc: IsafDocument, label: string, issues: string[], rules: { code: string | null; rule: PartyRule }[]): Party {
  const isLtCountry = isLt(doc);
  const vat = normalizedVat(doc);
  const id = doc.clientId != null ? String(doc.clientId) : (doc.code || doc.name || 'ND');
  const strict = !rules.length || rules.some(r => r.code === null);
  if (strict) {
    if (vat && !vat.startsWith('LT')) issues.push(`${label}: kontrahentui su užsienio PVM kodu ${vat} reikalinga rankinė mokestinė klasifikacija`);
    if (!vat && !isLtCountry) issues.push(`${label}: kontrahentui be PVM kodo nurodyta šalis „${doc.country}“, reikalingas šalies kodas ir klasifikacija`);
  }
  const kind = partyKind(doc);
  for (const r of rules) if (r.code !== null && !partyFits(r.rule, kind)) issues.push(`${label}: kodas ${r.code} leidžiamas tik ${PARTY_TEXT[r.rule]}`);
  // i.SAF 1.2.1: Country is given when the VAT code is "ND" or not from an EU member state; otherwise it stays empty.
  let country: string | null = vat ? null : 'LT';
  if (!strict && kind === 'FOREIGN') {
    country = isoCountry(doc);
    if (!country) issues.push(`${label}: užsienio kontrahentui kortelės šalies lauke nurodykite šalį dviejų raidžių ISO 3166 kodu (pvz., US)`);
  }
  return { id, vat: vat || 'ND', reg: vat ? (doc.code || '') : (doc.code || 'ND'), country, name: doc.name || 'ND' };
}

function partyXml(p: Party, idTag: string | null, withReq: boolean) {
  return (idTag ? tag(idTag, cut(p.id, 70)) : '') + tag('VATRegistrationNumber', cut(p.vat, 35)) + (withReq || p.reg ? tag('RegistrationNumber', cut(p.reg, 35)) : '') + (p.country ? tag('Country', p.country) : nil('Country')) + tag('Name', cut(p.name, 256));
}

// A document whose lines do not add up to its header totals cannot be trusted for a declaration or register.
export function totalsMismatch(doc: IsafDocument) {
  if (doc.headerNet === undefined || doc.headerGross === undefined) return false;
  const net = doc.lines.reduce((n, l) => n + cents(l.net), 0);
  const gross = doc.lines.reduce((n, l) => n + cents(l.gross), 0);
  return net !== cents(doc.headerNet) || gross !== cents(doc.headerGross);
}

export interface CodeGroup { code: string; side: TaxCodeSide; net: number; vat: number; explicit: boolean }
// Groups the lines of one document by tax code (one DocumentTotal per code; VMI refuses repeated codes in one invoice).
// Amounts in cents; for self-assessed codes `vat` is computed from the net amount with the invoice rounding rule.
export function classifyLines(doc: IsafDocument, kind: Kind, label: string, issues: string[]) {
  const groups = new Map<string, CodeGroup>();
  let excluded = 0;
  for (const line of doc.lines) {
    const net = cents(line.net);
    const vat = cents(line.gross) - net;
    const rate = line.rate;
    const credit = doc.docType === 'KS';
    if (line.taxCode) {
      const side = sideOf(line.taxCode, kind);
      if (!side) { issues.push(`${label}: kodas ${line.taxCode} netaikomas ${kind === 'sales' ? 'pardavimams' : 'pirkimams'}`); continue; }
      const problem = codedLineProblem(line.taxCode, side, { rate, net, vat }, doc.date, credit);
      if (problem) { issues.push(`${label}: ${problem}`); continue; }
      if (side.isaf === 'excluded') { excluded++; continue; }
      const g = groups.get(line.taxCode) || { code: line.taxCode, side, net: 0, vat: 0, explicit: true };
      g.net += net; g.vat += side.vat === 'selfAssessed' ? 0 : vat; g.explicit = true; groups.set(line.taxCode, g);
      continue;
    }
    if (credit ? (net >= 0 || vat >= 0) : (net < 0 || vat < 0)) {
      issues.push(credit ? `${label}: kreditiniame dokumente visos sumos turi būti neigiamos` : `${label}: neigiamos sumos leidžiamos tik kreditiniame dokumente`);
      continue;
    }
    if (rate == null || !(rate > 0) || vat === 0) { issues.push(`${label}: eilutei be apskaičiuoto PVM reikalinga rankinė mokestinė klasifikacija`); continue; }
    const code = domesticTaxCode(rate, doc.date);
    if (!code) { issues.push(`${label}: ${rate}% tarifas ${doc.date} datai neturi patvirtinto klasifikatoriaus kodo`); continue; }
    const g = groups.get(code) || { code, side: sideOf(code, kind)!, net: 0, vat: 0, explicit: false };
    g.net += net; g.vat += vat; groups.set(code, g);
  }
  for (const g of groups.values()) if (g.side.vat === 'selfAssessed') g.vat = vatOnNetCents(g.net, g.side.rate as number);
  const allExcluded = excluded > 0 && excluded === doc.lines.length;
  if (excluded && !allExcluded) issues.push(`${label}: dalis eilučių neįtraukta į i.SAF, o dalis įtraukta — toks dokumentas neeksportuojamas`);
  return { groups: [...groups.values()], allExcluded };
}

function totals(kind: Kind, label: string, issues: string[], doc: IsafDocument, groups: CodeGroup[]) {
  if (!groups.length && !doc.lines.length) issues.push(`${label}: dokumentas be eilučių`);
  return groups.map(g => {
    if (g.side.isaf === 'manual') { issues.push(`${label}: kodas ${g.code} automatiškai neeksportuojamas: ${g.side.reason}`); return ''; }
    const percentage = g.side.rate === null ? nil('TaxPercentage') : tag('TaxPercentage', String(g.side.rate));
    const coded = `${tag('TaxableValue', money(g.net))}${tag('TaxCode', g.code)}${percentage}${tag('Amount', money(g.vat))}`;
    return kind === 'sales' ? `<DocumentTotal>${coded}${nil('VATPointDate2')}</DocumentTotal>` : `<DocumentTotal>${coded}</DocumentTotal>`;
  }).join('');
}

const partyRules = (doc: IsafDocument, kind: Kind) => doc.lines.map(l => {
  const side = l.taxCode ? sideOf(l.taxCode, kind) : undefined;
  return side ? { code: l.taxCode as string, rule: side.party } : { code: null, rule: 'LT' as PartyRule };
});

export function buildIsaf(input: IsafInput): IsafResult {
  const issues: string[] = [];
  const { start, end } = input.period;
  if (!validDate(start) || !validDate(end) || start > end) issues.push('Neteisingas laikotarpis');
  else if (start < '2016-10-01') issues.push('i.SAF nesudaromas laikotarpiams iki 2016-10-01');
  const code = (input.company.code || '').replace(/\s+/g, '');
  if (!/^\d{1,11}$/.test(code)) issues.push('Įmonė turi turėti skaitinį juridinio asmens kodą (iki 11 skaitmenų)');
  if (!input.company.vatCode) issues.push('Įmonei nenurodytas PVM kodas');

  const inPeriod = (doc: IsafDocument) => doc.date >= start && doc.date <= end;
  const select = (docs: IsafDocument[], kind: string) => docs.filter(doc => {
    const date = (doc.date || '').slice(0, 10);
    if (!validDate(date)) { issues.push(`${kind} ${doc.number || '#' + doc.id}: neteisinga data`); return false; }
    doc.date = date;
    return inPeriod(doc);
  });
  const sales = select(input.sales, 'Pardavimas');
  const purchases = select(input.purchases, 'Pirkimas');

  const customers = new Map<string, Party>();
  const suppliers = new Map<string, Party>();
  const seen = new Set<string>();
  const check = (kind: string, doc: IsafDocument, key: string) => {
    if (!doc.number) issues.push(`${kind} #${doc.id}: nėra dokumento numerio`);
    if (seen.has(key)) issues.push(`${kind} ${doc.number}: numeris kartojasi tame pačiame faile`);
    seen.add(key);
  };

  const salesXml = sales.map(doc => {
    const label = `Pardavimas ${doc.number || '#' + doc.id}`;
    const mismatch = totalsMismatch(doc);
    const lineIssues: string[] = [];
    const classified = mismatch ? { groups: [], allExcluded: false } : classifyLines(doc, 'sales', label, lineIssues);
    if (classified.allExcluded && !lineIssues.length && !doc.codesDropped) return '';
    check('Pardavimas', doc, `S|${doc.number}`);
    const p = party(doc, label, issues, partyRules(doc, 'sales'));
    if (doc.codesDropped) issues.push(`${label}: ${droppedText(doc.codesDropped)}`);
    customers.set(p.id, p);
    if (mismatch) issues.push(`${label}: dokumento suma nelygi eilučių sumai, patikrinkite dokumentą`);
    issues.push(...lineIssues);
    const dt = mismatch ? '' : totals('sales', label, issues, doc, classified.groups);
    const credit = doc.docType === 'KS';
    if (credit && !doc.original) issues.push(`${label}: kreditiniam dokumentui nenurodyta nuoroda į pradinę sąskaitą`);
    const references = credit && doc.original ? `<References><Reference>${tag('ReferenceNo', cut(doc.original.number, 70))}${tag('ReferenceDate', doc.original.date)}</Reference></References>` : '<References/>';
    return `<Invoice>${tag('InvoiceNo', cut(doc.number, 70))}<CustomerInfo>${partyXml(p, 'CustomerID', false)}</CustomerInfo>${tag('InvoiceDate', doc.date)}${tag('InvoiceType', credit ? 'KS' : 'SF')}${tag('SpecialTaxation', '')}${references}${nil('VATPointDate')}<DocumentTotals>${dt}</DocumentTotals></Invoice>`;
  }).join('');
  const purchasesXml = purchases.map(doc => {
    const label = `Pirkimas ${doc.number || '#' + doc.id}`;
    const mismatch = totalsMismatch(doc);
    const lineIssues: string[] = [];
    const classified = mismatch ? { groups: [], allExcluded: false } : classifyLines(doc, 'purchases', label, lineIssues);
    if (classified.allExcluded && !lineIssues.length && !doc.codesDropped) return '';
    check('Pirkimas', doc, `P|${doc.clientId ?? doc.code ?? doc.name}|${doc.number}`);
    const p = party(doc, label, issues, partyRules(doc, 'purchases'));
    if (doc.codesDropped) issues.push(`${label}: ${droppedText(doc.codesDropped)}`);
    if (p.vat === 'ND' && doc.lines.some(l => cents(l.gross) - cents(l.net) !== 0)) issues.push(`${label}: pirkime yra PVM, bet tiekėjas neturi PVM kodo: nurodykite jį kontrahento kortelėje`);
    suppliers.set(p.id, p);
    if (mismatch) issues.push(`${label}: dokumento suma nelygi eilučių sumai, patikrinkite dokumentą`);
    issues.push(...lineIssues);
    const dt = mismatch ? '' : totals('purchases', label, issues, doc, classified.groups);
    const credit = doc.docType === 'KS';
    if (credit && !doc.original) issues.push(`${label}: kreditiniam dokumentui nenurodyta nuoroda į pradinį dokumentą`);
    const references = credit && doc.original ? `<References><Reference>${tag('ReferenceNo', cut(doc.original.number, 70))}${tag('ReferenceDate', doc.original.date)}</Reference></References>` : '<References/>';
    return `<Invoice>${tag('InvoiceNo', cut(doc.number, 70))}<SupplierInfo>${partyXml(p, 'SupplierID', false)}</SupplierInfo>${tag('InvoiceDate', doc.date)}${tag('InvoiceType', credit ? 'KS' : 'SF')}${tag('SpecialTaxation', '')}${references}${nil('VATPointDate')}${nil('RegistrationAccountDate')}<DocumentTotals>${dt}</DocumentTotals></Invoice>`;
  }).join('');

  if (issues.length) return { xml: null, issues: [...new Set(issues)] };

  const master = (map: Map<string, Party>, outer: string, inner: string, idTag: string) => map.size ? `<${outer}>${[...map.values()].map(p => `<${inner}>${tag(idTag, cut(p.id, 70))}${tag('VATRegistrationNumber', cut(p.vat, 35))}${tag('RegistrationNumber', cut(p.reg, 35))}${p.country ? tag('Country', p.country) : nil('Country')}${tag('Name', cut(p.name, 256))}</${inner}>`).join('')}</${outer}>` : '';
  const masterXml = master(customers, 'Customers', 'Customer', 'CustomerID') + master(suppliers, 'Suppliers', 'Supplier', 'SupplierID');
  const created = (input.now || new Date()).toISOString().slice(0, 19);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<iSAFFile xmlns="http://www.vmi.lt/cms/imas/isaf" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<Header><FileDescription>${tag('FileVersion', 'iSAF1.2')}${tag('FileDateCreated', created)}${tag('DataType', 'F')}${tag('SoftwareCompanyName', cut(input.software.company, 256))}${tag('SoftwareName', cut(input.software.name, 256))}${tag('SoftwareVersion', cut(input.software.version, 24))}${tag('RegistrationNumber', code)}${tag('NumberOfParts', '1')}${tag('PartNumber', '1')}<SelectionCriteria>${tag('SelectionStartDate', start)}${tag('SelectionEndDate', end)}</SelectionCriteria></FileDescription></Header>`
    + (masterXml ? `<MasterFiles>${masterXml}</MasterFiles>` : '')
    + (salesXml || purchasesXml ? `<SourceDocuments>${purchasesXml ? `<PurchaseInvoices>${purchasesXml}</PurchaseInvoices>` : ''}${salesXml ? `<SalesInvoices>${salesXml}</SalesInvoices>` : ''}</SourceDocuments>` : '')
    + `</iSAFFile>`;
  return { xml, issues: [] };
}
