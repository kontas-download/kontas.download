'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, UserCheck } from '@/components/icons';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';

export type EmployeeListItem = { id: number; name: string; personalCode: string | null; position: string | null; baseSalary: number; startDate: string | null; endDate: string | null; active: boolean };
type Filter = 'active' | 'inactive' | 'all';

/** Personnel list: search, employed / left filter, link to each employee card. */
export function EmployeesClient({ employees }: { employees: EmployeeListItem[] }) {
  const { t, lang } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter(e => (filter === 'all' || (filter === 'active') === e.active)
      && (!q || [e.name, e.personalCode, e.position].some(v => (v || '').toLowerCase().includes(q))));
  }, [employees, query, filter]);
  const money = (v: number) => '€' + v.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const filters: [Filter, string][] = [['active', t('employees.filterActive')], ['inactive', t('employees.filterInactive')], ['all', t('employees.filterAll')]];

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white"><UserCheck className="w-6 h-6 text-emerald-400" aria-hidden />{t('employees.title')}</h1>
          <p className="mt-1 text-sm text-slate-400">{t('employees.subtitle')}</p>
        </div>
        <Link href="/employees/new" className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500"><Plus className="w-4 h-4" aria-hidden />{t('employees.add')}</Link>
      </header>

      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900 p-4 sm:flex-row sm:items-center">
        <label className="flex flex-1 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
          <Search className="w-4 h-4 text-slate-500" aria-hidden />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('employees.search')} aria-label={t('employees.search')} className="w-full bg-transparent text-slate-100 placeholder:text-slate-500 focus:outline-none" />
        </label>
        <div className="flex gap-1" role="radiogroup">
          {filters.map(([key, label]) => (
            <button key={key} type="button" role="radio" aria-checked={filter === key} onClick={() => setFilter(key)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === key ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-600' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400">
            <tr><th className="px-4 py-2.5">{t('employees.colName')}</th><th className="px-4 py-2.5">{t('employees.colPosition')}</th><th className="px-4 py-2.5 text-right">{t('employees.colSalary')}</th><th className="px-4 py-2.5">{t('employees.colStart')}</th><th className="px-4 py-2.5">{t('employees.colStatus')}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {shown.map(e => (
              <tr key={e.id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3"><Link href={`/employees/${e.id}`} className="font-semibold text-white hover:text-emerald-400">{e.name}</Link>{e.personalCode && <div className="font-mono text-xs text-slate-500">{e.personalCode}</div>}</td>
                <td className="px-4 py-3 text-slate-300">{e.position || '–'}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-200">{money(e.baseSalary)}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-400">{e.startDate || '–'}</td>
                <td className="px-4 py-3"><span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${e.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>{e.active ? t('employees.active') : t('employees.inactive')}</span></td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t('employees.empty')}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
