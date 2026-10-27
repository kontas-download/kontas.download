import { rules } from './rules';

// Monthly payroll calculation of one employee (darbo užmokesčio skaičiavimas). Pure and deterministic: the same input and
// parameters always give the same result. Every legal value comes from the rules registry (rules.at(id, date)); this file holds
// no rates. All registry entries used here are provisional until the accountant verifies them, so are the results.
// Amounts are handled in integer cents; each contribution is rounded half away from zero to cents, the income tax once per month.

// Registry ids of the payroll calculation.
export const PAYROLL_RULE_IDS = {
  mma: 'payroll.mma',
  vdu: 'payroll.vdu',
  npdMax: 'payroll.npd.max',
  npdCoefficient: 'payroll.npd.coefficient',
  gpmRate1: 'payroll.gpm.rate',
  gpmRate2: 'payroll.gpm.rate2',
  gpmRate3: 'payroll.gpm.rate3',
  gpmBand2FromVdu: 'payroll.gpm.band2FromVdu',
  gpmBand3FromVdu: 'payroll.gpm.band3FromVdu',
  sodraCeilingVdu: 'payroll.sodra.ceilingVdu',
  vsd: 'payroll.sodra.employee.vsd',
  psd: 'payroll.sodra.employee.psd',
  pension: 'payroll.sodra.employee.pension',
  unemployment: 'payroll.sodra.employer.unemployment',
  unemploymentFixedTerm: 'payroll.sodra.employer.unemploymentFixedTerm',
  accidentMin: 'payroll.sodra.employer.accidentMin',
  accidentMax: 'payroll.sodra.employer.accidentMax',
  accidentDefault: 'payroll.sodra.employer.accidentDefault',
  guarantee: 'payroll.sodra.employer.guarantee',
  longTerm: 'payroll.sodra.employer.longTerm',
} as const;
export type PayrollParamKey = keyof typeof PAYROLL_RULE_IDS;

export type PayrollParams = Record<PayrollParamKey, number> & {
  // Calendar date the parameters are valid for (the last day of the payroll month).
  date: string;
  // true when any parameter is a provisional registry entry.
  provisional: boolean;
};

// Parameters valid on `date` (ISO, Vilnius calendar date). Throws the registry's error when a parameter is not valid that day.
export function payrollParams(date: string): PayrollParams {
  const out = { date, provisional: false } as PayrollParams;
  for (const [key, id] of Object.entries(PAYROLL_RULE_IDS) as [PayrollParamKey, string][]) {
    const entry = rules.entryAt(id, date);
    if (typeof entry.value !== 'number') throw new Error(`Taisyklių registras: taisyklės „${id}“ reikšmė nėra skaičius`);
    out[key] = entry.value;
    if (entry.status !== 'verified') out.provisional = true;
  }
  return out;
}

// Fields the accountant can set by hand (the last word). Net pay is always gross minus the employee's deductions.
export const OVERRIDE_FIELDS = ['npd', 'gpm', 'vsd', 'psd', 'pension', 'unemployment', 'accident', 'guarantee', 'longTerm'] as const;
export type OverrideField = typeof OVERRIDE_FIELDS[number];
export type PayslipOverrides = Partial<Record<OverrideField, number>>;
export const isOverrideField = (value: unknown): value is OverrideField => typeof value === 'string' && (OVERRIDE_FIELDS as readonly string[]).includes(value);

export interface PayslipInput {
  gross: number;
  // Gross pay and contribution base of earlier months of the same calendar year from this employer.
  ytdGrossBefore: number;
  ytdSodraBaseBefore: number;
  // The employee asked for the tax-exempt amount (NPD) at this workplace.
  applyNpd: boolean;
  // The employee takes part in pension accumulation (additional contribution).
  pensionAccumulation: boolean;
  fixedTerm: boolean;
  // Accidents at work insurance rate of the employer in percent; null = the registry default.
  accidentRate?: number | null;
}

export interface Payslip {
  gross: number;
  npd: number;
  taxable: number;
  // Taxable amounts per income tax rate (rate in percent).
  gpmBands: { rate: number; base: number }[];
  gpm: number;
  // Contribution base after the annual ceiling.
  sodraBase: number;
  vsd: number;
  psd: number;
  pension: number;
  employeeContributions: number;
  net: number;
  unemploymentRate: number;
  accidentRate: number;
  unemployment: number;
  accident: number;
  guarantee: number;
  longTerm: number;
  employerContributions: number;
  totalCost: number;
  overridden: OverrideField[];
}

const toCents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;
// value * factor rounded half away from zero; factor has at most 6 decimals.
function times(cents: number, factor: number): number {
  const scaled = BigInt(Math.round(factor * 1_000_000));
  const n = BigInt(cents) * scaled;
  const d = 1_000_000n;
  return Number(n < 0n ? -((-n + d / 2n) / d) : (n + d / 2n) / d);
}
const percentOf = (cents: number, rate: number) => times(cents, rate / 100);

function checkAmount(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1e9) throw new Error(`Darbo užmokestis: neteisinga reikšmė „${name}“`);
}

// Tax-exempt amount of the month: the maximum when income does not exceed the minimum wage, otherwise the maximum reduced by
// the coefficient times the excess, never below zero (2026: 747 − 0.49 × (income − MMA), zero from 2677.49).
export function monthlyNpd(grossCents: number, p: PayrollParams): number {
  const max = toCents(p.npdMax);
  const mma = toCents(p.mma);
  if (grossCents <= mma) return Math.min(max, grossCents);
  return Math.max(0, max - times(grossCents - mma, p.npdCoefficient));
}

export function calculatePayslip(input: PayslipInput, p: PayrollParams, overrides: PayslipOverrides = {}): Payslip {
  for (const key of ['gross', 'ytdGrossBefore', 'ytdSodraBaseBefore'] as const) checkAmount(key, input[key]);
  for (const [key, value] of Object.entries(overrides)) {
    if (!isOverrideField(key)) throw new Error(`Darbo užmokestis: nežinomas laukas „${key}“`);
    checkAmount(key, value as number);
  }
  const accidentRate = input.accidentRate ?? p.accidentDefault;
  if (!Number.isFinite(accidentRate) || accidentRate < p.accidentMin || accidentRate > p.accidentMax) throw new Error(`Darbo užmokestis: nelaimingų atsitikimų tarifas turi būti tarp ${p.accidentMin} ir ${p.accidentMax} %`);
  const pick = (field: OverrideField, computed: number) => overrides[field] !== undefined ? toCents(overrides[field] as number) : computed;

  const gross = toCents(input.gross);
  const before = toCents(input.ytdGrossBefore);

  // Income tax (GPM): the month's gross is split by the annual bands of the same employer; the tax-exempt amount reduces
  // the lowest-rate part first; the tax is rounded once.
  const npd = Math.min(gross, pick('npd', input.applyNpd ? monthlyNpd(gross, p) : 0));
  const vdu = toCents(p.vdu);
  const band2 = times(vdu, p.gpmBand2FromVdu);
  const band3 = times(vdu, p.gpmBand3FromVdu);
  const portion = (from: number, to: number) => Math.max(0, Math.min(before + gross, to) - Math.max(before, from));
  const parts = [
    { rate: p.gpmRate1, base: portion(0, band2) },
    { rate: p.gpmRate2, base: portion(band2, band3) },
    { rate: p.gpmRate3, base: portion(band3, Number.MAX_SAFE_INTEGER) },
  ];
  let exempt = npd;
  for (const part of parts) { const used = Math.min(part.base, exempt); part.base -= used; exempt -= used; }
  const taxMicro = parts.reduce((sum, part) => sum + BigInt(part.base) * BigInt(Math.round(part.rate * 10_000)), 0n);
  const computedGpm = Number((taxMicro + 500_000n) / 1_000_000n);
  const gpm = pick('gpm', computedGpm);

  // Social insurance: VSD, the pension accumulation and the employer's contributions stop at the annual ceiling; PSD does not.
  const ceiling = times(vdu, p.sodraCeilingVdu);
  const sodraBase = Math.max(0, Math.min(gross, ceiling - toCents(input.ytdSodraBaseBefore)));
  const vsd = pick('vsd', percentOf(sodraBase, p.vsd));
  const psd = pick('psd', percentOf(gross, p.psd));
  const pension = pick('pension', input.pensionAccumulation ? percentOf(sodraBase, p.pension) : 0);
  const unemploymentRate = input.fixedTerm ? p.unemploymentFixedTerm : p.unemployment;
  const unemployment = pick('unemployment', percentOf(sodraBase, unemploymentRate));
  const accident = pick('accident', percentOf(sodraBase, accidentRate));
  const guarantee = pick('guarantee', percentOf(sodraBase, p.guarantee));
  const longTerm = pick('longTerm', percentOf(sodraBase, p.longTerm));

  const employeeContributions = vsd + psd + pension;
  const employerContributions = unemployment + accident + guarantee + longTerm;
  return {
    gross: fromCents(gross),
    npd: fromCents(npd),
    taxable: fromCents(gross - npd),
    gpmBands: parts.filter(part => part.base > 0).map(part => ({ rate: part.rate, base: fromCents(part.base) })),
    gpm: fromCents(gpm),
    sodraBase: fromCents(sodraBase),
    vsd: fromCents(vsd),
    psd: fromCents(psd),
    pension: fromCents(pension),
    employeeContributions: fromCents(employeeContributions),
    net: fromCents(gross - gpm - employeeContributions),
    unemploymentRate,
    accidentRate,
    unemployment: fromCents(unemployment),
    accident: fromCents(accident),
    guarantee: fromCents(guarantee),
    longTerm: fromCents(longTerm),
    employerContributions: fromCents(employerContributions),
    totalCost: fromCents(gross + employerContributions),
    overridden: OVERRIDE_FIELDS.filter(field => overrides[field] !== undefined),
  };
}

// Last calendar day of a payroll month (the date of the payroll and of its parameters).
export function payrollDate(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}
