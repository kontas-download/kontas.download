'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/client';
import { LOCALES } from '@/lib/i18n/config';
import { askConfirm } from '@/components/ConfirmHost';
import { PurchaseBankMatches } from '@/components/PurchaseBankMatches';
import { neighbourId, reviewShortcut, waitingIds } from '@/lib/review-queue';
import { TAX_CODES } from '@/lib/tax-codes';
import { applyEvidenceType, applyRuleTaxCode, draftToForm, emptyLine, eurTotals, isForeign, formToPayload, manualNotice, refillAccountForSupplier, setDebitAccount, shouldShowLowQualityBanner, validateForm, type AccountHistoryHint, type FormLine, type ReviewForm, type RuleHint } from '@/lib/purchase-document-form';

interface Totals { net: number | null; vat: number | null; gross: number | null }
interface Preview {
  recognized: boolean; draft: Parameters<typeof draftToForm>[0]; missing: Record<string, string>; warnings: string[]; uncertainFields: string[]; companyVatPayer: boolean; duplicatePurchaseId: number | null;
  duplicates: { kind: 'purchase' | 'document'; id: number; number: string; date: string; gross: number | null; strength: 'strong' | 'possible' }[];
  extracted: { docKind: string; currency: string | null; supplier: { code: string | null }; totals: Totals };
  // (credit notes) the invoice number printed on the document
  referencedDocument?: string | null;
  suggestions: { debitAccount: string | null; debitAccountFromPurchaseId: number | null; modelAccount: { code: string; reason: string } | null };
  inventoryActive: boolean; fixedAssetAccounts: { code: string; category: string | null }[]; lineStockItems: (number | null)[];
  rule?: RuleHint | null; supplierFromEmail?: string | null;
}
const ASSET_CATEGORIES = ['BUILDING', 'MACHINERY', 'VEHICLE', 'COMPUTER', 'FURNITURE', 'INTANGIBLE', 'OTHER'];
interface DocumentInfo { id: number; fileName: string; mimeType: string; status: string; error: string | null; source: string; sender: string | null; originalSender?: string | null; receivedAt: string; hasVisual?: boolean; costEur?: number | null }
// XML e-invoice (UBL) from the queue: the preview of the XML import, not a recognition draft.
interface CreditOriginalRow { id: number; number: string; series: string | null; purchaseDate: string; sumWithVat: number }
interface XmlPreview {
  kind: 'xml'; companyVatPayer: boolean; accountHistory: { account: string; number: string; date: string } | null;
  xml: {
    kind: 'invoice' | 'credit'; ok: boolean; issues: string[]; warnings: string[]; needsSupplier: boolean;
    supplier: { clientId: number | null; name: string; code: string; vatCode: string } | null;
    invoice: { number: string; issueDate: string; dueDate: string | null; net: number; vat: number; gross: number; lines: number } | null;
    credit: { reference: { number: string; issueDate: string | null } | null; original: CreditOriginalRow | null; candidates: CreditOriginalRow[]; effect: { net: number; vat: number; gross: number; deductibleVatReversed: number | null } | null } | null;
  };
}
interface Props { documentId: number; companyId: number; clients: { id: number; name: string; code: string | null; vatCode: string | null }[]; accounts: { code: string; name: string }[]; stockItems: { id: number; name: string; code: string; warehouseName: string }[]; recognitionReady: boolean }

const control = 'block mt-1 w-full rounded-lg border bg-slate-950 px-2.5 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none';
const card = 'rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-3';
const OPEN = ['NEW', 'EXTRACTED', 'FAILED'];

function OriginalViewer({ id, mimeType, fileName, hasVisual }: { id: number; mimeType: string; fileName: string; hasVisual?: boolean }) {
  const { t } = useI18n();
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [xmlSource, setXmlSource] = useState('');
  const isXml = mimeType === 'application/xml';
  // R / + / - act on the photo when focus is not in a field.
  useEffect(() => {
    if (isXml || mimeType === 'application/pdf') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]')) return;
      const target = e.target as HTMLElement | null;
      const action = reviewShortcut({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, targetTag: target?.tagName, editable: target?.isContentEditable });
      if (action === 'rotate') setRotation(r => (r + 90) % 360);
      else if (action === 'zoomIn') setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)));
      else if (action === 'zoomOut') setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isXml, mimeType]);
  // A HEIC photo is shown as the prepared JPEG copy (browsers other than Safari cannot display HEIC); the original stays downloadable from the list.
  const src = `/api/purchase-documents/${id}/file${isXml && hasVisual ? '?variant=visual' : mimeType === 'image/heic' ? '?variant=prepared' : ''}`;
  // An XML e-invoice without a PDF: the file text itself is the original shown.
  useEffect(() => {
    if (!isXml || hasVisual) return;
    let cancelled = false;
    fetch(`/api/purchase-documents/${id}/file`, { cache: 'no-store' }).then(r => r.text()).then(text => { if (!cancelled) setXmlSource(text.slice(0, 200_000)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [id, isXml, hasVisual]);
  if (isXml && !hasVisual) {
    return (
      <div className="space-y-2">
        <a className="inline-block rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800" href={src} target="_blank" rel="noreferrer">{t('docs.openOriginal')}</a>
        <pre className="h-[70vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-300 lg:h-[calc(100vh-6rem)]">{xmlSource}</pre>
      </div>
    );
  }
  if (isXml || mimeType === 'application/pdf') return <iframe title={fileName} src={src} className="h-[70vh] w-full rounded-lg border border-slate-800 bg-white lg:h-[calc(100vh-2rem)] lg:min-h-[70vh]" />;
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

export function ReviewClient({ documentId, companyId, clients, accounts, stockItems, recognitionReady }: Props) {
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
  const [queue, setQueue] = useState<number[]>([]);
  const [notDuplicate, setNotDuplicate] = useState(false);
  const [creditCandidates, setCreditCandidates] = useState<{ id: number; number: string; date: string; gross: number }[]>([]);
  const [xml, setXml] = useState<XmlPreview | null>(null);
  const [xmlOptions, setXmlOptions] = useState({ createSupplier: false, deduction: '', debitAccount: '', accountSource: '', originalId: '' });
  const [rateBusy, setRateBusy] = useState(false);
  const [rateMessage, setRateMessage] = useState('');
  const [bankPurchaseId, setBankPurchaseId] = useState<number | null>(null);
  const [supplierHit, setSupplierHit] = useState<{ id: number; name: string; code: string | null; vatCode: string | null; address: string | null; accountHistory: AccountHistoryHint | null; rule?: RuleHint | null } | null>(null);
  const [saveRule, setSaveRule] = useState(false);
  // After a confirmation the person may be offered to allow the (original) sender; `proceed` continues to the next step afterwards.
  const [allowOffer, setAllowOffer] = useState<{ address: string; proceed: () => void } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [detail, list] = await Promise.all([
      fetch(`/api/purchase-documents/${documentId}`, { cache: 'no-store' }).then(async r => ({ ok: r.ok, data: await r.json().catch(() => ({})) })),
      fetch('/api/purchase-documents', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ documents: [] })),
    ]);
    if (!detail.ok) { setMessage(detail.data.error || t('common.error')); setLoading(false); return; }
    setInfo(detail.data.document);
    if (detail.data.kind === 'xml') {
      const x = detail.data as XmlPreview;
      setXml(x); setPreview(null); setForm(null);
      setXmlOptions({ createSupplier: false, deduction: '', debitAccount: x.accountHistory?.account || '', accountSource: x.accountHistory ? 'HISTORY' : '', originalId: x.xml.credit?.original ? String(x.xml.credit.original.id) : '' });
      setLoading(false);
      setQueue(waitingIds(list.documents));
      return;
    }
    setXml(null);
    const p: Preview | null = detail.data.draft ? detail.data : null;
    setPreview(p);
    setForm(p ? draftToForm(p.draft) : null);
    setTouched({}); setServerFields({}); setSupplierHit(null); setNotDuplicate(false); setSaveRule(false);
    setQueue(waitingIds(list.documents));
    setLoading(false);
  }, [documentId, t]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data load
  useEffect(() => { load(); }, [load]);

  // A foreign currency document asks the bank for the rate of its date as soon as currency and date are known (never over a typed rate).
  const autoCurrency = form?.currency, autoDate = form?.issueDate, autoOn = Boolean(form && isForeign(form));
  useEffect(() => {
    if (!autoOn || !autoCurrency || !/^\d{4}-\d{2}-\d{2}$/.test(autoDate || '')) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/exchange-rates?currency=${encodeURIComponent(autoCurrency)}&date=${encodeURIComponent(autoDate || '')}`, { cache: 'no-store' }).catch(() => null);
      const data = res ? await res.json().catch(() => ({})) : {};
      if (cancelled) return;
      if (res?.ok) setForm(f => (f && f.rateSource !== 'MANUAL' && f.currency === autoCurrency && f.issueDate === autoDate ? { ...f, rate: String(data.rate), rateDate: data.rateDate, rateSource: 'ECB' } : f));
      else setRateMessage(data.error || t('docs.rateOffline'));
    })();
    return () => { cancelled = true; };
  }, [autoCurrency, autoDate, autoOn, t]);

  // Credit note: the supplier's purchases to pick the original from; the one whose number equals the printed reference is pre-selected (still confirmed by the person).
  const creditOn = Boolean(form?.isCredit), creditClient = form?.clientId || '', creditReference = form?.creditReference || '';
  useEffect(() => {
    if (!creditOn || !creditClient) return;
    let cancelled = false;
    fetch(`/api/purchase-documents/credit-candidates?clientId=${encodeURIComponent(creditClient)}&reference=${encodeURIComponent(creditReference)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({})).then(data => {
      if (cancelled) return;
      setCreditCandidates(data.candidates || []);
      if (data.suggestedId) setForm(f => (f && f.isCredit && f.clientId === creditClient && !f.creditOriginalId ? { ...f, creditOriginalId: String(data.suggestedId) } : f));
    });
    return () => { cancelled = true; };
  }, [creditOn, creditClient, creditReference]);

  const allowedTaxCodes = useMemo(() => TAX_CODES.filter(d => d.purchase).map(d => d.code), []);
  const errors = useMemo(() => (form && preview ? validateForm(form, { extractedSupplierCode: preview.extracted.supplier.code, docKind: preview.extracted.docKind, currency: preview.extracted.currency, allowedTaxCodes, companyVatPayer: preview.companyVatPayer, fixedAssetAccounts: preview.fixedAssetAccounts.map(a => a.code) }) : {}), [form, preview, allowedTaxCodes]);

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
  const nextId = neighbourId(queue, documentId, 1), prevId = neighbourId(queue, documentId, -1);
  const goNext = () => router.push(nextId ? `/purchase-documents/${nextId}` : '/purchase-documents');

  // Keyboard shortcuts of the fast review (see the hint line under the title). Modifier combinations work inside fields; single keys never do.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]')) return;
      const target = e.target as HTMLElement | null;
      const action = reviewShortcut({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, targetTag: target?.tagName, editable: target?.isContentEditable });
      if (action === 'confirm') {
        // The button carries the whole "allowed" condition (open, no issues, not busy), so a disabled button is simply not found.
        const button = document.querySelector<HTMLButtonElement>('button[data-review-confirm]:not(:disabled)');
        if (button) { e.preventDefault(); button.click(); }
      } else if (action === 'next' || action === 'previous') {
        const id = action === 'next' ? nextId : prevId;
        if (id) { e.preventDefault(); router.push(`/purchase-documents/${id}`); }
      } else if (action === 'back') { e.preventDefault(); router.push('/purchase-documents'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nextId, prevId, router]);

  // Typed company code / VAT code: offer the existing supplier so a manual entry does not create a duplicate.
  async function lookupSupplier() {
    if (!form || form.clientId || (!form.supplier.code.trim() && !form.supplier.vatCode.trim())) { setSupplierHit(null); return; }
    const query = new URLSearchParams({ code: form.supplier.code, vatCode: form.supplier.vatCode });
    const data = await fetch(`/api/purchase-documents/supplier-lookup?${query}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    setSupplierHit(data.supplier || null);
  }
  // A rule account the chart does not offer (any more) is left out, so the select never shows a blank for an account it cannot hold.
  const usableRule = (rule?: RuleHint | null): RuleHint | null => (rule ? { ...rule, debitAccount: rule.debitAccount && accounts.some(a => a.code === rule.debitAccount) ? rule.debitAccount : null } : null);
  function useFoundSupplier() {
    const c = supplierHit;
    if (!c) return;
    edit(['supplier', 'supplier.name', 'supplier.code'], f => applyRuleTaxCode(refillAccountForSupplier({ ...f, clientId: String(c.id), supplier: { name: c.name, code: c.code || '', vatCode: c.vatCode || '', address: c.address || '' } }, c.accountHistory, preview?.suggestions.modelAccount ?? null, usableRule(c.rule)), usableRule(c.rule), allowedTaxCodes));
    setSupplierHit(null);
  }
  // Supplier picked from the list: the expense account follows the supplier's history unless the person set it.
  async function pickSupplier(value: string) {
    const c = clients.find(x => String(x.id) === value);
    edit(['supplier', 'supplier.name', 'supplier.code'], f => ({ ...f, clientId: value, supplier: c ? { name: c.name, code: c.code || '', vatCode: c.vatCode || '', address: '' } : f.supplier }));
    const model = preview?.suggestions.modelAccount ?? null;
    setForm(f => (f && f.clientId === value ? refillAccountForSupplier(f, null, model) : f));
    if (!value) return;
    const data = await fetch(`/api/purchase-documents/supplier-lookup?clientId=${encodeURIComponent(value)}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}));
    const rule = usableRule(data.rule);
    setForm(f => (f && f.clientId === value ? applyRuleTaxCode(refillAccountForSupplier(f, data.accountHistory || null, model, rule), rule, allowedTaxCodes) : f));
  }

  async function confirm() {
    if (!form) return;
    setBusy(true); setMessage(''); setServerFields({});
    try {
      const { ok, data } = await post('confirm', { companyId, ...formToPayload(form), confirmDuplicate: notDuplicate, saveRule });
      if (!ok) { setServerFields(data.fields || {}); setMessage(data.error || t('common.error')); return; }
      // A bank line that probably paid this document is offered right away (the person still has to link it).
      const purchaseId = (data.purchase as { id?: number } | undefined)?.id;
      const proceed = async () => {
        if (purchaseId) {
          const found = await fetch(`/api/purchases/${purchaseId}/bank-matches`, { cache: 'no-store' }).then(r => r.json()).catch(() => null);
          if (found?.candidates?.length) { setBankPurchaseId(purchaseId); return; }
        }
        goNext();
      };
      if (typeof data.suggestAllowSender === 'string') { setAllowOffer({ address: data.suggestAllowSender, proceed }); return; }
      await proceed();
    } finally { setBusy(false); }
  }
  // XML credit note without a reference: the chosen original is checked by the server preview before anything is confirmed.
  async function chooseOriginal(value: string) {
    setXmlOptions(o => ({ ...o, originalId: value }));
    const res = await fetch(`/api/purchase-documents/${documentId}${value ? `?originalPurchaseId=${encodeURIComponent(value)}` : ''}`, { cache: 'no-store' });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.kind === 'xml') setXml(data);
  }
  async function confirmXml() {
    if (!xml) return;
    setBusy(true); setMessage('');
    try {
      const { ok, data } = await post('confirm', {
        companyId, createSupplier: xmlOptions.createSupplier, originalPurchaseId: xmlOptions.originalId ? Number(xmlOptions.originalId) : undefined,
        deductionPercent: xmlOptions.deduction.trim() ? Number(xmlOptions.deduction.replace(',', '.')) : undefined, debitAccount: xmlOptions.debitAccount || undefined, accountSource: xmlOptions.accountSource || undefined,
      });
      if (!ok) { setServerFields(data.fields || {}); setMessage(data.error || t('common.error')); return; }
      if (typeof data.suggestAllowSender === 'string') { setAllowOffer({ address: data.suggestAllowSender, proceed: goNext }); return; }
      goNext();
    } finally { setBusy(false); }
  }

  // ECB reference rate of the document date (or the last earlier published one). Offline: the person types the rate.
  async function fetchRate() {
    if (!form || !/^[A-Za-z]{3}$/.test(form.currency.trim()) || !form.issueDate) { setRateMessage(t('docs.rateNeedDate')); return; }
    setRateBusy(true); setRateMessage('');
    try {
      const res = await fetch(`/api/exchange-rates?currency=${encodeURIComponent(form.currency.trim())}&date=${encodeURIComponent(form.issueDate)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setRateMessage(data.error || t('common.error')); return; }
      edit(['foreign.rate'], f => ({ ...f, rate: String(data.rate), rateDate: data.rateDate, rateSource: 'ECB' }));
    } finally { setRateBusy(false); }
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

  async function answerAllow(allow: boolean) {
    const offer = allowOffer;
    if (!offer) return;
    if (allow) {
      setBusy(true);
      const res = await fetch('/api/settings/document-inbox/allow-sender', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: offer.address }) }).catch(() => null);
      setBusy(false);
      if (!res?.ok) setMessage((res && (await res.json().catch(() => ({}))).error) || t('common.error'));
    }
    setAllowOffer(null);
    offer.proceed();
  }

  if (allowOffer) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <div role="alertdialog" aria-label={t('docs.allowOfferTitle', { address: allowOffer.address })} className="space-y-3 rounded-xl border border-emerald-800 bg-emerald-950/30 p-4">
          <h2 className="font-bold text-white">{t('docs.allowOfferTitle', { address: allowOffer.address })}</h2>
          <p className="text-sm text-slate-300">{t('docs.allowOfferBody')}</p>
          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={() => { void answerAllow(true); }} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{t('docs.allowOfferYes')}</button>
            <button type="button" disabled={busy} onClick={() => { void answerAllow(false); }} className="rounded-lg border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">{t('docs.allowOfferNo')}</button>
          </div>
        </div>
      </div>
    );
  }

  if (bankPurchaseId) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-100">{t('bank.pm.afterConfirm')}</p>
        <PurchaseBankMatches purchaseId={bankPurchaseId} />
        <button type="button" onClick={goNext} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500">{t('bank.pm.continue')}</button>
      </div>
    );
  }

  if (loading && !info) return <div className="p-8 text-slate-400">{t('common.loading')}</div>;
  if (!info) return <div className="p-8 space-y-3"><p role="alert" className="text-rose-300">{message}</p><Link href="/purchase-documents" className="text-emerald-300 underline">{t('docs.backToList')}</Link></div>;

  const open = OPEN.includes(info.status);
  const issueCount = Object.keys(errors).length;
  const notice = manualNotice(info.status, recognitionReady);
  const lowQuality = shouldShowLowQualityBanner(preview);
  const nonEur = Boolean(form && form.currency.toUpperCase() !== 'EUR');
  const foreignMode = Boolean(form && isForeign(form));
  const lineLabel = 'block text-[11px] font-medium text-slate-400';
  const label = 'block text-xs font-medium text-slate-400';
  const btn = 'rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40';

  return (
    <div className="p-4 sm:p-6 max-w-[1500px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-white truncate">{t('docs.reviewTitle')}: {info.fileName}</h1>
          <p className="text-xs text-slate-400">{t(`docs.status_${info.status}`)}{info.source === 'EMAIL' && info.sender ? ` · ${info.originalSender ? t('docs.originalSender', { sender: info.sender, original: info.originalSender }) : info.sender}` : ''}{info.costEur ? ` · ${t('docs.costApprox', { cost: info.costEur.toLocaleString(LOCALES[lang], { minimumFractionDigits: 2, maximumFractionDigits: 4 }) })}` : ''}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/purchase-documents" className={btn}>{t('docs.backToList')}</Link>
          {prevId && <Link href={`/purchase-documents/${prevId}`} className={btn}>{t('docs.previous')}</Link>}
          {nextId && <Link href={`/purchase-documents/${nextId}`} className={btn}>{t('docs.next')}</Link>}
        </div>
      </div>

      <p className="hidden text-[11px] text-slate-500 sm:block">{t('docs.shortcutHint')}</p>
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

      {open && (preview?.duplicates.length || serverFields.confirmDuplicate) ? (
        <div role="alert" className={`rounded-xl border p-3 text-sm ${preview?.duplicates.some(d => d.strength === 'strong') || serverFields.confirmDuplicate ? 'border-rose-700 bg-rose-950/40 text-rose-100' : 'border-amber-800 bg-amber-950/30 text-amber-100'}`}>
          <strong>{t('docs.dupTitle')}</strong>
          <ul className="mt-1 space-y-0.5">
            {(preview?.duplicates || []).map(d => (
              <li key={`${d.kind}-${d.id}`}>
                <span className="font-semibold">{t(d.strength === 'strong' ? 'docs.dupStrong' : 'docs.dupPossible')}</span>{' '}
                <Link href={d.kind === 'document' ? `/purchase-documents/${d.id}` : '/purchases'} className="underline">{t(d.kind === 'document' ? 'docs.dupInQueue' : 'docs.dupInPurchases', { number: d.number || `#${d.id}` })}</Link>
                {d.date ? ` · ${d.date}` : ''}{d.gross !== null ? ` · €${money(d.gross)}` : ''}
              </li>
            ))}
          </ul>
          {(preview?.duplicates.some(d => d.strength === 'strong') || serverFields.confirmDuplicate) && (
            <label className="mt-2 flex items-start gap-2 font-semibold"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={notDuplicate} onChange={e => setNotDuplicate(e.target.checked)} /><span>{t('docs.dupConfirm')}</span></label>
          )}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start"><OriginalViewer id={info.id} mimeType={info.mimeType} fileName={info.fileName} hasVisual={info.hasVisual} /></div>

        <div className="space-y-4">
          {preview && !preview.recognized && open && (
            <div className={card}>
              {notice.messageKey && <p className="text-sm text-slate-300">{t(notice.messageKey)}</p>}
              {notice.settingsLink && <p className="text-sm text-amber-200">{t('docs.notReady')} <Link href="/settings/api" className="underline">{t('docs.notReadyLink')}</Link></p>}
              {recognitionReady && <div><button disabled={busy} onClick={recognizeAgain} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? t('docs.recognizingShort') : t('docs.recognize')}</button></div>}
            </div>
          )}

          {xml && (
            <>
              <fieldset disabled={!open || busy} className="space-y-4 disabled:opacity-70">
                <section className={card} aria-label={t('docs.xmlTitle')}>
                  <h2 className="font-bold text-white text-sm">{t('docs.xmlTitle')}</h2>
                  <p className="text-xs text-slate-400">{t(info.hasVisual ? 'docs.xmlIntroPdf' : 'docs.xmlIntro')}</p>
                  {xml.xml.issues.length > 0 && <ul role="alert" className="list-disc space-y-0.5 rounded-lg border border-rose-800 bg-rose-950/40 p-3 pl-7 text-sm text-rose-200">{xml.xml.issues.map(i => <li key={i}>{i}</li>)}</ul>}
                  {xml.xml.warnings.length > 0 && <ul role="note" className="list-disc space-y-0.5 rounded-lg border border-amber-800 bg-amber-950/30 p-3 pl-7 text-sm text-amber-100">{xml.xml.warnings.map(w => <li key={w}>{w}</li>)}</ul>}
                  {xml.xml.supplier && <p className="text-sm text-slate-200"><span className="text-slate-400">{t('docs.sectionSupplier')}: </span>{xml.xml.supplier.name}{xml.xml.supplier.code ? ` (${xml.xml.supplier.code})` : ''} · {xml.xml.supplier.clientId ? <span className="text-emerald-300">{t('docs.xmlSupplierKnown')}</span> : <span className="text-sky-300">{t('docs.xmlSupplierNew')}</span>}</p>}
                  {xml.xml.invoice && (
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                      <div><dt className="text-[11px] text-slate-400">{xml.xml.kind === 'credit' ? t('docs.xmlKindCredit') : t('docs.number')}</dt><dd className="text-slate-100">{xml.xml.invoice.number}</dd></div>
                      <div><dt className="text-[11px] text-slate-400">{t('docs.issueDate')}</dt><dd className="text-slate-100">{xml.xml.invoice.issueDate}</dd></div>
                      <div><dt className="text-[11px] text-slate-400">{t('docs.dueDate')}</dt><dd className="text-slate-100">{xml.xml.invoice.dueDate || '—'}</dd></div>
                      <div><dt className="text-[11px] text-slate-400">{t('docs.total_net')}</dt><dd className="font-mono text-slate-100">€{money(xml.xml.invoice.net)}</dd></div>
                      <div><dt className="text-[11px] text-slate-400">{t('docs.total_vat')}</dt><dd className="font-mono text-slate-100">€{money(xml.xml.invoice.vat)}</dd></div>
                      <div><dt className="text-[11px] text-slate-400">{t('docs.total_gross')}</dt><dd className="font-mono text-slate-100">€{money(xml.xml.invoice.gross)}</dd></div>
                      <div><dt className="text-[11px] text-slate-400">{t('docs.xmlLines')}</dt><dd className="text-slate-100">{xml.xml.invoice.lines}</dd></div>
                    </dl>
                  )}
                  {xml.xml.needsSupplier && <label className="flex items-start gap-2 text-sm text-sky-100"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={xmlOptions.createSupplier} onChange={e => setXmlOptions(o => ({ ...o, createSupplier: e.target.checked }))} /><span>{t('docs.xmlCreateSupplier')}</span></label>}
                </section>
                {xml.xml.credit && (
                  <section className={card} aria-label={t('docs.creditOriginal')}>
                    <h2 className="font-bold text-white text-sm">{t('docs.creditOriginal')}</h2>
                    {xml.xml.credit.reference && <p className="text-xs text-slate-300">{t('docs.creditReference', { number: xml.xml.credit.reference.number })}</p>}
                    {xml.xml.credit.original
                      ? <p className="text-sm text-emerald-300">{(xml.xml.credit.original.series || '') + xml.xml.credit.original.number} · {xml.xml.credit.original.purchaseDate} · €{money(xml.xml.credit.original.sumWithVat)}</p>
                      : xml.xml.credit.candidates.length > 0 && (
                        <label className={label}>{t('docs.creditOriginalPick')}
                          <select value={xmlOptions.originalId} onChange={e => { void chooseOriginal(e.target.value); }} className={`${control} border-slate-700`}>
                            <option value="">{t('docs.creditOriginalPick')}</option>
                            {xml.xml.credit.candidates.map(c => <option key={c.id} value={c.id}>{(c.series || '') + c.number} · {c.purchaseDate} · €{money(c.sumWithVat)}</option>)}
                          </select>
                        </label>
                      )}
                    {xml.xml.credit.effect && <p className="text-xs text-slate-300">{t('docs.xmlCreditEffect', { net: money(xml.xml.credit.effect.net), vat: money(xml.xml.credit.effect.vat), gross: money(xml.xml.credit.effect.gross) })}</p>}
                  </section>
                )}
                {xml.xml.kind === 'invoice' && (
                  <section className={card} aria-label={t('docs.sectionTotals')}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className={label}>{t('docs.deduction')}
                        <input inputMode="decimal" value={xmlOptions.deduction} placeholder={t('docs.deductionDefault')} onChange={e => setXmlOptions(o => ({ ...o, deduction: e.target.value }))} className={`${control} border-slate-700 text-right font-mono`} />
                        {serverFields.deductionPercent && <span role="alert" className="mt-0.5 block text-[11px] text-amber-300">{serverFields.deductionPercent}</span>}
                      </label>
                      <label className={label}>{t('docs.expenseAccount')}
                        <select value={xmlOptions.debitAccount} onChange={e => setXmlOptions(o => ({ ...o, debitAccount: e.target.value, accountSource: 'USER' }))} className={`${control} border-slate-700`}>
                          <option value="">{t('docs.expenseAccountDefault')}</option>
                          {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                        </select>
                        {xmlOptions.debitAccount && xmlOptions.accountSource === 'HISTORY' && xml.accountHistory && <span className="mt-0.5 block text-[11px] text-emerald-300">{t('docs.accountFromHistory', { number: xml.accountHistory.number, date: xml.accountHistory.date })}</span>}
                      </label>
                    </div>
                  </section>
                )}
              </fieldset>
              <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/95 p-3 backdrop-blur">
                <button type="button" data-review-confirm disabled={!open || busy || !xml.xml.ok || (xml.xml.needsSupplier && !xmlOptions.createSupplier)} onClick={confirmXml} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? t('docs.saving') : t('docs.confirm')}</button>
                <button type="button" disabled={!open || busy} onClick={reject} className={btn}>{t('docs.reject')}</button>
                <span className="text-xs text-slate-400" aria-live="polite">{xml.xml.ok ? t('docs.readyToConfirm') : t('docs.unresolved', { count: xml.xml.issues.length })}</span>
              </div>
            </>
          )}

          {preview && form && open && preview.rule && <p role="note" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-100">{t('docs.ruleApplied', { name: preview.rule.name })} <Link href="/purchase-documents/rules" className="underline">{t('docs.rulesLink')}</Link></p>}
          {preview && form && open && preview.supplierFromEmail && <p role="note" className="rounded-xl border border-sky-800 bg-sky-950/30 p-3 text-sm text-sky-100">{t('docs.supplierFromEmail', { address: preview.supplierFromEmail })}</p>}
          {preview && form && (
            <fieldset disabled={!open || busy} className="space-y-4 disabled:opacity-70">
              <section className={card} aria-label={t('docs.sectionSupplier')}>
                <h2 className="font-bold text-white text-sm">{t('docs.sectionSupplier')}</h2>
                <label className={label}>{t('docs.supplierPick')}
                  <select value={form.clientId} className={`${control} ${ring('supplier')}`} onChange={e => { void pickSupplier(e.target.value); }}>
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
                <div className="space-y-2 rounded-lg border border-slate-800 p-3">
                  <label className="flex items-start gap-2 text-sm text-slate-200"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={form.isCredit} onChange={e => edit(['credit.original'], f => ({ ...f, isCredit: e.target.checked, creditOriginalId: '' }))} /><span>{t('docs.isCredit')}</span></label>
                  {form.isCredit && (
                    <>
                      <p className="text-xs text-slate-400">{t('docs.creditIntro')}</p>
                      {form.creditReference && <p className="text-xs text-slate-300">{t('docs.creditReference', { number: form.creditReference })}</p>}
                      {!form.clientId && <p className="text-xs text-amber-200">{t('docs.creditNeedSupplier')}</p>}
                      <label className={label}>{t('docs.creditOriginal')}
                        <select value={form.creditOriginalId} onChange={e => edit(['credit.original', 'credit'], f => ({ ...f, creditOriginalId: e.target.value }))} className={`${control} ${ring('credit.original')}`}>
                          <option value="">{t('docs.creditOriginalPick')}</option>
                          {creditCandidates.map(c => <option key={c.id} value={c.id}>{c.number} · {c.date} · €{money(c.gross)}</option>)}
                        </select>
                        {err('credit.original')}{err('credit')}
                      </label>
                    </>
                  )}
                </div>
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
                  <label className={label}>{t('docs.currency')}<input value={form.currency} maxLength={3} onChange={e => edit(['foreign.currency', 'foreign.rate'], f => ({ ...f, currency: e.target.value.toUpperCase(), rate: '', rateDate: '', rateSource: '' }))} className={`${control} ${ring('foreign.currency')}`} />{err('foreign.currency')}</label>
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
                  <button type="button" className="text-xs font-semibold text-emerald-300 underline" onClick={() => edit(['lines'], f => ({ ...f, lines: [...f.lines, emptyLine()] }))}>{t('docs.addLine')}</button>
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
                    {preview.inventoryActive && (
                      <div className="space-y-1">
                        <label className={lineLabel}>{t('docs.stockMode')}
                          <select value={l.stockMode} onChange={e => setLine(i, 'stockMode', e.target.value)} className={`${control} border-slate-700`}>
                            <option value="">{t('docs.stockNone')}</option><option value="EXISTING">{t('docs.stockExisting')}</option><option value="NEW">{t('docs.stockNew')}</option>
                          </select>
                        </label>
                        {l.stockMode === 'EXISTING' && (
                          <label className={lineLabel}>{t('docs.stockCard')}
                            <select value={l.stockItemId} onChange={e => setLine(i, 'stockItemId', e.target.value)} className={`${control} ${ring(`lines.${i}.stock`)}`}>
                              <option value="">{t('docs.stockPick')}</option>
                              {stockItems.map(c => <option key={c.id} value={c.id}>{c.name} ({c.code}{c.warehouseName && c.warehouseName !== 'Pagrindinis' ? `, ${c.warehouseName}` : ''})</option>)}
                            </select>
                          </label>
                        )}
                        {l.stockMode === 'NEW' && <label className={lineLabel}>{t('docs.stockNewCode')}<input value={l.stockCode} onChange={e => setLine(i, 'stockCode', e.target.value)} className={`${control} ${ring(`lines.${i}.stock`)}`} /></label>}
                        {l.stockMode !== 'EXISTING' && preview.lineStockItems[i] && stockItems.some(c => c.id === preview.lineStockItems[i]) && (
                          <button type="button" className="rounded-lg border border-emerald-700 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-950" onClick={() => edit([`lines.${i}.stock`], f => ({ ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, stockMode: 'EXISTING', stockItemId: String(preview.lineStockItems[i]) } : x)) }))}>
                            {t('docs.applySuggestion')}: {stockItems.find(c => c.id === preview.lineStockItems[i])?.name}
                          </button>
                        )}
                        {err(`lines.${i}.stock`)}
                      </div>
                    )}
                    {preview.fixedAssetAccounts.some(a => a.code === form.debitAccount.trim()) && (
                      <div className="space-y-2 rounded-lg border border-slate-800 p-2">
                        <label className="flex items-start gap-2 text-sm text-slate-200"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={l.assetCreate} onChange={e => edit([`lines.${i}.asset`], f => ({ ...f, lines: f.lines.map((x, j) => (j === i ? { ...x, assetCreate: e.target.checked, assetCategory: x.assetCategory || preview.fixedAssetAccounts.find(a => a.code === f.debitAccount.trim())?.category || '', assetCommissioning: x.assetCommissioning || f.issueDate } : x)) }))} /><span>{t('docs.assetCreate')}</span></label>
                        {l.assetCreate && (
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <label className={lineLabel}>{t('docs.assetCategory')}
                              <select value={l.assetCategory} onChange={e => setLine(i, 'assetCategory', e.target.value)} className={`${control} ${ring(`lines.${i}.asset`)}`}>
                                <option value="">—</option>
                                {ASSET_CATEGORIES.map(c => <option key={c} value={c}>{t(`docs.assetCat_${c}`)}</option>)}
                              </select>
                            </label>
                            <label className={lineLabel}>{t('docs.assetLife')}<input inputMode="numeric" value={l.assetLife} placeholder={t('docs.assetLifeDefault')} onChange={e => setLine(i, 'assetLife', e.target.value)} className={`${control} text-right font-mono border-slate-700`} /></label>
                            <label className={lineLabel}>{t('docs.assetCommissioning')}<input type="date" value={l.assetCommissioning} onChange={e => setLine(i, 'assetCommissioning', e.target.value)} className={`${control} border-slate-700`} /></label>
                            <label className={lineLabel}>{t('docs.assetCode')}<input value={l.assetCode} placeholder={t('docs.assetCodeAuto')} onChange={e => setLine(i, 'assetCode', e.target.value)} className={`${control} border-slate-700`} /></label>
                          </div>
                        )}
                        {l.assetCreate && <p className="text-[11px] text-slate-400">{t('docs.assetHint')}</p>}
                        {err(`lines.${i}.asset`)}
                      </div>
                    )}
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
                {nonEur && (
                  <div className="space-y-2 rounded-lg border border-amber-800 bg-amber-950/20 p-3">
                    <label className="flex items-start gap-2 text-sm text-amber-100"><input type="checkbox" className="mt-1 h-4 w-4 accent-emerald-500" checked={form.amountsInEur} onChange={e => edit(['currency'], f => ({ ...f, amountsInEur: e.target.checked }))} /><span>{t('docs.amountsInEur', { currency: form.currency })}{err('currency')}</span></label>
                    {foreignMode && (
                      <>
                        <p className="text-xs text-amber-100">{t('docs.foreignIntro', { currency: form.currency })}</p>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <label className={label}>{t('docs.rate', { currency: form.currency })}
                            <input inputMode="decimal" value={form.rate} onChange={e => edit(['foreign.rate'], f => ({ ...f, rate: e.target.value, rateSource: 'MANUAL' }))} className={`${control} text-right font-mono ${ring('foreign.rate')}`} />
                            {err('foreign.rate')}
                          </label>
                          <div className={label}>{t('docs.rateDate')}
                            <div className="mt-1 py-2 text-sm text-slate-200">{form.rateDate || '—'}{form.rateSource ? ` · ${t(`docs.rateSource_${form.rateSource}`)}` : ''}</div>
                          </div>
                          <div className="flex items-end"><button type="button" disabled={rateBusy} onClick={fetchRate} className="rounded-lg border border-emerald-700 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-950 disabled:opacity-40">{rateBusy ? t('docs.rateFetching') : t('docs.rateFetch')}</button></div>
                        </div>
                        {rateMessage && <p role="status" className="text-xs text-amber-200">{rateMessage}</p>}
                        {(() => { const eur = eurTotals(form); return eur ? <p className="text-sm text-slate-100">{t('docs.eurAmounts')}: {t('docs.total_net')} €{money(eur.net)} · {t('docs.total_vat')} €{money(eur.vat)} · {t('docs.total_gross')} €{money(eur.gross)}</p> : null; })()}
                        <p className="text-[11px] text-slate-400">{t('docs.rateRule')}</p>
                      </>
                    )}
                  </div>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={label}>{t('docs.deduction')}
                    <input inputMode="decimal" value={form.deductionPercent} placeholder={t('docs.deductionDefault')} onChange={e => edit(['deductionPercent'], f => ({ ...f, deductionPercent: e.target.value }))} className={`${control} text-right font-mono ${ring('deductionPercent')}`} />
                    {err('deductionPercent')}
                  </label>
                  <label className={label}>{t('docs.expenseAccount')}
                    <select value={form.debitAccount} onChange={e => edit(['debitAccount'], f => setDebitAccount(f, e.target.value))} className={`${control} ${ring('debitAccount')}`}>
                      <option value="">{t('docs.expenseAccountDefault')}</option>
                      {accounts.map(a => <option key={a.code} value={a.code}>{a.code} — {a.name}</option>)}
                    </select>
                    {err('debitAccount')}
                    {form.debitAccount && form.accountSource === 'HISTORY' && form.accountInfo && <span className="mt-0.5 block text-[11px] text-emerald-300">{t('docs.accountFromHistory', { number: form.accountInfo.number || '', date: form.accountInfo.date || '' })}</span>}
                    {form.debitAccount && form.accountSource === 'RULE' && form.accountInfo && <span className="mt-0.5 block text-[11px] text-emerald-300">{t('docs.accountFromRule', { name: form.accountInfo.ruleName || '' })}</span>}
                    {form.debitAccount && form.accountSource === 'MODEL' && form.accountInfo && <span className="mt-0.5 block text-[11px] text-sky-300">{t('docs.accountFromModel', { reason: form.accountInfo.reason || '' })}</span>}
                  </label>
                </div>
                {preview.suggestions.debitAccount && form.debitAccount !== preview.suggestions.debitAccount && (
                  <button type="button" className="rounded-lg border border-emerald-700 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-950" onClick={() => edit(['debitAccount'], f => setDebitAccount(f, preview.suggestions.debitAccount as string))}>
                    {t('docs.applySuggestion')}: {preview.suggestions.debitAccount}{preview.suggestions.debitAccountFromPurchaseId ? ` (${t('docs.fromPurchase', { id: preview.suggestions.debitAccountFromPurchaseId })})` : ''}
                  </button>
                )}
              </section>
            </fieldset>
          )}

          {preview && form && (
            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/95 p-3 backdrop-blur">
              <button type="button" data-review-confirm disabled={!open || busy || issueCount > 0 || (Boolean(preview.duplicates.some(d => d.strength === 'strong')) && !notDuplicate)} onClick={confirm} className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">{busy ? t('docs.saving') : t('docs.confirm')}</button>
              <button type="button" disabled={!open || busy} onClick={reject} className={btn}>{t('docs.reject')}</button>
              {recognitionReady && preview.recognized && <button type="button" disabled={!open || busy} onClick={recognizeAgain} className={btn}>{t('docs.recognizeAgain')}</button>}
              <span className="text-xs text-slate-400" aria-live="polite">{issueCount > 0 ? t('docs.unresolved', { count: issueCount }) : t('docs.readyToConfirm')}</span>
              {open && !form.isCredit && <label className="flex w-full items-start gap-2 text-xs text-slate-300"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-500" checked={saveRule} disabled={busy} onChange={e => setSaveRule(e.target.checked)} /><span>{t('docs.saveRule')}<span className="block text-slate-500">{t('docs.saveRuleHint')}</span></span></label>}
              {preview.extracted.totals.gross !== null && <span className="ml-auto text-xs text-slate-400">{t('docs.recognizedTotal')}: €{money(preview.extracted.totals.gross)}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
