'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
interface Draft { fields: Record<string, number | null>; extended?: Record<string, number>; computed?: { document: string; code: string; net: number; vat: number }[]; complete: boolean; manual: string[]; unreviewed: string[]; notes?: string[]; }
interface Result { dueDate: string | null; draft: Draft; notice: string; }
const rows = ['f11', 'f29', 'f29a', 'f30', 'f31', 'f25', 'f35', 'f36'];
const extendedRows = ['f12', 'f13', 'f14', 'f15', 'f16', 'f17', 'f18', 'f19', 'f20', 'f21', 'f22', 'f23', 'f24', 'f32', 'f33', 'f34'];

export function Fr0600Panel({ start, end }: { start: string; end: string }) {
  const t = useT();
  const [result, setResult] = useState<Result | null>(null);
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
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <strong className="text-white">{t('tax.fr.draftTitle', { start, end })}</strong>
          <p className="text-xs text-slate-400 mt-1">{t('tax.fr.draftHint')}</p>
        </div>
        <button onClick={calculate} disabled={busy} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">{busy ? t('tax.fr.calculating') : t('tax.fr.calculate')}</button>
      </div>
      {error && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm"><strong>{error.message}</strong>{error.issues.length > 0 && <ul className="list-disc pl-5 mt-1">{error.issues.map(i => <li key={i}>{i}</li>)}</ul>}</div>}
      {result && (
        <div className="space-y-3 text-sm">
          <table className="w-full"><tbody>{rows.map(key => <tr key={key} className="border-t border-slate-800"><td className="py-1.5 text-slate-300">{t(`tax.fr.${key}`)}</td><td className="py-1.5 text-right font-mono">{result.draft.fields[key] === null ? <span className="text-amber-300 font-sans">{t('tax.fr.f36Eds')}</span> : `€${result.draft.fields[key]!.toFixed(2)}`}</td></tr>)}</tbody></table>
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
