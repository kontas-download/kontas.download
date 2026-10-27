'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/client';
import { TAX_CODES, type TaxKind } from '@/lib/tax-codes';

interface Line { kind: TaxKind; itemId: number; docId: number; document: string; date: string; docType: string | null; counterparty: string; vatCode: string; itemName: string; rate: number | null; net: number; vat: number; taxCode: string | null; autoCode: string | null; note: string; review: string | null; }
const keyOf = (l: { kind: TaxKind; itemId: number }) => `${l.kind}:${l.itemId}`;

// Assignment of i.SAF tax codes to sale/purchase lines of the period. The documents themselves are never changed.
export function TaxCodesPanel({ start, end }: { start: string; end: string }) {
  const { t, lang } = useI18n();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const options = useMemo(() => ({
    SALE: TAX_CODES.filter(d => d.sale).map(d => ({ code: d.code, title: d.title[lang] })),
    PURCHASE: TAX_CODES.filter(d => d.purchase).map(d => ({ code: d.code, title: d.title[lang] })),
  }), [lang]);

  const load = useCallback(async () => {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch(`/api/tax-reports/line-codes?start=${start}&end=${end}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ ok: false, text: data.error || t('tax.codes.loadFailed') }); return; }
      setLines(data.lines); setDraft({});
    } catch { setMessage({ ok: false, text: t('tax.codes.loadFailed') }); } finally { setBusy(false); }
  }, [start, end, t]);
  useEffect(() => { void load(); }, [load]);

  const value = (l: Line) => draft[keyOf(l)] ?? l.taxCode ?? '';
  const changed = (lines || []).filter(l => value(l) !== (l.taxCode ?? ''));
  const documents = useMemo(() => {
    const map = new Map<string, Line[]>();
    for (const l of lines || []) { const k = `${l.kind}:${l.docId}`; (map.get(k) || map.set(k, []).get(k)!).push(l); }
    return [...map.values()];
  }, [lines]);

  async function save(confirm: { kind: TaxKind; docId: number }[] = []) {
    setBusy(true); setMessage(null);
    try {
      const res = await fetch('/api/tax-reports/line-codes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: changed.map(l => ({ kind: l.kind, itemId: l.itemId, taxCode: value(l) || null, note: l.note })), confirm }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ ok: false, text: data.error || t('tax.codes.saveFailed') }); return; }
      setMessage({ ok: true, text: t('tax.codes.saved', { count: data.changed ?? 0 }) });
      await load();
    } catch { setMessage({ ok: false, text: t('tax.codes.saveFailed') }); } finally { setBusy(false); }
  }

  const set = (items: Line[], code: string) => setDraft(d => ({ ...d, ...Object.fromEntries(items.map(l => [keyOf(l), code])) }));
  const select = (kind: TaxKind, current: string, onChange: (code: string) => void, label: string, empty: string) => (
    <select aria-label={label} value={current} onChange={e => onChange(e.target.value)} className="w-full max-w-xs bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200">
      <option value="">{empty}</option>
      {options[kind].map(o => <option key={o.code} value={o.code}>{o.title}</option>)}
    </select>
  );

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3" aria-labelledby="tax-codes-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="tax-codes-title" className="text-white font-semibold">{t('tax.codes.title')}</h2>
          <p className="text-xs text-slate-400 mt-1">{t('tax.codes.hint')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { if (!changed.length || window.confirm(t('tax.codes.unsaved'))) void load(); }} disabled={busy} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-200 text-sm disabled:opacity-50">{t('tax.codes.reload')}</button>
          <button onClick={() => save()} disabled={busy || !changed.length} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold">{t('tax.codes.save', { count: changed.length })}</button>
        </div>
      </div>
      {message && <p role="status" className={message.ok ? 'text-emerald-300 text-sm' : 'text-amber-300 text-sm'}>{message.text}</p>}
      {lines && !lines.length && <p className="text-sm text-slate-400">{t('tax.codes.empty')}</p>}
      {documents.map(items => {
        const first = items[0];
        const kindLabel = first.kind === 'SALE' ? t('tax.codes.sale') : t('tax.codes.purchase');
        return (
          <div key={`${first.kind}:${first.docId}`} className="border-t border-slate-800 pt-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-slate-200"><strong>{kindLabel} {first.document}</strong> · {first.date} · {first.counterparty}{first.vatCode ? ` (${first.vatCode})` : ''}{first.docType === 'KS' ? ' · KS' : ''}</div>
              {items.length > 1 && <div className="flex items-center gap-2 text-xs text-slate-400"><span>{t('tax.codes.applyAll')}</span>{select(first.kind, '', code => set(items, code), t('tax.codes.applyAll'), t('tax.codes.choose'))}</div>}
            </div>
            {first.review && <div role="alert" className="mt-2 rounded border border-amber-700 bg-amber-950/30 p-2 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2"><span>{first.review}</span><button onClick={() => save([{ kind: first.kind, docId: first.docId }])} disabled={busy} className="px-2 py-1 rounded border border-amber-600 disabled:opacity-50">{t('tax.codes.confirm')}</button></div>}
            <table className="w-full mt-2">
              <thead><tr className="text-left text-xs text-slate-500"><th scope="col" className="py-1 font-normal">{t('tax.codes.colItem')}</th><th scope="col" className="py-1 font-normal text-right">{t('tax.codes.colNet')}</th><th scope="col" className="py-1 font-normal text-right">{t('tax.codes.colVat')}</th><th scope="col" className="py-1 font-normal pl-3">{t('tax.codes.colCode')}</th></tr></thead>
              <tbody>{items.map(l => (
                <tr key={keyOf(l)} className="border-t border-slate-800/60">
                  <td className="py-1.5 text-slate-300">{l.itemName}{l.rate != null ? ` · ${l.rate}%` : ''}{l.autoCode ? <span className="text-xs text-slate-500"> · {t('tax.codes.auto', { code: l.autoCode })}</span> : null}</td>
                  <td className="py-1.5 text-right font-mono">€{l.net.toFixed(2)}</td>
                  <td className="py-1.5 text-right font-mono">€{l.vat.toFixed(2)}</td>
                  <td className="py-1.5 pl-3">{select(l.kind, value(l), code => set([l], code), `${t('tax.codes.colCode')}: ${l.itemName}`, t('tax.codes.none'))}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}
