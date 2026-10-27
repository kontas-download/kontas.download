'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n/client';
interface Line { itemName: string; itemCode?: string | null; quantity: number; price: number; vatRate: number; }
interface Props { sale: { id: number; series?: string; number: string; saleDate: string }; endpoint?: string; defaultSeries?: string; title?: string; items: Line[]; suggestedNumber: string; onClose: () => void; onCreated: (sale: any, items: any[]) => void; }
export function CreditNoteDialog({ sale, items, suggestedNumber, onClose, onCreated, endpoint = '/api/invoices', defaultSeries = 'KS', title }: Props) {
  const t = useT();
  const [number, setNumber] = useState(suggestedNumber);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10) < sale.saleDate ? sale.saleDate : new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState(items.map(i => ({ ...i, quantity: Number(i.quantity), price: Number(i.price), vatRate: Number(i.vatRate ?? ((i as any).sumWithoutVat ? Math.round(((i as any).sumWithVat / (i as any).sumWithoutVat - 1) * 10000) / 100 : 0)) })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (index: number, patch: Partial<Line>) => setLines(lines.map((l, i) => i === index ? { ...l, ...patch } : l));
  const net = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  const gross = lines.reduce((s, l) => s + l.quantity * l.price * (1 + l.vatRate / 100), 0);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await fetch(`${endpoint}/${sale.id}/credit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ series: defaultSeries, number, saleDate: date, purchaseDate: date, reason, items: lines.filter(l => l.quantity > 0 && l.price > 0) }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('creditNote.errFailed'));
      if (data.missingTaxCodes?.length) window.alert(t('tax.codes.creditMissing', { list: data.missingTaxCodes.join(', ') }));
      onCreated(data.sale, data.items);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form onSubmit={submit} className="w-full max-w-2xl max-h-[90vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4 text-sm text-slate-200">
        <h2 className="text-lg font-bold text-white">{title ?? t('creditNote.defaultTitle')} {sale.series} {sale.number}</h2>
        {error && <div className="rounded border border-rose-700 bg-rose-950/40 p-3 text-rose-200">{error}</div>}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-300">{t('creditNote.number')}<input required value={number} onChange={e => setNumber(e.target.value)} className="block w-full bg-slate-950 border border-slate-700 rounded p-2"/></label>
          <label className="text-xs text-slate-300">{t('creditNote.date')}<input required type="date" min={sale.saleDate} value={date} onChange={e => setDate(e.target.value)} className="block w-full bg-slate-950 border border-slate-700 rounded p-2"/></label>
        </div>
        <label className="block text-xs text-slate-300">{t('creditNote.reason')}<input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className="block w-full bg-slate-950 border border-slate-700 rounded p-2"/></label>
        <div className="space-y-2">
          <div className="text-xs text-slate-400">{t('creditNote.hint')}</div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_90px_110px_60px] gap-2 items-center">
              <span className="truncate">{l.itemName}</span>
              <input type="number" min="0" step="any" value={l.quantity} onChange={e => set(i, { quantity: Number(e.target.value) })} className="bg-slate-950 border border-slate-700 rounded p-1.5 text-right" aria-label={t('creditNote.quantity')}/>
              <input type="number" min="0" step="any" value={l.price} onChange={e => set(i, { price: Number(e.target.value) })} className="bg-slate-950 border border-slate-700 rounded p-1.5 text-right" aria-label={t('creditNote.price')}/>
              <span className="text-right text-slate-400">{l.vatRate}%</span>
            </div>
          ))}
        </div>
        <div className="text-right font-mono">{t('creditNote.totals', { net: net.toFixed(2), gross: gross.toFixed(2) })}</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-slate-700">{t('creditNote.cancel')}</button>
          <button disabled={busy || !reason.trim()} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold">{busy ? t('creditNote.creating') : t('creditNote.create')}</button>
        </div>
      </form>
    </div>
  );
}
