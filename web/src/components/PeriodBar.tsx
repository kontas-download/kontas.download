'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';
import { LIST_PERIODS, periodQuery, type ListPeriod, type ListPeriodKey } from '@/lib/list-period';

/** Period presets and a custom range for a list page; the choice lives in the URL, the server loads only that range. */
export function PeriodBar({ period, basePath, shown }: { period: ListPeriod; basePath: string; shown: string }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label={t('common.period')} className="flex flex-wrap gap-1">
          {(LIST_PERIODS.filter(k => k !== 'custom') as ListPeriodKey[]).map(key => (
            <Link key={key} href={`${basePath}${periodQuery({ key, from: null, to: null })}`} aria-current={period.key === key ? 'page' : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${period.key === key ? 'border border-emerald-600 bg-emerald-500/15 text-emerald-300' : 'border border-transparent text-slate-300 hover:bg-slate-800'}`}>
              {t(`common.period_${key}`)}
            </Link>
          ))}
        </nav>
        <form action={basePath} method="get" className="flex flex-wrap items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-slate-400">{t('common.periodFrom')}<input type="date" name="from" defaultValue={period.from ?? ''} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" /></label>
          <label className="flex items-center gap-1.5 text-slate-400">{t('common.periodTo')}<input type="date" name="to" defaultValue={period.to ?? ''} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" /></label>
          <button type="submit" className={`rounded-lg px-3 py-1.5 font-semibold ${period.key === 'custom' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-200 hover:bg-slate-800'}`}>{t('common.periodApply')}</button>
        </form>
      </div>
      <p className="-mt-3 text-xs text-slate-400">{shown}</p>
    </>
  );
}
