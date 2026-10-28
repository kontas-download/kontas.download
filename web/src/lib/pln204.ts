import type Database from 'better-sqlite3';
import { computePnl, type StatementEntry } from './financial-statements-calc';
import { ffWholeEuro } from './ffdata';
import { rules } from './rules/registry';

// Draft of the annual corporate income tax declaration PLN204 (VMI form PLN204 v.6, FormDefId {F1AA6CD7-1216-4BD2-B256-B133D3D97D73}).
// Derived from posted general ledger entries (class 5 revenue and class 6 expenses) and active employee count.
export interface Pln204Overrides {
  employees?: number;
  f20?: number; // Non-allowable deductions (PLN204S S3)
  f26?: number; // Non-taxable income (PLN204Z Z3)
  f45?: number; // Operating losses carried forward deducted
  tariffCode?: '1' | '2' | '3';
}

export interface Pln204Draft {
  year: number;
  periodStart: string;
  periodEnd: string;
  employees: number;
  tariffCode: '1' | '2' | '3';
  citRate: number; // Statutory CIT rate (%) for the year and tariff code
  mxfdRate: string; // Rate string expected by PLN204(6).mxfd Function E54 ('15,0', '5,0', '0')
  accounting: {
    salesRevenue: number;
    otherRevenue: number;
    finIncome: number;
    totalIncome: number;
    totalExpenses: number;
    profitBeforeTax: number;
  };
  fields: {
    f18: number; // Total revenue included in tax base (whole euro)
    f19: number; // Accounting profit (+) / loss (-) before tax (whole euro)
    f20: number; // Non-allowable deductions (whole euro)
    f26: number; // Non-taxable income (whole euro)
    f37: number; // Operating profit (+) / loss (-) (37 = 19 + 20 - 26)
    f40: number; // Profit (when f37 >= 0)
    f41: number; // Loss (when f37 < 0, positive magnitude)
    f43: number; // Operating profit after charity deductions
    f45: number; // Operating losses carried forward deducted
    f48: number; // Taxable profit (48 = max(0, 43 - 45))
    f52: number; // Calculated taxable profit
    f52a: number; // Taxable profit under tariff code 53A
    f53a: '1' | '2' | '3'; // Tariff code
    f54a: number; // Tariff (%)
    f55a: number; // Calculated CIT (55A = round(52A * 54A / 100))
    f55: number; // Total CIT (55 = 55A)
    f59: number; // CIT payable to budget (59 = 55)
    f62: number; // Final CIT payable to budget (62 = 59)
    f64: number; // Payable (-) / refundable (+) CIT (64 = 63 - 62 = -62)
  };
  entryCount: number;
  provisional: boolean;
  notes: string[];
  notFilled: string[];
}

export const PLN204_NOT_FILLED = [
  'Priedai PLN204S (neleidžiami atskaitymai pagal rūšies kodus), PLN204Z (neapmokestinamosios pajamos pagal kodus), PLN204F, PLN204G, PLN204C, PLN204E (dividendai) ir PLN204K (pozityviosios pajamos) automatiškai iš Didžiosios knygos nesudaromi — 20, 26 ir 45 laukų korekcijas galite įvesti rankiniu būdu arba užpildyti EDS',
  '21–25 laukai (pajamų padidinimas pagal PMĮ 38, 40, 43 str.), 27–31A laukai (dividendai ir nuolatinių buveinių pajamos) ir 32–36A laukai (MTEP 3x sąnaudos, beviltiškos skolos, PMĮ 18–19 str. nusidėvėjimo skirtumai) — pildo buhalteris',
  '42 laukas (atskaitoma dviguba paramos suma iki 40 % apmokestinamojo pelno pagal PMĮ 28 str. 2 d.) ir 49 laukas (investicinio projekto lengvata pagal PMĮ 46-1 str.) — pildo buhalteris',
  'Avansinio pelno mokesčio deklaracija FR0430 ir sumokėtos avansinio pelno mokesčio įmokos į PLN204 62–64 laukus neįtraukiamos — tikrinkite pagal VMI apskaitos kortelę',
  'Specialios formos modifikacijos PLN204A (individualioms įmonėms ir ūkinėms bendrijoms), PLN204N (pelno nesiekiančioms organizacijoms) ir PLN204U (užsienio vienetų nuolatinėms buveinėms) nerengiamos',
];

const r2 = (v: number) => Math.round(v * 100) / 100;

export function pln204Draft(
  db: Database.Database,
  companyId: number,
  year: number,
  overrides: Pln204Overrides = {},
): Pln204Draft {
  const periodStart = `${year}-01-01`;
  const periodEnd = `${year}-12-31`;
  const entries = db
    .prepare(
      'SELECT date, debitAccount, creditAccount, amount FROM GeneralEntry WHERE companyId = ? AND date >= ? AND date <= ? ORDER BY date, id',
    )
    .all(companyId, periodStart, periodEnd) as StatementEntry[];
  const empRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM Employee WHERE companyId = ? AND active = 1')
    .get(companyId) as { cnt: number } | undefined;

  const employees =
    overrides.employees !== undefined && Number.isFinite(overrides.employees) && overrides.employees >= 0
      ? Math.floor(overrides.employees)
      : empRow?.cnt ?? 0;

  const pnl = computePnl(entries, code => code, String(year));
  const totalIncome = r2(pnl.totalRevenue + pnl.finIncome.sum);
  const totalExpenses = r2(pnl.cogs.sum + pnl.totalOperatingExpenses + pnl.finExpense.sum);
  const profitBeforeTax = r2(pnl.profitBeforeTax);

  const f20 = Math.max(0, ffWholeEuro(overrides.f20 || 0));
  const f26 = Math.max(0, ffWholeEuro(overrides.f26 || 0));
  const f45Raw = Math.max(0, ffWholeEuro(overrides.f45 || 0));

  const f18 = Math.max(f26, Math.max(0, ffWholeEuro(totalIncome)));
  const f19 = ffWholeEuro(profitBeforeTax);
  const f37 = f19 + f20 - f26;
  const f40 = f37 >= 0 ? f37 : 0;
  const f41 = f37 < 0 ? Math.abs(f37) : 0;
  const f43 = f40;

  const tariffCode: '1' | '2' | '3' =
    overrides.tariffCode === '2' || overrides.tariffCode === '3' ? overrides.tariffCode : '1';

  // For standard tariff code '1', operating loss deduction cannot exceed 70% of f43 (PMĮ 30 str. 4 d.).
  const maxLossDeduction = tariffCode === '1' ? Math.round(f43 * 0.7) : f43;
  const f45 = Math.min(f45Raw, maxLossDeduction);
  const f48 = Math.max(0, f43 - f45);
  const f52 = f48;
  const f52a = f48;

  const standardRate = rules.number('cit.rate.standard', periodEnd);
  const smallRate = year <= 2024 ? 5 : year === 2025 ? 6 : 7;
  const citRate = tariffCode === '1' ? standardRate : tariffCode === '2' ? smallRate : 0;
  const mxfdRate = tariffCode === '1' ? '15,0' : tariffCode === '2' ? '5,0' : '0';

  const f55a = Math.round((f52a * citRate) / 100);
  const f55 = f55a;
  const f59 = f55;
  const f62 = f59;
  const f64 = -f62;

  const notes: string[] = [];
  if (entries.length === 0) {
    notes.push('Šiais metais Didžiosios knygos įrašų nėra — pajamos ir pelnas prieš apmokestinimą lygūs 0 €.');
  }
  if (f45Raw > maxLossDeduction && f43 > 0) {
    notes.push(
      `45 lauko nuostolių suma (${f45Raw} €) apribota iki ${maxLossDeduction} € (standartiniam tarifui taikoma 70 % veiklos pelno riba pagal PMĮ 30 str. 4 d.).`,
    );
  }
  if ((tariffCode === '2' || tariffCode === '3') && (f18 > 300000 || employees > 10)) {
    notes.push(
      'Pasirinktas smulkiojo vieneto lengvatinis tarifas (2 arba 3 kodas), tačiau pajamos viršija 300 000 € arba darbuotojų skaičius viršija 10 — patikrinkite PMĮ 5 str. 2 d. sąlygas.',
    );
  }
  if (year >= 2025 && f52a > 0) {
    notes.push(
      `${year} m. įstatyminis pelno mokesčio tarifas yra ${citRate} % (apskaičiuota ${f55} €); VMI EDS šablone PLN204 v.6 E54A laukelis automatiškai tikrinamas pagal ankstesnį šablono sąrašą (${mxfdRate} %), todėl įkėlę .ffdata failą patikrinkite tarifą EDS.`,
    );
  }

  const provisional = rules.entryAt('cit.rate.standard', periodEnd).status === 'provisional';

  return {
    year,
    periodStart,
    periodEnd,
    employees,
    tariffCode,
    citRate,
    mxfdRate,
    accounting: {
      salesRevenue: r2(pnl.salesRevenue.sum),
      otherRevenue: r2(pnl.otherRevenue.sum),
      finIncome: r2(pnl.finIncome.sum),
      totalIncome,
      totalExpenses,
      profitBeforeTax,
    },
    fields: {
      f18,
      f19,
      f20,
      f26,
      f37,
      f40,
      f41,
      f43,
      f45,
      f48,
      f52,
      f52a,
      f53a: tariffCode,
      f54a: citRate,
      f55a,
      f55,
      f59,
      f62,
      f64,
    },
    entryCount: entries.length,
    provisional,
    notes,
    notFilled: PLN204_NOT_FILLED,
  };
}

// Annual filing deadline: 15 June of the next year (rules registry calendar.pln204.due, 06-15).
export const pln204DueDate = (year: number) => `${year + 1}-${rules.at('calendar.pln204.due', `${year}-12-31`)}`;
