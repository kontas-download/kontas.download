import type Database from 'better-sqlite3';
import { rules } from './rules/registry';

// Draft of the monthly GPM313 declaration (income tax withheld from payments to individuals). Rules: VMI order VA-121 as amended
// by VA-105 of 2025-11-20 (docs/vmi/GPM313_Pildymo_instrukcija_06.zip, IN_GPM313_nuo_2026.docx). The application knows only posted
// payroll (employment-related A class income): field 5 (gross paid, NPD/GPM/contributions not deducted) and the withheld GPM that
// belongs to fields 6 + 7. The split between 6 (paid up to the 15th) and 7 (paid after the 15th) and everything else is left to
// the accountant (`notFilled`); nothing is guessed.
export interface Gpm313Row {
  employee: string;
  code: string | null;
  gross: number;
  npd: number | null; // information only: field 5 is stated without deducting NPD; legacy rows have no NPD
  gpm: number;
}
export interface Gpm313Draft {
  year: number;
  month: number;
  rows: Gpm313Row[];
  // f5 = gross; gpmTotal = sum of fields 6 and 7; when payoutDate is set on the run, f6 (<= 15th) and f7 (> 15th) are also populated
  totals: { f5: number; gpmTotal: number; npd: number | null };
  payoutDate: string | null;
  f6: number | null;
  f7: number | null;
  source: 'RUN' | 'LEGACY' | 'NONE';
  provisional: boolean;
  notes: string[];
  notFilled: string[];
}

export const GPM313_NOT_FILLED = [
  '6 ir 7 laukai: programa nežino darbo užmokesčio išmokėjimo datos, todėl išskaičiuoto GPM nesuskirsto į išmokėtą iki mėnesio 15 d. (imtinai) ir po 15 d.; rodoma tik bendra suma (6 + 7), skirstymą atlieka buhalteris',
  '5 laukas: taisyklės reikalauja per mėnesį IŠMOKĖTŲ išmokų, o programa turi tik priskaičiuotą (apskaitos mėnesio) darbo užmokestį; avansai, kitą mėnesį išmokamas atlyginimas ir išmokos už pirmąsias dvi nedarbingumo dienas neskirstomi — tikrinkite pagal išmokėjimo datas',
  '8–10 laukai (su darbo santykiais nesusijusios A klasės išmokos: dividendai, autorinis atlyginimas, tantjemos ir kt.) ir 11–12 laukai (B klasės išmokos) — programa jų nevaldo',
  'Neapmokestinamos išmokos, užsienyje apmokestintos išmokos (5 p., 21 p.), garantinio fondo išmokos, ligos, motinystės ir kitos socialinės išmokos, progresiniai tarifai pagal darbuotojo prašymą ir nenuolatiniai gyventojai — programa jų neskiria',
  '1–4 laukai pildomi EDS pagal įmonės rekvizitus ir ataskaitinį mėnesį; deklaracija teikiama net ir be išmokų, jei per mėnesį buvo dirbančių pagal darbo sutartis (4 p.)',
];

const cents = (value: number) => Math.round(value * 100);
const euro = (c: number) => c / 100;

export function gpm313Draft(db: Database.Database, companyId: number, year: number, month: number): Gpm313Draft {
  const notes: string[] = [];
  const runs = db.prepare("SELECT id, payrollId, rulesProvisional, payoutDate FROM PayrollRun WHERE companyId=? AND year=? AND month=? AND status='POSTED'").all(companyId, year, month) as { id: number; payrollId: number | null; rulesProvisional: number; payoutDate: string | null }[];
  let rows: Gpm313Row[] = [];
  let source: Gpm313Draft['source'] = 'NONE';
  let provisional = false;
  if (runs.length) {
    source = 'RUN';
    provisional = runs.some(r => r.rulesProvisional === 1);
    rows = (db.prepare(`SELECT employeeName, employeeCode, gross, npd, gpm FROM PayrollRunLine WHERE companyId=? AND runId IN (${runs.map(() => '?').join(',')}) ORDER BY employeeName COLLATE NOCASE, id`).all(companyId, ...runs.map(r => r.id)) as { employeeName: string; employeeCode: string | null; gross: number; npd: number; gpm: number }[])
      .map(l => ({ employee: l.employeeName, code: l.employeeCode, gross: l.gross, npd: l.npd, gpm: l.gpm }));
  }
  // Payroll documents that no calculation run owns (older data entered or imported without a run).
  const linked = runs.map(r => r.payrollId).filter((v): v is number => v !== null);
  const legacy = db.prepare(`SELECT e.employeeName, e.employeeCode, e.grossSalary, e.gpm FROM PayrollEmployee e JOIN Payroll p ON p.id=e.payrollId
      WHERE p.companyId=? AND p.year=? AND p.month=? AND NOT EXISTS (SELECT 1 FROM PayrollRun r WHERE r.payrollId=p.id)${linked.length ? ` AND p.id NOT IN (${linked.map(() => '?').join(',')})` : ''}
      ORDER BY e.employeeName COLLATE NOCASE, e.id`).all(companyId, year, month, ...linked) as { employeeName: string; employeeCode: string | null; grossSalary: number; gpm: number }[];
  if (legacy.length) {
    rows = rows.concat(legacy.map(l => ({ employee: l.employeeName, code: l.employeeCode, gross: l.grossSalary, npd: null, gpm: l.gpm })));
    source = runs.length ? 'RUN' : 'LEGACY';
    notes.push('Dalis duomenų paimta iš darbo užmokesčio įrašų be skaičiavimo (NPD nežinomas, parametrai nepatikrinti) — patikrinkite');
  }
  if (!rows.length) notes.push('Šį mėnesį užregistruoto darbo užmokesčio nėra. Jei buvo dirbančių pagal darbo sutartis, deklaracija vis tiek teikiama su nuliais ar tuščiais laukais (4 p.)');
  if (provisional) notes.push('Bent vieno skaičiavimo parametrai (VDU, NPD, tarifai) laikini — patikrinkite GPM sumas');
  const totalGpm = rows.reduce((s, r) => s + cents(r.gpm), 0);
  const gpmEuro = euro(totalGpm);
  const payoutDate = runs.length === 1 && !legacy.length ? (runs[0].payoutDate ?? null) : null;
  let f6: number | null = null;
  let f7: number | null = null;
  if (payoutDate) {
    const day = Number(payoutDate.slice(8, 10));
    f6 = day <= 15 ? gpmEuro : 0;
    f7 = day > 15 ? gpmEuro : 0;
    notes.push(`Išmokėjimo data ${payoutDate}: išskaičiuotas GPM (${gpmEuro.toFixed(2)} EUR) priskirtas ${day <= 15 ? '6 laukeliui (iki 15 d. imtinai)' : '7 laukeliui (po 15 d.)'}.`);
  }
  const npdKnown = rows.length > 0 && rows.every(r => r.npd !== null);
  return {
    year, month, rows,
    totals: { f5: euro(rows.reduce((s, r) => s + cents(r.gross), 0)), gpmTotal: gpmEuro, npd: npdKnown ? euro(rows.reduce((s, r) => s + cents(r.npd as number), 0)) : null },
    payoutDate, f6, f7,
    source, provisional, notes, notFilled: payoutDate ? GPM313_NOT_FILLED.slice(1) : GPM313_NOT_FILLED,
  };
}

// Monthly period: the due day of the next month (rules registry calendar.gpm313.dueDay, 15), without weekend/holiday carry-over.
export function gpm313DueDate(start: string, end: string): string | null {
  const first = /^(\d{4})-(\d{2})-01$/.exec(start);
  if (!first) return null;
  const last = new Date(Date.UTC(Number(first[1]), Number(first[2]), 0)).toISOString().slice(0, 10);
  if (end !== last) return null;
  return new Date(Date.UTC(Number(first[1]), Number(first[2]), rules.number('calendar.gpm313.dueDay', end))).toISOString().slice(0, 10);
}
