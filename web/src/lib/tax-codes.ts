// Catalogue of the i.SAF tax codes the accountant can assign to a sale or purchase line. Single source of truth for the i.SAF
// export, the FR0600 draft, API validation, the UI and the help pages.
// Sources (docs/vmi): VMI table "Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas" (FR0600 fields per code),
// i.SAF 1.2.1 description (TaxPercentage is empty when the classifier has no rate, "0" for 0 %; purchase TaxCode is filled when the
// buyer must calculate the VAT; VATRegistrationNumber "ND" + Country when the party has no VAT code or a non-EU one) and the
// i.SAF import checks (TAX_ROW_AMOUNT_MISMATCH: Amount = TaxableValue × TaxPercentage; PVM13 only for an EU VAT payer).

export type TaxKind = 'SALE' | 'PURCHASE';
export type Lang3 = 'lt' | 'ru' | 'en';
// charged: the document itself carries VAT at the code's rate; zero: no VAT on the document (0 % or outside VAT);
// selfAssessed: no VAT on the document, the buyer calculates it (net × rate); margin: VAT is calculated on the margin, not on the invoice.
export type VatMode = 'charged' | 'zero' | 'selfAssessed' | 'margin';
// LT: Lithuanian party; EU_VAT: party with a VAT code of another EU member state; FOREIGN: any non-Lithuanian party;
// NON_EU_VAT: non-Lithuanian party without an EU VAT code; ANY: no restriction.
export type PartyRule = 'LT' | 'EU_VAT' | 'FOREIGN' | 'NON_EU_VAT' | 'ANY';
export type FrField = 'f11' | 'f12' | 'f13' | 'f14' | 'f15' | 'f16' | 'f17' | 'f18' | 'f19' | 'f20' | 'f21' | 'f22' | 'f23' | 'f24' | 'f25' | 'f29' | 'f29a' | 'f30' | 'f31' | 'f32' | 'f33' | 'f34';

export interface TaxCodeSide {
  // TaxPercentage in i.SAF; null = element left empty (no rate under the classifier).
  rate: number | null;
  vat: VatMode;
  party: PartyRule;
  // FR0600 fields fed by the net amount and by the VAT amount (document VAT or the self-assessed VAT).
  base: FrField[];
  vatFields: FrField[];
  // Base field added only when the supplier has an EU VAT code (PVM60: field 24).
  baseIfEuParty?: FrField[];
  // The VAT may be deducted (field 35) if PVMĮ art. 58 allows it; the right to deduct is not known to the application.
  deductible?: boolean;
  // FR0564 field fed by the net amount; conditional = only in certain cases (services to EU VAT payers).
  fr0564?: { field: '13' | '14' | '18'; conditional?: boolean };
  // export: exported to i.SAF; manual: refused with `reason`; excluded: never exported (not a purchase invoice for i.SAF).
  isaf: 'export' | 'manual' | 'excluded';
  reason?: string;
  // The FR0600 amounts cannot be derived from the document (reason in Russian, like other issue texts).
  frManual?: string;
  from?: string;
}
export interface TaxCodeDef { code: string; title: Record<Lang3, string>; sale?: TaxCodeSide; purchase?: TaxCodeSide; }

const MANUAL_REVERSE_SALE = 'pardavėjo TaxPercentage tarifas taikant atvirkštinį apmokestinimą (PVMĮ 96 str.) pagal VMI dokumentus aiškiai nenustatytas';
const MANUAL_TRIANGLE = 'trikampė prekyba (II grandis): tarifas ir kontrahentų duomenys i.SAF pagal VMI dokumentus aiškiai nenustatyti';
const MANUAL_MARGIN = 'maržos schema: mokesčio bazė yra marža, o ne sąskaitos suma; tarifas ir suma i.SAF pagal VMI dokumentus nenustatyti';
const MANUAL_INTERNAL = 'vidinis dokumentas be pirkėjo: kontrahento duomenys i.SAF pagal VMI dokumentus nenustatyti';
const FR_MARGIN = 'maržos schema: 16 laukas — teigiama marža, maržos PVM (29/30/31) apskaičiuokite rankiniu būdu';

const domestic = (rate: number, field: FrField, from?: string): Pick<TaxCodeDef, 'sale' | 'purchase'> => ({
  sale: { rate, vat: 'charged', party: 'ANY', base: ['f11'], vatFields: [field], isaf: 'export', from },
  purchase: { rate, vat: 'charged', party: 'ANY', base: [], vatFields: ['f25'], deductible: true, isaf: 'export', from },
});
const selfPurchase = (rate: number, party: PartyRule, base: FrField[], vatFields: FrField[], from?: string, baseIfEuParty?: FrField[]): TaxCodeSide =>
  ({ rate, vat: 'selfAssessed', party, base, vatFields, deductible: true, isaf: 'export', from, ...(baseIfEuParty ? { baseIfEuParty } : {}) });
const marginSale = (rate: number | null, field: FrField | null): TaxCodeSide => ({ rate, vat: 'margin', party: 'ANY', base: ['f16'], vatFields: field ? [field] : [], isaf: 'manual', reason: MANUAL_MARGIN, frManual: FR_MARGIN });
const marginPurchase = (rate: number): TaxCodeSide => ({ rate, vat: 'margin', party: 'ANY', base: [], vatFields: [], isaf: 'manual', reason: MANUAL_MARGIN });
const privateUse = (rate: number, field: FrField, from?: string): TaxCodeSide => ({ rate, vat: 'charged', party: 'ANY', base: ['f14'], vatFields: [field], isaf: 'manual', reason: MANUAL_INTERNAL, from });

export const TAX_CODES: TaxCodeDef[] = [
  { code: 'PVM1', title: { lt: 'PVM1 — 21 % PVM Lietuvoje', ru: 'PVM1 — НДС 21 % в Литве', en: 'PVM1 — 21% VAT in Lithuania' }, ...domestic(21, 'f29') },
  { code: 'PVM58', title: { lt: 'PVM58 — 12 % PVM Lietuvoje (nuo 2026-01-01)', ru: 'PVM58 — НДС 12 % в Литве (с 2026-01-01)', en: 'PVM58 — 12% VAT in Lithuania (from 2026-01-01)' }, ...domestic(12, 'f29a', '2026-01-01') },
  { code: 'PVM2', title: { lt: 'PVM2 — 9 % PVM Lietuvoje', ru: 'PVM2 — НДС 9 % в Литве', en: 'PVM2 — 9% VAT in Lithuania' }, ...domestic(9, 'f30') },
  { code: 'PVM3', title: { lt: 'PVM3 — 5 % PVM Lietuvoje', ru: 'PVM3 — НДС 5 % в Литве', en: 'PVM3 — 5% VAT in Lithuania' }, ...domestic(5, 'f31') },
  {
    code: 'PVM25', title: { lt: 'PVM25 — atvirkštinis apmokestinimas (PVMĮ 96 str.), 21 %', ru: 'PVM25 — обратное начисление (ст. 96 PVMĮ), 21 %', en: 'PVM25 — domestic reverse charge (VAT Act art. 96), 21%' },
    sale: { rate: null, vat: 'zero', party: 'LT', base: ['f12'], vatFields: [], isaf: 'manual', reason: MANUAL_REVERSE_SALE },
    purchase: selfPurchase(21, 'LT', [], ['f25', 'f33']),
  },
  { code: 'PVM26', title: { lt: 'PVM26 — atvirkštinis apmokestinimas (PVMĮ 96 str.), 9 %', ru: 'PVM26 — обратное начисление (ст. 96 PVMĮ), 9 %', en: 'PVM26 — domestic reverse charge (VAT Act art. 96), 9%' }, purchase: selfPurchase(9, 'LT', [], ['f25', 'f33']) },
  { code: 'PVM27', title: { lt: 'PVM27 — atvirkštinis apmokestinimas (PVMĮ 96 str.), 5 %', ru: 'PVM27 — обратное начисление (ст. 96 PVMĮ), 5 %', en: 'PVM27 — domestic reverse charge (VAT Act art. 96), 5%' }, purchase: selfPurchase(5, 'LT', [], ['f25', 'f33']) },
  {
    code: 'PVM13', title: { lt: 'PVM13 — prekių tiekimas ES PVM mokėtojui, 0 % (taip pat trikampės prekybos I grandis)', ru: 'PVM13 — поставка товаров плательщику НДС ЕС, 0 % (также I звено трёхсторонней торговли)', en: 'PVM13 — supply of goods to an EU VAT payer, 0% (also triangular trade, 1st link)' },
    sale: { rate: 0, vat: 'zero', party: 'EU_VAT', base: ['f18'], vatFields: [], fr0564: { field: '13' }, isaf: 'export' },
  },
  {
    code: 'PVM19', title: { lt: 'PVM19 — trikampė prekyba, II grandis', ru: 'PVM19 — трёхсторонняя торговля, II звено', en: 'PVM19 — triangular trade, 2nd link' },
    sale: { rate: null, vat: 'zero', party: 'ANY', base: ['f20'], vatFields: [], fr0564: { field: '14' }, isaf: 'manual', reason: MANUAL_TRIANGLE },
    purchase: { rate: null, vat: 'zero', party: 'ANY', base: ['f22'], vatFields: [], isaf: 'manual', reason: MANUAL_TRIANGLE },
  },
  { code: 'PVM12', title: { lt: 'PVM12 — prekių eksportas, 0 % (PVMĮ 41 str.)', ru: 'PVM12 — экспорт товаров, 0 % (ст. 41 PVMĮ)', en: 'PVM12 — export of goods, 0% (VAT Act art. 41)' }, sale: { rate: 0, vat: 'zero', party: 'FOREIGN', base: ['f17'], vatFields: [], isaf: 'export' } },
  { code: 'PVM5', title: { lt: 'PVM5 — PVM neapmokestinami sandoriai (PVMĮ 20–33 str.)', ru: 'PVM5 — операции, освобождённые от НДС (ст. 20–33 PVMĮ)', en: 'PVM5 — VAT-exempt supplies (VAT Act art. 20–33)' }, sale: { rate: null, vat: 'zero', party: 'ANY', base: ['f13'], vatFields: [], isaf: 'export' } },
  { code: 'PVM32', title: { lt: 'PVM32 — maržos schema, 21 %', ru: 'PVM32 — схема маржи, 21 %', en: 'PVM32 — margin scheme, 21%' }, sale: marginSale(21, 'f29'), purchase: marginPurchase(21) },
  { code: 'PVM52', title: { lt: 'PVM52 — maržos schema, 9 %', ru: 'PVM52 — схема маржи, 9 %', en: 'PVM52 — margin scheme, 9%' }, sale: marginSale(9, 'f30'), purchase: marginPurchase(9) },
  { code: 'PVM53', title: { lt: 'PVM53 — maržos schema, 5 %', ru: 'PVM53 — схема маржи, 5 %', en: 'PVM53 — margin scheme, 5%' }, sale: marginSale(5, 'f31'), purchase: marginPurchase(5) },
  { code: 'PVM33', title: { lt: 'PVM33 — maržos schema, 0 % (PVMĮ 108¹ str.)', ru: 'PVM33 — схема маржи, 0 % (ст. 108¹ PVMĮ)', en: 'PVM33 — margin scheme, 0% (VAT Act art. 108¹)' }, sale: marginSale(0, null), purchase: marginPurchase(0) },
  {
    code: 'PVM14', title: { lt: 'PVM14 — kiti 0 % PVM sandoriai Lietuvoje (PVMĮ 42–53 str.)', ru: 'PVM14 — прочие операции по ставке 0 % в Литве (ст. 42–53 PVMĮ)', en: 'PVM14 — other 0% VAT transactions in Lithuania (VAT Act art. 42–53)' },
    sale: { rate: 0, vat: 'zero', party: 'ANY', base: ['f19'], vatFields: [], isaf: 'export' },
    purchase: { rate: 0, vat: 'zero', party: 'LT', base: [], vatFields: [], isaf: 'export' },
  },
  { code: 'PVM15', title: { lt: 'PVM15 — ne PVM objektas Lietuvoje, atskaita galima', ru: 'PVM15 — не объект НДС в Литве, вычет разрешён', en: 'PVM15 — outside the scope of LT VAT, deduction allowed' }, sale: { rate: null, vat: 'zero', party: 'ANY', base: ['f20'], vatFields: [], fr0564: { field: '18', conditional: true }, isaf: 'export' } },
  { code: 'PVM34', title: { lt: 'PVM34 — ne PVM objektas Lietuvoje, atskaita negalima', ru: 'PVM34 — не объект НДС в Литве, вычет не разрешён', en: 'PVM34 — outside the scope of LT VAT, no deduction' }, sale: { rate: null, vat: 'zero', party: 'ANY', base: ['f20'], vatFields: [], fr0564: { field: '18', conditional: true }, isaf: 'export' } },
  { code: 'PVM9', title: { lt: 'PVM9 — ilgalaikio turto pasigaminimas, 21 %', ru: 'PVM9 — изготовление основных средств своими силами, 21 %', en: 'PVM9 — self-produced fixed assets, 21%' }, sale: { rate: 21, vat: 'charged', party: 'ANY', base: ['f15'], vatFields: ['f29', 'f25'], deductible: true, isaf: 'manual', reason: MANUAL_INTERNAL } },
  { code: 'PVM6', title: { lt: 'PVM6 — suvartojimas privatiems poreikiams, 21 %', ru: 'PVM6 — потребление на личные нужды, 21 %', en: 'PVM6 — private use, 21%' }, sale: privateUse(21, 'f29') },
  { code: 'PVM59', title: { lt: 'PVM59 — suvartojimas privatiems poreikiams, 12 % (nuo 2026-01-01)', ru: 'PVM59 — потребление на личные нужды, 12 % (с 2026-01-01)', en: 'PVM59 — private use, 12% (from 2026-01-01)' }, sale: privateUse(12, 'f29a', '2026-01-01') },
  { code: 'PVM7', title: { lt: 'PVM7 — suvartojimas privatiems poreikiams, 9 %', ru: 'PVM7 — потребление на личные нужды, 9 %', en: 'PVM7 — private use, 9%' }, sale: privateUse(9, 'f30') },
  { code: 'PVM8', title: { lt: 'PVM8 — suvartojimas privatiems poreikiams, 5 %', ru: 'PVM8 — потребление на личные нужды, 5 %', en: 'PVM8 — private use, 5%' }, sale: privateUse(5, 'f31') },
  { code: 'PVM16', title: { lt: 'PVM16 — prekių įsigijimas iš ES PVM mokėtojo, 21 %', ru: 'PVM16 — приобретение товаров у плательщика НДС ЕС, 21 %', en: 'PVM16 — acquisition of goods from an EU VAT payer, 21%' }, purchase: selfPurchase(21, 'EU_VAT', ['f21'], ['f25', 'f34']) },
  { code: 'PVM17', title: { lt: 'PVM17 — prekių įsigijimas iš ES PVM mokėtojo, 9 %', ru: 'PVM17 — приобретение товаров у плательщика НДС ЕС, 9 %', en: 'PVM17 — acquisition of goods from an EU VAT payer, 9%' }, purchase: selfPurchase(9, 'EU_VAT', ['f21'], ['f25', 'f34']) },
  { code: 'PVM18', title: { lt: 'PVM18 — prekių įsigijimas iš ES PVM mokėtojo, 5 %', ru: 'PVM18 — приобретение товаров у плательщика НДС ЕС, 5 %', en: 'PVM18 — acquisition of goods from an EU VAT payer, 5%' }, purchase: selfPurchase(5, 'EU_VAT', ['f21'], ['f25', 'f34']) },
  { code: 'PVM21', title: { lt: 'PVM21 — paslaugos iš ES PVM mokėtojo, 21 % (PVMĮ 95 str. 2 d.)', ru: 'PVM21 — услуги от плательщика НДС ЕС, 21 % (ст. 95 ч. 2 PVMĮ)', en: 'PVM21 — services from an EU VAT payer, 21% (VAT Act art. 95(2))' }, purchase: selfPurchase(21, 'EU_VAT', ['f23', 'f24'], ['f25', 'f32']) },
  { code: 'PVM20', title: { lt: 'PVM20 — paslaugos iš trečiųjų šalių ar ES ne PVM mokėtojo, 21 %', ru: 'PVM20 — услуги из третьих стран или от неплательщика НДС ЕС, 21 %', en: 'PVM20 — services from third countries or an EU non-VAT payer, 21%' }, purchase: selfPurchase(21, 'NON_EU_VAT', ['f23'], ['f25', 'f32']) },
  { code: 'PVM43', title: { lt: 'PVM43 — pirkėjas apskaičiuoja PVM (trikampės prekybos III grandis, PVMĮ 95 str. 3 ir 5 d.), 21 %', ru: 'PVM43 — НДС начисляет покупатель (III звено трёхсторонней торговли, ст. 95 ч. 3 и 5 PVMĮ), 21 %', en: 'PVM43 — buyer accounts for VAT (triangular trade 3rd link, VAT Act art. 95(3),(5)), 21%' }, purchase: selfPurchase(21, 'FOREIGN', [], ['f25', 'f32']) },
  { code: 'PVM44', title: { lt: 'PVM44 — pirkėjas apskaičiuoja PVM (PVMĮ 95 str. 5 d.), 9 %', ru: 'PVM44 — НДС начисляет покупатель (ст. 95 ч. 5 PVMĮ), 9 %', en: 'PVM44 — buyer accounts for VAT (VAT Act art. 95(5)), 9%' }, purchase: selfPurchase(9, 'FOREIGN', [], ['f25', 'f32']) },
  { code: 'PVM45', title: { lt: 'PVM45 — pirkėjas apskaičiuoja PVM (PVMĮ 95 str. 3 ir 5 d.), 5 %', ru: 'PVM45 — НДС начисляет покупатель (ст. 95 ч. 3 и 5 PVMĮ), 5 %', en: 'PVM45 — buyer accounts for VAT (VAT Act art. 95(3),(5)), 5%' }, purchase: selfPurchase(5, 'FOREIGN', [], ['f25', 'f32']) },
  { code: 'PVM60', title: { lt: 'PVM60 — pirkėjas apskaičiuoja PVM už paslaugas (PVMĮ 95 str. 5 d.), 12 % (nuo 2026-01-01)', ru: 'PVM60 — НДС за услуги начисляет покупатель (ст. 95 ч. 5 PVMĮ), 12 % (с 2026-01-01)', en: 'PVM60 — buyer accounts for VAT on services (VAT Act art. 95(5)), 12% (from 2026-01-01)' }, purchase: selfPurchase(12, 'FOREIGN', ['f23'], ['f25', 'f32'], '2026-01-01', ['f24']) },
  {
    code: 'EXCLUDED', title: { lt: 'Neįtraukiama į i.SAF (pvz., importas – PVM sumokamas muitinei)', ru: 'Не включается в i.SAF (например, импорт — НДС уплачивается таможне)', en: 'Not included in i.SAF (e.g. import — VAT paid to customs)' },
    purchase: { rate: null, vat: 'zero', party: 'ANY', base: [], vatFields: [], isaf: 'excluded' },
  },
];

// PVM43–45 for services (art. 95(5)) also need fields 23/24, which cannot be told apart from goods on the document.
export const BASE_UNKNOWN: Record<string, string> = Object.fromEntries(['PVM43', 'PVM44', 'PVM45'].map(c => [c, 'jei tai paslaugos (PVMĮ 95 str. 5 d.), vertę į 23 lauką (ir į 24 — jei tiekėjas yra ES PVM mokėtojas) įrašykite rankiniu būdu']));

const BY_CODE = new Map(TAX_CODES.map(d => [d.code, d]));
export const taxCodeDef = (code: string) => BY_CODE.get(code);
export function taxCodeSide(code: string, kind: TaxKind): TaxCodeSide | undefined {
  const def = BY_CODE.get(code);
  return kind === 'SALE' ? def?.sale : def?.purchase;
}
export const codesFor = (kind: TaxKind) => TAX_CODES.filter(d => (kind === 'SALE' ? d.sale : d.purchase)).map(d => d.code);

// Problem of a line with an explicitly assigned code, or null. Amounts in cents; `vat` is the VAT on the document line.
export function codedLineProblem(code: string, side: TaxCodeSide, line: { rate: number | null; net: number; vat: number }, date: string, credit: boolean): string | null {
  if (side.from && date < side.from) return `kodas ${code} taikomas tik nuo ${side.from}`;
  if (line.net === 0) return `kodas ${code}: eilutė su nuline verte`;
  if (credit ? line.net > 0 || line.vat > 0 : line.net < 0 || line.vat < 0) return credit ? 'kreditiniame dokumente visos sumos turi būti neigiamos' : 'neigiamos sumos leidžiamos tik kreditiniame dokumente';
  const rate = line.rate ?? 0;
  if (side.vat === 'charged') {
    if (rate !== side.rate || line.vat === 0) return `kodui ${code} reikalingas ${side.rate}% tarifas ir apskaičiuotas PVM, o eilutėje yra ${line.rate ?? '—'}%`;
  } else if (side.vat === 'zero' || side.vat === 'selfAssessed') {
    if (line.vat !== 0 || rate !== 0) return side.vat === 'zero' ? `kodas ${code} leidžiamas tik eilutei be PVM (0 %)` : `kodas ${code}: PVM apskaičiuoja pirkėjas, tiekėjo dokumente PVM būti neturi`;
  }
  return null;
}

// Parties: EU member state prefixes of VAT codes (Greece EL, Northern Ireland XI).
export const EU_VAT_PREFIXES = new Set(['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI']);

// Counterparty of a document as far as the tax codes are concerned (shared by the i.SAF export and the FR0600 draft).
export interface PartyFields { vatCode: string; country: string }
const LT_NAMES = ['', 'lt', 'ltu', 'lietuva', 'lietuvos respublika', 'lithuania', 'republic of lithuania', 'литва', 'литовская республика'];
export const normalizedVat = (doc: PartyFields) => { const vat = doc.vatCode.replace(/\s+/g, '').toUpperCase(); return /^\d+$/.test(vat) ? 'LT' + vat : vat; };
export const isLt = (doc: PartyFields) => LT_NAMES.includes(doc.country.trim().toLowerCase());
// ISO 3166-1 alpha-2 code from the counterparty's country field (the field is free text; only a two-letter code is trusted).
export const isoCountry = (doc: PartyFields) => { const c = doc.country.trim().toUpperCase(); return /^[A-Z]{2}$/.test(c) && c !== 'EL' ? c : null; };
export type PartyKind = 'LT' | 'EU_VAT' | 'FOREIGN';
export function partyKind(doc: PartyFields): PartyKind {
  const vat = normalizedVat(doc);
  if (vat) return vat.startsWith('LT') ? 'LT' : EU_VAT_PREFIXES.has(vat.slice(0, 2)) ? 'EU_VAT' : 'FOREIGN';
  return isLt(doc) || isoCountry(doc) === 'LT' ? 'LT' : 'FOREIGN';
}
export const PARTY_TEXT: Record<PartyRule, string> = { LT: 'Lietuvos kontrahentui', EU_VAT: 'kontrahentui su kitos ES šalies PVM kodu', FOREIGN: 'užsienio kontrahentui', NON_EU_VAT: 'užsienio kontrahentui be ES PVM kodo', ANY: 'bet kuriam kontrahentui' };
export const partyFits = (rule: PartyRule, kind: PartyKind) => rule === 'ANY' || (rule === 'LT' ? kind === 'LT' : rule === 'EU_VAT' ? kind === 'EU_VAT' : rule === 'FOREIGN' ? kind !== 'LT' : kind === 'FOREIGN');

// Issue text for a document whose codes were dropped by an edit (TaxCodeReview.dropped: [{ itemName, taxCode }]).
export function droppedText(dropped: string): string {
  let list = '';
  try { list = (JSON.parse(dropped) as { itemName: string; taxCode: string }[]).map(d => `${d.itemName}: ${d.taxCode}`).join(', '); } catch { list = '?'; }
  return `taisant dokumentą pašalinti i.SAF kodai (${list}) — priskirkite kodus iš naujo arba patvirtinkite dokumentą skydelyje „i.SAF kodai eilutėms“`;
}
