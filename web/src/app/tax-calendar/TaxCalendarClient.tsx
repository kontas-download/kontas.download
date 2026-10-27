'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

interface Setting { code: string; enabled: boolean; period: string | null; auto: boolean; reason: string; }
interface Event { code: string; title: string; periodStart: string; periodEnd: string; dueNominal: string; dueWorkingDay: string; source: string; done: boolean; doneAt: number | null; }
const CODES = ['FR0600', 'FR0564', 'GPM313', 'GPM312', 'PLN204'];
const PERIODS: [string, string][] = [['MONTH', 'tax.cal.periodMonth'], ['QUARTER', 'tax.cal.periodQuarter'], ['HALF', 'tax.cal.periodHalf']];
const daysTo = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

export function TaxCalendarClient({ today, settings, events }: { today: string; settings: Setting[]; events: Event[] }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(body: object) {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/tax-calendar', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('tax.cal.saveFailed')); return; }
      router.refresh();
    } finally { setBusy(false); }
  }
  const overdue = events.filter(e => !e.done && e.dueNominal < today);
  const upcoming = events.filter(e => e.dueNominal >= today);

  const row = (e: Event) => {
    const left = daysTo(today, e.dueNominal);
    return (
      <tr key={`${e.code}-${e.periodEnd}`} className="border-t border-slate-800">
        <td className="p-3">{e.title}<div className="text-xs text-slate-500">{e.source}</div></td>
        <td className="p-3 text-slate-400">{e.periodStart} – {e.periodEnd}</td>
        <td className="p-3 font-mono">{e.dueNominal}{e.dueWorkingDay !== e.dueNominal && <div className="text-xs text-amber-400">{t('tax.cal.nonWorkingDay', { date: e.dueWorkingDay })}</div>}</td>
        <td className={`p-3 ${e.done ? 'text-emerald-400' : left < 0 ? 'text-rose-400' : left <= 7 ? 'text-amber-400' : 'text-slate-300'}`}>{e.done ? t('tax.cal.filed') : left < 0 ? t('tax.cal.overdueDays', { days: -left }) : left === 0 ? t('tax.cal.today') : t('tax.cal.inDays', { days: left })}</td>
        <td className="p-3 text-right"><button disabled={busy} onClick={() => save({ code: e.code, periodEnd: e.periodEnd, done: !e.done })} className="px-3 py-1 rounded border border-slate-700 text-xs">{e.done ? t('tax.cal.unmark') : t('tax.cal.markFiled')}</button></td>
      </tr>
    );
  };
  const table = (title: string, list: Event[], empty: string) => (
    <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
      <div className="p-3 font-semibold text-white">{title}</div>
      <table className="w-full text-sm"><tbody>{list.length === 0 ? <tr><td className="p-3 text-slate-400">{empty}</td></tr> : list.map(row)}</tbody></table>
    </div>
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('tax.cal.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('tax.cal.intro', { today })}</p>
      </div>
      {error && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200">{error}</div>}
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
        <div className="font-semibold text-white">{t('tax.cal.applicable')}</div>
        {settings.map(s => (
          <div key={s.code} className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2 min-w-72"><input type="checkbox" checked={s.enabled} disabled={busy || s.auto} onChange={e => save({ code: s.code, enabled: e.target.checked })} />{CODES.includes(s.code) ? t(`tax.cal.${s.code}`) : s.code}</label>
            {s.code === 'FR0600' && s.enabled && <select disabled={busy} value={s.period || 'MONTH'} onChange={e => save({ code: 'FR0600', period: e.target.value })} className="bg-slate-950 border border-slate-700 rounded p-1">{PERIODS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}</select>}
            <span className="text-xs text-slate-500">{s.reason}</span>
          </div>
        ))}
      </div>
      {table(t('tax.cal.overdueTitle'), overdue, t('tax.cal.overdueEmpty'))}
      {table(t('tax.cal.upcomingTitle'), upcoming, t('tax.cal.upcomingEmpty'))}
    </div>
  );
}
