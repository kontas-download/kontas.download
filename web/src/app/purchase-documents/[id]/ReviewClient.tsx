'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { askConfirm } from '@/components/ConfirmHost';
import { TAX_CODES } from '@/lib/tax-codes';
import { applyEvidenceType, draftToForm, formToPayload, manualNotice, shouldShowLowQualityBanner, validateForm, type FormLine, type ReviewForm } from '@/lib/purchase-document-form';

interface Totals { net: number | null; vat: number | null; gross: number | null }
interface Preview {
  recognized: boolean; draft: Parameters<typeof draftToForm>[0]; missing: Record<string, string>; warnings: string[]; uncertainFields: string[]; companyVatPayer: boolean; duplicatePurchaseId: number | null;
  extracted: { docKind: string; currency: string | null; supplier: { code: string | null }; totals: Totals };
  suggestions: { debitAccount: string | null; debitAccountFromPurchaseId: number | null };
}
interface DocumentInfo { id: number; fileName: string; mimeType: string; status: string; error: string | null; source: string; sender: string | null; receivedAt: string }
interface Props { documentId: number; companyId: number; clients: { id: number; name: string; code: string | null; vatCode: string | null }[]; accounts: { code: string; name: string }[]; recognitionReady: boolean }

const control = 'block mt-1 w-full rounded-lg border bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3';
const OPEN = ['NEW', 'EXTRACTED', 'FAILED'];

function OriginalViewer({ id, mimeType, fileName }: { id: number; mimeType: string; fileName: string }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const src = `/api/purchase-documents/${id}/file`;
  if (mimeType === 'application/pdf') return <iframe title={fileName} src={src} className="h-[70vh] w-full rounded-lg border border-slate-800 bg-white lg:h-[calc(100vh-2rem)] lg:min-h-[70vh]" />;
  const tool = 'rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tool} onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))} aria-label={t('docs.zoomOut')}>−</button>
        <span className="self-center text-xs text-slate-400">{Math.round(zoom * 100)}%</span>
        <button type="button" className={tool} onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))} aria-label={t('docs.zoomIn')}>+</button>
        <button type="button" className={tool} onClick={() => setRotation(r => (r + 270) % 360)}>{t('docs.rotateLeft')}</button>
        <button type="button" className={tool} onClick={() => setRotation(r => (r + 90) % 360)}>{t('docs.rotateRight')}</button>
        <button type="button" className={tool} onClick={() => { setZoom(1); setRotation(0); }}>{t('docs.resetView')}</button>
        <a className={tool} href={src} target="_blank" rel="noreferrer">{t('docs.openOriginal')}</a>
      </div>
      <div className="h-[70vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950 lg:h-[calc(100vh-6rem)] lg:min-h-[70vh]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={fileName} style={{ width: `${zoom * 100}%`, maxWidth: 'none', transform: `rotate(${rotation}deg)`, transformOrigin: 'center center' }} className="block" />
      </div>
    </div>
  );
}

export function ReviewClient({ documentId, companyId, clients, accounts, recognitionReady }: Props) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [info, setInfo] = useState<DocumentInfo | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState<ReviewForm | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [nextId, setNextId] = useState<number | null>(null);
  const [supplierHit, setSupplierHit] = useState<{ id: number; name: string; code: string | null; vatCode: string | null; address: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [detail, list] = await Promise.all([
      fetch(`/api/purchase-documents/${documentId}`, { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) })),
      fetch('/api/purchase-documents', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ documents: [] })),
    ]);
    if (!detail.ok) { setMessage(detail.data.error || t('common.error')); setLoading(false); return; }
    setInfo(detail.data.document);
    const p: Preview | null = detail.data.draft ? detail.data : null;
    setPreview(p);
    setForm(p ? draftToForm(p.draft) : null);
    setTouched({}); setServerFields({}); setSupplierHit(null);
    const waiting = (list.documents as { id: number; status: string }[]).filter(d => OPEN.includes(d.status) && d.id !== documentId).map(d => d.id).sort((a, b) => a - b);
    setNextId(waiting.find(id => id > documentId) ?? waiting[0] ?? null);
    setLoading(false);
  }, [documentId, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { load(); }, [load]);

  const allowedTaxCodes = useMemo(() => TAX_CODES.filter(d => d.purchase).map(d => d.code), []);
  const errors = useMemo(() => (form && preview ? validateForm(form, { extractedSupplierCode: preview.extracted.supplier.code, docKind: preview.extracted.docKind, currency: preview.extracted.currency, allowedTaxCodes, companyVatPayer: preview.companyVatPayer }) : {}), [form, preview, allowedTaxCodes]);

  const edit = (paths: string[], change: (f: ReviewForm) => ReviewForm) => {
    setForm(f => (f ? change(f) : f));
    setTouched(prev => ({ ...prev, ...Object.fromEntries(paths.map(p => [p, true])) }));
    setServerFields(prev => { const next = { ...prev }; for (const p of paths) delete next[p]; return next; });
  };
  const flagged = (path: string) => Boolean(errors[path] || serverFields[path] || (preview?.missing[path] && !touched[path]));
  const ring = (path: string) => (flagged(path) ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-700');
  const problem = (path: string) => (errors[path] ? t(errors[path].key, errors[path].params) : serverFields[path]);
  const err = (path: string) => { const text = problem(path); return text ? <span role="alert" className="mt-0.5 block text-[11px] text-amber-300">{text}</span> : null; };

  const setLine = (i: number, field: keyof FormLine, value: string) => edit([`lines.${i}.${field}`], f => ({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, [field]: value } : l)) }));
  const money = (v: number) => v.toLocaleString(lang === 'lt' ? 'lt-LT' : lang === 'ru' ? 'ru-RU' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function post(path: string, body?: unknown) {
    const res = await fetch(`/api/purchase-documents/${documentId}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: await res.json().catch(() => ({})) as Record<string, unknown> & { error?: string; fields?: Record<string, string> } };
  }
  const goNext = () => router.push(nextId ? `/purchase-documents/${nextId}` : '/purchase-documents');

  // Typed company code / VAT code: offer the existing supplier so a manual entry does not create a duplicate.
  async function lookupSupplier() {
    if (!form || form.clientId || (!form.supplier.code.trim() && !form.supplier.vatCode.trim())) { setSupplierHit(null); return; }
    const query = new URLSearchParams({ code: form.supplier.code, vatCode: form.supplier.vatCode });
    const data = await fetch(`/api/purchase-documents/supplier-lookup?${query}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    setSupplierHit(data.supplier || null);
  }
  function useFoundSupplier() {
    const c = supplierHit;
    if (!c) return;
    edit(['supplier', 'supplier.name', 'supplier.code'], f => ({ ...f, clientId: String(c.id), supplier: { name: c.name, code: c.code || '', vatCode: c.vatCode || '', address: c.address || '' } }));
    setSupplierHit(null);
  }

  async function confirm() {
    if (!form) return;
    setBusy(true); setMessage(''); setServerFields({});
    try {
      const { ok, data } = await post('confirm', { companyId, ...formToPayload(form) });
      if (!ok) { setServerFields(data.fields || {}); setMessage(data.error || t('common.error')); return; }
      goNext();
    } finally { setBusy(false); }
  }
  async function reject() {
    if (!await askConfirm(t('docs.confirmReject', { name: info?.fileName || '' }))) return;
    setBusy(true); setMessage('');
    try {
      const { ok, data } = await post('reject');
      if (!ok) { setMessage(data.error || t('common.error')); return; }
      goNext();
    } finally { setBusy(false); }
  }
  async function recognizeAgain() {
    if (preview?.recognized && !await askConfirm(t('docs.confirmRecognizeAgain'))) return;
    setBusy(true); setMessage('');
    try {
      const { ok, data } = await post('recognize');
      if (!ok) setMessage(data.error || t('common.error'));
      await load();
    } finally { setBusy(false); }
  }

  if (loading && !info) return <div className="p-8 text-slate-400">{t('common.loading')}</div>;
  if (!info) return <div className="p-8 space-y-3"><p role="alert" className="text-rose-300">{message}</p><Link href="/purchase-documents" className="text-emerald-300 underline">{t('docs.backToList')}</Link></div>;

  const open = OPEN.includes(info.status);
  const issueCount = Object.keys(errors).length;
  const notice = manualNotice(info.status, recognitionReady);
  const lowQuality = shouldShowLowQualityBanner(preview);
  const nonEur = Boolean(preview?.extracted.currency && preview.extracted.currency.toUpperCase() !== 'EUR');
  const lineLabel = 'block text-[11px] font-medium text-slate-400';
  const label = 'block text-xs font-medium text-slate-400';
  const btn = 'rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40';

  return (
    <div className="p-4 sm:p-6 max-w-[1500px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{t('docs.reviewTitle')}: {info.fileName}</h1>
          <p className="text-xs text-slate-400">{t(`docs.status_${info.status}`)}{info.source === 'EMAIL' && info.sender ? ` · ${info.sender}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/purchase-documents" className={btn}>{t('docs.backToList')}</Link>
          {nextId && <Link href={`/purchase-documents/${nextId}`} className={btn}>{t('docs.next')}</Link>}
        </div>
      </div>

      {!open && <p role="status" className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-sm text-slate-300">{t('docs.alreadyDone')}</p>}
      {info.error && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{info.error}</p>}
      {message && <p role="alert" className="rounded-xl border border-rose-800 bg-rose-950/40 p-3 text-sm text-rose-200">{message}</p>}
      {lowQuality && <p role="alert" className="rounded-xl border border-amber-700 bg-amber-950/40 p-3 text-sm font-semibold text-amber-200">{t('docs.blurry')}</p>}
      {preview && preview.warnings.length > 0 && (
        <div role="note" className="rounded-xl border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-100">
          <strong>{t('docs.warnings')}</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{preview.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start"><OriginalViewer id={info.id} mimeType={info.mimeType} fileName={info.fileName} /></div>

        <div className="space-y-4">
          {preview && !preview.recognized && open && (
            <div className={card}>
              {notice.messageKey && <p className="text-sm text-slate-300">{t(notice.messageKey)}</p>}
              {notice.settingsLink && <p className="text-sm text-amber-200">{t('docs.notReady')} <Link href="/companies" className="underline">{t('docs.notReadyLink')}</Link></p>}
              {recognitionReady && <div><button disabled={busy} onClick={recognizeAgain} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? t('docs.recognizingShort') : t('docs.recognize')}</button></div>}
            </div>
          )}

          {preview && form && (
            <fieldset disabled={!open || busy} className="space-y-4 disabled:opacity-70">
              <section className={card} aria-label={t('docs.sectionSupplier')}>
                <h2 className="font-bold text-white text-sm">{t('docs.sectionSupplier')}</h2>
                <label className={label}>{t('docs.supplierPick')}
                  <select value={form.clientId} className={`${control} ${ring('supplier')}`} onChange={e => {
                    const c = clients.find(x => String(x.id) === e.target.value);
                    edit(['supplier', 'supplier.name', 'supplier.code'], f => ({ ...f, clientId: e.target.value, supplier: c ? { name: c.name, code: c.code || '', vatCode: c.vatCode || '', address: '' } : f.supplier }));
                  }}>
                    <option value="">{t('docs.supplierNew')}</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ''}</option>)}
                  </select>
                  {err('supplier')}
                </label>
                {form.clientId
                  ? <p className="text-sm text-emerald-300">{t('docs.supplierMatched', { name: form.supplier.name })}</p>
                  : <>
                    <p className="rounded-lg border border-sky-800 bg-sky-950/30 p-2 text-xs text-sky-200">{t('docs.supplierWillCreate')}</p>
                    {supplierHit && (
                      <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-800 bg-emerald-950/30 p-2 text-xs text-emerald-200">
                        <span>{t('docs.supplierFound', { name: supplierHit.name })}</span>
                        <button type="button" className="rounded-lg border border-emerald-700 px-2.5 py-1 font-semibold hover:bg-emerald-950" onClick={useFoundSupplier}>{t('docs.supplierUseFound')}</button>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={`${label} sm:col-span-2`}>{t('docs.supplierName')}<input value={form.supplier.name} onChange={e => edit(['supplier.name'], f => ({ ...f, supplier: { ...f.supplier, name: e.target.value } }))} className={`${control} ${ring('supplier.name')}`} />{err('supplier.name')}</label>
                      <label className={label}>{t('docs.supplierCode')}<input value={form.supplier.code} onBlur={lookupSupplier} onChange={e => edit(['supplier.code'], f => ({ ...f, supplier: { ...f.supplier, code: e.target.value } }))} className={`${control} ${ring('supplier.code')}`} />{err('supplier.code')}</label>
                      <label className={label}>{t('docs.supplierVat')}<input value={form.supplier.vatCode} onBlur={lookupSupplier} onChange={e => edit([], f => ({ ...f, supplier: { ...f.supplier, vatCode: e.target.value } }))} className={`${control} border-slate-700`} /></label>
                      <label className={`${label} sm:col-span-2`}>{t('docs.supplierAddress')}<input value={form.supplier.address} onChange={e => edit([], f => ({ ...f, supplier: { ...f.supplier, address: e.target.value } }))} className={`${control} border-slate-700`} /></label>
                    </div>
                  </>}
              </section>

              <section className={card} aria-label={t('docs.sectionDocument')}>
                <h2 className="font-bold text-white text-sm">{t('docs.sectionDocument')}</h2>
                {preview.extracted.docKind === 'CREDIT_NOTE' && err('docKind')}
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className={label}>{t('docs.evidenceType')}
                    <select value={form.evidenceType} onChange={e => edit(['evidenceType'], f => applyEvidenceType(f, e.target.value === 'RECEIPT' ? 'RECEIPT' : 'INVOICE'))} className={`${control} border-slate-700`}>
                      <option value="INVOICE">{t('docs.evidenceInvoice')}</option><option value="RECEIPT">{t('docs.evidenceReceipt')}</option>
                    </select>
                  </label>
                  <label className={label}>{t('docs.series')}<input value={form.series} onChange={e => edit(['series'], f => ({ ...f, series: e.target.value }))} className={`${control} border-slate-700`} /></label>
                  <label className={label}>{t('docs.number')}<input value={form.number} onChange={e => edit(['number'], f => ({ ...f, number: e.target.value }))} className={`${control} ${ring('number')}`} />{err('number')}</label>
                  <label className={label}>{t('docs.issueDate')}<input type="date" value={form.issueDate} onChange={e => edit(['issueDate'], f => ({ ...f, issueDate: e.target.value }))} className={`${control} ${ring('issueDate')}`} />{err('issueDate')}</label>
                  <label className={label}>{t('docs.dueDate')}<input type="date" value={form.dueDate} onChange={e => edit(['dueDate'], f => ({ ...f, dueDate: e.target.value }))} className={`${control} ${ring('dueDate')}`} />{err('dueDate')}</label>
                  <label className={label}>{t('docs.time')}<input value={form.documentTime} placeholder="HH:MM" onChange={e => edit(['documentTime'], f => ({ ...f, documentTime: e.target.value }))} className={`${control} ${ring('documentTime')}`} />{err('documentTime')}</label>
                  {(form.evidenceType === 'RECEIPT' || form.cashRegisterNo || form.receiptNo) && <>
                    <label className={label}>{t('docs.cashRegisterNo')}<input value={form.cashRegisterNo} onChange={e => edit([], f => ({ ...f, cashRegisterNo: e.target.value }))} className={`${control} border-slate-700`} /></label>
                    <label className={label}>{t('docs.receiptNo')}<input value={form.receiptNo} onChange={e => edit(['number'], f => ({ ...f, receiptNo: e.target.value }))} className={`${control} border-slate-700`} /></label>
                  </>}
                </div>
              </section>

              <section className={card} aria-label={t('docs.sectionPayment')}>
                <h2 className="font-bold text-white text-sm">{t('docs.sectionPayment')}</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>{t('docs.paymentMethod')}
                    <select value={form.paymentMethod} onChange={e => edit(['paymentMethod', 'cardLast4'], f => ({ ...f, paymentMethod: e.target.value }))} className={`${control} ${ring('paymentMethod')}`}>
                      <option value="">—</option>
                      {['CARD', 'CASH', 'TRANSFER', 'OTHER'].map(m => <option key={m} value={m}>{t(`docs.pay_${m}`)}</option>)}
                    </select>{err('paymentMethod')}
                  </label>
                  <label className={label}>{t('docs.cardLast4')}<input inputMode="numeric" maxLength={4} value={form.cardLast4} onChange={e => edit(['cardLast4'], f => ({ ...f, cardLast4: e.target.value }))} className={`${control} ${ring('cardLast4')}`} />{err('cardLast4')}</label>
                  <label className={label}>{t('docs.paidBy')}
                    <select value={form.paidBy} onChange={e => edit(['paidBy', 'paidByName'], f => ({ ...f, paidBy: e.target.value as ReviewForm['paidBy'], paidByName: e.target.value === 'PERSON' ? f.paidByName : '' }))} className={`${control} ${ring('paidBy')}`}>
                      <option value="">—</option><option value="COMPANY">{t('docs.paidByCompany')}</option><option value="PERSON">{t('docs.paidByPerson')}</option>
                    </select>{err('paidBy')}
                  </label>
                  {form.paidBy === 'PERSON' && <label className={label}>{t('docs.paidByName')}<input value={form.paidByName} onChange={e => edit(['paidByName'], f => ({ ...f, paidByName: e.target.value }))} className={`${control} ${ring('paidByName')}`} />{err('paidByName')}</label>}
                </div>
              </section>

              <section className={card} aria-label={t('docs.sectionLines')}>
                <div className="flex items-center justify-between"><h2 className="font-bold text-white text-sm">{t('docs.sectionLines')}</h2>
                  <button type="button" className="text-xs font-semibold text-emerald-300 underline" onClick={() => edit(['lines'], f => ({ ...f, lines: [...f.lines, { itemName: '', quantity: '1', net: '', vat: '', gross: '', vatRate: '21', taxCode: '', suggestedTaxCode: null, suggestedFromPurchaseId: null }] }))}>{t('docs.addLine')}</button>
                </div>
                {err('lines')}
                {form.lines.map((l, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <div className="flex items-start gap-2">
                      <label className={`${lineLabel} flex-1`}>{t('docs.lineName')} #{i + 1}<input value={l.itemName} onChange={e => setLine(i, 'itemName', e.target.value)} className={`${control} ${ring(`lines.${i}.itemName`)}`} />{err(`lines.${i}.itemName`)}</label>
                      {form.lines.length > 1 && <button type="button" aria-label={t('docs.removeLine')} className="mt-5 text-slate-400 hover:text-rose-400" onClick={() => edit(['lines'], f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))}>✕</button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {(['quantity', 'net', 'vatRate', 'vat', 'gross'] as const).map(field => (
                        <label key={field} className={lineLabel}>{t(`docs.line_${field}`)}
                          <input inputMode="decimal" value={l[field]} onChange={e => setLine(i, field, e.target.value)} className={`${control} text-right font-mono ${ring(`lines.${i}.${field}`)}`} />
                          {err(`lines.${i}.${field}`)}
                        </label>
                      ))}
                    </div>
                    <label className={lineLabel}>{t('docs.taxCode')}
                      <select value={l.taxCode} onChange={e => setLine(i, 'taxCode', e.target.value)} className={`${control} ${ring(`lines.${i}.taxCode`)}`}>
                        <option value="">{t('docs.taxCodePick')}</option>
                        {TAX_CODES.filter(d => d.purchase).map(d => <option key={d.code} value={d.code}>{d.title[lang]}</option>)}
                      </select>
                      {err(`lines.${i}.taxCode`)}
                    </label>
                    {l.suggestedTaxCode && l.taxCode !== l.suggestedTaxCode && (
                      <button type="button" className="rounded-lg border border-emerald-700 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-950" onClick={() => setLine(i, 'taxCode', l.suggestedTaxCode as string)}>
                        {t('docs.applySuggestion')}: {l.suggestedTaxCode}{l.suggestedFromPurchaseId ? ` (${t('docs.fromPurchase', { id: l.suggestedFromPurchaseId })})` : ''}
                      </button>
                    )}
                  </div>
                ))}
              </section>

              <section className={card} aria-label={t('docs.sectionTotals')}>
                <h2 className="font-bold text-white text-sm">{t('docs.sectionTotals')}</h2>
                <div className="grid grid-cols-3 gap-3">
                  {(['net', 'vat', 'gross'] as const).map(field => (
                    <label key={field} className={label}>{t(`docs.total_${field}`)}
                      <input inputMode="decimal" value={form.totals[field]} onChange={e => edit([`totals.${field}`], f => ({ ...f, totals: { ...f.totals, [field]: e.target.value } }))} className={`${control} text-right font-mono ${ring(`totals.${field}`)}`} />
                      {err(`totals.${field}`)}
                    </label>
                  ))}
                </div>
                {nonEur && <label className="flex items-start gap-2 text-sm text-amber-100"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={form.amountsInEur} onChange={e => edit(['currency'], f => ({ ...f, amountsInEur: e.target.checked }))} /><span>{t('docs.amountsInEur', { currency: preview.extracted.currency || '' })}{err('currency')}</span></label>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>{t('docs.deduction')}
                    <input inputMode="decimal" value={form.deductionPercent} placeholder={t('docs.deductionDefault')} onChange={e => edit(['deductionPercent'], f => ({ ...f, deductionPercent: e.target.value }))} className={`${control} text-right font-mono ${ring('deductionPercent')}`} />
                    {err('deductionPercent')}
                  </label>
                  <label className={label}>{t('docs.expenseAccount')}
                    <select value={form.debitAccount} onChange={e => edit(['debitAccount'], f => ({ ...f, debitAccount: e.target.value }))} className={`${control} ${ring('debitAccount')}`}>
                      <option value="">{t('docs.expenseAccountDefault')}</option>
                      {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                    </select>
                    {err('debitAccount')}
                  </label>
                </div>
                {preview.suggestions.debitAccount && form.debitAccount !== preview.suggestions.debitAccount && (
                  <button type="button" className="rounded-lg border border-emerald-700 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-950" onClick={() => edit(['debitAccount'], f => ({ ...f, debitAccount: preview.suggestions.debitAccount as string }))}>
                    {t('docs.applySuggestion')}: {preview.suggestions.debitAccount}{preview.suggestions.debitAccountFromPurchaseId ? ` (${t('docs.fromPurchase', { id: preview.suggestions.debitAccountFromPurchaseId })})` : ''}
                  </button>
                )}
              </section>
            </fieldset>
          )}

          {preview && form && (
            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/95 p-3 backdrop-blur">
              <button type="button" disabled={!open || busy || issueCount > 0} onClick={confirm} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? t('docs.saving') : t('docs.confirm')}</button>
              <button type="button" disabled={!open || busy} onClick={reject} className={btn}>{t('docs.reject')}</button>
              {recognitionReady && preview.recognized && <button type="button" disabled={!open || busy} onClick={recognizeAgain} className={btn}>{t('docs.recognizeAgain')}</button>}
              <span className="text-xs text-slate-400" aria-live="polite">{issueCount > 0 ? t('docs.unresolved', { count: issueCount }) : t('docs.readyToConfirm')}</span>
              {preview.extracted.totals.gross !== null && <span className="ml-auto text-xs text-slate-400">{t('docs.recognizedTotal')}: €{money(preview.extracted.totals.gross)}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
