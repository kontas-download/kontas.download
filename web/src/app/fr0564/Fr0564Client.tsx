'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';

interface Row { country: string; vatCode: string; r13: number; r14: number; r18: number; f13: number; f14: number; f18: number; customers: string[]; documents: string[]; }
interface Draft { rows: Row[]; totals: { r13: number; r14: number; r18: number }; complete: boolean; manual: string[]; notes: string[]; notFilled: string[]; }
interface Result { period: { start: string; end: string }; dueDate: string; header: { name: string; code: string; vatCode: string; year: number; month: number }; draft: Draft; notice: string; }

const previousMonth = (today: string) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function Fr0564Client({ today }: { today: string }) {
  const t = useT();
  const [month, setMonth] = useState(previousMonth(today));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate() {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/tax-reports/fr0564?start=${start}&end=${end}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError({ message: data.error || t('tax.fr564.calcFailed'), issues: data.issues || [] }); return; }
      setResult(data);
    } catch { setError({ message: t('tax.fr564.calcFailed'), issues: [] }); } finally { setBusy(false); }
  }
  const exportCsv = () => {
    if (!result) return;
    const lines = ['11;12;13;14;18', ...result.draft.rows.map(r => [r.country, r.vatCode, r.r13, r.r14, r.r18].join(';'))];
    download(`FR0564_${month}_juodrastis.csv`, 'text/csv', lines.join('\r\n') + '\r\n');
  };
  const exportJson = () => result && download(`FR0564_${month}_juodrastis.json`, 'application/json', JSON.stringify({ draft: true, notice: result.notice, header: result.header, period: result.period, dueDate: result.dueDate, rows: result.draft.rows, totals: result.draft.totals, manual: result.draft.manual, notFilled: result.draft.notFilled }, null, 2));

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-5 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('tax.fr564.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('tax.fr564.intro')}</p>
      </div>
      <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm font-semibold">{t('tax.fr564.banner')}</div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">{t('tax.fr564.month')}<input type="month" value={month} onChange={e => setMonth(e.target.value)} className="block mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5" /></label>
        <button onClick={calculate} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">{busy ? t('tax.fr.calculating') : t('tax.fr.calculate')}</button>
        {result && <>
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">{t('tax.fr564.exportCsv')}</button>
          <button onClick={exportJson} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">{t('tax.fr564.exportJson')}</button>
          <button onClick={() => window.print()} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">{t('tax.fr564.print')}</button>
        </>}
      </div>
      {error && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm"><strong>{error.message}</strong>{error.issues.length > 0 && <ul className="list-disc pl-5 mt-1">{error.issues.map(i => <li key={i}>{i}</li>)}</ul>}</div>}
      {result && (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="font-semibold text-white">{t('tax.fr564.header')}</div>
            <p className="mt-1 text-slate-300">{t('tax.fr564.headerLine', { name: result.header.name, code: result.header.code || '—', vat: result.header.vatCode || '—', year: result.header.year, month: result.header.month })}</p>
            <p className="text-slate-400">{t('tax.fr.due', { date: result.dueDate })}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-left text-slate-400"><th className="p-3">{t('tax.fr564.f11')}</th><th className="p-3">{t('tax.fr564.f12')}</th><th className="p-3 text-right">{t('tax.fr564.f13')}</th><th className="p-3 text-right">{t('tax.fr564.f14')}</th><th className="p-3 text-right">{t('tax.fr564.f18')}</th><th className="p-3">{t('tax.fr564.customer')}</th></tr></thead>
              <tbody>
                {result.draft.rows.length === 0 && <tr><td colSpan={6} className="p-3 text-slate-400">{t('tax.fr564.empty')}</td></tr>}
                {result.draft.rows.map(r => <tr key={r.country + r.vatCode} className="border-t border-slate-800"><td className="p-3 font-mono">{r.country}</td><td className="p-3 font-mono">{r.vatCode}</td><td className="p-3 text-right font-mono">{r.r13}</td><td className="p-3 text-right font-mono">{r.r14}</td><td className="p-3 text-right font-mono">{r.r18}</td><td className="p-3 text-slate-400">{r.customers.join(', ')}<div className="text-xs">{r.documents.join(', ')}</div></td></tr>)}
                {result.draft.rows.length > 0 && <tr className="border-t border-slate-700 font-semibold"><td className="p-3" colSpan={2}>{t('tax.fr564.total')}</td><td className="p-3 text-right font-mono">{result.draft.totals.r13}</td><td className="p-3 text-right font-mono">{result.draft.totals.r14}</td><td className="p-3 text-right font-mono">{result.draft.totals.r18}</td><td /></tr>}
              </tbody>
            </table>
          </div>
          {!!result.draft.notes.length && <div className="rounded border border-sky-800 bg-sky-950/30 p-3 text-sky-200"><strong>{t('tax.fr.notesTitle')}</strong><ul className="list-disc pl-5 mt-1 space-y-1">{result.draft.notes.map(i => <li key={i}>{i}</li>)}</ul></div>}
          {!result.draft.complete && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200"><strong>{t('tax.fr564.incomplete')}</strong><ul className="list-disc pl-5 mt-1 space-y-1">{result.draft.manual.slice(0, 40).map(i => <li key={i}>{i}</li>)}</ul></div>}
          <div className="rounded border border-slate-700 p-3"><strong>{t('tax.fr564.notFilled')}</strong><ul className="list-disc pl-5 mt-1 space-y-1 text-slate-300">{result.draft.notFilled.map(i => <li key={i}>{i}</li>)}</ul></div>
          <p className="text-xs text-slate-500">{result.notice}</p>
        </div>
      )}
    </div>
  );
}
