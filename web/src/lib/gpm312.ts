import type Database from 'better-sqlite3';
import { rules } from './rules/registry';

// Draft of the annual GPM312 declaration (payments to individuals attributed to A and B class income) with appendix GPM312L (residents).
// Rules: VMI order VA-9 as amended by VA-24 of 2026-03-26 (docs/vmi/IN_GPM312.pdf, GPM312_MXFD_33.zip). The application knows only posted
// payroll: employment-related payments to residents, income type code 01 (rules annex 2, item 1.1), L8 = gross (NPD, GPM, VSD and PSD
// not deducted), L10 = GPM withheld. Everything else is left to the accountant (`notFilled`); nothing is guessed.
export interface Gpm312Row {
  employee: string;
  code: string | null; // personal code (L1, L2 = 1); null = missing, the accountant must supply it
  incomeCode: '01'; // employment-related income (annex 2, item 1.1); 03 / 04 / 08 etc. cannot be told apart by the application
  gross: number; // L8
  npd: number | null; // information only; legacy rows have no NPD
  gpm: number; // L10
  months: number;
}
export interface Gpm312Draft {
  year: number;
  rows: Gpm312Row[];
  // f4 = sum of L8, f5 = sum of L10; f6 (GPM paid from own funds) and f7 (GPM paid abroad) are not known
  totals: { f4: number; f5: number; npd: number | null };
  source: 'RUN' | 'LEGACY' | 'MIXED' | 'NONE';
  provisional: boolean;
  missingCodes: string[];
  notes: string[];
  notFilled: string[];
}

export const GPM312_NOT_FILLED = [
  'L9 laukelis (taikytas GPM tarifas): programa nesaugo kiekvienai eilutei taikyto tarifo (20 % / 32 % ar kt.); jis privalomas net kai GPM po NPD lygus nuliui (31.1 p.) — įrašo buhalteris',
  'Pajamų rūšies kodas: rodomas 01 (su darbo santykiais susijusios išmokos); ligos išmokos už pirmąsias dvi dienas (03), dienpinigiai (05), neapmokestinamos išmokos (08), iki 2019 m. apskaičiuotos išmokos (04), neribotos atsakomybės vieneto dalyviams (02) ir kt. kodai programai nežinomi — skirstymą į atskiras eilutes atlieka buhalteris',
  'Skirtingais GPM tarifais apmokestintos to paties asmens išmokos (pvz., progresinis tarifas) turi būti atskirose eilutėse (18 p.); programa vienam darbuotojui rodo vieną eilutę',
  'Išmokų priskyrimas metams: taisyklės reikalauja mokestinio laikotarpio išmokėtų išmokų, o programa turi priskaičiuotą (apskaitos mėnesio) darbo užmokestį; gruodžio atlyginimas, išmokėtas sausį, ir praėjusių metų gruodžio atlyginimas, išmokėtas šiais metais, priskirtini pagal išmokėjimo datą — tikrinkite',
  'L1 / L2 (asmens identifikatorius): rodomas tik darbuotojo kortelės asmens kodas; kitų identifikatorių (pasas, leidimas gyventi) programa neapdoroja',
  'U priedas (nenuolatiniai gyventojai): programa gyventojo statuso nežino, todėl visi darbuotojai rodomi kaip nuolatiniai (L priedas); nenuolatiniams išmokėtos išmokos deklaruojamos U priede (7 p.) ir jų programa neatskiria',
  'Kitos A klasės išmokos (dividendai, autorinis atlyginimas, tantjemos, civilinės sutartys), B klasės išmokos, individualią veiklą vykdantiems asmenims ir nuomos išmokos (L6, L7 laukeliai: A / N, D, M, P) — programa jų nevaldo',
  'Neapmokestinamos išmokos, nurodytos taisyklių 1 priede, ir užsienyje sumokėtas GPM (L12, L13, 7 laukelis); GPM, sumokėtas išmokas išmokėjusio asmens lėšomis (L11, 6 laukelis) — pildo buhalteris',
  '1–3 laukeliai pildomi EDS pagal įmonės rekvizitus ir mokestinį laikotarpį; L3 laukelio vardas ir pavardė imami iš darbuotojo kortelės, patikrinkite',
  'Jei deklaruojamos sumos skiriasi nuo GPM313 deklaracijose pateiktų, tikslinama ir atitinkamo mėnesio GPM313 (65 p.)',
];

const cents = (value: number) => Math.round(value * 100);
const euro = (c: number) => c / 100;

interface Acc { employee: string; code: string | null; gross: number; npd: number | null; gpm: number; months: Set<number> }

export function gpm312Draft(db: Database.Database, companyId: number, year: number): Gpm312Draft {
  const notes: string[] = [];
  const acc = new Map<string, Acc>();
  const add = (key: string, employee: string, code: string | null, gross: number, npd: number | null, gpm: number, month: number) => {
    const cur = acc.get(key) || { employee, code, gross: 0, npd: 0 as number | null, gpm: 0, months: new Set<number>() };
    cur.gross += cents(gross); cur.gpm += cents(gpm);
    cur.npd = cur.npd === null || npd === null ? null : cur.npd + cents(npd);
    cur.code = cur.code || code; cur.employee = employee; cur.months.add(month);
    acc.set(key, cur);
  };
  const runs = db.prepare("SELECT id, payrollId, month, rulesProvisional FROM PayrollRun WHERE companyId=? AND year=? AND status='POSTED'").all(companyId, year) as { id: number; payrollId: number | null; month: number; rulesProvisional: number }[];
  const provisional = runs.some(r => r.rulesProvisional === 1);
  if (runs.length) {
    const monthOf = new Map(runs.map(r => [r.id, r.month]));
    const lines = db.prepare(`SELECT runId, employeeId, employeeName, employeeCode, gross, npd, gpm FROM PayrollRunLine WHERE companyId=? AND runId IN (${runs.map(() => '?').join(',')}) ORDER BY runId, id`).all(companyId, ...runs.map(r => r.id)) as { runId: number; employeeId: number; employeeName: string; employeeCode: string | null; gross: number; npd: number; gpm: number }[];
    for (const l of lines) add('e' + l.employeeId, l.employeeName, l.employeeCode, l.gross, l.npd, l.gpm, monthOf.get(l.runId) as number);
  }
  // Payroll documents that no calculation run owns (older data entered or imported without a run).
  const linked = runs.map(r => r.payrollId).filter((v): v is number => v !== null);
  const legacy = db.prepare(`SELECT p.month, e.employeeName, e.employeeCode, e.grossSalary, e.gpm FROM PayrollEmployee e JOIN Payroll p ON p.id=e.payrollId
      WHERE p.companyId=? AND p.year=? AND NOT EXISTS (SELECT 1 FROM PayrollRun r WHERE r.payrollId=p.id)${linked.length ? ` AND p.id NOT IN (${linked.map(() => '?').join(',')})` : ''}
      ORDER BY p.month, e.id`).all(companyId, year, ...linked) as { month: number; employeeName: string; employeeCode: string | null; grossSalary: number; gpm: number }[];
  for (const l of legacy) add(l.employeeCode ? 'c' + l.employeeCode : 'n' + l.employeeName.toLowerCase(), l.employeeName, l.employeeCode, l.grossSalary, null, l.gpm, l.month);
  if (legacy.length) notes.push('Dalis duomenų paimta iš darbo užmokesčio įrašų be skaičiavimo (NPD nežinomas, parametrai nepatikrinti) — patikrinkite');
  const rows: Gpm312Row[] = [...acc.values()]
    .sort((a, b) => a.employee.localeCompare(b.employee, 'lt'))
    .map(a => ({ employee: a.employee, code: a.code && a.code.trim() ? a.code.trim() : null, incomeCode: '01' as const, gross: euro(a.gross), npd: a.npd === null ? null : euro(a.npd), gpm: euro(a.gpm), months: a.months.size }));
  const missingCodes = rows.filter(r => !r.code).map(r => r.employee);
  if (missingCodes.length) notes.push(`Trūksta asmens kodo (L1): ${missingCodes.join(', ')} — papildykite darbuotojo kortelę arba įrašykite EDS`);
  if (!rows.length) notes.push('Šiais metais užregistruoto darbo užmokesčio nėra. Jei per metus nebuvo išmokų, kurias privaloma deklaruoti, GPM312 gali būti neteikiama (3 ir 8 p.) — patikrinkite');
  if (provisional) notes.push('Bent vieno skaičiavimo parametrai (VDU, NPD, tarifai) laikini — patikrinkite GPM sumas');
  const npdKnown = rows.length > 0 && rows.every(r => r.npd !== null);
  return {
    year, rows,
    totals: { f4: euro(rows.reduce((s, r) => s + cents(r.gross), 0)), f5: euro(rows.reduce((s, r) => s + cents(r.gpm), 0)), npd: npdKnown ? euro(rows.reduce((s, r) => s + cents(r.npd as number), 0)) : null },
    source: !rows.length ? 'NONE' : runs.length && legacy.length ? 'MIXED' : runs.length ? 'RUN' : 'LEGACY',
    provisional, missingCodes, notes, notFilled: GPM312_NOT_FILLED,
  };
}

// Annual period: the date of the next year from the rules registry (calendar.gpm312.due, 02-15), without weekend/holiday carry-over.
export const gpm312DueDate = (year: number) => `${year + 1}-${rules.at('calendar.gpm312.due', `${year}-12-31`)}`;
