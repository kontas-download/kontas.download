'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Package } from 'lucide-react';
import { useI18n } from '@/lib/i18n/client';

type Method = 'STRAIGHT_LINE' | 'DECLINING_BALANCE';
const CATEGORIES = ['BUILDING', 'MACHINERY', 'VEHICLE', 'COMPUTER', 'FURNITURE', 'INTANGIBLE', 'OTHER'];
const METHODS: Method[] = ['STRAIGHT_LINE', 'DECLINING_BALANCE'];

export interface AssetDto {
  id: number; code: string; name: string; category: string; acquisitionDate: string; commissioningDate: string; cost: number; residualValue: number;
  usefulLifeMonths: number; method: Method; decliningFactor: number | null; notes: string | null; disposedAt: string | null;
  accumulated: number; bookValue: number; lastPeriod: string | null; nextPeriod: string | null; nextAmount: number; warnings: string[];
}
interface Details {
  asset: AssetDto;
  postings: { id: number; period: string; kind: string; amount: number; bookValueAfter: number }[];
  changes: { id: number; field: string; oldValue: string | null; newValue: string | null; reason: string | null; createdAt: string; actorName: string | null }[];
}
interface Form { code: string; name: string; category: string; acquisitionDate: string; commissioningDate: string; cost: string; residualValue: string; usefulLifeMonths: string; method: Method; decliningFactor: string; notes: string; reason: string }

const input = 'rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100';
const btn = 'rounded border border-slate-600 px-3 py-1 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-50';
const blank = (method: Method): Form => ({ code: '', name: '', category: 'COMPUTER', acquisitionDate: '', commissioningDate: '', cost: '', residualValue: '0', usefulLifeMonths: '', method, decliningFactor: '', notes: '', reason: '' });

export function AssetsClient({ initialAssets, initialDefaultMethod, companyId }: { initialAssets: AssetDto[]; initialDefaultMethod: Method; companyId: number }) {
  const { t, money, date } = useI18n();
  const [assets, setAssets] = useState(initialAssets);
  const [defaultMethod, setDefaultMethod] = useState<Method>(initialDefaultMethod);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Details | null>(null);
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [disposal, setDisposal] = useState<{ date: string; reason: string; proceeds: string } | null>(null);

  async function call(url: string, method: string, body?: unknown) {
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('assets.error')); return null; }
      return data;
    } catch { setError(t('assets.error')); return null; } finally { setBusy(false); }
  }
  async function reload() { const d = await call('/api/assets', 'GET'); if (d) setAssets(d.assets); }
  async function open(id: number) { const d = await call(`/api/assets/${id}`, 'GET'); if (d) { setDetail(d); setDisposal(null); } }
  async function refresh(id?: number) { await reload(); if (id) await open(id); }

  const toBody = (f: Form) => ({
    code: f.code, name: f.name, category: f.category, acquisitionDate: f.acquisitionDate, commissioningDate: f.commissioningDate, cost: Number(f.cost),
    residualValue: Number(f.residualValue || 0), usefulLifeMonths: f.usefulLifeMonths === '' ? null : Number(f.usefulLifeMonths), method: f.method,
    decliningFactor: f.decliningFactor === '' ? null : Number(f.decliningFactor), notes: f.notes, reason: f.reason,
  });
  async function save() {
    if (!form) return;
    const d = await call(editId ? `/api/assets/${editId}` : '/api/assets', editId ? 'PUT' : 'POST', editId ? toBody(form) : { ...toBody(form), companyId });
    if (d) { setForm(null); const id = editId; setEditId(null); await refresh(id ?? undefined); }
  }
  function edit(a: AssetDto) {
    setEditId(a.id);
    setForm({ code: a.code, name: a.name, category: a.category, acquisitionDate: a.acquisitionDate, commissioningDate: a.commissioningDate, cost: String(a.cost), residualValue: String(a.residualValue), usefulLifeMonths: String(a.usefulLifeMonths), method: a.method, decliningFactor: a.decliningFactor === null ? '' : String(a.decliningFactor), notes: a.notes ?? '', reason: '' });
  }
  async function remove(a: AssetDto) {
    if (!window.confirm(t('assets.confirmDelete', { code: a.code }))) return;
    if (await call(`/api/assets/${a.id}`, 'DELETE')) { setDetail(null); await reload(); }
  }
  async function saveDefault(method: Method) {
    const d = await call('/api/assets/settings', 'PUT', { defaultMethod: method });
    if (d) setDefaultMethod(d.defaultMethod);
  }
  async function postPeriod() {
    const d = await call('/api/assets/depreciation', 'POST', { period, companyId });
    if (d) { setInfo(t('assets.posted', { count: d.posted, amount: money(d.total) })); await refresh(detail?.asset.id); }
  }
  const latest = assets.reduce<string | null>((m, a) => (a.lastPeriod && (!m || a.lastPeriod > m) ? a.lastPeriod : m), null);
  async function undoLatest() {
    if (!latest || !window.confirm(t('assets.confirmUndo', { period: latest }))) return;
    if (await call('/api/assets/depreciation', 'DELETE', { period: latest, companyId })) await refresh(detail?.asset.id);
  }
  async function dispose() {
    if (!detail || !disposal) return;
    const d = await call(`/api/assets/${detail.asset.id}/dispose`, 'POST', { date: disposal.date, reason: disposal.reason, proceeds: disposal.proceeds === '' ? null : Number(disposal.proceeds) });
    if (d) { setInfo(t('assets.disposalResult', { book: money(d.bookValue), gain: d.gain === null ? '-' : money(d.gain) })); await refresh(detail.asset.id); }
  }
  async function cancelDisposal() {
    if (!detail || !window.confirm(t('assets.confirmCancelDisposal'))) return;
    if (await call(`/api/assets/${detail.asset.id}/dispose`, 'DELETE')) await refresh(detail.asset.id);
  }

  const due = assets.filter(a => a.nextPeriod && a.nextPeriod <= period);
  const dueTotal = due.reduce((s, a) => s + a.nextAmount, 0);
  const set = (patch: Partial<Form>) => setForm(f => f && { ...f, ...patch });
  const field = (label: string, key: keyof Form, type = 'text', step?: string) => (
    <label className="flex flex-col gap-1">{label}<input className={input} type={type} step={step} value={form![key]} onChange={e => set({ [key]: e.target.value } as Partial<Form>)} /></label>
  );

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2"><Package className="w-6 h-6 text-emerald-400" /><span>{t('assets.title')}</span></h1>
        <p className="text-sm text-slate-400 mt-1">{t('assets.subtitle')}</p>
      </header>
      {error && <div role="alert" className="rounded-lg border border-rose-700 bg-rose-950/30 p-3 text-sm text-rose-200">{error}</div>}
      {info && <div role="status" className="rounded-lg border border-emerald-700 bg-emerald-950/30 p-3 text-sm text-emerald-200">{info}</div>}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h2 className="font-semibold text-white">{t('assets.settings')}</h2>
        <label className="flex flex-wrap items-center gap-2 text-sm text-slate-300">{t('assets.defaultMethod')}
          <select className={input} value={defaultMethod} disabled={busy} onChange={e => saveDefault(e.target.value as Method)}>{METHODS.map(m => <option key={m} value={m}>{t(`assets.${m}`)}</option>)}</select>
        </label>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <h2 className="font-semibold text-white">{t('assets.depreciation')}</h2>
        <div className="flex flex-wrap items-end gap-3 text-sm text-slate-300">
          <label className="flex flex-col gap-1">{t('assets.period')}<input className={input} type="month" value={period} onChange={e => setPeriod(e.target.value)} /></label>
          <span>{t('assets.preview', { count: due.length, amount: money(dueTotal) })}</span>
          <button className={btn} disabled={busy || !period} onClick={postPeriod}>{t('assets.post')}</button>
          <button className={btn} disabled={busy || !latest} onClick={undoLatest}>{t('assets.undo')}</button>
          {latest && <span className="text-slate-400">{t('assets.lastPosted', { period: latest })}</span>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">{t('assets.assets')}</h2>
          {!form && <button className={btn} onClick={() => { setEditId(null); setForm(blank(defaultMethod)); }}>{t('assets.add')}</button>}
        </div>
        {form && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-slate-300">
            {field(t('assets.code'), 'code')}
            {field(t('assets.name'), 'name')}
            <label className="flex flex-col gap-1">{t('assets.category')}<select className={input} value={form.category} onChange={e => set({ category: e.target.value })}>{CATEGORIES.map(c => <option key={c} value={c}>{t(`assets.${c}`)}</option>)}</select></label>
            {field(t('assets.acquisitionDate'), 'acquisitionDate', 'date')}
            {field(t('assets.commissioningDate'), 'commissioningDate', 'date')}
            {field(t('assets.cost'), 'cost', 'number', '0.01')}
            {field(t('assets.residual'), 'residualValue', 'number', '0.01')}
            {field(t('assets.life'), 'usefulLifeMonths', 'number', '1')}
            <label className="flex flex-col gap-1">{t('assets.method')}<select className={input} value={form.method} onChange={e => set({ method: e.target.value as Method })}>{METHODS.map(m => <option key={m} value={m}>{t(`assets.${m}`)}</option>)}</select></label>
            {field(t('assets.factor'), 'decliningFactor', 'number', '0.1')}
            {field(t('assets.notes'), 'notes')}
            {editId && <div className="sm:col-span-3 space-y-1"><div className="font-medium text-slate-100">{t('assets.overrideTitle')}</div><input className={`${input} w-full`} placeholder={t('assets.reason')} value={form.reason} onChange={e => set({ reason: e.target.value })} /></div>}
            <div className="flex gap-2 sm:col-span-3"><button className={btn} disabled={busy} onClick={save}>{t('assets.save')}</button><button className={btn} onClick={() => { setForm(null); setEditId(null); }}>{t('assets.cancel')}</button></div>
          </div>
        )}
        {assets.length === 0 ? <p className="text-sm text-slate-400">{t('assets.empty')}</p> : (
          <div className="overflow-x-auto"><table className="w-full text-sm text-slate-300">
            <thead className="text-left text-slate-400"><tr>
              <th className="py-1 px-2">{t('assets.code')}</th><th className="py-1 px-2">{t('assets.name')}</th><th className="py-1 px-2">{t('assets.category')}</th>
              <th className="py-1 px-2 text-right">{t('assets.cost')}</th><th className="py-1 px-2 text-right">{t('assets.accumulated')}</th><th className="py-1 px-2 text-right">{t('assets.bookValue')}</th>
              <th className="py-1 px-2">{t('assets.next')}</th><th className="py-1 px-2">{t('assets.status')}</th><th />
            </tr></thead>
            <tbody>{assets.map(a => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="py-1 px-2 font-mono">{a.code}</td><td className="py-1 px-2">{a.name}{a.warnings.map(w => <span key={w} title={t(`assets.${w}`)} className="ml-1 text-amber-400">!</span>)}</td>
                <td className="py-1 px-2">{t(`assets.${a.category}`)}</td>
                <td className="py-1 px-2 text-right font-mono">{money(a.cost)}</td><td className="py-1 px-2 text-right font-mono">{money(a.accumulated)}</td><td className="py-1 px-2 text-right font-mono">{money(a.bookValue)}</td>
                <td className="py-1 px-2">{a.nextPeriod ? `${a.nextPeriod} · ${money(a.nextAmount)}` : ''}</td>
                <td className="py-1 px-2">{a.disposedAt ? t('assets.disposed', { date: date(a.disposedAt) }) : t('assets.active')}</td>
                <td className="py-1 px-2 whitespace-nowrap"><button className={btn} onClick={() => open(a.id)}>{t('assets.details')}</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </section>

      {detail && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-white">{detail.asset.code} · {detail.asset.name}</h2>
            <div className="flex flex-wrap gap-2">
              {!detail.asset.disposedAt && <button className={btn} onClick={() => edit(detail.asset)}>{t('assets.edit')}</button>}
              {!detail.asset.disposedAt && !disposal && <button className={btn} onClick={() => setDisposal({ date: new Date().toISOString().slice(0, 10), reason: '', proceeds: '' })}>{t('assets.dispose')}</button>}
              {detail.asset.disposedAt && <button className={btn} disabled={busy} onClick={cancelDisposal}>{t('assets.cancelDisposal')}</button>}
              <button className={btn} onClick={() => remove(detail.asset)}>{t('assets.delete')}</button>
              <button className={btn} onClick={() => setDetail(null)}>{t('assets.close')}</button>
            </div>
          </div>
          {disposal && (
            <div className="flex flex-wrap items-end gap-3 text-sm text-slate-300">
              <label className="flex flex-col gap-1">{t('assets.disposalDate')}<input className={input} type="date" value={disposal.date} onChange={e => setDisposal({ ...disposal, date: e.target.value })} /></label>
              <label className="flex flex-col gap-1">{t('assets.disposalReason')}<input className={`${input} w-72`} value={disposal.reason} onChange={e => setDisposal({ ...disposal, reason: e.target.value })} /></label>
              <label className="flex flex-col gap-1">{t('assets.proceeds')}<input className={input} type="number" step="0.01" min="0" value={disposal.proceeds} onChange={e => setDisposal({ ...disposal, proceeds: e.target.value })} /></label>
              <button className={btn} disabled={busy} onClick={dispose}>{t('assets.dispose')}</button>
              <button className={btn} onClick={() => setDisposal(null)}>{t('assets.cancel')}</button>
            </div>
          )}
          {detail.postings.length > 0 && (
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-sm">{t('assets.postings')}</h3>
              <div className="overflow-x-auto"><table className="w-full text-xs text-slate-300">
                <thead className="text-left text-slate-400"><tr><th className="py-1 px-2">{t('assets.period')}</th><th className="py-1 px-2 text-right">{t('assets.amount')}</th><th className="py-1 px-2 text-right">{t('assets.bookValue')}</th></tr></thead>
                <tbody>{detail.postings.map(p => (
                  <tr key={p.id} className="border-t border-slate-800"><td className="py-1 px-2">{p.period}{p.kind === 'DEPRECIATION' ? '' : ` · ${p.kind}`}</td><td className="py-1 px-2 text-right font-mono">{money(p.amount)}</td><td className="py-1 px-2 text-right font-mono">{money(p.bookValueAfter)}</td></tr>))}</tbody>
              </table></div>
            </div>
          )}
          {detail.changes.length > 0 && (
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-sm">{t('assets.changeLog')}</h3>
              <div className="overflow-x-auto"><table className="w-full text-xs text-slate-300">
                <thead className="text-left text-slate-400"><tr><th className="py-1 px-2">{t('assets.logDate')}</th><th className="py-1 px-2">{t('assets.logField')}</th><th className="py-1 px-2">{t('assets.logOld')}</th><th className="py-1 px-2">{t('assets.logNew')}</th><th className="py-1 px-2">{t('assets.logReason')}</th><th className="py-1 px-2">{t('assets.logBy')}</th></tr></thead>
                <tbody>{detail.changes.map(c => (
                  <tr key={c.id} className="border-t border-slate-800"><td className="py-1 px-2">{date(c.createdAt)}</td><td className="py-1 px-2">{c.field}</td><td className="py-1 px-2">{c.oldValue}</td><td className="py-1 px-2">{c.newValue}</td><td className="py-1 px-2">{c.reason}</td><td className="py-1 px-2">{c.actorName}</td></tr>))}</tbody>
              </table></div>
            </div>
          )}
        </section>
      )}

      <Link href="/help/fixed-assets" className="inline-block text-sm text-emerald-400 hover:underline">{t('assets.helpLink')}</Link>
    </div>
  );
}
