import Link from 'next/link';
import { Scale } from 'lucide-react';
import { requirePageAccess } from '@/lib/access';
import { todayVilnius } from '@/lib/dates';
import { helpSourceById } from '@/lib/help/sources';
import { getT } from '@/lib/i18n/server';
import { formatDate, formatMoney, type T } from '@/lib/i18n/translate';
import type { Lang } from '@/lib/i18n/config';
import { rules, rulesFreshness, type RuleEntry } from '@/lib/rules';

export const dynamic = 'force-dynamic';

function valueText(entry: RuleEntry, t: T, lang: Lang) {
  if (entry.unit === 'percent') return `${entry.value} %`;
  if (entry.unit === 'dayOfMonth') return t('rules.valueDay', { day: entry.value });
  if (entry.unit === 'nextYearDate') return t('rules.valueNextYear', { date: entry.value });
  if (entry.unit === 'eur' && typeof entry.value === 'number') return formatMoney(lang, entry.value);
  if (entry.unit === 'years') return t('rules.valueYears', { years: entry.value });
  return String(entry.value);
}

function Basis({ entry, lang }: { entry: RuleEntry; lang: Lang }) {
  const source = entry.basis.sourceId ? helpSourceById.get(entry.basis.sourceId) : undefined;
  const url = entry.basis.url || source?.url;
  return (
    <div className="space-y-0.5">
      <div>{entry.basis.actTitle}{entry.basis.article ? <span className="text-slate-400"> · {entry.basis.article}</span> : null}</div>
      {source && url ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-400 hover:underline">{source.title[lang]}</a> : null}
    </div>
  );
}

// Read-only list of the legislation rules registry (lib/rules); available to administrators and accountants.
export default async function RulesPage() {
  await requirePageAccess();
  const { t, lang } = await getT();
  const today = todayVilnius();
  const freshness = rulesFreshness(today);
  const overdue = new Set(freshness.overdue);
  const entries = rules.list().sort((a, b) => a.id.localeCompare(b.id) || a.effectiveFrom.localeCompare(b.effectiveFrom));

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Scale className="w-6 h-6 text-emerald-400" />
          <span>{t('rules.title')}</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">{t('rules.subtitle')}</p>
        <p className="text-sm text-slate-300 mt-2">{freshness.asOf ? t('rules.asOf', { date: formatDate(lang, freshness.asOf) }) : t('rules.asOfUnknown')}</p>
      </header>

      {freshness.overdue.length > 0 && <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{t('rules.overdue', { count: freshness.overdue.length })}</div>}
      {freshness.stale && freshness.asOf && <div role="alert" className="rounded-lg border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-200">{t('rules.stale', { days: freshness.daysOld ?? 0 })}</div>}
      <div className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">{t('rules.provisionalWarning')}</div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-400">
            <tr>
              <th className="py-2.5 px-3">{t('rules.colRule')}</th>
              <th className="py-2.5 px-3 text-right">{t('rules.colValue')}</th>
              <th className="py-2.5 px-3">{t('rules.colPeriod')}</th>
              <th className="py-2.5 px-3">{t('rules.colBasis')}</th>
              <th className="py-2.5 px-3">{t('rules.colStatus')}</th>
              <th className="py-2.5 px-3">{t('rules.colChecked')}</th>
              <th className="py-2.5 px-3">{t('rules.colReviewBy')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={`${entry.id}|${entry.effectiveFrom}`} className="border-t border-slate-800 align-top">
                <td className="py-2 px-3"><div className="text-slate-100">{entry.title[lang]}</div><div className="font-mono text-xs text-slate-500">{entry.id}</div></td>
                <td className="py-2 px-3 text-right font-mono whitespace-nowrap">{valueText(entry, t, lang)}</td>
                <td className="py-2 px-3 whitespace-nowrap">{entry.effectiveTo ? t('rules.periodClosed', { from: formatDate(lang, entry.effectiveFrom), to: formatDate(lang, entry.effectiveTo) }) : t('rules.periodOpen', { from: formatDate(lang, entry.effectiveFrom) })}</td>
                <td className="py-2 px-3 text-slate-300"><Basis entry={entry} lang={lang} /></td>
                <td className="py-2 px-3 whitespace-nowrap">
                  <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${entry.status === 'verified' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{t(entry.status === 'verified' ? 'rules.statusVerified' : 'rules.statusProvisional')}</span>
                  {overdue.has(entry) && <div className="mt-1 text-xs text-rose-300">{t('rules.flagOverdue')}</div>}
                </td>
                <td className="py-2 px-3 whitespace-nowrap"><div>{formatDate(lang, entry.verifiedOn)}</div><div className="text-xs text-slate-500">{entry.verifiedBy}</div></td>
                <td className="py-2 px-3 whitespace-nowrap">{formatDate(lang, entry.reviewBy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link href="/help/rules-registry" className="inline-block text-sm text-emerald-400 hover:underline">{t('rules.helpLink')}</Link>
    </div>
  );
}
