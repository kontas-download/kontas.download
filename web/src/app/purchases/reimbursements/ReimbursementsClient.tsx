'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { askConfirm } from '@/components/ConfirmHost';

interface Row { id: number; series: string | null; number: string; purchaseDate: string; clientName: string | null; paidByName: string; sumWithVat: number }
interface Data { people: { name: string; owed: number }[]; purchases: Row[] }

// Purchases paid from a person's own funds that the company has not repaid yet, grouped by person, with "mark as reimbursed".
export function ReimbursementsClient({ initial, today }: { initial: Data; today: string }) {
  const { t, lang } = useI18n();
  const [data, setData] = useState(initial);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const money = (n: number) => n.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function mark(row: Row) {
    const date = dates[row.id] || today;
    if (!await askConfirm(t('docs.reimbConfirm', { doc: `${row.series || ''}${row.number}`, name: row.paidByName, date }))) return;
    setBusyId(row.id); setMessage('');
    try {
      const res = await fetch(`/api/purchases/${row.id}/reimburse`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(body.error || t('common.error')); return; }
      const fresh = await fetch('/api/purchases/unreimbursed', { cache: 'no-store' });
      if (fresh.ok) setData(await fresh.json());
    } finally { setBusyId(null); }
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">{t('docs.reimbTitle')}</h1>
          <p className="text-sm text-slate-400 max-w-3xl">{t('docs.reimbIntro')}</p>
        </div>
        <Link href="/purchases" className="text-sm font-semibold text-emerald-300 underline">{t('docs.reimbBack')}</Link>
      </div>
      {message && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{message}</p>}
      {data.people.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center text-sm text-slate-400">{t('docs.reimbNone')}</p>}
      {data.people.map(person => (
        <section key={person.name} className="rounded-xl border border-slate-800 bg-slate-900" aria-label={person.name}>
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 p-4">
            <h2 className="font-bold text-white">{person.name}</h2>
            <span className="text-sm text-slate-300">{t('docs.reimbOwed')}: <strong className="font-mono text-rose-300">€{money(person.owed)}</strong></span>
          </header>
          <ul className="divide-y divide-slate-800/60">
            {data.purchases.filter(p => p.paidByName === person.name).map(p => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 text-sm text-slate-200">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.series || ''}{p.number} · {p.purchaseDate}</div>
                  <div className="truncate text-xs text-slate-400">{p.clientName || '—'}</div>
                </div>
                <span className="font-mono">€{money(p.sumWithVat)}</span>
                <label className="text-xs text-slate-400">{t('docs.reimbDate')}
                  <input type="date" min={p.purchaseDate} value={dates[p.id] || today} onChange={e => setDates(d => ({ ...d, [p.id]: e.target.value }))} className="ml-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" />
                </label>
                <button disabled={busyId === p.id} onClick={() => mark(p)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{t('docs.reimbMark')}</button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
