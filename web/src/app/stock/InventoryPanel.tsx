'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';

type Method = 'OFF' | 'AVERAGE' | 'FIFO';
const METHODS: Method[] = ['OFF', 'AVERAGE', 'FIFO'];
interface Settings { method: Method; inventoryAccount: string; cogsAccount: string; startDate: string | null; }
interface Row { id: number; name: string; code: string | null; balanceQty: number | null; balanceValue: number | null; movements: number; cogs: number; }
interface Movement {
  id: number; date: string; kind: string; quantity: number; amount: number; unitCost: number; balanceQty: number; balanceValue: number;
  debitAccount: string | null; creditAccount: string | null; docNumber: string | null; reason: string | null; actorId: number | null;
}

const input = 'rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100';
const btn = 'rounded border border-slate-600 px-3 py-1 text-sm text-slate-100 hover:bg-slate-800 disabled:opacity-50';

// Costing method, per-item movements (with COGS), manual adjustments and the audit trail for the active company. Hidden for roles without access.
export function InventoryPanel() {
  const { t, money, date } = useI18n();
  const [allowed, setAllowed] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<{ id: number; name: string; movements: Movement[] } | null>(null);
  const [adj, setAdj] = useState({ kind: 'ADJUST_QTY', value: '', unitCost: '', account: '', reason: '' });
  const num = (n: number | null | undefined) => (n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 6 });

  const call = useCallback(async (url: string, method: string, body?: unknown) => {
    setBusy(true); setError(''); setInfo('');
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || t('inventory.error')); return null; }
      return data;
    } catch { setError(t('inventory.error')); return null; } finally { setBusy(false); }
  }, [t]);

  const load = useCallback(async () => {
    const res = await fetch('/api/inventory').catch(() => null);
    if (!res || !res.ok) return;
    const data = await res.json();
    setSettings(data.settings); setRows(data.items); setAllowed(true);
  }, []);
  useEffect(() => {
    fetch('/api/inventory').then(r => (r.ok ? r.json() : null)).then(data => {
      if (data) { setSettings(data.settings); setRows(data.items); setAllowed(true); }
    }).catch(() => undefined);
  }, []);

  async function openItem(id: number) {
    const d = await call(`/api/inventory/${id}`, 'GET');
    if (d) setOpen({ id, name: d.item.name, movements: d.movements });
  }
  async function saveSettings() {
    if (!settings) return;
    const d = await call('/api/inventory', 'PUT', { method: settings.method, inventoryAccount: settings.inventoryAccount, cogsAccount: settings.cogsAccount, startDate: settings.startDate });
    if (d) { setSettings(d.settings); setInfo(t('inventory.saved')); await load(); }
  }
  async function applyAdjustment() {
    if (!open) return;
    const body: Record<string, unknown> = { stockItemId: open.id, kind: adj.kind, reason: adj.reason };
    if (adj.kind === 'ADJUST_QTY') { body.quantity = adj.value; if (adj.unitCost) body.unitCost = adj.unitCost; } else body.amount = adj.value;
    if (adj.account) body.account = adj.account;
    const d = await call('/api/inventory/adjustments', 'POST', body);
    if (d) { setInfo(t('inventory.adjusted')); setAdj({ ...adj, value: '', unitCost: '', reason: '' }); await load(); await openItem(open.id); }
  }

  if (!allowed || !settings) return null;
  const on = settings.method !== 'OFF';
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 text-slate-200">
      <h2 className="text-lg font-bold text-white">{t('inventory.title')}</h2>
      {error && <p role="alert" className="text-sm text-rose-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs space-y-1 block">{t('inventory.method')}
          <select className={`${input} block`} value={settings.method} onChange={e => setSettings({ ...settings, method: e.target.value as Method })}>
            {METHODS.map(m => <option key={m} value={m}>{t(`inventory.${m}`)}</option>)}
          </select>
        </label>
        <label className="text-xs space-y-1 block">{t('inventory.inventoryAccount')}
          <input className={`${input} block w-24`} value={settings.inventoryAccount} onChange={e => setSettings({ ...settings, inventoryAccount: e.target.value })} />
        </label>
        <label className="text-xs space-y-1 block">{t('inventory.cogsAccount')}
          <input className={`${input} block w-24`} value={settings.cogsAccount} onChange={e => setSettings({ ...settings, cogsAccount: e.target.value })} />
        </label>
        {on && <span className="text-xs text-slate-400">{t('inventory.startDate')}: {settings.startDate ? date(settings.startDate) : '-'}</span>}
        <button className={btn} disabled={busy} onClick={saveSettings}>{t('inventory.save')}</button>
      </div>
      <p className="text-xs text-slate-400">{t(on ? 'inventory.noteOn' : 'inventory.noteOff')}</p>

      {on && (
        <div className="overflow-x-auto">
          <h3 className="text-sm font-semibold mb-2">{t('inventory.items')}</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-slate-400">
              <th className="p-1">{t('inventory.item')}</th><th className="p-1 text-right">{t('inventory.qty')}</th><th className="p-1 text-right">{t('inventory.value')}</th>
              <th className="p-1 text-right">{t('inventory.cogs')}</th><th className="p-1 text-right">{t('inventory.movementsCount')}</th><th className="p-1" />
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-800">
                  <td className="p-1">{r.code ? `${r.code} ` : ''}{r.name}</td>
                  <td className="p-1 text-right">{num(r.balanceQty)}</td>
                  <td className="p-1 text-right">{money(r.balanceValue ?? 0)}</td>
                  <td className="p-1 text-right">{money(r.cogs)}</td>
                  <td className="p-1 text-right">{r.movements}</td>
                  <td className="p-1 text-right"><button className={btn} disabled={busy} onClick={() => openItem(r.id)}>{t('inventory.open')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="border border-slate-700 rounded-lg p-3 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold">{t('inventory.movements', { name: open.name })}</h3>
            <button className={btn} onClick={() => setOpen(null)}>{t('inventory.close')}</button>
          </div>
          <p className="text-xs text-slate-400">{t('inventory.auditHint')}</p>
          {open.movements.length === 0 ? <p className="text-sm text-slate-400">{t('inventory.noMovements')}</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-slate-400">
                  <th className="p-1">{t('inventory.date')}</th><th className="p-1">{t('inventory.kind')}</th><th className="p-1 text-right">{t('inventory.quantity')}</th>
                  <th className="p-1 text-right">{t('inventory.amount')}</th><th className="p-1 text-right">{t('inventory.unitCost')}</th><th className="p-1 text-right">{t('inventory.balance')}</th>
                  <th className="p-1">{t('inventory.accounts')}</th><th className="p-1">{t('inventory.document')}</th><th className="p-1">{t('inventory.reason')}</th><th className="p-1">{t('inventory.by')}</th>
                </tr></thead>
                <tbody>
                  {open.movements.map(m => (
                    <tr key={m.id} className="border-t border-slate-800">
                      <td className="p-1">{date(m.date)}</td><td className="p-1">{t(`inventory.${m.kind}`)}</td>
                      <td className="p-1 text-right">{num(m.quantity)}</td><td className="p-1 text-right">{money(m.amount)}</td><td className="p-1 text-right">{money(m.unitCost)}</td>
                      <td className="p-1 text-right">{num(m.balanceQty)} / {money(m.balanceValue)}</td>
                      <td className="p-1">{m.debitAccount || '-'} / {m.creditAccount || '-'}</td><td className="p-1">{m.docNumber || '-'}</td>
                      <td className="p-1">{m.reason || '-'}</td><td className="p-1">{m.actorId ? `#${m.actorId}` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">{t('inventory.adjust')}</h4>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs space-y-1 block">{t('inventory.adjustKind')}
                <select className={`${input} block`} value={adj.kind} onChange={e => setAdj({ ...adj, kind: e.target.value })}>
                  <option value="ADJUST_QTY">{t('inventory.ADJUST_QTY')}</option><option value="ADJUST_COST">{t('inventory.ADJUST_COST')}</option>
                </select>
              </label>
              <label className="text-xs space-y-1 block">{t(adj.kind === 'ADJUST_QTY' ? 'inventory.adjustQtyHint' : 'inventory.adjustCostHint')}
                <input className={`${input} block w-32`} type="number" step="any" value={adj.value} onChange={e => setAdj({ ...adj, value: e.target.value })} />
              </label>
              {adj.kind === 'ADJUST_QTY' && (
                <label className="text-xs space-y-1 block">{t('inventory.unitCostOptional')}
                  <input className={`${input} block w-32`} type="number" step="any" value={adj.unitCost} onChange={e => setAdj({ ...adj, unitCost: e.target.value })} />
                </label>
              )}
              <label className="text-xs space-y-1 block">{t('inventory.account')}
                <input className={`${input} block w-24`} placeholder={settings.cogsAccount} value={adj.account} onChange={e => setAdj({ ...adj, account: e.target.value })} />
              </label>
            </div>
            <label className="text-xs space-y-1 block">{t('inventory.reasonRequired')}
              <input className={`${input} block w-full`} maxLength={500} value={adj.reason} onChange={e => setAdj({ ...adj, reason: e.target.value })} />
            </label>
            <button className={btn} disabled={busy || !adj.reason.trim() || adj.value === ''} onClick={applyAdjustment}>{t('inventory.apply')}</button>
          </div>
        </div>
      )}
      <Link href="/help/inventory-costing" className="inline-block text-sm text-emerald-400 hover:underline">{t('inventory.helpLink')}</Link>
    </section>
  );
}
