'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { buildGpm312Ffdata } from '@/lib/ffdata';

interface Row { employee: string; code: string | null; incomeCode: string; gross: number; npd: number | null; gpm: number; months: number; }
interface RowMeta { gpmRate: number; nonResident: boolean; country: string; }
interface Draft { year: number; rows: Row[]; totals: { f4: number; f5: number; npd: number | null }; source: string; provisional: boolean; missingCodes: string[]; notes: string[]; notFilled: string[]; }
interface Result { dueDate: string; header: { name: string; code: string; year: number }; draft: Draft; notice: string; }

const money = (v: number | null) => v === null ? '—' : v.toFixed(2);
const GPM_RATES = [20, 15, 32, 25, 5, 0];

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: type + ';charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}

export function Gpm312Client({ today }: { today: string }) {
  const t = useT();
  const [year, setYear] = useState(String(Number(today.slice(0, 4)) - 1));
  const [result, setResult] = useState<Result | null>(null);
  const [rowMeta, setRowMeta] = useState<Record<number, RowMeta>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getMeta = (idx: number): RowMeta => rowMeta[idx] || { gpmRate: 20, nonResident: false, country: '' };
  const updateMeta = (idx: number, patch: Partial<RowMeta>) =>
    setRowMeta(prev => ({ ...prev, [idx]: { ...getMeta(idx), ...patch } }));

  async function calculate() {
    if (!/^\d{4}$/.test(year)) return;
    setBusy(true); setError(null); setResult(null); setRowMeta({});
    try {
      const res = await fetch(`/api/tax-reports/gpm312?year=${year}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('tax.gpm312.calcFailed')); return; }
      setResult(data);
    } catch { setError(t('tax.gpm312.calcFailed')); } finally { setBusy(false); }
  }
  const exportFfdata = () => {
    if (!result) return;
    const rows = result.draft.rows.map((r, idx) => {
      const m = getMeta(idx);
      return { ...r, gpmRate: m.gpmRate, nonResident: m.nonResident, country: m.country };
    });
    download(`GPM312_${year}.ffdata`, 'application/xml', buildGpm312Ffdata({ header: result.header, totals: result.draft.totals, rows, createdOn: today }));
  };
  const exportCsv = () => {
    if (!result) return;
    const npd = (v: number | null) => v === null ? '' : v.toFixed(2);
    const lines = ['employee;personalCode;appendix;country;incomeCode;gpmRate;gross;npd;gpm', ...result.draft.rows.map((r, idx) => {
      const m = getMeta(idx);
      return [r.employee.replace(/;/g, ','), r.code ?? '', m.nonResident ? 'U' : 'L', m.nonResident ? m.country : 'LT', r.incomeCode, m.gpmRate.toFixed(2), r.gross.toFixed(2), npd(r.npd), r.gpm.toFixed(2)].join(';');
    }), ['TOTAL', '', '', '', '', '', result.draft.totals.f4.toFixed(2), npd(result.draft.totals.npd), result.draft.totals.f5.toFixed(2)].join(';')];
    download(`GPM312_${year}_juodrastis.csv`, 'text/csv', lines.join('\r\n') + '\r\n');
  };
  const exportJson = () => result && download(`GPM312_${year}_juodrastis.json`, 'application/json', JSON.stringify({ draft: true, notice: result.notice, header: result.header, dueDate: result.dueDate, fields: { f4: result.draft.totals.f4, f5: result.draft.totals.f5 }, rows: result.draft.rows.map((r, idx) => ({ ...r, ...getMeta(idx) })), provisional: result.draft.provisional, missingCodes: result.draft.missingCodes, notes: result.draft.notes, notFilled: result.draft.notFilled }, null, 2));

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-5 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('tax.gpm312.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('tax.gpm312.intro')}</p>
      </div>
      <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm font-semibold">{t('tax.gpm312.banner')}</div>
      <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm">{t('tax.gpm312.provisional')}</div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">{t('tax.gpm312.year')}<input type="number" min={2000} max={2100} value={year} onChange={e => setYear(e.target.value)} className="block mt-1 w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1.5" /></label>
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
            <div className="font-semibold text-white">{t('tax.gpm312.header')}</div>
            <p className="mt-1 text-slate-300">{t('tax.gpm312.headerLine', { name: result.header.name, code: result.header.code || '—', year: result.header.year })}</p>
            <p className="text-slate-400">{t('tax.fr.due', { date: result.dueDate })}</p>
            {result.draft.rows.length > 0 && <p className="text-slate-300 mt-1">{t('tax.gpm312.totals', { f4: money(result.draft.totals.f4), f5: money(result.draft.totals.f5) })}</p>}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
            <table className="w-full">
              <thead><tr className="text-left text-slate-400"><th className="p-3">{t('tax.gpm312.employee')}</th><th className="p-3">{t('tax.gpm312.personalCode')}</th><th className="p-3">{t('tax.gpm312.appendix')}</th><th className="p-3">{t('tax.gpm312.incomeCode')}</th><th className="p-3">{t('tax.gpm312.l9')}</th><th className="p-3 text-right">{t('tax.gpm312.l8')}</th><th className="p-3 text-right">{t('tax.gpm312.npd')}</th><th className="p-3 text-right">{t('tax.gpm312.l10')}</th></tr></thead>
              <tbody>
                {result.draft.rows.length === 0 && <tr><td colSpan={8} className="p-3 text-slate-400">{t('tax.gpm312.empty')}</td></tr>}
                {result.draft.rows.map((r, i) => {
                  const m = getMeta(i);
                  return (
                    <tr key={i} className="border-t border-slate-800">
                      <td className="p-3">{r.employee}</td>
                      <td className="p-3 font-mono">{r.code ?? <span className="text-amber-300">{t('tax.gpm312.missingCode')}</span>}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          <select value={m.nonResident ? 'U' : 'L'} onChange={e => updateMeta(i, { nonResident: e.target.value === 'U' })} className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs">
                            <option value="L">L (LT)</option>
                            <option value="U">U</option>
                          </select>
                          {m.nonResident && (
                            <input type="text" maxLength={2} placeholder="U14" value={m.country} onChange={e => updateMeta(i, { country: e.target.value.toUpperCase() })} className="w-12 bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono uppercase" />
                          )}
                        </div>
                      </td>
                      <td className="p-3 font-mono">{r.incomeCode}</td>
                      <td className="p-3">
                        <select value={m.gpmRate} onChange={e => updateMeta(i, { gpmRate: Number(e.target.value) })} className="bg-slate-950 border border-slate-700 rounded px-1.5 py-1 text-xs font-mono">
                          {GPM_RATES.map(rate => <option key={rate} value={rate}>{rate},00 %</option>)}
                        </select>
                      </td>
                      <td className="p-3 text-right font-mono">{money(r.gross)}</td>
                      <td className="p-3 text-right font-mono">{money(r.npd)}</td>
                      <td className="p-3 text-right font-mono">{money(r.gpm)}</td>
                    </tr>
                  );
                })}
                {result.draft.rows.length > 0 && <tr className="border-t border-slate-700 font-semibold"><td className="p-3" colSpan={5}>{t('tax.fr564.total')}</td><td className="p-3 text-right font-mono">{money(result.draft.totals.f4)}</td><td className="p-3 text-right font-mono">{money(result.draft.totals.npd)}</td><td className="p-3 text-right font-mono">{money(result.draft.totals.f5)}</td></tr>}
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
