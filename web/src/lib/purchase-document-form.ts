// Form model of the purchase document review screen: conversion from the server draft, the payload for the confirmation and the
// client-side validation that mirrors the server checks (lib/purchase-recognition.ts, validateEdit). Messages are i18n keys of the
// `docs` namespace so the same checks are testable without a browser. Pure functions, no imports from the server code.

export interface FormLine { itemName: string; quantity: string; net: string; vat: string; gross: string; vatRate: string; taxCode: string; suggestedTaxCode: string | null; suggestedFromPurchaseId: number | null }
export interface ReviewForm {
  clientId: string;
  supplier: { name: string; code: string; vatCode: string; address: string };
  evidenceType: 'INVOICE' | 'RECEIPT';
  series: string; number: string; issueDate: string; dueDate: string; documentTime: string; cashRegisterNo: string; receiptNo: string;
  paymentMethod: string; cardLast4: string; paidBy: '' | 'COMPANY' | 'PERSON'; paidByName: string;
  lines: FormLine[]; totals: { net: string; vat: string; gross: string };
  deductionPercent: string; debitAccount: string; amountsInEur: boolean;
}
export interface FieldProblem { key: string; params?: Record<string, string | number> }
export interface ValidationContext { extractedSupplierCode: string | null; docKind: string | null; currency: string | null; allowedTaxCodes: string[]; companyVatPayer: boolean }

type Draft = {
  supplier?: { clientId?: unknown; name?: unknown; code?: unknown; vatCode?: unknown; address?: unknown };
  series?: unknown; number?: unknown; issueDate?: unknown; dueDate?: unknown; documentTime?: unknown; cashRegisterNo?: unknown; receiptNo?: unknown;
  evidenceType?: unknown; paymentMethod?: unknown; cardLast4?: unknown; paidBy?: unknown; paidByName?: unknown; deductionPercent?: unknown; debitAccount?: unknown; amountsInEur?: unknown;
  lines?: { itemName?: unknown; quantity?: unknown; net?: unknown; vat?: unknown; gross?: unknown; vatRate?: unknown; taxCode?: unknown; suggestedTaxCode?: unknown; suggestedFromPurchaseId?: unknown }[];
  totals?: { net?: unknown; vat?: unknown; gross?: unknown };
};
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const dateRe = /^\d{4}-\d{2}-\d{2}$/;
export const parseNumber = (v: string): number | null => {
  const text = v.trim().replace(',', '.');
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};
const validDate = (v: string) => dateRe.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
const near = (a: number, b: number, tol = 0.01 + 1e-9) => Math.abs(a - b) <= tol;
const r2 = (v: number) => Math.round(v * 100) / 100;

export function draftToForm(draft: Draft): ReviewForm {
  const sup = draft.supplier || {};
  return {
    clientId: sup.clientId === null || sup.clientId === undefined ? '' : String(sup.clientId),
    supplier: { name: s(sup.name), code: s(sup.code), vatCode: s(sup.vatCode), address: s(sup.address) },
    evidenceType: draft.evidenceType === 'RECEIPT' ? 'RECEIPT' : 'INVOICE',
    series: s(draft.series), number: s(draft.number), issueDate: s(draft.issueDate), dueDate: s(draft.dueDate), documentTime: s(draft.documentTime),
    cashRegisterNo: s(draft.cashRegisterNo), receiptNo: s(draft.receiptNo), paymentMethod: s(draft.paymentMethod), cardLast4: s(draft.cardLast4),
    paidBy: draft.paidBy === 'COMPANY' || draft.paidBy === 'PERSON' ? draft.paidBy : '', paidByName: s(draft.paidByName),
    lines: (draft.lines || []).map(l => ({
      itemName: s(l.itemName), quantity: s(l.quantity ?? 1), net: s(l.net), vat: s(l.vat), gross: s(l.gross), vatRate: s(l.vatRate), taxCode: s(l.taxCode),
      suggestedTaxCode: typeof l.suggestedTaxCode === 'string' ? l.suggestedTaxCode : null, suggestedFromPurchaseId: typeof l.suggestedFromPurchaseId === 'number' ? l.suggestedFromPurchaseId : null,
    })),
    totals: { net: s(draft.totals?.net), vat: s(draft.totals?.vat), gross: s(draft.totals?.gross) },
    deductionPercent: draft.evidenceType === 'RECEIPT' && !s(draft.deductionPercent) ? '0' : s(draft.deductionPercent),
    debitAccount: s(draft.debitAccount), amountsInEur: draft.amountsInEur === true,
  };
}

// A cash receipt without the buyer's details gives no VAT deduction: switching to a receipt fills an empty deduction with 0 so the
// user sees it (the server stores 0 for receipts anyway); switching back to an invoice clears that 0 again (empty = company regime).
export function applyEvidenceType(form: ReviewForm, evidenceType: 'INVOICE' | 'RECEIPT'): ReviewForm {
  const deduction = form.deductionPercent.trim();
  if (evidenceType === 'RECEIPT' && !deduction) return { ...form, evidenceType, deductionPercent: '0' };
  if (evidenceType === 'INVOICE' && form.evidenceType === 'RECEIPT' && deduction === '0') return { ...form, evidenceType, deductionPercent: '' };
  return { ...form, evidenceType };
}

const num = (v: string) => parseNumber(v) ?? undefined;
// Body of POST /api/purchase-documents/:id/confirm. Empty optional fields are omitted, not sent as empty strings.
export function formToPayload(form: ReviewForm) {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    supplier: { clientId: form.clientId ? Number(form.clientId) : undefined, name: form.supplier.name.trim(), code: form.supplier.code.trim(), vatCode: form.supplier.vatCode.trim(), address: form.supplier.address.trim(), create: !form.clientId },
    series: form.series.trim(), number: form.number.trim(), issueDate: form.issueDate, dueDate: opt(form.dueDate),
    lines: form.lines.map(l => ({ itemName: l.itemName.trim(), quantity: num(l.quantity), net: num(l.net), vat: num(l.vat), gross: num(l.gross), vatRate: num(l.vatRate), taxCode: l.taxCode })),
    totals: { net: num(form.totals.net), vat: num(form.totals.vat), gross: num(form.totals.gross) },
    evidenceType: form.evidenceType, documentTime: opt(form.documentTime), cashRegisterNo: opt(form.cashRegisterNo), receiptNo: opt(form.receiptNo),
    paymentMethod: opt(form.paymentMethod), cardLast4: opt(form.cardLast4), paidBy: opt(form.paidBy), paidByName: form.paidBy === 'PERSON' ? opt(form.paidByName) : undefined,
    deductionPercent: num(form.deductionPercent), debitAccount: opt(form.debitAccount), amountsInEur: form.amountsInEur,
  };
}

// Same rules and field keys as the server; a form with no problems can still be refused by the server (duplicate, period lock, ...).
export function validateForm(form: ReviewForm, ctx: ValidationContext): Record<string, FieldProblem> {
  const e: Record<string, FieldProblem> = {};
  const add = (key: string, i18n: string, params?: Record<string, string | number>) => { if (!e[key]) e[key] = { key: i18n, params }; };
  if (!form.supplier.name.trim()) add('supplier.name', 'docs.v_supplierName');
  if (!form.clientId && ctx.extractedSupplierCode?.trim() && !form.supplier.code.trim()) add('supplier.code', 'docs.v_supplierCode');
  if (!validDate(form.issueDate)) add('issueDate', 'docs.v_issueDate');
  if (form.dueDate && !validDate(form.dueDate)) add('dueDate', 'docs.v_dueDate');
  if (ctx.docKind === 'CREDIT_NOTE') add('docKind', 'docs.v_creditNote');
  if (ctx.currency && ctx.currency.toUpperCase() !== 'EUR' && !form.amountsInEur) add('currency', 'docs.v_currency', { currency: ctx.currency });
  if (!form.number.trim() && !form.receiptNo.trim()) add('number', 'docs.v_number');
  if (form.documentTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.documentTime)) add('documentTime', 'docs.v_time');
  if (form.paidBy === 'PERSON' && !form.paidByName.trim()) add('paidByName', 'docs.v_paidByName');
  if (form.cardLast4 && (!/^\d{4}$/.test(form.cardLast4) || form.paymentMethod !== 'CARD')) add('cardLast4', 'docs.v_cardLast4');

  if (!form.lines.length || form.lines.length > 1000) add('lines', 'docs.v_lines');
  let sumNet = 0, sumVat = 0, sumGross = 0, linesOk = true;
  form.lines.forEach((l, i) => {
    const k = (f: string) => `lines.${i}.${f}`;
    const n = i + 1;
    if (!l.itemName.trim()) add(k('itemName'), 'docs.v_lineName', { n });
    const quantity = l.quantity.trim() === '' ? 1 : parseNumber(l.quantity);
    if (quantity === null || quantity <= 0) add(k('quantity'), 'docs.v_lineQuantity', { n });
    const net = parseNumber(l.net), vat = parseNumber(l.vat), gross = parseNumber(l.gross), rate = parseNumber(l.vatRate);
    if (net === null) add(k('net'), 'docs.v_lineNet', { n });
    if (vat === null) add(k('vat'), 'docs.v_lineVat', { n });
    if (gross === null) add(k('gross'), 'docs.v_lineGross', { n });
    if (rate === null || rate < 0 || rate > 100) add(k('vatRate'), 'docs.v_lineRate', { n });
    if (!ctx.allowedTaxCodes.includes(l.taxCode)) add(k('taxCode'), 'docs.v_lineTaxCode', { n });
    if (net !== null && vat !== null && gross !== null) {
      if (!near(net + vat, gross)) add(k('gross'), 'docs.v_lineSum', { n });
      else if (rate !== null && !near(vat, r2(net * rate / 100))) add(k('vat'), 'docs.v_lineVatRate', { n, rate });
      sumNet += net; sumVat += vat; sumGross += gross;
    } else linesOk = false;
  });
  const tn = parseNumber(form.totals.net), tv = parseNumber(form.totals.vat), tg = parseNumber(form.totals.gross);
  if (tn === null) add('totals.net', 'docs.v_totalNet');
  if (tv === null) add('totals.vat', 'docs.v_totalVat');
  if (tg === null) add('totals.gross', 'docs.v_totalGross');
  else if (tg <= 0) add('totals.gross', 'docs.v_totalPositive');
  if (form.lines.length && linesOk && tn !== null && tv !== null && tg !== null && !Object.keys(e).some(k => k.startsWith('lines.'))) {
    const tol = 0.01 * Math.max(1, form.lines.length) + 1e-9;
    if (!near(sumNet, tn, tol)) add('totals.net', 'docs.v_sumNet');
    if (!near(sumVat, tv, tol)) add('totals.vat', 'docs.v_sumVat');
    if (!near(sumGross, tg, tol)) add('totals.gross', 'docs.v_sumGross');
    if (!near(tn + tv, tg)) add('totals.gross', 'docs.v_totalSum');
  }
  if (form.deductionPercent.trim()) {
    const d = parseNumber(form.deductionPercent);
    if (d === null || d < 0 || d > 100) add('deductionPercent', 'docs.v_deduction');
    else if (d !== 0 && !ctx.companyVatPayer) add('deductionPercent', 'docs.v_deductionNonPayer');
  }
  return e;
}

// The "low quality" guard: many uncertain fields or nothing usable in the totals.
export function isLowQuality(uncertainFields: string[], totals: { net: number | null; vat: number | null; gross: number | null }) {
  return uncertainFields.length >= 4 || (totals.net === null && totals.vat === null && totals.gross === null);
}

// The blurry-photo banner makes sense only after recognition actually ran.
export function shouldShowLowQualityBanner(preview: { recognized: boolean; uncertainFields: string[]; extracted: { totals: { net: number | null; vat: number | null; gross: number | null } } } | null) {
  return !!preview && preview.recognized === true && isLowQuality(preview.uncertainFields, preview.extracted.totals);
}

// One notice for an unrecognized document: a single message key (or none) plus whether to show the settings link.
export function manualNotice(status: string, recognitionReady: boolean): { messageKey: string | null; settingsLink: boolean } {
  if (status === 'FAILED') return { messageKey: 'docs.manualFailed', settingsLink: !recognitionReady };
  if (recognitionReady) return { messageKey: 'docs.manualNew', settingsLink: false };
  return { messageKey: null, settingsLink: true };
}
