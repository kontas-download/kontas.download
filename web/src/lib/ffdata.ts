// VMI EDS .ffdata XML builders for FR0600, FR0564 (with P/R/T/TP), GPM313, GPM312 (with L/U), and PLN204 (with S/Z).
// FormDefId, PageDefName, and exact field lists match the official VMI MXFD/FFData packages in docs/vmi/:
// - FR0600: {DFDCC8EC-FFAB-4AA2-92E3-E20980272B19} (Form_FR0600.ffdata / FR0600.mxfd)
// - FR0564: {69D689D5-B191-4B58-A03C-ED0A85F76C3E} (Form_FR0564.ffdata / FR0564.mxfd)
// - GPM313: {EB03E9EF-39B0-457F-8264-79E86F053009} (Form_GPM313.ffdata / GPM313.mxfd)
// - GPM312: {DD0F88DD-A858-4595-AF2F-3643D0069A39} (Form_GPM312.ffdata / GPM312.mxfd)
// - PLN204: {F1AA6CD7-1216-4BD2-B256-B133D3D97D73} (PLN204(6).mxfd)

export const FFDATA_FORM_IDS = {
  FR0600: '{DFDCC8EC-FFAB-4AA2-92E3-E20980272B19}',
  FR0564: '{69D689D5-B191-4B58-A03C-ED0A85F76C3E}',
  GPM313: '{EB03E9EF-39B0-457F-8264-79E86F053009}',
  GPM312: '{DD0F88DD-A858-4595-AF2F-3643D0069A39}',
  PLN204: '{F1AA6CD7-1216-4BD2-B256-B133D3D97D73}',
} as const;

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

// Whole euro rounding (VMI rule: 49 cents down, 50 cents up, preserving sign).
export function ffWholeEuro(amount: number): number {
  const c = Math.round(amount * 100);
  return (c < 0 ? -1 : 1) * Math.floor((Math.abs(c) + 50) / 100);
}

export function ffWholeStr(amount: number | null | undefined, allowZero = false): string {
  if (amount === null || amount === undefined) return '';
  const rounded = ffWholeEuro(amount);
  return rounded === 0 && !allowZero ? '' : String(rounded);
}

// Decimal with 2 places and comma separator (Form.SetDefaultDecimalSeparator ",").
export function ffDecimal2(amount: number | null | undefined, allowZero = false): string {
  if (amount === null || amount === undefined) return '';
  const cents = Math.round(amount * 100);
  if (cents === 0 && !allowZero) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

interface FfPage {
  pageDefName: string;
  fields: [string, string][];
}

function renderFfdata(formDefId: string, pages: FfPage[], createdOn: string): string {
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(createdOn) ? createdOn : new Date().toISOString().slice(0, 10);
  const pageXml = pages
    .map((p, idx) => {
      const fieldsXml = p.fields
        .map(([name, val]) => (val === '' ? `          <Field Name="${name}" />` : `          <Field Name="${name}">${xmlEscape(val)}</Field>`))
        .join('\r\n');
      return [
        `      <Page PageDefName="${p.pageDefName}" PageNumber="${idx + 1}">`,
        `        <Fields Count="${p.fields.length}">`,
        fieldsXml,
        '        </Fields>',
        '      </Page>',
      ].join('\r\n');
    })
    .join('\r\n');
  return [
    '<?xml version="1.0" encoding="utf-8" standalone="yes"?>',
    '<!--FFData content-->',
    `<FFData Version="1" CreatedByApp="DocumentFFData" CreatedByLogin="" CreatedOn="${dateStr}">`,
    `  <Form FormDefId="${formDefId}">`,
    `    <Pages Count="${pages.length}">`,
    pageXml,
    '    </Pages>',
    '  </Form>',
    '</FFData>',
    '',
  ].join('\r\n');
}

const stripLtPrefix = (vatCode: string) => {
  const clean = (vatCode || '').replace(/\s+/g, '').toUpperCase();
  return clean.startsWith('LT') ? clean.slice(2) : clean;
};

export interface Fr0600FfdataInput {
  header: { name: string; code: string; vatCode: string };
  period: { start: string; end: string };
  fields: Record<string, number | null>;
  extended?: Record<string, number>;
  manual?: {
    f26?: number | null; // Import VAT paid
    f27?: number | null; // Import VAT controlled by VMI
    f28?: number | null; // Deduction percentage (1..100, default 100)
    f35Override?: number | null; // Explicit deductible VAT override
  };
  createdOn?: string;
}

export function buildFr0600Ffdata(input: Fr0600FfdataInput): string {
  const dateStr = input.createdOn || new Date().toISOString().slice(0, 10);
  const vatDigits = stripLtPrefix(input.header.vatCode);
  const f = input.fields;
  const ex = input.extended || {};
  const m = input.manual || {};
  const e29Combined = (f.f29 || 0) + (f.f29a || 0);
  const e26Num = m.f26 != null ? ffWholeEuro(m.f26) : 0;
  const e27Num = m.f27 != null ? ffWholeEuro(m.f27) : 0;
  const e28Pct =
    m.f28 != null && Number.isFinite(m.f28) && m.f28 > 0 && m.f28 <= 100 ? Math.round(m.f28) : 100;

  const baseE35 =
    m.f35Override != null
      ? ffWholeEuro(m.f35Override)
      : ffWholeEuro(((f.f35 || 0) + e26Num + e27Num) * (e28Pct / 100));

  const e29R = ffWholeEuro(e29Combined);
  const e30R = ffWholeEuro(f.f30 || 0);
  const e31R = ffWholeEuro(f.f31 || 0);
  const e32R = ffWholeEuro(ex.f32 || 0);
  const e33R = ffWholeEuro(ex.f33 || 0);
  const e34R = ffWholeEuro(ex.f34 || 0);
  const e36Val =
    f.f36 !== null && f.f36 !== undefined && e26Num === 0 && e27Num === 0 && e28Pct === 100 && m.f35Override == null
      ? ffWholeEuro(f.f36)
      : e29R + e30R + e31R + e32R + e33R + e34R - baseE35;

  const fieldList: [string, string][] = [
    ['B_MM_Pavad', (input.header.name || '').trim().toUpperCase().slice(0, 30)],
    ['B_MM_ID', (input.header.code || '').trim()],
    ['LT', vatDigits ? 'LT' : ''],
    ['B_MM_PVM', vatDigits],
    ['B_MM_Adresas', ''],
    ['B_MM_Epastas', ''],
    ['B_UzpildData', dateStr],
    ['B_ML_DataNuo', input.period.start],
    ['B_ML_DataIki', input.period.end],
    ['E10', ''],
    ['E11', ffWholeStr(f.f11)],
    ['E12', ffWholeStr(ex.f12)],
    ['E13', ffWholeStr(ex.f13)],
    ['E14', ffWholeStr(ex.f14)],
    ['E15', ffWholeStr(ex.f15)],
    ['E16', ffWholeStr(ex.f16)],
    ['E17', ffWholeStr(ex.f17)],
    ['E18', ffWholeStr(ex.f18)],
    ['E19', ffWholeStr(ex.f19)],
    ['E20', ffWholeStr(ex.f20)],
    ['E21', ffWholeStr(ex.f21)],
    ['E22', ffWholeStr(ex.f22)],
    ['E23', ffWholeStr(ex.f23)],
    ['E24', ffWholeStr(ex.f24)],
    ['E25', ffWholeStr(f.f25)],
    ['E26', e26Num !== 0 ? String(e26Num) : ''],
    ['E27', e27Num !== 0 ? String(e27Num) : ''],
    ['E28', String(e28Pct)],
    ['E29', ffWholeStr(e29Combined)],
    ['E30', ffWholeStr(f.f30)],
    ['E31', ffWholeStr(f.f31)],
    ['E32', ffWholeStr(ex.f32)],
    ['E33', ffWholeStr(ex.f33)],
    ['E34', ffWholeStr(ex.f34)],
    ['E35', baseE35 !== 0 ? String(baseE35) : ''],
    ['E36', e36Val !== 0 ? String(e36Val) : ''],
    ['B_FormNr', ''],
    ['B_FormVerNr', ''],
    ['E8', '1'],
    ['E9', '-1'],
  ];
  return renderFfdata(FFDATA_FORM_IDS.FR0600, [{ pageDefName: 'FR0600', fields: fieldList }], dateStr);
}

export interface Fr0564RRow {
  actionCode: '1' | '2' | '3' | '4'; // 1-išvežimas, 2-perdavimas, 3-grąžinimas, 4-anuliavimas
  country: string;
  vatCode: string;
  prevCountry?: string;
  prevVatCode?: string;
}

export interface Fr0564TRow {
  country: string;
  vatCode: string;
  value: number;
}

export interface Fr0564FfdataInput {
  header: { name: string; code: string; vatCode: string; year: number; month: number };
  rows: { country: string; vatCode: string; r13: number; r14: number; r18: number }[];
  totals: { r13: number; r14: number; r18: number };
  rRows?: Fr0564RRow[];
  tRows?: Fr0564TRow[];
  createdOn?: string;
}

export function buildFr0564Ffdata(input: Fr0564FfdataInput): string {
  const dateStr = input.createdOn || new Date().toISOString().slice(0, 10);
  const vatDigits = stripLtPrefix(input.header.vatCode);
  const companyCode = (input.header.code || '').trim();
  const yearStr = String(input.header.year);
  const monthStr = String(input.header.month);
  const mainRows = input.rows.slice(0, 9);
  const extraRows = input.rows.slice(9);
  const extraPageCount = Math.ceil(extraRows.length / 16);
  const mainE15 = mainRows.reduce((s, r) => s + r.r13, 0);

  const mainFields: [string, string][] = [
    ['B_MM_Pavad', (input.header.name || '').trim()],
    ['B_MM_ID', companyCode],
    ['B_MM_PVM', vatDigits],
    ['B_MM_Tel', ''],
    ['B_UzpildData', dateStr],
    ['B_ML_Metai', yearStr],
    ['B_ML_Ketvirtis', ''],
    ['B_ML_Menuo', monthStr],
  ];
  for (let i = 1; i <= 9; i++) {
    const r = mainRows[i - 1];
    mainFields.push(
      [`E10-${i}`, r ? String(i) : ''],
      [`E11-${i}`, r ? r.country : ''],
      [`E12-${i}`, r ? r.vatCode : ''],
      [`E13-${i}`, r && r.r13 !== 0 ? String(r.r13) : ''],
      [`E14-${i}`, r && r.r14 !== 0 ? String(r.r14) : ''],
      [`E18-${i}`, r && r.r18 !== 0 ? String(r.r18) : ''],
    );
  }
  mainFields.push(
    ['E15', mainE15 !== 0 ? String(mainE15) : ''],
    ['E16', input.totals.r13 !== 0 ? String(input.totals.r13) : ''],
    ['E17', extraPageCount > 0 ? String(extraPageCount) : ''],
    ['B_FormNr', ''],
    ['B_FormVerNr', ''],
    ['Text-20', ''],
  );

  const pages: FfPage[] = [{ pageDefName: 'FR0564', fields: mainFields }];
  for (let p = 0; p < extraPageCount; p++) {
    const chunk = extraRows.slice(p * 16, (p + 1) * 16);
    const pageE15 = chunk.reduce((s, r) => s + r.r13, 0);
    const pFields: [string, string][] = [];
    for (let i = 1; i <= 16; i++) {
      const r = chunk[i - 1];
      const globalIdx = 9 + p * 16 + i;
      pFields.push(
        [`E10-${i}`, r ? String(globalIdx) : ''],
        [`E11-${i}`, r ? r.country : ''],
        [`E12-${i}`, r ? r.vatCode : ''],
        [`E13-${i}`, r && r.r13 !== 0 ? String(r.r13) : ''],
        [`E14-${i}`, r && r.r14 !== 0 ? String(r.r14) : ''],
        [`E18-${i}`, r && r.r18 !== 0 ? String(r.r18) : ''],
      );
    }
    pFields.push(
      ['E15', pageE15 !== 0 ? String(pageE15) : ''],
      ['LapoNr', String(p + 1)],
      ['B_FormNr', ''],
      ['B_FormVerNr', ''],
      ['B_MM_ID', companyCode],
      ['Text-LT', ''],
      ['B_MM_PVM', vatDigits],
      ['B_ML_Metai', yearStr],
      ['B_ML_Ketvirtis', ''],
      ['B_ML_Menuo', monthStr],
    );
    pages.push({ pageDefName: 'FR0564P', fields: pFields });
  }

  // Optional FR0564R appendix (call-off stock movements, 17 rows per page, 110 fields)
  if (input.rRows && input.rRows.length > 0) {
    const rPageCount = Math.ceil(input.rRows.length / 17);
    for (let p = 0; p < rPageCount; p++) {
      const chunk = input.rRows.slice(p * 17, (p + 1) * 17);
      const rFields: [string, string][] = [
        ['B_MM_ID', companyCode],
        ['B_FormNr', ''],
        ['B_FormVerNr', ''],
        ['LapoNr', String(p + 1)],
        ['Text-LT', ''],
        ['B_MM_PVM', vatDigits],
        ['B_ML_Metai', yearStr],
        ['B_ML_Menuo', monthStr],
      ];
      for (let i = 1; i <= 17; i++) {
        const r = chunk[i - 1];
        const globalIdx = p * 17 + i;
        rFields.push(
          [`R1-${i}`, r ? String(globalIdx) : ''],
          [`R2-${i}`, r ? r.actionCode : ''],
          [`R3-${i}`, r ? r.country : ''],
          [`R4-${i}`, r ? r.vatCode : ''],
          [`R5-${i}`, r && r.actionCode === '2' ? r.prevCountry || '' : ''],
          [`R6-${i}`, r && r.actionCode === '2' ? r.prevVatCode || '' : ''],
        );
      }
      pages.push({ pageDefName: 'FR0564R', fields: rFields });
    }
  }

  // Optional FR0564T / FR0564TP appendix (supplies of call-off stock, 16 rows per page, 73 fields)
  if (input.tRows && input.tRows.length > 0) {
    const mainT = input.tRows.slice(0, 16);
    const extraT = input.tRows.slice(16);
    const tpCount = Math.ceil(extraT.length / 16);
    const mainT5 = mainT.reduce((s, r) => s + ffWholeEuro(r.value), 0);
    const totalT6 = input.tRows.reduce((s, r) => s + ffWholeEuro(r.value), 0);
    const tFields: [string, string][] = [
      ['B_MM_ID', companyCode],
      ['B_FormNr', ''],
      ['B_FormVerNr', ''],
      ['Text-LT', ''],
      ['B_MM_PVM', vatDigits],
      ['B_ML_Metai', yearStr],
      ['B_ML_Menuo', monthStr],
    ];
    for (let i = 1; i <= 16; i++) {
      const r = mainT[i - 1];
      const v = r ? ffWholeEuro(r.value) : 0;
      tFields.push(
        [`T1-${i}`, r ? String(i) : ''],
        [`T2-${i}`, r ? r.country : ''],
        [`T3-${i}`, r ? r.vatCode : ''],
        [`T4-${i}`, r && v !== 0 ? String(v) : ''],
      );
    }
    tFields.push(
      ['T6', totalT6 !== 0 ? String(totalT6) : ''],
      ['T5', mainT5 !== 0 ? String(mainT5) : ''],
    );
    pages.push({ pageDefName: 'FR0564T', fields: tFields });

    for (let p = 0; p < tpCount; p++) {
      const chunk = extraT.slice(p * 16, (p + 1) * 16);
      const pageT5 = chunk.reduce((s, r) => s + ffWholeEuro(r.value), 0);
      const tpFields: [string, string][] = [
        ['B_MM_ID', companyCode],
        ['B_FormNr', ''],
        ['B_FormVerNr', ''],
        ['LapoNr', String(p + 1)],
        ['Text-LT', ''],
        ['B_MM_PVM', vatDigits],
        ['B_ML_Metai', yearStr],
        ['B_ML_Menuo', monthStr],
      ];
      for (let i = 1; i <= 16; i++) {
        const r = chunk[i - 1];
        const globalIdx = 16 + p * 16 + i;
        const v = r ? ffWholeEuro(r.value) : 0;
        tpFields.push(
          [`T1-${i}`, r ? String(globalIdx) : ''],
          [`T2-${i}`, r ? r.country : ''],
          [`T3-${i}`, r ? r.vatCode : ''],
          [`T4-${i}`, r && v !== 0 ? String(v) : ''],
        );
      }
      tpFields.push(['T5', pageT5 !== 0 ? String(pageT5) : '']);
      pages.push({ pageDefName: 'FR0564TP', fields: tpFields });
    }
  }

  return renderFfdata(FFDATA_FORM_IDS.FR0564, pages, dateStr);
}

export interface Gpm313FfdataInput {
  header: { name: string; code: string; year: number; month: number };
  f5: number;
  f6: number | null;
  f7: number | null;
  createdOn?: string;
}

export function buildGpm313Ffdata(input: Gpm313FfdataInput): string {
  const dateStr = input.createdOn || new Date().toISOString().slice(0, 10);
  const hasSplit = input.f6 !== null && input.f7 !== null;
  const fields: [string, string][] = [
    ['B_MM_ID', (input.header.code || '').trim()],
    ['B_MM_Pavadinimas', (input.header.name || '').trim()],
    ['B_ML_Metai', String(input.header.year)],
    ['B_ML_Menuo', String(input.header.month)],
    ['G5', ffDecimal2(input.f5)],
    ['G6', hasSplit ? ffDecimal2(input.f6, true) : ''],
    ['G7', hasSplit ? ffDecimal2(input.f7, true) : ''],
    ['G8', ''],
    ['G9', ''],
    ['G10', ''],
    ['G11', ''],
    ['G12', ''],
    ['B_FormNr', ''],
    ['B_FormVerNr', ''],
  ];
  return renderFfdata(FFDATA_FORM_IDS.GPM313, [{ pageDefName: 'GPM313', fields }], dateStr);
}

export interface Gpm312FfdataRow {
  employee: string;
  code: string | null;
  incomeCode: string;
  gross: number;
  gpm: number;
  gpmRate?: number | null; // Default 20 (formatted as "20,00")
  nonResident?: boolean; // When true, placed on GPM312U instead of GPM312L
  country?: string; // U14 ISO country code for GPM312U (e.g. 'LV', 'PL', 'UA')
  foreignTin?: string; // U13 tax ID in foreign country
  birthDate?: string; // U12 YYYY-MM-DD
  foreignAddress?: string; // U15 address in foreign country
}

export interface Gpm312FfdataInput {
  header: { name: string; code: string; year: number };
  totals: { f4: number; f5: number };
  rows: Gpm312FfdataRow[];
  createdOn?: string;
}

export function buildGpm312Ffdata(input: Gpm312FfdataInput): string {
  const dateStr = input.createdOn || new Date().toISOString().slice(0, 10);
  const companyCode = (input.header.code || '').trim();
  const yearStr = String(input.header.year);
  const lRows = input.rows.filter(r => !r.nonResident);
  const uRows = input.rows.filter(r => Boolean(r.nonResident));
  const g4Val = uRows.length > 0 ? lRows.reduce((s, r) => s + r.gross, 0) : input.totals.f4;
  const g5Val = uRows.length > 0 ? lRows.reduce((s, r) => s + r.gpm, 0) : input.totals.f5;
  const g6Val = uRows.reduce((s, r) => s + r.gross, 0);
  const g7Val = uRows.reduce((s, r) => s + r.gpm, 0);
  const mainFields: [string, string][] = [
    ['B_MM_ID', companyCode],
    ['B_MM_Pavad', (input.header.name || '').trim()],
    ['B_ML_Metai', yearStr],
    ['G4', ffDecimal2(g4Val)],
    ['G5', ffDecimal2(g5Val)],
    ['G6', uRows.length > 0 ? ffDecimal2(g6Val) : ''],
    ['G7', uRows.length > 0 ? ffDecimal2(g7Val) : ''],
    ['B_FormNr', ''],
    ['B_FormVerNr', ''],
  ];
  const pages: FfPage[] = [{ pageDefName: 'GPM312', fields: mainFields }];

  const lPageCount = Math.max(uRows.length > 0 ? 0 : 1, Math.ceil(lRows.length / 10));
  for (let p = 0; p < lPageCount; p++) {
    const chunk = lRows.slice(p * 10, (p + 1) * 10);
    const lFields: [string, string][] = [];
    for (let j = 1; j <= 10; j++) {
      const r = chunk[j - 1];
      lFields.push(
        [`L1-${j}`, r?.code || ''],
        [`L2-${j}`, r ? '1' : ''],
        [`L3-${j}`, r?.employee || ''],
        [`L4-${j}`, r ? 'A' : ''],
        [`L5-${j}`, r?.incomeCode || ''],
        [`L6-${j}`, ''],
        [`L7-${j}`, ''],
        [`L8-${j}`, r ? ffDecimal2(r.gross, true) : ''],
        [`L9-${j}`, r ? ffDecimal2(r.gpmRate ?? 20, true) : ''],
        [`L10-${j}`, r ? ffDecimal2(r.gpm, true) : ''],
        [`L11-${j}`, ''],
        [`L12-${j}`, ''],
        [`L13-${j}`, ''],
      );
    }
    lFields.push(
      ['B_MM_ID', companyCode],
      ['B_ML_Metai', yearStr],
      ['B_FormNr', ''],
      ['B_FormVerNr', ''],
      ['LapoNr', String(p + 1)],
    );
    pages.push({ pageDefName: 'GPM312L', fields: lFields });
  }

  // GPM312U appendix for non-residents (5 rows per page, 80 fields)
  if (uRows.length > 0) {
    const uPageCount = Math.ceil(uRows.length / 5);
    for (let p = 0; p < uPageCount; p++) {
      const chunk = uRows.slice(p * 5, (p + 1) * 5);
      const uFields: [string, string][] = [];
      for (let j = 1; j <= 5; j++) {
        const r = chunk[j - 1];
        const hasLtCode = Boolean(r?.code && r.code.trim());
        uFields.push(
          [`U1-${j}`, hasLtCode ? r!.code!.trim() : ''],
          [`U2-${j}`, hasLtCode ? '1' : ''],
          [`U3-${j}`, r?.employee || ''],
          [`U4-${j}`, r ? 'A' : ''],
          [`U5-${j}`, r?.incomeCode || ''],
          [`U6-${j}`, ''],
          [`U7-${j}`, ''],
          [`U8-${j}`, r ? ffDecimal2(r.gross, true) : ''],
          [`U9-${j}`, r ? ffDecimal2(r.gpmRate ?? 20, true) : ''],
          [`U10-${j}`, r ? ffDecimal2(r.gpm, true) : ''],
          [`U11-${j}`, ''],
          [`U12-${j}`, r?.birthDate || ''],
          [`U13-${j}`, r?.foreignTin || ''],
          [`U14-${j}`, r ? (r.country || '').trim().toUpperCase() : ''],
          [`U15-${j}`, r?.foreignAddress || ''],
        );
      }
      uFields.push(
        ['B_MM_ID', companyCode],
        ['B_ML_Metai', yearStr],
        ['B_FormNr', ''],
        ['B_FormVerNr', ''],
        ['LapoNr', String(p + 1)],
      );
      pages.push({ pageDefName: 'GPM312U', fields: uFields });
    }
  }

  return renderFfdata(FFDATA_FORM_IDS.GPM312, pages, dateStr);
}

export interface Pln204FfdataInput {
  header: { name: string; code: string; year: number };
  period?: { start: string; end: string };
  employees: number;
  fields: {
    f18: number;
    f19: number;
    f20?: number;
    f26?: number;
    f37: number;
    f40: number;
    f41: number;
    f43: number;
    f45?: number;
    f48: number;
    f52: number;
    f52a: number;
    f53a: '1' | '2' | '3';
    f54a?: string | number;
    f55a: number;
    f55: number;
    f59: number;
    f62: number;
    f64: number;
  };
  sCode?: string; // Default '31' (Kitos sąnaudos, laikomos neleidžiamais atskaitymais)
  zCode?: string; // Default '06' (Netesybos / kitos neapmokestinamosios pajamos)
  createdOn?: string;
}

export function buildPln204Ffdata(input: Pln204FfdataInput): string {
  const dateStr = input.createdOn || new Date().toISOString().slice(0, 10);
  const companyCode = (input.header.code || '').trim();
  const companyName = (input.header.name || '').trim().toUpperCase().slice(0, 40);
  const periodStart = input.period?.start || `${input.header.year}-01-01`;
  const periodEnd = input.period?.end || `${input.header.year}-12-31`;
  const f = input.fields;
  const f20 = f.f20 ? ffWholeEuro(f.f20) : 0;
  const f26 = f.f26 ? ffWholeEuro(f.f26) : 0;
  const f45 = f.f45 ? ffWholeEuro(f.f45) : 0;
  const hasTaxableProfit = f.f52 > 0;
  const rateStr =
    typeof f.f54a === 'string'
      ? f.f54a
      : f.f53a === '1'
        ? '15,0'
        : f.f53a === '2'
          ? '5,0'
          : '0';

  // Page 1: PLN204 (37 fields in exact MXFD order)
  const page1Fields: [string, string][] = [
    ['B_MM_ID', companyCode],
    ['B_MM_Pavad', companyName],
    ['E4', String(Math.max(0, Math.floor(input.employees)))],
    ['B_ML_DataNuo', periodStart],
    ['B_ML_DataIki', periodEnd],
    ['E7', ''],
    ['E8-Pradzia-Pabaiga', ''],
    ['E9', 'N'],
    ['E10', 'N'],
    ['E17-FR0528', 'N'],
    ['E17-FR0438', 'N'],
    ['E17A', 'N'],
    ['E18', String(Math.max(0, ffWholeEuro(f.f18)))],
    ['E19', String(ffWholeEuro(f.f19))],
    ['E20', f20 > 0 ? String(f20) : ''],
    ['E21', ''],
    ['E22', ''],
    ['E23', ''],
    ['E24', ''],
    ['E25', ''],
    ['E26', f26 > 0 ? String(f26) : ''],
    ['E27', ''],
    ['E28', ''],
    ['E29', ''],
    ['E30', ''],
    ['E31', ''],
    ['E31A', ''],
    ['E32', ''],
    ['E33', ''],
    ['E34', ''],
    ['E35', ''],
    ['E36', ''],
    ['E36A', ''],
    ['E37', String(ffWholeEuro(f.f37))],
    ['E38', ''],
    ['B_FormNr', ''],
    ['B_FormVerNr', ''],
  ];

  // Page 2: PLN204_2 (44 fields in exact MXFD order)
  const page2Fields: [string, string][] = [
    ['E39', ''],
    ['E39A', ''],
    ['E40', f.f37 >= 0 ? String(ffWholeEuro(f.f40)) : ''],
    ['E41', f.f37 < 0 ? String(ffWholeEuro(f.f41)) : ''],
    ['E42', ''],
    ['E43', f.f37 >= 0 ? String(ffWholeEuro(f.f43)) : ''],
    ['E43A', ''],
    ['E43B', ''],
    ['E44', ''],
    ['E45', f45 > 0 && f.f43 > 0 ? String(f45) : ''],
    ['E46', ''],
    ['E47', ''],
    ['E47A', ''],
    ['E48', f.f37 >= 0 ? String(ffWholeEuro(f.f48)) : '0'],
    ['E49', ''],
    ['E50', ''],
    ['E51', ''],
    ['E52', f.f37 >= 0 ? String(ffWholeEuro(f.f52)) : ''],
    ['E52A', hasTaxableProfit ? String(ffWholeEuro(f.f52a)) : ''],
    ['E53A', hasTaxableProfit ? f.f53a : ''],
    ['E54A', hasTaxableProfit ? rateStr : ''],
    ['E55A', hasTaxableProfit ? String(ffWholeEuro(f.f55a)) : ''],
    ['E52B', ''],
    ['E53B', ''],
    ['E54B', ''],
    ['E55B', ''],
    ['E55', hasTaxableProfit ? String(ffWholeEuro(f.f55)) : ''],
    ['E56', ''],
    ['E57', ''],
    ['E58', ''],
    ['E59', hasTaxableProfit ? String(ffWholeEuro(f.f59)) : ''],
    ['E60', ''],
    ['E61', ''],
    ['E62', hasTaxableProfit ? String(ffWholeEuro(f.f62)) : ''],
    ['E63', ''],
    ['E64', hasTaxableProfit ? String(ffWholeEuro(f.f64)) : ''],
    ['E65', ''],
    ['E65A', ''],
    ['E66', ''],
    ['E66A', ''],
    ['E67', ''],
    ['B_MM_ID', companyCode],
    ['B_FormNr', ''],
    ['B_FormVerNr', ''],
  ];

  const pages: FfPage[] = [
    { pageDefName: 'PLN204', fields: page1Fields },
    { pageDefName: 'PLN204_2', fields: page2Fields },
  ];

  // Optional PLN204S appendix (70 fields) when f20 > 0
  if (f20 > 0) {
    const sFields: [string, string][] = [];
    for (let i = 1; i <= 32; i++) {
      sFields.push(
        [`S1-${i}`, i === 1 ? input.sCode || '31' : ''],
        [`S2-${i}`, i === 1 ? String(f20) : ''],
      );
    }
    sFields.push(
      ['S3', String(f20)],
      ['B_MM_ID', companyCode],
      ['B_FormNr', ''],
      ['B_FormVerNr', ''],
      ['B_ML_DataNuo', periodStart],
      ['B_ML_DataIki', periodEnd],
    );
    pages.push({ pageDefName: 'PLN204S', fields: sFields });
  }

  // Optional PLN204Z appendix (36 fields) when f26 > 0
  if (f26 > 0) {
    const zFields: [string, string][] = [];
    for (let i = 1; i <= 15; i++) {
      zFields.push(
        [`Z1-${i}`, i === 1 ? input.zCode || '06' : ''],
        [`Z2-${i}`, i === 1 ? String(f26) : ''],
      );
    }
    zFields.push(
      ['Z3', String(f26)],
      ['B_MM_ID', companyCode],
      ['B_FormNr', ''],
      ['B_FormVerNr', ''],
      ['B_ML_DataNuo', periodStart],
      ['B_ML_DataIki', periodEnd],
    );
    pages.push({ pageDefName: 'PLN204Z', fields: zFields });
  }

  return renderFfdata(FFDATA_FORM_IDS.PLN204, pages, dateStr);
}
