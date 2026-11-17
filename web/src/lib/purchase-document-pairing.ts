import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
import { parseUblInvoice } from './ubl-invoice';
import { readDocumentFile, NOT_FINAL, confirmDocument, getDocument, isXmlDocument, parseExtracted, publicRow, type ConfirmInput, type PurchaseDocumentRow } from './purchase-recognition';
import { attachDocumentToPurchase } from './purchase-document-attach';

// An invoice and a receipt for the same purchase that arrive together (one e-mail, one upload with several files) are paired: the receipt waits
// beside its invoice and is attached to the purchase as the payment receipt when the invoice is confirmed.

export const BATCH_NOTE = 'Gauti kartu — patikrinkite, ar tai tas pats pirkimas';
const DATE_WINDOW_DAYS = 3;
const EPS = 0.01 + 1e-9;
const alnum = (v: string | null | undefined) => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

export interface PairFacts { kind: 'INVOICE' | 'RECEIPT'; code: string; vatCode: string; name: string; gross: number | null; date: string | null }

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10) + 'T00:00:00Z') - Date.parse(b.slice(0, 10) + 'T00:00:00Z')) / 86400000;

// Pure rule: same supplier (code or VAT code; else the normalized name), the same gross within 0.01 and dates within 3 days.
export function pairMatches(invoice: PairFacts, receipt: PairFacts): boolean {
  const sameCode = (a: string, b: string) => Boolean(alnum(a)) && alnum(a) === alnum(b);
  let supplier = sameCode(invoice.code, receipt.code) || sameCode(invoice.vatCode, receipt.vatCode);
  if (!supplier) {
    // Differing identifying codes mean different suppliers; the name decides only when a side carries none.
    const bothCoded = (alnum(invoice.code) && alnum(receipt.code)) || (alnum(invoice.vatCode) && alnum(receipt.vatCode));
    supplier = !bothCoded && Boolean(alnum(invoice.name)) && alnum(invoice.name) === alnum(receipt.name);
  }
  if (!supplier) return false;
  if (invoice.gross === null || receipt.gross === null || Math.abs(Math.abs(invoice.gross) - Math.abs(receipt.gross)) > EPS) return false;
  if (invoice.date && receipt.date && dayDiff(invoice.date, receipt.date) > DATE_WINDOW_DAYS) return false;
  return true;
}

// The decision for the recognized documents of one batch: exactly one invoice and one receipt that match = a pair; any other combination of
// at least one invoice and one receipt = no pair, a note for all of them.
export function decidePairing(items: { id: number; facts: PairFacts }[]): { pair: { invoiceId: number; receiptId: number } | null; noteIds: number[] } {
  const invoices = items.filter(i => i.facts.kind === 'INVOICE');
  const receipts = items.filter(i => i.facts.kind === 'RECEIPT');
  if (!invoices.length || !receipts.length) return { pair: null, noteIds: [] };
  if (invoices.length === 1 && receipts.length === 1 && pairMatches(invoices[0].facts, receipts[0].facts)) return { pair: { invoiceId: invoices[0].id, receiptId: receipts[0].id }, noteIds: [] };
  return { pair: null, noteIds: [...invoices, ...receipts].map(i => i.id) };
}

function factsOf(companyId: number, row: PurchaseDocumentRow): PairFacts | null {
  if (isXmlDocument(row)) {
    try {
      const inv = parseUblInvoice(readDocumentFile(companyId, row.id).data.toString('utf8').replace(/^﻿/, '')).invoice;
      if (!inv || inv.kind === 'credit') return null;
      return { kind: 'INVOICE', code: inv.supplier.regNumber || '', vatCode: inv.supplier.vatCode || '', name: inv.supplier.name || '', gross: inv.totals.gross, date: inv.issueDate };
    } catch { return null; }
  }
  const x = parseExtracted(row);
  if (!x || (x.docKind !== 'INVOICE' && x.docKind !== 'RECEIPT')) return null;
  return { kind: x.docKind, code: x.supplier.code || '', vatCode: x.supplier.vatCode || '', name: x.supplier.name || '', gross: x.totals.gross, date: x.issueDate || null };
}

// Re-evaluates one batch (idempotent; called after every recognition). Only recognized, still open documents take part. Splitting a pair
// clears the batchId of both documents, so the decision of the person is never undone.
export function pairBatch(companyId: number, batchId: string | null | undefined): void {
  if (!batchId) return;
  const db = getDb();
  db.transaction(() => {
    const all = (db.prepare('SELECT * FROM PurchaseDocument WHERE companyId=? AND batchId=? ORDER BY id').all(companyId, batchId) as PurchaseDocumentRow[]).filter(r => NOT_FINAL.includes(r.status));
    // A pair made by the person is never re-decided by the rule.
    const manual = new Set(all.filter(r => r.pairManual && r.pairedWithId).flatMap(r => [r.id, r.pairedWithId as number]));
    const rows = all.filter(r => !manual.has(r.id));
    const items = rows.flatMap(r => { const facts = factsOf(companyId, r); return facts ? [{ id: r.id, facts }] : []; });
    const clear = db.prepare('UPDATE PurchaseDocument SET pairedWithId=NULL, pairNote=NULL WHERE id=? AND companyId=?');
    for (const i of items) clear.run(i.id, companyId);
    const { pair, noteIds } = decidePairing(items);
    if (pair) db.prepare('UPDATE PurchaseDocument SET pairedWithId=? WHERE id=? AND companyId=?').run(pair.invoiceId, pair.receiptId, companyId);
    for (const id of noteIds) db.prepare('UPDATE PurchaseDocument SET pairNote=? WHERE id=? AND companyId=?').run(BATCH_NOTE, id, companyId);
  })();
}

// The receipt paired with an invoice (still waiting), or the invoice a receipt is paired with, for the review screen.
export function pairingOf(companyId: number, id: number) {
  const db = getDb();
  const row = getDocument(companyId, id);
  const receipt = db.prepare("SELECT id FROM PurchaseDocument WHERE companyId=? AND pairedWithId=? AND status IN ('NEW','EXTRACTED','FAILED')").get(companyId, id) as { id: number } | undefined;
  let receiptInfo: { id: number; fileName: string; mimeType: string; gross: number | null; supplier: string | null } | null = null;
  if (receipt) {
    const r = getDocument(companyId, receipt.id);
    const x = parseExtracted(r);
    receiptInfo = { id: r.id, fileName: r.fileName, mimeType: r.mimeType, gross: x?.totals.gross ?? null, supplier: x?.supplier.name ?? null };
  }
  // Open documents of the same batch that are not paired with anything: candidates for a manual pair.
  const siblings = row.batchId && !row.pairedWithId && !receipt
    ? (db.prepare(`SELECT id, fileName, mimeType FROM PurchaseDocument WHERE companyId=? AND batchId=? AND id<>? AND status IN ('NEW','EXTRACTED','FAILED') AND pairedWithId IS NULL
        AND NOT EXISTS (SELECT 1 FROM PurchaseDocument p WHERE p.pairedWithId=PurchaseDocument.id AND p.companyId=PurchaseDocument.companyId) ORDER BY id`).all(companyId, row.batchId, id) as { id: number; fileName: string; mimeType: string }[])
    : [];
  // Other originals of the same purchase (after confirmation: the attached payment receipt or attachments), shown next to this one.
  const related = row.purchaseId
    ? (db.prepare('SELECT id, fileName, mimeType, role FROM PurchaseDocument WHERE companyId=? AND purchaseId=? AND id<>? ORDER BY id').all(companyId, row.purchaseId, id) as { id: number; fileName: string; mimeType: string; role: string | null }[])
    : [];
  return { receipt: receiptInfo, pairedWithId: row.pairedWithId, note: row.pairNote, siblings, related };
}

// The person pairs two open documents of the company: `receiptId` becomes the payment receipt of `invoiceId`. No amount comparison (the person
// decides); the pair is marked manual so that confirming the invoice attaches the receipt even without recognition data.
export function pairManually(companyId: number, invoiceId: number, receiptId: number) {
  const db = getDb();
  return db.transaction(() => {
    if (invoiceId === receiptId) throw new HttpError(400, 'Dokumento negalima sujungti su pačiu savimi');
    const invoice = getDocument(companyId, invoiceId);
    const receipt = getDocument(companyId, receiptId);
    if (!NOT_FINAL.includes(invoice.status) || !NOT_FINAL.includes(receipt.status)) throw new HttpError(409, 'Sujungti galima tik dar neapdorotus dokumentus');
    const linked = (id: number) => Boolean(db.prepare("SELECT 1 FROM PurchaseDocument WHERE companyId=? AND (id=? AND pairedWithId IS NOT NULL OR pairedWithId=?) AND status IN ('NEW','EXTRACTED','FAILED')").get(companyId, id, id));
    if (linked(invoiceId) || linked(receiptId)) throw new HttpError(409, 'Vienas iš dokumentų jau sujungtas su kitu — pirmiausia atskirkite');
    db.prepare('UPDATE PurchaseDocument SET pairedWithId=?, pairNote=NULL, pairManual=1 WHERE id=? AND companyId=?').run(invoiceId, receiptId, companyId);
    db.prepare('UPDATE PurchaseDocument SET pairNote=NULL WHERE id=? AND companyId=?').run(invoiceId, companyId);
    return { document: publicRow(getDocument(companyId, invoiceId)), receipt: publicRow(getDocument(companyId, receiptId)) };
  })();
}

// Splits a pair (called on the invoice or on the receipt): both documents leave the batch and become ordinary queue items.
export function unpairDocument(companyId: number, id: number) {
  const db = getDb();
  return db.transaction(() => {
    const row = getDocument(companyId, id);
    const invoiceId = row.pairedWithId ?? id;
    const receipt = db.prepare("SELECT id FROM PurchaseDocument WHERE companyId=? AND pairedWithId=? AND status IN ('NEW','EXTRACTED','FAILED')").get(companyId, invoiceId) as { id: number } | undefined;
    if (!receipt) throw new HttpError(404, 'Dokumentas neturi pririšto kvito');
    db.prepare('UPDATE PurchaseDocument SET pairedWithId=NULL, pairNote=NULL, batchId=NULL, pairManual=NULL WHERE companyId=? AND id IN (?,?)').run(companyId, invoiceId, receipt.id);
    return { document: publicRow(getDocument(companyId, invoiceId)), receipt: publicRow(getDocument(companyId, receipt.id)) };
  })();
}

export interface PairedReceiptOutcome { attached: boolean; receiptId: number; manual?: boolean; reason?: 'MISMATCH' | 'ERROR'; message?: string }

// Confirms the invoice and, right after, attaches its paired receipt as the payment receipt of the new purchase. The receipt is attached only
// when it still matches the confirmed purchase (supplier and total); otherwise it stays in the queue with the note. A failure of the receipt
// never undoes the confirmed invoice: it is reported in `pairedReceipt`.
export function confirmDocumentWithPair(companyId: number, id: number, userId: number | null, input: ConfirmInput) {
  const db = getDb();
  const receipt = db.prepare("SELECT id, pairManual FROM PurchaseDocument WHERE companyId=? AND pairedWithId=? AND status IN ('NEW','EXTRACTED','FAILED')").get(companyId, id) as { id: number; pairManual: number | null } | undefined;
  const manual = Boolean(receipt?.pairManual);
  const result = confirmDocument(companyId, id, userId, input);
  if (!receipt) return { ...result, pairedReceipt: null as PairedReceiptOutcome | null };
  const purchaseId = (result.purchase as { id: number }).id;
  let outcome: PairedReceiptOutcome;
  try {
    // A manual pair is the explicit decision of the person: the supplier/total comparison is skipped (there may be no recognition data at all).
    const attached = attachDocumentToPurchase(companyId, receipt.id, purchaseId, 'PAYMENT_RECEIPT', userId, { confirmMismatch: manual });
    db.prepare('UPDATE PurchaseDocument SET pairedWithId=NULL, pairNote=NULL, pairManual=NULL WHERE id=? AND companyId=?').run(receipt.id, companyId);
    outcome = { attached: true, receiptId: receipt.id, ...(manual ? { manual: true } : {}) };
    Object.assign(outcome, { enriched: attached.enriched, settlement: attached.settlement });
  } catch (error) {
    const mismatch = (error as { mismatch?: unknown }).mismatch;
    releaseReceipt(db, companyId, receipt.id);
    outcome = mismatch
      ? { attached: false, receiptId: receipt.id, reason: 'MISMATCH' }
      : { attached: false, receiptId: receipt.id, reason: 'ERROR', message: error instanceof Error ? error.message : 'Klaida' };
  }
  return { ...result, pairedReceipt: outcome };
}

// The receipt returns to the queue as an ordinary item with the note to check it.
function releaseReceipt(db: Database.Database, companyId: number, receiptId: number) {
  db.prepare('UPDATE PurchaseDocument SET pairedWithId=NULL, pairNote=?, pairManual=NULL WHERE id=? AND companyId=?').run(BATCH_NOTE, receiptId, companyId);
}
