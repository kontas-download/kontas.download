import { normalizeTimeOfDay } from './time-of-day';
import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
import { companyTaxMode, taxMode } from './tax';
import { findSupplierId } from './purchase-import';
import { openDocuments, settleManually } from './payments';
import { updatePurchase } from './purchases';
import { setLineCodes } from './tax-line-codes';
import { validateBody } from './validation';
import { findDuplicates } from './purchase-duplicates';
import {
  FieldErrorsError, NOT_FINAL, getDocument, isXmlDocument, parseExtracted, previewXmlDocument, publicRow, resolveAccountSource, validateEdit, writePurchaseExtras,
  type ConfirmInput, type DocumentRole, type PurchaseExtras,
} from './purchase-recognition';

// One purchase, several source documents: the main one (PRIMARY, or NULL in older rows), the payment receipt of an invoice bought on
// account or by card (PAYMENT_RECEIPT) and any other attachment. Attaching never creates a purchase and never touches the ledger
// except for the cash payment a receipt proves.

export const ATTACH_ROLES: DocumentRole[] = ['PAYMENT_RECEIPT', 'ATTACHMENT'];
const EPS = 0.01 + 1e-9;
const alnum = (v: string | null | undefined) => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const validDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;

interface PurchaseHead {
  id: number; clientId: number | null; clientName: string | null; sumWithVat: number; purchaseDate: string; docType: string | null; evidenceType: 'INVOICE' | 'RECEIPT' | null;
  paidBy: string | null; buyerVatMode: string | null; notes: string | null; credited: number;
  paymentMethod: PurchaseExtras['paymentMethod']; cardLast4: string | null; cashRegisterNo: string | null; receiptNo: string | null; documentTime: string | null;
}
function loadPurchase(db: Database.Database, companyId: number, purchaseId: number): PurchaseHead {
  const p = Number.isSafeInteger(purchaseId) ? db.prepare(`SELECT p.id, p.clientId, COALESCE(p.clientName, c.name) AS clientName, p.sumWithVat, p.purchaseDate, p.docType, p.evidenceType, p.paidBy, p.buyerVatMode, p.notes,
      EXISTS(SELECT 1 FROM Purchase k WHERE k.originalPurchaseId=p.id) AS credited, p.paymentMethod, p.cardLast4, p.cashRegisterNo, p.receiptNo, p.documentTime
    FROM Purchase p LEFT JOIN Client c ON c.id=p.clientId WHERE p.id=? AND p.companyId=?`).get(purchaseId, companyId) as PurchaseHead | undefined : undefined;
  if (!p) throw new HttpError(404, 'Pirkimas nerastas');
  if ((p.docType ?? 'SF') !== 'SF') throw new HttpError(409, 'Prie kreditinio dokumento kitų dokumentų prisegti negalima');
  return p;
}

// Differences between the document and the purchase it is said to belong to ('SUPPLIER', 'AMOUNT'). Nothing to compare = no difference.
function differences(db: Database.Database, companyId: number, purchase: PurchaseHead, doc: { clientId: number | null; name: string; gross: number | null } | null): ('SUPPLIER' | 'AMOUNT')[] {
  if (!doc) return [];
  const out: ('SUPPLIER' | 'AMOUNT')[] = [];
  if (doc.clientId !== null && purchase.clientId !== null) { if (doc.clientId !== purchase.clientId) out.push('SUPPLIER'); }
  else if (alnum(doc.name) && alnum(purchase.clientName) && alnum(doc.name) !== alnum(purchase.clientName)) out.push('SUPPLIER');
  if (doc.gross !== null && Math.abs(Math.abs(doc.gross) - Math.abs(purchase.sumWithVat)) > EPS) out.push('AMOUNT');
  return out;
}
function mismatchError(diffs: string[]) {
  return Object.assign(new FieldErrorsError({ confirmMismatch: 'Dokumento tiekėjas arba suma skiriasi nuo pirkimo. Patvirtinkite, kad tai tas pats pirkimas.' }, 409), { mismatch: diffs });
}

// Supplier and total of the stored document, as far as they can be read (recognized extraction or the XML e-invoice).
function documentFacts(db: Database.Database, companyId: number, docId: number) {
  const row = getDocument(companyId, docId);
  if (isXmlDocument(row)) {
    try {
      const x = previewXmlDocument(companyId, docId).xml;
      return x.invoice && x.supplier ? { clientId: x.supplier.clientId, name: x.supplier.name || '', gross: x.invoice.gross } : null;
    } catch { return null; }
  }
  const x = parseExtracted(row);
  if (!x) return null;
  return { clientId: findSupplierId(db, companyId, { regNumber: x.supplier.code, vatCode: x.supplier.vatCode }), name: x.supplier.name || '', gross: x.totals.gross };
}

const nowSql = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

// Fills only the receipt columns that are still empty on the purchase. Returns the names of the columns that were filled.
function enrichFromReceipt(db: Database.Database, companyId: number, purchase: PurchaseHead, docId: number): { filled: string[]; method: PurchaseExtras['paymentMethod']; issueDate: string | null } {
  const x = parseExtracted(getDocument(companyId, docId));
  if (!x) return { filled: [], method: purchase.paymentMethod, issueDate: null };
  const proposed: Record<string, string | null> = {
    paymentMethod: x.payment.method, cardLast4: x.payment.cardLast4?.trim() || null, cashRegisterNo: x.receipt?.cashRegisterNo?.trim().slice(0, 100) || null,
    receiptNo: x.receipt?.receiptNo?.trim().slice(0, 100) || null, documentTime: x.receipt?.time?.trim() || null,
  };
  const method = purchase.paymentMethod || (proposed.paymentMethod as PurchaseExtras['paymentMethod']);
  // Format rules of the purchase form: the card digits belong to a card payment, the time is HH:MM or HH:MM:SS (normalized).
  if (proposed.cardLast4 && (!/^\d{4}$/.test(proposed.cardLast4) || method !== 'CARD')) proposed.cardLast4 = null;
  proposed.documentTime = proposed.documentTime ? normalizeTimeOfDay(proposed.documentTime) : proposed.documentTime;
  const filled = Object.keys(proposed).filter(k => proposed[k] && !(purchase as unknown as Record<string, unknown>)[k]);
  if (filled.length) db.prepare(`UPDATE Purchase SET ${filled.map(k => `${k}=?`).join(',')} WHERE id=? AND companyId=?`).run(...filled.map(k => proposed[k]), purchase.id, companyId);
  return { filled, method, issueDate: validDay(x.issueDate) ? x.issueDate : null };
}

// Attaches a queue document to an existing purchase. The document becomes CONFIRMED; a PAYMENT_RECEIPT enriches empty payment fields and, when it
// proves a cash payment of an unpaid purchase, records the cash settlement the same way the manual "paid in cash" action does.
export function attachDocumentToPurchase(companyId: number, docId: number, purchaseId: number, role: unknown, userId: number | null, opts: { confirmMismatch?: boolean } = {}) {
  const db = getDb();
  return db.transaction(() => {
    const row = getDocument(companyId, docId);
    if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šis dokumentas jau patvirtintas arba atmestas');
    if (!ATTACH_ROLES.includes(role as DocumentRole)) throw new HttpError(400, 'Neteisinga dokumento paskirtis pirkime');
    const purchase = loadPurchase(db, companyId, purchaseId);
    const diffs = differences(db, companyId, purchase, documentFacts(db, companyId, docId));
    if (diffs.length && opts.confirmMismatch !== true) throw mismatchError(diffs);
    db.prepare(`UPDATE PurchaseDocument SET status='CONFIRMED', purchaseId=?, role=?, confirmedAt=${nowSql}, confirmedBy=?, error=NULL WHERE id=? AND companyId=?`).run(purchaseId, role, userId, docId, companyId);

    let enriched: string[] = [];
    let settlement: { settled: boolean; reason?: string } | null = null;
    if (role === 'PAYMENT_RECEIPT' && !isXmlDocument(row)) {
      // Best effort: a closed accounting period must not stop the document from being attached, only the enrichment is skipped.
      try {
        db.transaction(() => {
          const result = enrichFromReceipt(db, companyId, purchase, docId);
          enriched = result.filled;
          if (result.method === 'CASH' && purchase.paidBy !== 'PERSON') {
            if (!openDocuments(db, companyId).some(d => d.kind === 'PURCHASE' && d.id === purchaseId)) settlement = { settled: false, reason: 'ALREADY_PAID' };
            else {
              const date = result.issueDate && result.issueDate >= purchase.purchaseDate.slice(0, 10) ? result.issueDate : purchase.purchaseDate.slice(0, 10);
              settleManually(db, companyId, { kind: 'PURCHASE', documentId: purchaseId, method: 'CASH', date, note: 'Pagal prisegtą mokėjimo kvitą' });
              settlement = { settled: true };
            }
          }
        })();
      } catch (error) {
        enriched = [];
        if (!(error instanceof Error) || error.message !== 'ACCOUNTING_PERIOD_LOCKED') console.error('[attach] enrichment skipped', error instanceof Error ? error.message : error);
        settlement = { settled: false, reason: 'SKIPPED' };
      }
    }
    return { document: publicRow(getDocument(companyId, docId)), purchase: db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId), enriched, settlement, mismatch: diffs };
  })();
}

// A receipt-based purchase gets the invoice that arrived later as its main document: the reviewed invoice form rewrites the purchase through
// the ordinary purchase update (ledger, tax codes and the period and stock guards work exactly as for a manual edit), the invoice becomes PRIMARY
// and the earlier documents of the purchase become payment receipts.
export function promoteDocumentToPurchase(companyId: number, docId: number, purchaseId: number, userId: number | null, input: ConfirmInput & { confirmMismatch?: unknown }) {
  const db = getDb();
  return db.transaction(() => {
    const row = getDocument(companyId, docId);
    if (!NOT_FINAL.includes(row.status)) throw new HttpError(409, 'Šis dokumentas jau patvirtintas arba atmestas');
    if (isXmlDocument(row)) throw new HttpError(409, 'XML e-sąskaitos pagrindiniu dokumentu čia padaryti negalima: prisekite ją kaip priedą');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'Tikimasi objekto');
    const purchase = loadPurchase(db, companyId, purchaseId);
    if (purchase.evidenceType !== 'RECEIPT') throw new HttpError(409, 'Pagrindiniu dokumentu galima padaryti sąskaitą faktūrą tik pirkimui, sukurtam iš kvito');
    if (purchase.credited) throw new HttpError(409, 'Pirkimas turi kreditinių dokumentų: pirmiausia ištrinkite juos.');
    const extracted = parseExtracted(row);
    const { errors, normalized: n } = validateEdit(db, companyId, { ...input, evidenceType: 'INVOICE', docKind: 'INVOICE' }, extracted);
    if (!n) throw new FieldErrorsError(errors);
    if (n.foreign || n.stockCreates.length || n.assets.length) throw new FieldErrorsError({ promote: 'Kvito pagrindu sukurtam pirkimui užsienio valiuta, naujos atsargų ir ilgalaikio turto kortelės nepalaikomos: sąskaitą prisekite kaip priedą.' }, 400);
    const supplierKnown = n.clientId ?? findSupplierId(db, companyId, { regNumber: n.supplier.code, vatCode: n.supplier.vatCode });
    const diffs = differences(db, companyId, purchase, { clientId: supplierKnown, name: n.supplier.name, gross: n.declaredGross });
    if (diffs.length && input.confirmMismatch !== true) throw mismatchError(diffs);
    // The number may not belong to another purchase of the supplier.
    if (db.prepare("SELECT id FROM Purchase WHERE companyId=? AND number=? AND COALESCE(series,'')=? AND (clientId=? OR (clientId IS NULL AND clientName=?)) AND id<>? LIMIT 1").get(companyId, n.body.number, n.body.series, supplierKnown, n.supplier.name, purchaseId)) {
      throw new FieldErrorsError({ number: `Šio tiekėjo dokumentas ${n.body.series}${n.body.number} jau yra pirkimuose` });
    }
    const others = findDuplicates(db, companyId, {
      clientId: supplierKnown, supplierCode: n.supplier.code, supplierVatCode: n.supplier.vatCode, supplierName: n.supplier.name,
      series: n.body.series, number: n.body.number, receiptNo: n.extras.receiptNo || '', cashRegisterNo: n.extras.cashRegisterNo || '', date: String(n.body.purchaseDate), gross: n.declaredGross,
    }, docId).filter(d => !(d.kind === 'purchase' && d.id === purchaseId));
    if (others.some(d => d.strength === 'strong') && (input as { confirmDuplicate?: unknown }).confirmDuplicate !== true) {
      throw new FieldErrorsError({ confirmDuplicate: 'Dokumentas atrodo kaip jau užregistruoto dublikatas. Pažymėkite „Tai ne dublikatas, vis tiek patvirtinti“.' }, 409);
    }
    let supplierId = supplierKnown;
    if (supplierId === null) {
      const res = db.prepare("INSERT INTO Client(companyId,name,code,vatCode,address,createdAt,updatedAt) VALUES(?,?,?,?,?,datetime('now'),datetime('now'))")
        .run(companyId, n.supplier.name, n.supplier.code || null, n.supplier.vatCode || null, n.supplier.address || null);
      supplierId = Number(res.lastInsertRowid);
    }
    const accountSource = resolveAccountSource(db, companyId, supplierKnown, (n.body.debitAccount as string | undefined) ?? null, input.accountSource, extracted);
    const mode = purchase.buyerVatMode ? taxMode(purchase.buyerVatMode) : companyTaxMode(companyId, String(n.body.purchaseDate));
    // A receipt carried no deductible VAT; the invoice gets the deduction of the form, or the usual one for the buyer's VAT status.
    const body = {
      ...n.body, clientId: supplierId, deductionPercent: n.body.deductionPercent ?? (mode === 'STANDARD_VAT' ? 100 : 0),
      notes: [purchase.notes, typeof input.notes === 'string' ? input.notes.trim().slice(0, 400) : '', 'Pagrindiniu dokumentu pakeista sąskaita faktūra (kvitas liko kaip mokėjimo kvitas)'].filter(Boolean).join('; ').slice(0, 1000),
    };
    validateBody(body, 'purchases', companyId);
    // Receipt facts of the purchase stay unless the invoice form states them itself.
    const keep = <K extends keyof PurchaseExtras>(key: K): PurchaseExtras[K] => (n.extras[key] ?? (purchase as unknown as PurchaseExtras)[key] ?? null) as PurchaseExtras[K];
    const current = db.prepare('SELECT paidBy,paidByName,reimbursedAt FROM Purchase WHERE id=? AND companyId=?').get(purchaseId, companyId) as Pick<PurchaseExtras, 'paidBy' | 'paidByName' | 'reimbursedAt'>;
    const extras: PurchaseExtras = {
      paidBy: n.extras.paidBy ?? current.paidBy, paidByName: n.extras.paidBy ? n.extras.paidByName : current.paidByName, reimbursedAt: n.extras.paidBy ? n.extras.reimbursedAt : current.reimbursedAt,
      evidenceType: 'INVOICE', paymentMethod: keep('paymentMethod'), cardLast4: keep('cardLast4'), cashRegisterNo: keep('cashRegisterNo'), receiptNo: keep('receiptNo'), documentTime: keep('documentTime'),
    };
    const { droppedTaxCodes } = updatePurchase(db, companyId, purchaseId, body, () => writePurchaseExtras(db, companyId, purchaseId, extras));
    const items = db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(purchaseId) as { id: number }[];
    setLineCodes(db, companyId, items.map((it, i) => ({ kind: 'PURCHASE' as const, itemId: it.id, taxCode: n.taxCodes[i], note: 'Pagal sąskaitą faktūrą, pakeitusią kvitą kaip pagrindinį dokumentą' })), userId);
    db.prepare("UPDATE PurchaseDocument SET role='PAYMENT_RECEIPT' WHERE companyId=? AND purchaseId=? AND (role IS NULL OR role='PRIMARY')").run(companyId, purchaseId);
    db.prepare(`UPDATE PurchaseDocument SET status='CONFIRMED', purchaseId=?, role='PRIMARY', confirmedAt=${nowSql}, confirmedBy=?, error=NULL, accountSource=? WHERE id=? AND companyId=?`).run(purchaseId, userId, accountSource, docId, companyId);
    return { purchase: db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId), items: db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(purchaseId), droppedTaxCodes, assets: [], createdSupplier: supplierId !== supplierKnown, promoted: true, document: publicRow(getDocument(companyId, docId)) };
  })();
}

// Purchases to pick from when attaching by hand: newest first, matched on supplier, document number, date or amount.
export function searchPurchases(companyId: number, query: unknown) {
  const q = typeof query === 'string' ? query.trim().slice(0, 100) : '';
  const like = (v: string) => `%${v.replace(/[\\%_]/g, m => `\\${m}`)}%`;
  const amount = q.replace(/\s+/g, '').replace(',', '.');
  const where = q
    ? "AND (p.clientName LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\' OR COALESCE(p.series,'')||p.number LIKE ? ESCAPE '\\' OR p.purchaseDate LIKE ? ESCAPE '\\' OR printf('%.2f',p.sumWithVat) LIKE ? ESCAPE '\\')"
    : '';
  const args = q ? [like(q), like(q), like(q), like(q), like(amount)] : [];
  return getDb().prepare(`SELECT p.id, COALESCE(p.series,'')||p.number AS number, p.purchaseDate AS date, COALESCE(p.clientName, c.name) AS supplier, p.sumWithVat AS gross, p.evidenceType,
      (SELECT COUNT(*) FROM PurchaseDocument d WHERE d.purchaseId=p.id) AS documentCount
    FROM Purchase p LEFT JOIN Client c ON c.id=p.clientId WHERE p.companyId=? AND COALESCE(p.docType,'SF')='SF' ${where} ORDER BY p.purchaseDate DESC, p.id DESC LIMIT 20`)
    .all(companyId, ...args);
}

// All originals of each purchase (main one first), for the purchase list: adds `documents` and keeps `documentId` (the main one) for older callers.
export const ROLE_ORDER: Record<string, number> = { PRIMARY: 0, PAYMENT_RECEIPT: 1, ATTACHMENT: 2 };
export function withDocuments<T extends { id: number }>(db: Database.Database, companyId: number, purchases: T[]) {
  const docs = new Map<number, { id: number; role: DocumentRole; fileName: string; mimeType: string }[]>();
  for (const d of db.prepare('SELECT id, purchaseId, COALESCE(role, \'PRIMARY\') AS role, fileName, mimeType FROM PurchaseDocument WHERE companyId=? AND purchaseId IS NOT NULL ORDER BY id').all(companyId) as { id: number; purchaseId: number; role: DocumentRole; fileName: string; mimeType: string }[]) {
    (docs.get(d.purchaseId) ?? docs.set(d.purchaseId, []).get(d.purchaseId)!).push({ id: d.id, role: d.role, fileName: d.fileName, mimeType: d.mimeType });
  }
  return purchases.map(p => {
    const list = (docs.get(p.id) || []).sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.id - b.id);
    return { ...p, documents: list, documentId: list[0]?.id ?? null };
  });
}
