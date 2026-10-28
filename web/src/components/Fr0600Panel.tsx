'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { buildFr0600Ffdata } from '@/lib/ffdata';
interface Draft { fields: Record<string, number | null>; extended?: Record<string, number>; computed?: { document: string; code: string; net: number; vat: number }[]; complete: boolean; manual: string[]; unreviewed: string[]; notes?: string[]; }
interface Result { dueDate: string | null; header?: { name: string; code: string; vatCode: string }; draft: Draft; notice: string; }
const rows = ['f11', 'f29', 'f29a', 'f30', 'f31', 'f25', 'f35', 'f36'];
const extendedRows = ['f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f23', 'f24', 'f32', 'f33', 'f34'];

export function Fr0600Panel({ start, end }: { start: string; end: string }) {
  const t = useT();
  const [result, setResult] = useState<Result | null>(null);
  const [f26, setF26] = useState('');
  const [f27, setF27] = useState('');
  const [f28, setF28] = useState('100');
  const [error, setError] = useState<{ message: string; issues: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  async function calculate() {
    setBusy(true); setError(null); setResult(null);
    try {
      const res = await fetch(`/api/tax-reports/fr0600?start=${start}&end=${end}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError({ message: data.error || t('tax.fr.calcFailed'), issues: data.issues || [] }); return; }
      setResult(data);
    } catch { setError({ message: t('tax.fr.calcFailed'), issues: [] }); } finally { setBusy(false); }
  }
  const exportFfdata = () => {
    if (!result) return;
    const xml = buildFr0600Ffdata({
      header: result.header || { name: '', code: '', vatCode: '' },
      period: { start, end },
      fields: result.draft.fields,
      extended: result.draft.extended,
      manual: {
        f26: f26 ? Number(f26) : null,
        f27: f27 ? Number(f27) : null,
        f28: f28 ? Number(f28) : 100,
      },
    });
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `FR0600_${start}_${end}.ffdata`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <strong className="text-white">{t('tax.fr.draftTitle', { start, end })}</strong>
          <p className="text-xs text-slate-400 mt-1">{t('tax.fr.draftHint')}</p>
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button onClick={exportFfdata} className="px-3 py-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-sm">
              {t('tax.fr564.exportFfdata')}
            </button>
          )}
          <button onClick={calculate} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">{busy ? t('tax.fr.calculating') : t('tax.fr.calculate')}</button>
        </div>
      </div>
      {error && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm"><strong>{error.message}</strong>{error.issues.length > 0 && <ul className="list-disc pl-5 mt-1">{error.issues.map(i => <li key={i}>{i}</li>)}</ul>}</div>}
      {result && (
        <div className="space-y-3 text-sm">
          <table className="w-full"><tbody>{rows.map(key => <tr key={key} className="border-t border-slate-800"><td className="py-1.5 text-slate-300">{t(`tax.fr.${key}`)}</td><td className="py-1.5 text-right font-mono">{result.draft.fields[key] === null ? <span className="text-amber-300 font-sans">{t('tax.fr.f36Eds')}</span> : `€${result.draft.fields[key]!.toFixed(2)}`}</td></tr>)}</tbody></table>
          <div className="flex flex-wrap gap-3 pt-2 border-t border-slate-800">
            <label className="text-xs text-slate-300">{t('tax.fr.f26')}<input type="number" step="1" placeholder="0" value={f26} onChange={e => setF26(e.target.value)} className="block mt-1 w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm font-mono" /></label>
            <label className="text-xs text-slate-300">{t('tax.fr.f27')}<input type="number" step="1" placeholder="0" value={f27} onChange={e => setF27(e.target.value)} className="block mt-1 w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm font-mono" /></label>
            <label className="text-xs text-slate-300">{t('tax.fr.f28')}<input type="number" min="1" max="100" step="1" value={f28} onChange={e => setF28(e.target.value)} className="block mt-1 w-24 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm font-mono" /></label>
          </div>
          {extendedRows.some(key => result.draft.extended?.[key]) && (
            <div>
              <strong className="text-slate-200">{t('tax.fr.extendedTitle')}</strong>
              <table className="w-full mt-1"><tbody>{extendedRows.filter(key => result.draft.extended?.[key]).map(key => <tr key={key} className="border-t border-slate-800"><td className="py-1.5 text-slate-300">{t(`tax.fr.${key}`)}</td><td className="py-1.5 text-right font-mono">€{result.draft.extended![key].toFixed(2)}</td></tr>)}</tbody></table>
            </div>
          )}
          {!!result.draft.computed?.length && (
            <div>
              <strong className="text-slate-200">{t('tax.fr.computedTitle')}</strong>
              <ul className="list-disc pl-5 mt-1 text-slate-300">{result.draft.computed.map((c, i) => <li key={`${i}-${c.document}-${c.code}`}>{t('tax.fr.computedRow', { document: c.document, code: c.code, net: c.net.toFixed(2), vat: c.vat.toFixed(2) })}</li>)}</ul>
            </div>
          )}
          {!!result.draft.notes?.length && <div className="rounded border border-sky-800 bg-sky-950/30 p-3 text-sky-200"><strong>{t('tax.fr.notesTitle')}</strong><ul className="list-disc pl-5 mt-1 space-y-1">{result.draft.notes.map(i => <li key={i}>{i}</li>)}</ul></div>}
          {result.dueDate && <p className="text-slate-400">{t('tax.fr.due', { date: result.dueDate })}</p>}
          {!result.draft.complete && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200"><strong>{t('tax.fr.incomplete')}</strong><ul className="list-disc pl-5 mt-1 space-y-1">{[...result.draft.manual, ...result.draft.unreviewed].slice(0, 40).map(i => <li key={i}>{i}</li>)}</ul></div>}
          <p className="text-xs text-slate-500">{result.notice}</p>
        </div>
      )}
    </div>
  );
}
