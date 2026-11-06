'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { askConfirm } from '@/components/ConfirmHost';

interface Line { id: number; date: string; sum: number; counterparty: string; notes: string }
interface Suggestion { kind: 'purchase' | 'document'; bankTransactionId: number; documentId: number; label: string; supplierName: string; date: string; amount: number; confidence: number; reasons: string[]; txn: Line }
interface Reimbursement { bankTransactionId: number; person: string; purchaseIds: number[]; labels: string[]; amount: number; txn: Line }
interface Linked { allocationId: number; amount: number; bankTransactionId: number; date: string; counterparty: string; notes: string }
interface ListData { suggestions: Suggestion[]; drafts: Suggestion[]; reimbursements: Reimbursement[]; reliableThreshold: number }
interface OneData { candidates: Suggestion[]; linked: Linked[]; ownFunds: boolean; reliableThreshold: number }

// Bank lines that probably pay a purchase. Nothing is linked without a click: "Link" for one line, "Link all reliable" for the ones at or above the threshold.
// With `purchaseId` the panel is about that purchase (candidates and existing links, with undo); without it, it covers the whole bank side.
export function PurchaseBankMatches({ purchaseId, onChange }: { purchaseId?: number; onChange?: () => void }) {
  const { t, lang } = useI18n();
  const [list, setList] = useState<ListData | null>(null);
  const [one, setOne] = useState<OneData | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const money = (n: number) => Math.abs(n).toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const load = useCallback(async () => {
    const res = await fetch(purchaseId ? `/api/purchases/${purchaseId}/bank-matches` : '/api/bank/purchase-matches', { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return;
    if (purchaseId) setOne(data); else setList(data);
  }, [purchaseId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { load(); }, [load]);

  async function post(body: unknown) {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/bank/purchase-matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(data.error || t('common.error')); return null; }
      await load(); onChange?.();
      return data;
    } finally { setBusy(false); }
  }
  const link = (s: Suggestion) => post({ action: 'link', bankTransactionId: s.bankTransactionId, purchaseId: s.documentId });
  async function linkAll(count: number) {
    if (!await askConfirm(t('bank.pm.confirmAll', { count }))) return;
    const data = await post({ action: 'linkReliable' });
    if (data) setMessage(t('bank.pm.linkedCount', { count: data.applied }));
  }
  async function unlink(row: Linked) {
    if (!await askConfirm(t('bank.pm.confirmUnlink', { date: row.date, sum: money(row.amount) }))) return;
    setBusy(true); setMessage('');
    try {
      const res = await fetch(`/api/bank/allocations/${row.allocationId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(data.error || t('common.error')); return; }
      await load(); onChange?.();
    } finally { setBusy(false); }
  }
  async function reimburse(r: Reimbursement) {
    if (!await askConfirm(t('bank.pm.confirmReimburse', { person: r.person, sum: money(r.amount), date: r.txn.date }))) return;
    await post({ action: 'reimburse', bankTransactionId: r.bankTransactionId, purchaseIds: r.purchaseIds });
  }

  const reasons = (s: Suggestion) => s.reasons.map(r => t(`bank.pm.reason_${r}`)).join('; ');
  const lineText = (l: Line) => `${l.date} · ${l.counterparty || '—'} · €${money(l.sum)}`;
  const btn = 'rounded-lg border border-emerald-700 px-2.5 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-950 disabled:opacity-40';

  if (purchaseId) {
    if (!one || one.ownFunds || (!one.candidates.length && !one.linked.length)) return message ? <p role="alert" className="text-xs text-rose-300">{message}</p> : null;
    return (
      <div className="space-y-2 rounded-xl border border-sky-800 bg-sky-950/20 p-3 text-sm text-slate-200 font-sans">
        {message && <p role="alert" className="text-xs text-rose-300">{message}</p>}
        {one.linked.map(l => (
          <div key={l.allocationId} className="flex flex-wrap items-center justify-between gap-2">
            <span>{t('bank.pm.linkedTo', { line: `${l.date} · ${l.counterparty || '—'} · €${money(l.amount)}` })}</span>
            <button disabled={busy} onClick={() => unlink(l)} className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">{t('bank.pm.unlink')}</button>
          </div>
        ))}
        {one.candidates.map(s => (
          <div key={s.bankTransactionId} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>{t('bank.pm.found')}</strong> {lineText(s.txn)} <span className={s.confidence >= one.reliableThreshold ? 'text-emerald-300' : 'text-amber-300'}>({t('bank.pm.confidence', { value: s.confidence })})</span>
              <div className="text-xs text-slate-400">{reasons(s)}</div>
            </div>
            <button disabled={busy} onClick={() => link(s)} className={btn}>{t('bank.pm.link')}</button>
          </div>
        ))}
      </div>
    );
  }

  if (!list || (!list.suggestions.length && !list.drafts.length && !list.reimbursements.length)) return message ? <p role="alert" className="text-xs text-rose-300">{message}</p> : null;
  const reliable = list.suggestions.filter(s => s.confidence >= list.reliableThreshold).length;
  return (
    <section className="space-y-3 rounded-xl border border-sky-800 bg-sky-950/20 p-4 text-sm text-slate-200 font-sans" aria-label={t('bank.pm.title')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-white">{t('bank.pm.title')}</h2>
        {reliable > 0 && <button disabled={busy} onClick={() => linkAll(reliable)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{t('bank.pm.linkAll', { count: reliable })}</button>}
      </div>
      <p className="text-xs text-slate-400">{t('bank.pm.intro')}</p>
      {message && <p role="alert" className="text-xs text-rose-300">{message}</p>}
      {list.suggestions.map(s => (
        <div key={`${s.bankTransactionId}-${s.documentId}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2">
          <div>
            <span className="font-mono">{lineText(s.txn)}</span> → <strong>{s.label}</strong> {s.supplierName && <span className="text-slate-400">({s.supplierName}, {s.date})</span>}
            <span className={`ml-2 ${s.confidence >= list.reliableThreshold ? 'text-emerald-300' : 'text-amber-300'}`}>{t('bank.pm.confidence', { value: s.confidence })}</span>
            <div className="text-xs text-slate-400">{reasons(s)}</div>
          </div>
          <button disabled={busy} onClick={() => link(s)} className={btn}>{t('bank.pm.link')}</button>
        </div>
      ))}
      {list.drafts.length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-2">
          <strong className="text-xs text-slate-300">{t('bank.pm.drafts')}</strong>
          {list.drafts.map(s => (
            <div key={`d-${s.bankTransactionId}-${s.documentId}`} className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="font-mono">{lineText(s.txn)}</span> → {s.label} <span className="text-slate-400">({s.supplierName})</span> <span className="text-amber-300">{t('bank.pm.confidence', { value: s.confidence })}</span></span>
              <Link href={`/purchase-documents/${s.documentId}`} className="text-xs font-semibold text-emerald-300 underline">{t('bank.pm.openDraft')}</Link>
            </div>
          ))}
        </div>
      )}
      {list.reimbursements.length > 0 && (
        <div className="space-y-1 border-t border-slate-800 pt-2">
          <strong className="text-xs text-slate-300">{t('bank.pm.reimbursements')}</strong>
          {list.reimbursements.map(r => (
            <div key={`r-${r.bankTransactionId}`} className="flex flex-wrap items-center justify-between gap-2">
              <span><span className="font-mono">{lineText(r.txn)}</span> → {t('bank.pm.reimburseFor', { person: r.person, docs: r.labels.join(', ') })}</span>
              <button disabled={busy} onClick={() => reimburse(r)} className={btn}>{t('bank.pm.markReimbursed')}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
