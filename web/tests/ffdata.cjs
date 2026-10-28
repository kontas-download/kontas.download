const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

require.extensions['.ts'] = (mod, filename) =>
  mod._compile(
    ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText,
    filename,
  );

const {
  FFDATA_FORM_IDS,
  ffWholeEuro,
  ffDecimal2,
  buildFr0600Ffdata,
  buildFr0564Ffdata,
  buildGpm313Ffdata,
  buildGpm312Ffdata,
  buildPln204Ffdata,
} = require('../src/lib/ffdata.ts');

function parseFfdata(xml) {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="utf-8" standalone="yes"?>'));
  assert.ok(xml.includes('<!--FFData content-->'));
  const formMatch = /<Form FormDefId="([^"]+)">/.exec(xml);
  assert.ok(formMatch, 'missing FormDefId');
  const pagesCountMatch = /<Pages Count="(\d+)">/.exec(xml);
  assert.ok(pagesCountMatch, 'missing Pages Count');
  const pageRegex = /<Page PageDefName="([^"]+)" PageNumber="(\d+)">([\s\S]*?)<\/Page>/g;
  const pages = [];
  let pm;
  while ((pm = pageRegex.exec(xml)) !== null) {
    const body = pm[3];
    const fCountMatch = /<Fields Count="(\d+)">/.exec(body);
    assert.ok(fCountMatch, 'missing Fields Count');
    const fieldRegex = /<Field Name="([^"]+)"(?:\s*\/>|>([\s\S]*?)<\/Field>)/g;
    const fields = [];
    let fm;
    while ((fm = fieldRegex.exec(body)) !== null) {
      fields.push([fm[1], fm[2] ?? '']);
    }
    assert.equal(fields.length, Number(fCountMatch[1]), `Fields Count mismatch on ${pm[1]}`);
    pages.push({
      pageDefName: pm[1],
      pageNumber: Number(pm[2]),
      fields,
      map: Object.fromEntries(fields),
    });
  }
  assert.equal(pages.length, Number(pagesCountMatch[1]), 'Pages Count mismatch');
  return { formDefId: formMatch[1], pages };
}

test('ffdata rounding and decimal helpers follow VMI rules', () => {
  assert.equal(ffWholeEuro(100.49), 100);
  assert.equal(ffWholeEuro(100.5), 101);
  assert.equal(ffWholeEuro(-40.49), -40);
  assert.equal(ffWholeEuro(-40.5), -41);
  assert.equal(ffDecimal2(1234.5), '1234,50');
  assert.equal(ffDecimal2(0, false), '');
  assert.equal(ffDecimal2(0, true), '0,00');
});

test('FR0600 .ffdata export populates 40 fields with whole euro values and FormDefId', () => {
  const xml = buildFr0600Ffdata({
    header: { name: 'UAB Pavyzdys & Ko', code: '123456789', vatCode: 'LT100000000011' },
    period: { start: '2026-09-01', end: '2026-09-30' },
    fields: { f11: 1000.49, f25: 210, f29: 198, f29a: 12.6, f30: 0, f31: 0, f35: 210, f36: 0.6 },
    extended: { f18: 500, f21: 300, f34: 63 },
    createdOn: '2026-10-15',
  });
  const parsed = parseFfdata(xml);
  assert.equal(parsed.formDefId, FFDATA_FORM_IDS.FR0600);
  assert.equal(parsed.pages.length, 1);
  const p = parsed.pages[0];
  assert.equal(p.pageDefName, 'FR0600');
  assert.equal(p.fields.length, 40);
  assert.equal(p.map.B_MM_Pavad, 'UAB PAVYZDYS &amp; KO');
  assert.equal(p.map.B_MM_ID, '123456789');
  assert.equal(p.map.LT, 'LT');
  assert.equal(p.map.B_MM_PVM, '100000000011');
  assert.equal(p.map.B_UzpildData, '2026-10-15');
  assert.equal(p.map.B_ML_DataNuo, '2026-09-01');
  assert.equal(p.map.B_ML_DataIki, '2026-09-30');
  assert.equal(p.map.E11, '1000');
  assert.equal(p.map.E18, '500');
  assert.equal(p.map.E21, '300');
  assert.equal(p.map.E25, '210');
  assert.equal(p.map.E28, '100');
  assert.equal(p.map.E29, '211'); // 198 + 12.6 = 210.6 -> 211
  assert.equal(p.map.E34, '63');
  assert.equal(p.map.E35, '210');
  assert.equal(p.map.E36, '1');
  assert.equal(p.map.E8, '1');
  assert.equal(p.map.E9, '-1');
});

test('FR0564 .ffdata export creates FR0564 main page and FR0564P overflow sheets when > 9 rows', () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({
    country: 'LV',
    vatCode: `400030094${String(i + 1).padStart(2, '0')}`,
    r13: (i + 1) * 100,
    r14: i === 0 ? 50 : 0,
    r18: i === 1 ? 200 : 0,
  }));
  const totalR13 = rows.reduce((s, r) => s + r.r13, 0);
  const xml = buildFr0564Ffdata({
    header: { name: 'UAB Eksportas', code: '123456789', vatCode: 'LT100000000011', year: 2026, month: 9 },
    rows,
    totals: { r13: totalR13, r14: 50, r18: 200 },
    createdOn: '2026-10-15',
  });
  const parsed = parseFfdata(xml);
  assert.equal(parsed.formDefId, FFDATA_FORM_IDS.FR0564);
  assert.equal(parsed.pages.length, 2);
  const main = parsed.pages[0];
  const extra = parsed.pages[1];
  assert.equal(main.pageDefName, 'FR0564');
  assert.equal(main.fields.length, 68);
  assert.equal(main.map['E10-1'], '1');
  assert.equal(main.map['E11-1'], 'LV');
  assert.equal(main.map['E12-1'], '40003009401');
  assert.equal(main.map['E13-1'], '100');
  assert.equal(main.map['E14-1'], '50');
  assert.equal(main.map['E18-2'], '200');
  assert.equal(main.map.E15, '4500'); // sum of 100..900
  assert.equal(main.map.E16, String(totalR13)); // 6600
  assert.equal(main.map.E17, '1');
  assert.equal(extra.pageDefName, 'FR0564P');
  assert.equal(extra.fields.length, 106);
  assert.equal(extra.map['E10-1'], '10');
  assert.equal(extra.map['E12-1'], '40003009410');
  assert.equal(extra.map['E13-1'], '1000');
  assert.equal(extra.map['E10-2'], '11');
  assert.equal(extra.map['E13-2'], '1100');
  assert.equal(extra.map['E10-3'], '');
  assert.equal(extra.map.E15, '2100');
  assert.equal(extra.map.LapoNr, '1');
});

test('GPM313 .ffdata export formats decimal amounts with comma and splits G6/G7 when payoutDate is set', () => {
  const withSplit = parseFfdata(
    buildGpm313Ffdata({
      header: { name: 'UAB Algos', code: '123456789', year: 2026, month: 9 },
      f5: 3500,
      f6: 451.82,
      f7: 0,
      createdOn: '2026-10-10',
    }),
  );
  assert.equal(withSplit.formDefId, FFDATA_FORM_IDS.GPM313);
  assert.equal(withSplit.pages.length, 1);
  const p1 = withSplit.pages[0];
  assert.equal(p1.pageDefName, 'GPM313');
  assert.equal(p1.fields.length, 14);
  assert.equal(p1.map.B_MM_ID, '123456789');
  assert.equal(p1.map.B_MM_Pavadinimas, 'UAB Algos');
  assert.equal(p1.map.B_ML_Metai, '2026');
  assert.equal(p1.map.B_ML_Menuo, '9');
  assert.equal(p1.map.G5, '3500,00');
  assert.equal(p1.map.G6, '451,82');
  assert.equal(p1.map.G7, '0,00');

  const noSplit = parseFfdata(
    buildGpm313Ffdata({
      header: { name: 'UAB Algos', code: '123456789', year: 2026, month: 9 },
      f5: 3500,
      f6: null,
      f7: null,
      createdOn: '2026-10-10',
    }),
  );
  assert.equal(noSplit.pages[0].map.G6, '');
  assert.equal(noSplit.pages[0].map.G7, '');
});

test('GPM312 .ffdata export paginates GPM312L by 10 employees per sheet', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({
    employee: `Darbuotojas ${i + 1}`,
    code: `380010100${String(i + 1).padStart(2, '0')}`,
    incomeCode: '01',
    gross: 12000 + i * 100,
    gpm: 1800 + i * 15,
  }));
  const f4 = rows.reduce((s, r) => s + r.gross, 0);
  const f5 = rows.reduce((s, r) => s + r.gpm, 0);
  const parsed = parseFfdata(
    buildGpm312Ffdata({
      header: { name: 'UAB Metinė', code: '123456789', year: 2026 },
      totals: { f4, f5 },
      rows,
      createdOn: '2027-01-20',
    }),
  );
  assert.equal(parsed.formDefId, FFDATA_FORM_IDS.GPM312);
  assert.equal(parsed.pages.length, 3); // 1 main + 2 GPM312L pages
  const main = parsed.pages[0];
  assert.equal(main.pageDefName, 'GPM312');
  assert.equal(main.fields.length, 9);
  assert.equal(main.map.G4, ffDecimal2(f4));
  assert.equal(main.map.G5, ffDecimal2(f5));
  const l1 = parsed.pages[1];
  const l2 = parsed.pages[2];
  assert.equal(l1.pageDefName, 'GPM312L');
  assert.equal(l1.fields.length, 135);
  assert.equal(l1.map.LapoNr, '1');
  assert.equal(l1.map['L1-1'], '38001010001');
  assert.equal(l1.map['L2-1'], '1');
  assert.equal(l1.map['L3-1'], 'Darbuotojas 1');
  assert.equal(l1.map['L4-1'], 'A');
  assert.equal(l1.map['L5-1'], '01');
  assert.equal(l1.map['L8-1'], '12000,00');
  assert.equal(l1.map['L10-1'], '1800,00');
  assert.equal(l2.pageDefName, 'GPM312L');
  assert.equal(l2.fields.length, 135);
  assert.equal(l2.map.LapoNr, '2');
  assert.equal(l2.map['L3-2'], 'Darbuotojas 12');
  assert.equal(l2.map['L3-3'], '');
});

test('FR0600 .ffdata supports manual fields 26, 27, 28 and recalculates E35 / E36', () => {
  const parsed = parseFfdata(
    buildFr0600Ffdata({
      header: { name: 'UAB Importas', code: '123456789', vatCode: 'LT100000000011' },
      period: { start: '2026-09-01', end: '2026-09-30' },
      fields: { f11: 1000, f25: 100, f29: 210, f29a: 0, f30: 0, f31: 0, f35: 100, f36: 110 },
      manual: { f26: 50, f27: 50, f28: 80 },
      createdOn: '2026-10-15',
    }),
  );
  const p = parsed.pages[0];
  assert.equal(p.map.E26, '50');
  assert.equal(p.map.E27, '50');
  assert.equal(p.map.E28, '80');
  // (100 + 50 + 50) * 80% = 160
  assert.equal(p.map.E35, '160');
  // 210 - 160 = 50
  assert.equal(p.map.E36, '50');
});

test('FR0564 .ffdata supports FR0564R and FR0564T/FR0564TP appendices', () => {
  const parsed = parseFfdata(
    buildFr0564Ffdata({
      header: { name: 'UAB Tiekimas', code: '123456789', vatCode: 'LT100000000011', year: 2026, month: 9 },
      rows: [{ country: 'PL', vatCode: '5261040828', r13: 500, r14: 0, r18: 0 }],
      totals: { r13: 500, r14: 0, r18: 0 },
      rRows: [{ actionCode: '2', country: 'DE', vatCode: '123456789', prevCountry: 'DE', prevVatCode: '987654321' }],
      tRows: Array.from({ length: 18 }, (_, i) => ({
        country: 'LV',
        vatCode: `400030094${String(i + 1).padStart(2, '0')}`,
        value: 100,
      })),
      createdOn: '2026-10-15',
    }),
  );
  assert.equal(parsed.pages.length, 4); // FR0564 + FR0564R + FR0564T + FR0564TP
  assert.equal(parsed.pages[1].pageDefName, 'FR0564R');
  assert.equal(parsed.pages[1].fields.length, 110);
  assert.equal(parsed.pages[1].map['R2-1'], '2');
  assert.equal(parsed.pages[1].map['R3-1'], 'DE');
  assert.equal(parsed.pages[1].map['R6-1'], '987654321');
  assert.equal(parsed.pages[2].pageDefName, 'FR0564T');
  assert.equal(parsed.pages[2].fields.length, 73);
  assert.equal(parsed.pages[2].map.T5, '1600');
  assert.equal(parsed.pages[2].map.T6, '1800');
  assert.equal(parsed.pages[3].pageDefName, 'FR0564TP');
  assert.equal(parsed.pages[3].fields.length, 73);
  assert.equal(parsed.pages[3].map.T5, '200');
});

test('GPM312 .ffdata supports L9 rate and GPM312U non-resident appendix (80 fields)', () => {
  const parsed = parseFfdata(
    buildGpm312Ffdata({
      header: { name: 'UAB Tarptautinė', code: '123456789', year: 2026 },
      totals: { f4: 10000, f5: 2000 },
      rows: [
        { employee: 'Jonas Jonaitis', code: '38001010001', incomeCode: '01', gross: 6000, gpm: 1200, gpmRate: 20 },
        {
          employee: 'John Smith',
          code: 'PASS9988',
          incomeCode: '01',
          gross: 4000,
          gpm: 800,
          gpmRate: 20,
          nonResident: true,
          country: 'GB',
        },
      ],
      createdOn: '2027-01-20',
    }),
  );
  assert.equal(parsed.pages.length, 3); // GPM312 + GPM312L + GPM312U
  const main = parsed.pages[0];
  assert.equal(main.map.G4, '6000,00');
  assert.equal(main.map.G5, '1200,00');
  assert.equal(main.map.G6, '4000,00');
  assert.equal(main.map.G7, '800,00');
  const l = parsed.pages[1];
  assert.equal(l.pageDefName, 'GPM312L');
  assert.equal(l.map['L9-1'], '20,00');
  const u = parsed.pages[2];
  assert.equal(u.pageDefName, 'GPM312U');
  assert.equal(u.fields.length, 80);
  assert.equal(u.map['U3-1'], 'John Smith');
  assert.equal(u.map['U8-1'], '4000,00');
  assert.equal(u.map['U9-1'], '20,00');
  assert.equal(u.map['U10-1'], '800,00');
  assert.equal(u.map['U14-1'], 'GB');
});

test('PLN204 .ffdata exports PLN204 (37 fields), PLN204_2 (44 fields), PLN204S (70 fields) and PLN204Z (36 fields)', () => {
  const parsed = parseFfdata(
    buildPln204Ffdata({
      header: {
        name: 'UAB Pelnas',
        code: '123456789',
        year: 2026,
      },
      period: { start: '2026-01-01', end: '2026-12-31' },
      employees: 5,
      fields: {
        f18: 150000,
        f19: 50000,
        f20: 1500,
        f26: 500,
        f37: 51000,
        f40: 51000,
        f41: 0,
        f43: 51000,
        f45: 1000,
        f48: 50000,
        f52: 50000,
        f52a: 50000,
        f53a: '1',
        f54a: '17,0',
        f55a: 8500,
        f55: 8500,
        f59: 8500,
        f62: 8500,
        f64: 8500,
      },
      createdOn: '2027-05-15',
    }),
  );
  assert.equal(parsed.formDefId, FFDATA_FORM_IDS.PLN204);
  assert.equal(parsed.pages.length, 4); // PLN204, PLN204_2, PLN204S, PLN204Z
  const p1 = parsed.pages[0];
  const p2 = parsed.pages[1];
  const ps = parsed.pages[2];
  const pz = parsed.pages[3];
  assert.equal(p1.pageDefName, 'PLN204');
  assert.equal(p1.fields.length, 37);
  assert.equal(p1.map.B_MM_Pavad, 'UAB PELNAS');
  assert.equal(p1.map.B_MM_ID, '123456789');
  assert.equal(p1.map.E4, '5');
  assert.equal(p1.map.E18, '150000');
  assert.equal(p1.map.E19, '50000');
  assert.equal(p1.map.E20, '1500');
  assert.equal(p1.map.E26, '500');
  assert.equal(p1.map.E37, '51000');
  assert.equal(p2.pageDefName, 'PLN204_2');
  assert.equal(p2.fields.length, 44);
  assert.equal(p2.map.E40, '51000');
  assert.equal(p2.map.E48, '50000');
  assert.equal(p2.map.E52A, '50000');
  assert.equal(p2.map.E53A, '1');
  assert.equal(p2.map.E54A, '17,0');
  assert.equal(p2.map.E55, '8500');
  assert.equal(p2.map.E64, '8500');
  assert.equal(ps.pageDefName, 'PLN204S');
  assert.equal(ps.fields.length, 70);
  assert.equal(ps.map.S3, '1500');
  assert.equal(pz.pageDefName, 'PLN204Z');
  assert.equal(pz.fields.length, 36);
  assert.equal(pz.map.Z3, '500');
});
