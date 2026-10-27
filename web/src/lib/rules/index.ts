import { rules } from './registry';
import type { RuleEntry } from './types';

export { rules } from './registry';
export { REGISTRY_FROM } from './types';
export type { RuleBasis, RuleEntry, RuleStatus, RuleTopic, RuleUnit, RuleValue } from './types';

// A verified entry older than this must be checked again even if its reviewBy date has not passed (audit flag only).
export const REVERIFY_AFTER_DAYS = 180;
// The program warns when the newest verification is older than this.
export const STALE_AFTER_DAYS = 400;

const days = (from: string, to: string) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
const latestVerified = (entries: RuleEntry[]) => entries.filter(e => e.status === 'verified').map(e => e.verifiedOn).sort().at(-1) ?? null;
// Entries still in force (or starting later) on `today`; closed historical entries need no further review.
const current = (entries: RuleEntry[], today: string) => entries.filter(e => e.effectiveTo === null || e.effectiveTo >= today);

// Date to which the tax rules of this build are known to be up to date: the newest verification of a verified entry.
export const TAX_RULES_AS_OF: string | null = latestVerified(rules.list());

export interface RulesFreshness { asOf: string | null; daysOld: number | null; stale: boolean; overdue: RuleEntry[]; provisional: number }
// today: Vilnius calendar date (ISO). `entries` can be injected by tests.
export function rulesFreshness(today: string, entries: RuleEntry[] = rules.list()): RulesFreshness {
  const asOf = latestVerified(entries);
  const daysOld = asOf ? days(asOf, today) : null;
  const live = current(entries, today);
  return {
    asOf,
    daysOld,
    stale: daysOld === null || daysOld > STALE_AFTER_DAYS,
    overdue: live.filter(e => e.reviewBy < today),
    provisional: live.filter(e => e.status === 'provisional').length,
  };
}

export type AuditFlag = 'overdue' | 'provisional' | 'old';
export interface AuditRow { entry: RuleEntry; flags: AuditFlag[] }
// Rows of the rules audit (scripts/rules-audit.cjs): overdue = reviewBy passed; provisional; old = verified more than
// REVERIFY_AFTER_DAYS ago. `failed` is true when any entry in force is overdue.
export function auditRules(today: string, entries: RuleEntry[] = rules.list()): { rows: AuditRow[]; failed: boolean } {
  const live = new Set(current(entries, today));
  const rows = entries.map(entry => {
    const flags: AuditFlag[] = [];
    if (live.has(entry) && entry.reviewBy < today) flags.push('overdue');
    if (entry.status === 'provisional') flags.push('provisional');
    if (entry.status === 'verified' && days(entry.verifiedOn, today) > REVERIFY_AFTER_DAYS) flags.push('old');
    return { entry, flags };
  });
  return { rows, failed: rows.some(r => r.flags.includes('overdue')) };
}
