'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n/client';

interface Original { id: number; number: string; series: string | null; purchaseDate: string; sumWithVat: number }
interface Credit { reference: { number: string; issueDate: string | null } | null; original: Original | null; candidates: Original[]; effect: { net: number; vat: number; gross: number; deductionPercent: number | null; deductibleVatReversed: number | null } | null }
interface Preview { kind?: 'invoice' | 'credit'; credit?: Credit | null; committed?: boolean; ok?: boolean; error?: string; issues: string[]; warnings: string[]; needsSupplier: boolean; supplier: { name: string; code: string; vatCode: string } | null; invoice: { number: string; issueDate: string; dueDate: string | null; net: number; vat: number; gross: number; lines: number } | null; }

// Supplier e-invoice (UBL XML) import: always previewed first; nothing is created until the user confirms.
export function PurchaseXmlImport() {
  const t = useT();
  const router = useRouter();
  const [xml, setXml] = useState('');
  const [filename, setFilename] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [createSupplier, setCreateSupplier] = useState(false);
  const [originalId, setOriginalId] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function send(commit: boolean, text = xml, chosen = originalId) {
    setBusy(true); setMessage('');
    try {
      const res = await fetch('/api/purchases/import-xml', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ xml: text, filename, commit, createSupplier, ...(chosen ? { originalPurchaseId: Number(chosen) } : {}) }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && commit) { setMessage(t('purchases.xmlImported', { number: data.purchase.number })); setXml(''); setFilename(''); setPreview(null); setCreateSupplier(false); setOriginalId(''); router.refresh(); return; }
      if (!res.ok && !data.issues) { setMessage(data.error || t('purchases.xmlErrImport')); return; }
      setPreview({ issues: [], warnings: [], needsSupplier: false, supplier: null, invoice: null, ...data });
    } finally { setBusy(false); }
  }
  async function pick(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setXml(text); setFilename(file.name); setCreateSupplier(false); setOriginalId(''); setMessage('');
    await send(false, text, '');
  }
  const blocked = !preview?.ok || (preview.needsSupplier && !createSupplier);

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3 text-sm text-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-slate-300">{t('purchases.xmlLabel')}
          <input type="file" accept=".xml,text/xml,application/xml" onChange={e => pick(e.target.files?.[0])} className="block mt-1 text-slate-300" />
        </label>
        {preview && <button disabled={busy || blocked} onClick={() => send(true)} className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold">{t('purchases.xmlImport')}</button>}
      </div>
      {message && <div className="rounded border border-emerald-700 bg-emerald-950/30 p-2 text-emerald-200">{message}</div>}
      {preview && (
        <div className="space-y-2">
          {preview.invoice && <div>{preview.kind === 'credit' ? t('purchases.xmlCredit') : t('purchases.xmlInvoice')} <strong>{preview.invoice.number}</strong> · {preview.invoice.issueDate} · {t('purchases.xmlNet', { amount: preview.invoice.net.toFixed(2) })} · {t('purchases.xmlVat', { amount: preview.invoice.vat.toFixed(2) })} · {t('purchases.xmlGross', { amount: preview.invoice.gross.toFixed(2) })} · {t('purchases.xmlLines', { count: preview.invoice.lines })}{preview.invoice.dueDate && <> · {t('purchases.xmlDueDate', { date: preview.invoice.dueDate })}</>}</div>}
          {preview.supplier && <div className="text-slate-300">{t('purchases.xmlSupplier')}: {preview.supplier.name} {preview.supplier.code && `(${preview.supplier.code})`} {preview.supplier.vatCode} — {preview.needsSupplier ? t('purchases.xmlSupplierMissing') : t('purchases.xmlSupplierFound')}</div>}
          {preview.needsSupplier && preview.ok && <label className="flex items-center gap-2"><input type="checkbox" checked={createSupplier} onChange={e => setCreateSupplier(e.target.checked)} />{t('purchases.xmlCreateSupplier')}</label>}
          {preview.kind === 'credit' && preview.credit && (
            <div className="space-y-1">
              {preview.credit.reference && <div className="text-slate-300">{t('purchases.xmlCreditRef', { number: preview.credit.reference.number + (preview.credit.reference.issueDate ? ` (${preview.credit.reference.issueDate})` : '') })}</div>}
              {!preview.credit.reference && preview.credit.candidates.length > 0 && (
                <label className="block text-slate-300">{t('purchases.xmlCreditPick')}
                  <select value={originalId} onChange={e => { setOriginalId(e.target.value); send(false, xml, e.target.value); }} className="block mt-1 rounded border border-slate-700 bg-slate-950 p-1 text-slate-200">
                    <option value="">{t('purchases.xmlCreditPickNone')}</option>
                    {preview.credit.candidates.map(c => <option key={c.id} value={c.id}>{(c.series || '') + c.number} · {c.purchaseDate} · {c.sumWithVat.toFixed(2)}</option>)}
                  </select>
                </label>
              )}
              {preview.credit.original && <div>{t('purchases.xmlCreditOriginal')}: <strong>{(preview.credit.original.series || '') + preview.credit.original.number}</strong> · {preview.credit.original.purchaseDate} · {preview.credit.original.sumWithVat.toFixed(2)}</div>}
              {preview.credit.effect && <div className="text-slate-300">{t('purchases.xmlCreditEffect', { gross: preview.credit.effect.gross.toFixed(2), net: preview.credit.effect.net.toFixed(2), vat: preview.credit.effect.vat.toFixed(2) })} {preview.credit.effect.deductibleVatReversed === null ? t('purchases.xmlCreditNoReview') : t('purchases.xmlCreditDeduct', { amount: preview.credit.effect.deductibleVatReversed.toFixed(2), percent: preview.credit.effect.deductionPercent ?? 0 })}</div>}
            </div>
          )}
          {preview.invoice && preview.ok && preview.kind !== 'credit' && <p className="text-xs text-slate-400">{t('purchases.xmlDeductionNote')}</p>}
          {preview.issues.length > 0 && <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-amber-200"><strong>{t('purchases.xmlNotImported')}</strong><ul className="list-disc pl-5 mt-1">{preview.issues.map(i => <li key={i}>{i}</li>)}</ul></div>}
          {preview.warnings.length > 0 && <ul className="list-disc pl-5 text-slate-400">{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  );
}
