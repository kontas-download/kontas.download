'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';

interface Statement { iban: string; opening: number | null; closing: number | null; entries: number; reconciled: boolean | null; }
interface Preview { overlap?: number; committed?: boolean; format?: string; statements?: Statement[]; warnings?: string[]; ambiguousDirection?: boolean; error?: string; errors?: string[]; total: number; new: number; duplicates: number; incoming: number; outgoing: number; preview: { date: string; sum: number; clientName: string; details: string }[]; }
interface Suggestion { bankTransactionId: number; kind: 'SALE' | 'PURCHASE'; documentId: number; label: string; amount: number; confidence: 'high' | 'medium'; reasons: string[]; }

// CSV statement import (dry run first) and confirmation of suggested payment matches.
export function BankPaymentsPanel() {
  const t = useT();
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');
  const [account, setAccount] = useState('Bank');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ackDirection, setAckDirection] = useState(false);
  const [ackOverlap, setAckOverlap] = useState(false);

  async function call(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }
  async function readFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name); setPreview(null); setMessage('');
    setCsv(await file.text());
  }
  async function runImport(commit: boolean) {
    setBusy(true); setMessage('');
    try {
      const { ok, data } = await call('/api/bank/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, account, commit, acknowledgeDirection: ackDirection, acknowledgeOverlap: ackOverlap }) });
      setPreview(data);
      if (ok && commit) { setMessage(t('bank.pnl.imported', { new: data.new, duplicates: data.duplicates })); setCsv(''); setFileName(''); setAckDirection(false); setAckOverlap(false); }
    } finally { setBusy(false); }
  }
  async function loadSuggestions() {
    setBusy(true); setMessage('');
    try {
      const { ok, data } = await call('/api/bank/matches');
      if (ok) setSuggestions(data.suggestions); else setMessage(data.error || t('bank.pnl.suggestionsFailed'));
    } finally { setBusy(false); }
  }
  async function apply(s: Suggestion) {
    const { ok, data } = await call('/api/bank/allocations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bankTransactionId: s.bankTransactionId, kind: s.kind, documentId: s.documentId, amount: s.amount }) });
    if (ok) setSuggestions((suggestions || []).filter(x => x !== s)); else setMessage(data.error || t('bank.pnl.linkFailed'));
  }
  async function applyHigh() {
    setBusy(true);
    try {
      const { ok, data } = await call('/api/bank/matches', { method: 'POST' });
      if (ok) { setMessage(t('bank.pnl.linked', { count: data.applied })); await loadSuggestions(); } else setMessage(data.error || t('bank.pnl.linkFailed'));
    } finally { setBusy(false); }
  }
  const high = (suggestions || []).filter(s => s.confidence === 'high').length;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 text-sm text-slate-200">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-300">{t('bank.pnl.statementFile')}
          <input type="file" accept=".xml,.csv,.sta,.mt940,.txt,text/xml,application/xml,text/csv,text/plain" onChange={e => readFile(e.target.files?.[0])} className="block mt-1 text-slate-300" />
        </label>
        <label className="text-xs text-slate-300">{t('bank.pnl.account')}
          <input value={account} onChange={e => setAccount(e.target.value)} maxLength={100} className="block mt-1 bg-slate-950 border border-slate-700 rounded p-2" />
        </label>
        <button disabled={!csv || busy} onClick={() => runImport(false)} className="px-3 py-2 rounded border border-slate-700 disabled:opacity-50">{t('bank.pnl.check')}</button>
        <button disabled={!preview || preview.committed || !!preview.errors?.length || !preview.new || busy || (preview.ambiguousDirection && !ackDirection) || (!!preview.overlap && !ackOverlap)} onClick={() => runImport(true)} className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold">{t('bank.pnl.import')}</button>
        <button disabled={busy} onClick={loadSuggestions} className="px-3 py-2 rounded border border-slate-700 disabled:opacity-50">{t('bank.pnl.findMatches')}</button>
      </div>
      {fileName && <div className="text-xs text-slate-400">{t('bank.pnl.file', { name: fileName })}</div>}
      {message && <div className="rounded border border-emerald-700 bg-emerald-950/30 p-2 text-emerald-200">{message}</div>}
      {preview?.errors && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200"><strong>{preview.error}</strong><ul className="list-disc pl-5 mt-1">{preview.errors.map(e => <li key={e}>{e}</li>)}</ul></div>}
      {preview?.ambiguousDirection && !preview.errors && (
        <label className="flex items-start gap-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200"><input type="checkbox" checked={ackDirection} onChange={e => setAckDirection(e.target.checked)} className="mt-1" /><span>{t('bank.pnl.ackDirection')}</span></label>
      )}
      {!!preview?.overlap && !preview.errors && (
        <label className="flex items-start gap-2 rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200"><input type="checkbox" checked={ackOverlap} onChange={e => setAckOverlap(e.target.checked)} className="mt-1" /><span>{t('bank.pnl.ackOverlap', { count: preview.overlap })}</span></label>
      )}
      {preview && !preview.errors && (
        <div className="space-y-2">
          {preview.statements && preview.statements.length > 0 && <div className="space-y-1">{preview.statements.map(st => <div key={st.iban} className={st.reconciled === false ? 'text-rose-300' : 'text-slate-300'}>{t('bank.pnl.statementLine', { iban: st.iban, entries: st.entries })}{st.opening !== null && st.closing !== null && <>{t('bank.pnl.balance', { opening: st.opening.toFixed(2), closing: st.closing.toFixed(2) })}{st.reconciled ? t('bank.pnl.matches') : t('bank.pnl.mismatch')}</>}</div>)}</div>}
          {preview.warnings && preview.warnings.length > 0 && <ul className="list-disc pl-5 text-amber-300">{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
          <div>{t('bank.pnl.summary', { total: preview.total, new: preview.new, duplicates: preview.duplicates, incoming: preview.incoming, outgoing: preview.outgoing })}</div>
          <table className="w-full text-xs"><tbody>{preview.preview.map((r, i) => <tr key={i} className="border-t border-slate-800"><td className="py-1">{r.date}</td><td className="text-right font-mono">{r.sum.toFixed(2)}</td><td className="pl-3">{r.clientName}</td><td className="pl-3 text-slate-400">{r.details}</td></tr>)}</tbody></table>
        </div>
      )}
      {suggestions && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <strong>{t('bank.pnl.suggestions', { count: suggestions.length })}</strong>
            {high > 0 && <button disabled={busy} onClick={applyHigh} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold">{t('bank.pnl.applyHigh', { count: high })}</button>}
          </div>
          {suggestions.length === 0 && <div className="text-slate-400">{t('bank.pnl.noMatches')}</div>}
          {suggestions.map(s => (
            <div key={`${s.bankTransactionId}-${s.documentId}`} className="flex items-center justify-between gap-3 border-t border-slate-800 py-1.5">
              <div>
                <span className="font-mono">#{s.bankTransactionId}</span> → {s.kind === 'SALE' ? t('bank.pnl.kindSale') : t('bank.pnl.kindPurchase')} <strong>{s.label}</strong> · €{s.amount.toFixed(2)}
                <span className={s.confidence === 'high' ? 'ml-2 text-emerald-400' : 'ml-2 text-amber-400'}>{s.confidence === 'high' ? t('bank.pnl.reliable') : t('bank.pnl.verify')}</span>
                <div className="text-xs text-slate-400">{s.reasons.join('; ')}</div>
              </div>
              <button onClick={() => apply(s)} className="px-2 py-1 rounded border border-slate-700 text-xs">{t('bank.pnl.confirm')}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
