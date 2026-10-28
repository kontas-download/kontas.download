'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { buildGpm313Ffdata } from '@/lib/ffdata';

interface Row { employee: string; code: string | null; gross: number; npd: number | null; gpm: number; }
interface Draft { year: number; month: number; rows: Row[]; totals: { f5: number; gpmTotal: number; npd: number | null }; payoutDate: string | null; f6: number | null; f7: number | null; source: string; provisional: boolean; notes: string[]; notFilled: string[]; }
interface Result { period: { start: string; end: string }; dueDate: string; header: { name: string; code: string; year: number; month: number }; draft: Draft; notice: string; }

const previousMonth = (today: string) => new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
const money = (v: number | null) => v === null ? '—' : v.toFixed(2);

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function Gpm313Client({ today }: { today: string }) {
  const t = useT();
  const [month, setMonth] = useState(previousMonth(today));
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function calculate() {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const [y, m] = month.split('-').map(Number);
    const start = `${month}-01`;
    const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/tax-reports/gpm313?start=${start}&end=${end}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('tax.gpm313.calcFailed')); return; }
      setResult(data);
    } catch { setError(t('tax.gpm313.calcFailed')); } finally { setBusy(false); }
  }
  const exportFfdata = () => result && download(`GPM313_${month}.ffdata`, 'application/xml', buildGpm313Ffdata({ header: result.header, f5: result.draft.totals.f5, f6: result.draft.f6, f7: result.draft.f7, createdOn: today }));
  const exportCsv = () => {
    if (!result) return;
    const npd = (v: number | null) => v === null ? '' : v.toFixed(2);
    const lines = ['employee;code;gross;npd;gpm', ...result.draft.rows.map(r => [r.employee.replace(/;/g, ','), r.code ?? '', r.gross.toFixed(2), npd(r.npd), r.gpm.toFixed(2)].join(';')), ['TOTAL', '', result.draft.totals.f5.toFixed(2), npd(result.draft.totals.npd), result.draft.totals.gpmTotal.toFixed(2)].join(';')];
    download(`GPM313_${month}_juodrastis.csv`, 'text/csv', lines.join('\r\n') + '\r\n');
  };
  const exportJson = () => result && download(`GPM313_${month}_juodrastis.json`, 'application/json', JSON.stringify({ draft: true, notice: result.notice, header: result.header, period: result.period, dueDate: result.dueDate, fields: { f5: result.draft.totals.f5, f6: result.draft.f6, f7: result.draft.f7, f6plus7: result.draft.totals.gpmTotal, payoutDate: result.draft.payoutDate }, rows: result.draft.rows, provisional: result.draft.provisional, notes: result.draft.notes, notFilled: result.draft.notFilled }, null, 2));

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-5 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('tax.gpm313.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('tax.gpm313.intro')}</p>
      </div>
      <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm font-semibold">{t('tax.gpm313.banner')}</div>
      <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm">{t('tax.gpm313.provisional')}</div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">{t('tax.gpm313.month')}<input type="month" value={month} onChange={e => setMonth(e.target.value)} className="block mt-1 bg-slate-950 border border-slate-700 rounded px-2 py-1.5" /></label>
        <button onClick={calculate} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">{busy ? t('tax.fr.calculating') : t('tax.fr.calculate')}</button>
        {result && <>
          <button onClick={exportFfdata} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">{t('tax.fr564.exportFfdata')}</button>
          <button onClick={exportCsv} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">{t('tax.fr564.exportCsv')}</button>
          <button onClick={exportJson} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">{t('tax.fr564.exportJson')}</button>
          <button onClick={() => window.print()} className="px-3 py-2 rounded-lg border border-slate-700 text-sm">{t('tax.fr564.print')}</button>
        </>}
      </div>
      {error && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm"><strong>{error}</strong></div>}
      {result && (
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="font-semibold text-white">{t('tax.gpm313.header')}</div>
            <p className="mt-1 text-slate-300">{t('tax.gpm313.headerLine', { name: result.header.name, code: result.header.code || '—', year: result.header.year, month: result.header.month })}</p>
            {result.draft.payoutDate && result.draft.f6 !== null && result.draft.f7 !== null && (
              <p className="mt-1 text-emerald-300 font-mono text-xs">{t('tax.gpm313.splitLine', { date: result.draft.payoutDate, f6: result.draft.f6.toFixed(2), f7: result.draft.f7.toFixed(2) })}</p>
            )}
            <p className="text-slate-400">{t('tax.fr.due', { date: result.dueDate })}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-left text-slate-400"><th className="p-3">{t('tax.gpm313.employee')}</th><th className="p-3 text-right">{t('tax.gpm313.f5')}</th><th className="p-3 text-right">{t('tax.gpm313.npd')}</th><th className="p-3 text-right">{t('tax.gpm313.gpm')}</th></tr></thead>
              <tbody>
                {result.draft.rows.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-400">{t('tax.gpm313.empty')}</td></tr>}
                {result.draft.rows.map((r, i) => <tr key={i} className="border-t border-slate-800"><td className="p-3">{r.employee}{r.code && <span className="text-slate-500 font-mono"> {r.code}</span>}</td><td className="p-3 text-right font-mono">{money(r.gross)}</td><td className="p-3 text-right font-mono">{money(r.npd)}</td><td className="p-3 text-right font-mono">{money(r.gpm)}</td></tr>)}
                {result.draft.rows.length > 0 && <tr className="border-t border-slate-700 font-semibold"><td className="p-3">{t('tax.fr564.total')}</td><td className="p-3 text-right font-mono">{money(result.draft.totals.f5)}</td><td className="p-3 text-right font-mono">{money(result.draft.totals.npd)}</td><td className="p-3 text-right font-mono">{money(result.draft.totals.gpmTotal)}</td></tr>}
              </tbody>
            </table>
          </div>
          {!!result.draft.notes.length && <div className="rounded border border-sky-800 bg-sky-950/30 p-3 text-sky-200"><strong>{t('tax.fr.notesTitle')}</strong><ul className="list-disc pl-5 mt-1 space-y-1">{result.draft.notes.map(i => <li key={i}>{i}</li>)}</ul></div>}
          <div className="rounded border border-slate-700 p-3"><strong>{t('tax.fr564.notFilled')}</strong><ul className="list-disc pl-5 mt-1 space-y-1 text-slate-300">{result.draft.notFilled.map(i => <li key={i}>{i}</li>)}</ul></div>
          <p className="text-xs text-slate-500">{result.notice}</p>
        </div>
      )}
    </div>
  );
}
