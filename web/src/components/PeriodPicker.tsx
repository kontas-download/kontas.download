import Link from 'next/link';
import type { Period, PeriodKey } from '@/lib/dashboard-period';

// Period switcher of the overview: preset links and a small GET form for any range (works without client JavaScript).
export function PeriodPicker({ period, labels, basePath = '/' }: { period: Period; labels: Record<PeriodKey | 'from' | 'to' | 'apply' | 'title', string>; basePath?: string }) {
  const presets: PeriodKey[] = ['month', 'quarter', 'year', 'last12', 'lastYear', 'all'];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3 lg:flex-row lg:items-center lg:justify-between">
      <nav aria-label={labels.title} className="flex flex-wrap gap-1">
        {presets.map(key => (
          <Link key={key} href={`${basePath}?period=${key}`} aria-current={period.key === key ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${period.key === key ? 'border border-emerald-600 bg-emerald-500/15 text-emerald-300' : 'border border-transparent text-slate-300 hover:bg-slate-800'}`}>
            {labels[key]}
          </Link>
        ))}
      </nav>
      <form action={basePath} method="get" className="flex flex-wrap items-center gap-2 text-xs">
        <input type="hidden" name="period" value="custom" />
        <label className="flex items-center gap-1.5 text-slate-400">{labels.from}<input type="date" name="from" defaultValue={period.from ?? ''} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" /></label>
        <label className="flex items-center gap-1.5 text-slate-400">{labels.to}<input type="date" name="to" defaultValue={period.to ?? ''} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100" /></label>
        <button type="submit" className={`rounded-lg px-3 py-1.5 font-semibold ${period.key === 'custom' ? 'bg-emerald-600 text-white' : 'border border-slate-700 text-slate-200 hover:bg-slate-800'}`}>{labels.apply}</button>
      </form>
    </div>
  );
}
