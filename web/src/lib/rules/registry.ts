import { todayVilnius } from '../dates';
import { assetRules } from './assets';
import { calendarRules } from './calendar';
import { citRules } from './cit';
import { isafRules } from './isaf';
import { payrollRules } from './payroll';
import { REGISTRY_FROM, type RuleEntry, type RuleValue } from './types';
import { vatRules } from './vat';

const ALL: RuleEntry[] = [...vatRules, ...payrollRules, ...calendarRules, ...isafRules, ...assetRules, ...citRules];
const BY_ID = new Map<string, RuleEntry[]>();
for (const entry of ALL) BY_ID.set(entry.id, [...(BY_ID.get(entry.id) || []), entry]);
for (const list of BY_ID.values()) list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

const ISO = /^\d{4}-\d{2}-\d{2}$/;
// A Date is taken as the calendar date in Lithuania; a string must start with an ISO date (a timestamp is cut to its date).
function calendarDate(date: string | Date): string {
  if (date instanceof Date) return todayVilnius(date);
  const day = String(date).slice(0, 10);
  if (!ISO.test(day) || new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) !== day) throw new Error(`Taisyklių registras: neteisinga data „${date}“`);
  return day;
}

// Entry of `id` valid on `date`, without validation (calculators keep their own date handling). Dates before REGISTRY_FROM
// are answered as of REGISTRY_FROM.
function find(id: string, date: string): RuleEntry | undefined {
  const day = date < REGISTRY_FROM ? REGISTRY_FROM : date;
  return BY_ID.get(id)?.find(e => e.effectiveFrom <= day && (e.effectiveTo === null || day <= e.effectiveTo));
}

export const rules = {
  // Value of rule `id` valid on `date` (Vilnius calendar date). Throws when the id is unknown or no entry is valid that day.
  at(id: string, date: string | Date): RuleValue {
    return rules.entryAt(id, date).value;
  },
  entryAt(id: string, date: string | Date): RuleEntry {
    if (!BY_ID.has(id)) throw new Error(`Taisyklių registras: nežinoma taisyklė „${id}“`);
    const day = calendarDate(date);
    const entry = find(id, day);
    if (!entry) throw new Error(`Taisyklių registras: taisyklė „${id}“ ${day} dienai negalioja (nėra galiojančio įrašo)`);
    return entry;
  },
  number(id: string, date: string | Date): number {
    const value = rules.at(id, date);
    if (typeof value !== 'number') throw new Error(`Taisyklių registras: taisyklės „${id}“ reikšmė nėra skaičius`);
    return value;
  },
  // Lenient lookup for calculators that accept any date string as before (no validation, undefined when nothing is valid).
  find,
  list(): RuleEntry[] { return [...ALL]; },
  ids(): string[] { return [...BY_ID.keys()]; },
  history(id: string): RuleEntry[] { return [...(BY_ID.get(id) || [])]; },
};
