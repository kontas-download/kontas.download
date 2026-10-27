'use client';
import { useMemo, useState } from 'react';
import { DocLanguageSelect } from '@/components/DocLanguageSelect';
import { useT } from '@/lib/i18n/client';

interface Row { saleId: number; label: string; date: string; dueDate: string | null; clientName: string; clientEmail: string; balance: number; daysOverdue: number; bucket: string; lastReminder: number | null; reminders: number; }
interface Draft { saleId: number; label: string; to: string; subject: string; text: string; configured: boolean; requestId: string; lang: string; }
const BUCKETS = ['NOT_DUE', 'D1_30', 'D31_60', 'D61_90', 'D90_PLUS'];

interface Overpaid { id: number; label: string; clientName: string; excess: number; }

export function ReceivablesClient({ asOf, rows: initial, overpaid = [] }: { asOf: string; rows: Row[]; overpaid?: Overpaid[] }) {
  const t = useT();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const totals = useMemo(() => Object.fromEntries(BUCKETS.map(key => [key, rows.filter(r => r.bucket === key).reduce((n, r) => n + Math.round(r.balance * 100), 0) / 100])), [rows]);

  async function openDraft(row: Row, lang = '') {
    setError(''); setNotice(''); setBusy(true);
    try {
      const res = await fetch(`/api/invoices/${row.saleId}/reminder${lang ? `?lang=${lang}` : ''}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('receivables.errReminder')); return; }
      setDraft({ saleId: row.saleId, label: row.label, to: data.to, subject: data.subject, text: data.text, configured: data.configured, requestId: crypto.randomUUID(), lang: data.lang });
    } finally { setBusy(false); }
  }
  async function settle(row: Row) {
    if (!window.confirm(t('receivables.confirmSettle', { label: row.label, amount: row.balance.toFixed(2) }))) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const res = await fetch('/api/bank/settlements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'SALE', documentId: row.saleId, method: 'CASH' }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('receivables.errSettle')); return; }
      setRows(rows.filter(r => r.saleId !== row.saleId));
      setNotice(t('receivables.settled', { label: row.label }));
    } finally { setBusy(false); }
  }
  async function send() {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/invoices/${draft.saleId}/reminder`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: draft.to, subject: draft.subject, text: draft.text, requestId: draft.requestId, lang: draft.lang }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('receivables.errSend')); return; }
      setNotice(t('receivables.reminderSent', { label: draft.label }));
      setRows(rows.map(r => r.saleId === draft.saleId ? { ...r, reminders: r.reminders + 1, lastReminder: Date.now() } : r));
      setDraft(null);
    } finally { setBusy(false); }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 text-slate-200">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('receivables.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('receivables.intro', { date: asOf })}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {BUCKETS.map(key => <div key={key} className="rounded-xl border border-slate-800 bg-slate-900 p-4"><div className="text-xs text-slate-400">{t(`receivables.bucket${key}`)}</div><div className="font-mono text-lg mt-1">€{totals[key].toFixed(2)}</div></div>)}
      </div>
      {notice && <div className="rounded border border-emerald-700 bg-emerald-950/30 p-3 text-emerald-200">{notice}</div>}
      {error && !draft && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200">{error}</div>}
      {overpaid.length > 0 && (
        <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200 text-sm">
          <strong>{t('receivables.overpaidTitle')}</strong>
          <ul className="list-disc pl-5 mt-1">{overpaid.map(o => <li key={o.id}>{t('receivables.overpaidLine', { label: o.label, client: o.clientName, amount: o.excess.toFixed(2) })}</li>)}</ul>
        </div>
      )}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400"><tr><th className="text-left p-3">{t('receivables.colInvoice')}</th><th className="text-left p-3">{t('receivables.colBuyer')}</th><th className="text-left p-3">{t('receivables.colDue')}</th><th className="text-right p-3">{t('receivables.colOverdue')}</th><th className="text-right p-3">{t('receivables.colBalance')}</th><th className="text-left p-3">{t('receivables.colReminded')}</th><th className="p-3" /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-slate-400">{t('receivables.noDebts')}</td></tr>}
            {rows.map(r => (
              <tr key={r.saleId} className="border-t border-slate-800">
                <td className="p-3 font-mono">{r.label}</td>
                <td className="p-3">{r.clientName}{!r.clientEmail && <span className="ml-2 text-xs text-amber-400">{t('receivables.noEmail')}</span>}</td>
                <td className="p-3">{r.dueDate || '—'}</td>
                <td className="p-3 text-right">{r.daysOverdue > 0 ? t('receivables.days', { count: r.daysOverdue }) : '—'}</td>
                <td className="p-3 text-right font-mono">€{r.balance.toFixed(2)}</td>
                <td className="p-3 text-xs text-slate-400">{r.reminders ? t('receivables.remindedInfo', { count: r.reminders, date: new Date(r.lastReminder || 0).toISOString().slice(0, 10) }) : '—'}</td>
                <td className="p-3 text-right space-x-1 whitespace-nowrap"><button disabled={busy || r.daysOverdue === 0} onClick={() => openDraft(r)} className="px-3 py-1 rounded border border-slate-700 text-xs disabled:opacity-40">{t('receivables.remind')}</button><button disabled={busy} onClick={() => settle(r)} className="px-3 py-1 rounded border border-slate-700 text-xs disabled:opacity-40">{t('receivables.settleOther')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-3">
            <h2 className="text-lg font-bold text-white">{t('receivables.reminderTitle', { label: draft.label })}</h2>
            {!draft.configured && <div className="rounded border border-amber-700 bg-amber-950/30 p-2 text-amber-200 text-sm">{t('receivables.noSmtp')}</div>}
            {error && <div className="rounded border border-rose-700 bg-rose-950/40 p-2 text-rose-200 text-sm">{error}</div>}
            <div className="flex items-center gap-2 text-xs text-slate-300">{t('docLang.label')}: <DocLanguageSelect value={draft.lang} disabled={busy} onChange={value => { const row = rows.find(r => r.saleId === draft.saleId); if (row && value) void openDraft(row, value); }} className="bg-slate-950 border border-slate-700 rounded p-1" /></div>
            <label className="block text-xs text-slate-300">{t('receivables.recipient')}<input value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
            <label className="block text-xs text-slate-300">{t('receivables.subject')}<input value={draft.subject} maxLength={200} onChange={e => setDraft({ ...draft, subject: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
            <label className="block text-xs text-slate-300">{t('receivables.text')}<textarea value={draft.text} rows={9} onChange={e => setDraft({ ...draft, text: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
            <p className="text-xs text-slate-400">{t('receivables.attachNote')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setDraft(null); setError(''); }} className="px-4 py-2 rounded border border-slate-700">{t('receivables.cancel')}</button>
              <button disabled={busy || !draft.to.trim()} onClick={send} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold">{busy ? t('receivables.sending') : t('receivables.send')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
