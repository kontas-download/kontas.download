'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

interface Line { itemName: string; itemCode?: string; quantity: number; price: number; vatRate: number; }
interface Template { id: number; name: string; clientId: number; clientName: string; series: string; frequency: string; nextDate: string; endDate: string | null; payDays: number; notes: string | null; items: Line[]; active: boolean; due: boolean; runs: number; }
interface Form { id: number | null; name: string; clientId: number; series: string; frequency: string; nextDate: string; endDate: string; payDays: number; notes: string; items: Line[]; }
const FREQ = ['MONTH', 'QUARTER', 'YEAR'];
// Form suggestion, not a legal parameter: the rate is chosen per line and stored on the document; i.SAF and FR0600 classify a stored rate through the rules registry (lib/rules).
const emptyLine = (): Line => ({ itemName: '', itemCode: '', quantity: 1, price: 0, vatRate: 21 });
const total = (items: Line[]) => items.reduce((n, l) => n + l.quantity * l.price * (1 + l.vatRate / 100), 0);

export function RecurringClient({ today, templates, clients }: { today: string; templates: Template[]; clients: { id: number; name: string }[] }) {
  const router = useRouter();
  const t = useT();
  const freqLabel = (k: string) => FREQ.includes(k) ? t(`recurring.freq${k}`) : k;
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function call(url: string, method: string, body?: object) {
    setBusy(true); setError('');
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('recurring.errFailed')); return null; }
      return data;
    } finally { setBusy(false); }
  }
  async function save() {
    if (!form) return;
    const payload = { name: form.name, clientId: form.clientId, series: form.series, frequency: form.frequency, nextDate: form.nextDate, endDate: form.endDate || null, payDays: form.payDays, notes: form.notes, items: form.items };
    const ok = await call(form.id ? `/api/recurring/${form.id}` : '/api/recurring', form.id ? 'PUT' : 'POST', payload);
    if (ok) { setForm(null); router.refresh(); }
  }
  async function issue(tpl: Template) {
    if (!window.confirm(t('recurring.confirmIssue', { name: tpl.name, client: tpl.clientName, total: total(tpl.items).toFixed(2) }))) return;
    const data = await call(`/api/recurring/${tpl.id}/issue`, 'POST', {});
    if (data) { setNotice(t('recurring.issued', { doc: `${data.sale.series} ${data.sale.number}`, next: data.finished ? t('recurring.finished') : data.nextDate })); router.refresh(); }
  }
  const edit = (tpl: Template) => setForm({ id: tpl.id, name: tpl.name, clientId: tpl.clientId, series: tpl.series, frequency: tpl.frequency, nextDate: tpl.nextDate, endDate: tpl.endDate || '', payDays: tpl.payDays, notes: tpl.notes || '', items: tpl.items.map(i => ({ ...i })) });
  const setLine = (i: number, patch: Partial<Line>) => form && setForm({ ...form, items: form.items.map((l, idx) => idx === i ? { ...l, ...patch } : l) });

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6 text-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('recurring.title')}</h1>
          <p className="text-sm text-slate-400 mt-1">{t('recurring.intro')}</p>
        </div>
        <button onClick={() => setForm({ id: null, name: '', clientId: clients[0]?.id || 0, series: 'SF', frequency: 'MONTH', nextDate: today, endDate: '', payDays: 14, notes: '', items: [emptyLine()] })} disabled={!clients.length} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">{t('recurring.newTemplate')}</button>
      </div>
      {notice && <div className="rounded border border-emerald-700 bg-emerald-950/30 p-3 text-emerald-200">{notice}</div>}
      {error && !form && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200">{error}</div>}
      <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-400"><tr><th className="text-left p-3">{t('recurring.colTemplate')}</th><th className="text-left p-3">{t('recurring.colClient')}</th><th className="text-left p-3">{t('recurring.colFrequency')}</th><th className="text-left p-3">{t('recurring.colNextDate')}</th><th className="text-right p-3">{t('recurring.colTotal')}</th><th className="p-3" /></tr></thead>
          <tbody>
            {templates.length === 0 && <tr><td colSpan={6} className="p-4 text-slate-400">{t('recurring.noTemplates')}</td></tr>}
            {templates.map(tpl => (
              <tr key={tpl.id} className="border-t border-slate-800">
                <td className="p-3">{tpl.name}{!tpl.active && <span className="ml-2 text-xs text-slate-500">{t('recurring.paused')}</span>}<div className="text-xs text-slate-500">{t('recurring.issuedCount', { count: tpl.runs })}</div></td>
                <td className="p-3">{tpl.clientName}</td>
                <td className="p-3">{freqLabel(tpl.frequency)}{tpl.endDate && <div className="text-xs text-slate-500">{t('recurring.until', { date: tpl.endDate })}</div>}</td>
                <td className={`p-3 font-mono ${tpl.due ? 'text-amber-400' : ''}`}>{tpl.nextDate}{tpl.due && <div className="text-xs">{t('recurring.timeToIssue')}</div>}</td>
                <td className="p-3 text-right font-mono">€{total(tpl.items).toFixed(2)}</td>
                <td className="p-3 text-right space-x-1 whitespace-nowrap">
                  {tpl.due && <button disabled={busy} onClick={() => issue(tpl)} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold">{t('recurring.issue')}</button>}
                  <button disabled={busy} onClick={() => edit(tpl)} className="px-2 py-1 rounded border border-slate-700 text-xs">{t('recurring.edit')}</button>
                  <button disabled={busy} onClick={async () => { if (await call(`/api/recurring/${tpl.id}`, 'PUT', { active: !tpl.active })) router.refresh(); }} className="px-2 py-1 rounded border border-slate-700 text-xs">{tpl.active ? t('recurring.pause') : t('recurring.resume')}</button>
                  <button disabled={busy} onClick={async () => { if (window.confirm(t('recurring.confirmDelete')) && await call(`/api/recurring/${tpl.id}`, 'DELETE')) router.refresh(); }} className="px-2 py-1 rounded border border-rose-800 text-rose-300 text-xs">{t('recurring.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-3">
            <h2 className="text-lg font-bold text-white">{form.id ? t('recurring.editTitle') : t('recurring.newTitle')}</h2>
            {error && <div className="rounded border border-rose-700 bg-rose-950/40 p-2 text-rose-200 text-sm">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-300 col-span-2">{t('recurring.name')}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
              <label className="text-xs text-slate-300">{t('recurring.colClient')}<select value={form.clientId} onChange={e => setForm({ ...form, clientId: Number(e.target.value) })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2">{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-xs text-slate-300">{t('recurring.series')}<input value={form.series} onChange={e => setForm({ ...form, series: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
              <label className="text-xs text-slate-300">{t('recurring.colFrequency')}<select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2">{FREQ.map(k => <option key={k} value={k}>{freqLabel(k)}</option>)}</select></label>
              <label className="text-xs text-slate-300">{t('recurring.nextInvoice')}<input type="date" value={form.nextDate} onChange={e => setForm({ ...form, nextDate: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
              <label className="text-xs text-slate-300">{t('recurring.endOptional')}<input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
              <label className="text-xs text-slate-300">{t('recurring.payDays')}<input type="number" min={0} max={365} value={form.payDays} onChange={e => setForm({ ...form, payDays: Number(e.target.value) })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
              <label className="text-xs text-slate-300 col-span-2">{t('recurring.notes')}<input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="block w-full bg-slate-950 border border-slate-700 rounded p-2" /></label>
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-400">{t('recurring.linesHint')}</div>
              {form.items.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_110px_70px_auto] gap-2">
                  <input placeholder={t('recurring.servicePlaceholder')} value={l.itemName} onChange={e => setLine(i, { itemName: e.target.value })} className="bg-slate-950 border border-slate-700 rounded p-1.5" />
                  <input type="number" min="0" step="any" value={l.quantity} onChange={e => setLine(i, { quantity: Number(e.target.value) })} className="bg-slate-950 border border-slate-700 rounded p-1.5 text-right" aria-label={t('recurring.quantity')} />
                  <input type="number" min="0" step="any" value={l.price} onChange={e => setLine(i, { price: Number(e.target.value) })} className="bg-slate-950 border border-slate-700 rounded p-1.5 text-right" aria-label={t('recurring.price')} />
                  <input type="number" min="0" max="100" step="any" value={l.vatRate} onChange={e => setLine(i, { vatRate: Number(e.target.value) })} className="bg-slate-950 border border-slate-700 rounded p-1.5 text-right" aria-label={t('recurring.vatPercent')} />
                  <button disabled={form.items.length <= 1} onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })} className="px-2 rounded border border-slate-700 disabled:opacity-30">×</button>
                </div>
              ))}
              <button onClick={() => setForm({ ...form, items: [...form.items, emptyLine()] })} className="text-xs text-emerald-400">{t('recurring.addLine')}</button>
              <div className="text-right font-mono">{t('recurring.totalWithVat', { total: total(form.items).toFixed(2) })}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setForm(null); setError(''); }} className="px-4 py-2 rounded border border-slate-700">{t('recurring.cancel')}</button>
              <button disabled={busy} onClick={save} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold">{t('recurring.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
