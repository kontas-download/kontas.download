import type { Lang } from '../i18n/config';

// One value of the legislation rules registry (methodology: owner's private monitoring rules). Values that depend on laws live
// here, not in the calculation code; a change of law adds a new entry and closes the previous one (effectiveTo), nothing is deleted.
export type RuleStatus = 'verified' | 'provisional';
export type RuleTopic = 'vat' | 'payroll' | 'calendar' | 'isaf' | 'assets' | 'cit';
// percent: number in percent (21 = 21 %); dayOfMonth: day of the month after the period; nextYearDate: 'MM-DD' of the next year;
// reference: the value is kept elsewhere (a catalogue in code), the entry records its source and review dates;
// eur: an amount in euro (MMA, VDU, NPD); factor: a plain number (a coefficient or a multiple of VDU); years: a period in years.
export type RuleUnit = 'percent' | 'dayOfMonth' | 'nextYearDate' | 'reference' | 'eur' | 'factor' | 'years';
export type RuleValue = number | string;

// The registry records values from the start of i.SAF (2016-10-01), the earliest tax period the program prepares. Entries whose
// earlier history is not recorded start on this date; a lookup for an earlier date is answered as of this date (this keeps the
// behaviour the calculators had before the registry, when the values did not depend on the date at all).
export const REGISTRY_FROM = '2016-10-01';
// Defaults of the initial registry (2026-10-27): what the program already applied, checked against the VMI documents in docs/vmi.
export const INITIAL_CHECK = { verifiedOn: '2026-10-27', verifiedBy: 'kontas.download (automatinė peržiūra)', reviewBy: '2026-12-31' } as const;

export interface RuleBasis {
  // Lithuanian title of the legal act or official VMI / Sodra document.
  actTitle: string;
  article?: string;
  // Id from web/src/lib/help/sources.ts when the act is listed there.
  sourceId?: string;
  url?: string;
}

export interface RuleEntry {
  id: string;
  topic: RuleTopic;
  title: Record<Lang, string>;
  unit: RuleUnit;
  value: RuleValue;
  // ISO dates, both inclusive; effectiveTo null = still valid.
  effectiveFrom: string;
  effectiveTo: string | null;
  basis: RuleBasis;
  status: RuleStatus;
  verifiedOn: string;
  verifiedBy: string;
  // The entry must be checked again by this date.
  reviewBy: string;
  // Title (or part of it) of the control test in web/tests/*.cjs that exercises this value.
  example: string;
}
