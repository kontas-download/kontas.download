'use client';
import { useState } from 'react';
import { SuggestionLists } from '@/components/SuggestionLists';
import type { Suggestions } from '@/lib/suggestions';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';
import { askConfirm } from '@/components/ConfirmHost';
import { findCatalogItem, type CatalogItem } from '@/lib/item-catalog';

interface Line { itemName: string; itemCode?: string; quantity: number; price: number; vatRate: number; }
interface Template { id: number; name: string; clientId: number; clientName: string; series: string; frequency: string; nextDate: string; endDate: string | null; payDays: number; notes: string | null; items: Line[]; active: boolean; due: boolean; runs: number; }
interface Form { id: number | null; name: string; clientId: number; series: string; frequency: string; nextDate: string; endDate: string; payDays: number; notes: string; items: Line[]; }
const FREQ = ['MONTH', 'QUARTER', 'YEAR'];
// Form suggestion, not a legal parameter: the rate is chosen per line and stored on the document; i.SAF and FR0600 classify a stored rate through the rules registry (lib/rules).
const emptyLine = (): Line => ({ itemName: '', itemCode: '', quantity: 1, price: 0, vatRate: 21 });
const lbl = 'block text-xs font-medium text-slate-400 space-y-1';
const fld = 'mt-1 block w-full h-10 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const cell = 'h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const total = (items: Line[]) => items.reduce((n, l) => n + l.quantity * l.price * (1 + l.vatRate / 100), 0);

export function RecurringClient({ today, templates, clients, catalog = [], suggest = {} }: { today: string; templates: Template[]; clients: { id: number; name: string }[]; catalog?: CatalogItem[]; suggest?: Suggestions }) {
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
    if (!await askConfirm(t('recurring.confirmIssue', { name: tpl.name, client: tpl.clientName, total: total(tpl.items).toFixed(2) }))) return;
    const data = await call(`/api/recurring/${tpl.id}/issue`, 'POST', {});
    if (data) { setNotice(t('recurring.issued', { doc: `${data.sale.series} ${data.sale.number}`, next: data.finished ? t('recurring.finished') : data.nextDate })); router.refresh(); }
  }
  const edit = (tpl: Template) => setForm({ id: tpl.id, name: tpl.name, clientId: tpl.clientId, series: tpl.series, frequency: tpl.frequency, nextDate: tpl.nextDate, endDate: tpl.endDate || '', payDays: tpl.payDays, notes: tpl.notes || '', items: tpl.items.map(i => ({ ...i })) });
  const setLine = (i: number, patch: Partial<Line>) => form && setForm({ ...form, items: form.items.map((l, idx) => idx === i ? { ...l, ...patch } : l) });
  // Picking a known item or service fills its code and latest price; typing a new name keeps the line as it is.
  const setLineName = (i: number, itemName: string) => { const hit = findCatalogItem(catalog, itemName); setLine(i, hit ? { itemName: hit.name, itemCode: hit.code || '', price: hit.price } : { itemName }); };

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
                  <button disabled={busy} onClick={async () => { if (await askConfirm(t('recurring.confirmDelete')) && await call(`/api/recurring/${tpl.id}`, 'DELETE')) router.refresh(); }} className="px-2 py-1 rounded border border-rose-800 text-rose-300 text-xs">{t('recurring.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="recurring-form-title">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
            <h2 id="recurring-form-title" className="text-lg font-bold text-white">{form.id ? t('recurring.editTitle') : t('recurring.newTitle')}</h2>
            {error && <div className="rounded-lg border border-rose-700 bg-rose-950/40 p-2 text-rose-200 text-sm">{error}</div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className={`${lbl} sm:col-span-2`}>{t('recurring.name')}<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={fld} /></label>
              <label className={lbl}>{t('recurring.colClient')}<select value={form.clientId} onChange={e => setForm({ ...form, clientId: Number(e.target.value) })} className={fld}>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className={lbl}>{t('recurring.series')}<input list="sug-sale-series" value={form.series} onChange={e => setForm({ ...form, series: e.target.value })} className={fld} /></label>
              <label className={lbl}>{t('recurring.colFrequency')}<select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className={fld}>{FREQ.map(k => <option key={k} value={k}>{freqLabel(k)}</option>)}</select></label>
              <label className={lbl}>{t('recurring.nextInvoice')}<input type="date" value={form.nextDate} onChange={e => setForm({ ...form, nextDate: e.target.value })} className={fld} /></label>
              <label className={lbl}>{t('recurring.endOptional')}<input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} className={fld} /></label>
              <label className={lbl}>{t('recurring.payDays')}<input type="number" min={0} max={365} value={form.payDays} onChange={e => setForm({ ...form, payDays: Number(e.target.value) })} className={fld} /></label>
              <label className={`${lbl} sm:col-span-2`}>{t('recurring.notes')}<input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={fld} /></label>
            </div>
            <div className="space-y-2 border-t border-slate-800 pt-4">
              <p className="text-xs text-slate-400">{t('recurring.linesHint')}</p>
              <SuggestionLists lists={{ 'sug-sale-series': suggest.saleSeries }} />
              <datalist id="recurring-catalog">{catalog.map(c => <option key={c.name} value={c.name}>{`€${c.price.toFixed(2)}${c.code ? ' · ' + c.code : ''}`}</option>)}</datalist>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="text-xs text-slate-400">
                    <tr>
                      <th className="pb-1 pr-2 text-left font-medium">{t('recurring.servicePlaceholder')}</th>
                      <th className="w-20 pb-1 pr-2 text-right font-medium">{t('recurring.quantity')}</th>
                      <th className="w-28 pb-1 pr-2 text-right font-medium">{t('recurring.price')}</th>
                      <th className="w-20 pb-1 pr-2 text-right font-medium">{t('recurring.vatPercent')}</th>
                      <th className="w-28 pb-1 pr-2 text-right font-medium">{t('recurring.lineSum')}</th>
                      <th className="w-9 pb-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {form.items.map((l, i) => (
                      <tr key={i}>
                        <td className="py-1 pr-2"><input placeholder={t('recurring.servicePlaceholder')} aria-label={t('recurring.servicePlaceholder')} list="recurring-catalog" value={l.itemName} onChange={e => setLineName(i, e.target.value)} className={cell} /></td>
                        <td className="py-1 pr-2"><input type="number" min="0" step="any" value={l.quantity} onChange={e => setLine(i, { quantity: Number(e.target.value) })} className={`${cell} text-right font-mono`} aria-label={t('recurring.quantity')} /></td>
                        <td className="py-1 pr-2"><input type="number" min="0" step="any" value={l.price} onChange={e => setLine(i, { price: Number(e.target.value) })} className={`${cell} text-right font-mono`} aria-label={t('recurring.price')} /></td>
                        <td className="py-1 pr-2"><input type="number" min="0" max="100" step="any" value={l.vatRate} onChange={e => setLine(i, { vatRate: Number(e.target.value) })} className={`${cell} text-right font-mono`} aria-label={t('recurring.vatPercent')} /></td>
                        <td className="py-1 pr-2 text-right font-mono text-slate-200">{(l.quantity * l.price).toFixed(2)}</td>
                        <td className="py-1 text-right"><button type="button" disabled={form.items.length <= 1} onClick={() => setForm({ ...form, items: form.items.filter((_, idx) => idx !== i) })} aria-label={t('recurring.removeLine')} title={t('recurring.removeLine')} className="h-9 w-9 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-30">×</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setForm({ ...form, items: [...form.items, emptyLine()] })} className="text-xs font-semibold text-emerald-400 hover:underline">{t('recurring.addLine')}</button>
                <div className="font-mono text-sm font-semibold text-white">{t('recurring.totalWithVat', { total: total(form.items).toFixed(2) })}</div>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
              <button type="button" onClick={() => { setForm(null); setError(''); }} className="px-4 py-2 rounded-lg border border-slate-700 text-sm font-semibold text-slate-200 hover:bg-slate-800">{t('recurring.cancel')}</button>
              <button type="button" disabled={busy} onClick={save} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-semibold text-white">{t('recurring.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
