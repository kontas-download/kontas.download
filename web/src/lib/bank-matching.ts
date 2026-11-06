import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { allocatePayment, numberPattern, openDocuments } from './payments';
import { reimbursePurchase } from './purchase-recognition';
import { RecognizedDocumentSchema } from './recognition/types';

// Matching of outgoing bank lines with unpaid purchases (and not yet confirmed received documents).
// The engine only ranks candidates; a link is made by a person (one at a time, or in bulk for >= RELIABLE_CONFIDENCE) and goes through
// the existing payment mechanism (PaymentAllocation): the purchase counts as paid, the bank line keeps its own ledger posting (D 4430 / K 2710).
export const RELIABLE_CONFIDENCE = 90;
const MIN_CONFIDENCE = 60;
const DAYS_BEFORE = 3;
const DAYS_AFTER = 10;

export type ReasonCode = 'AMOUNT' | 'DATE_SAME' | 'DATE_NEAR' | 'DATE_WINDOW' | 'CARD' | 'SUPPLIER_CODE' | 'SUPPLIER_NAME' | 'SUPPLIER_NAME_PART' | 'NUMBER' | 'ALREADY_MATCHED' | 'AMBIGUOUS';
export interface MatchDoc { kind: 'purchase' | 'document'; id: number; label: string; date: string; gross: number; supplierName: string; supplierCode: string; cardLast4: string | null }
export interface MatchTxn { id: number; date: string; sum: number; clientName: string; clientCode: string; number: string; notes: string; allocated: number }
export interface Score { confidence: number; reasons: ReasonCode[]; dayDelta: number }

const cents = (v: number) => Math.round(v * 100);
const fold = (v: string) => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9а-я]+/g, ' ').trim();
const compact = (v: string) => fold(v).replace(/ /g, '');
const LEGAL = new Set(['uab', 'mb', 'ab', 'vsi', 'ii', 'iv', 'kb', 'sia', 'oy', 'ltd', 'gmbh', 'llc', 'inc', 'sp', 'zoo', 'ooo', 'oo', 'as', 'the', 'and']);
const tokens = (v: string) => fold(v).split(' ').filter(t => t.length >= 3 && !LEGAL.has(t));
const dayNumber = (d: string) => Math.round(Date.parse(d.slice(0, 10) + 'T00:00:00Z') / 86400000);

// Pure scoring of one document against one outgoing bank line; null when they cannot be the same payment.
export function scoreMatch(doc: MatchDoc, txn: MatchTxn): Score | null {
  if (!(txn.sum < 0)) return null;
  const remaining = cents(Math.abs(txn.sum)) - cents(txn.allocated);
  if (remaining !== cents(doc.gross)) return null;
  const dayDelta = dayNumber(txn.date) - dayNumber(doc.date);
  const text = [txn.clientName, txn.number, txn.notes].join(' ');
  const pattern = numberPattern(doc.label);
  const numberHit = Boolean(pattern && pattern.test(text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')));
  const inWindow = dayDelta >= -DAYS_BEFORE && dayDelta <= DAYS_AFTER;
  if (!inWindow && !numberHit) return null;

  const reasons: ReasonCode[] = ['AMOUNT'];
  let score = 50;
  if (inWindow) {
    const d = Math.abs(dayDelta);
    if (d <= 1) { score += 15; reasons.push('DATE_SAME'); } else if (d <= 3) { score += 10; reasons.push('DATE_NEAR'); } else { score += 5; reasons.push('DATE_WINDOW'); }
  }
  if (doc.cardLast4 && new RegExp(`(?<!\\d)${doc.cardLast4}(?!\\d)`).test(text)) { score += 25; reasons.push('CARD'); }
  const code = compact(doc.supplierCode);
  if (code.length >= 4 && (compact(txn.clientCode) === code || compact(text).includes(code))) { score += 15; reasons.push('SUPPLIER_CODE'); }
  const want = tokens(doc.supplierName);
  if (want.length) {
    const have = new Set(tokens(text));
    const share = want.filter(t => have.has(t)).length / want.length;
    if (share >= 1) { score += 15; reasons.push('SUPPLIER_NAME'); } else if (share >= 0.5) { score += 8; reasons.push('SUPPLIER_NAME_PART'); }
  }
  if (numberHit) { score += 25; reasons.push('NUMBER'); }
  if (txn.allocated > 0) { score -= 40; reasons.push('ALREADY_MATCHED'); }
  return { confidence: Math.max(0, Math.min(100, score)), reasons, dayDelta };
}

export interface BankLine { id: number; date: string; sum: number; counterparty: string; notes: string }
export interface PurchaseSuggestion { kind: 'purchase' | 'document'; bankTransactionId: number; documentId: number; label: string; supplierName: string; date: string; amount: number; confidence: number; reasons: ReasonCode[]; dayDelta: number; txn: BankLine }

function outgoingLines(db: Database.Database, companyId: number, onlyId?: number): (MatchTxn & { counterparty: string })[] {
  const rows = db.prepare(`SELECT t.id, t.date, t.sum, COALESCE(t.clientName,'') clientName, COALESCE(t.clientCode,'') clientCode, COALESCE(t.number,'') number, COALESCE(t.notes,'') notes,
      ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE bankTransactionId=t.id),0),2) allocated
    FROM BankTransaction t WHERE t.companyId=? AND t.sum<0 ${onlyId ? 'AND t.id=?' : ''}`).all(...(onlyId ? [companyId, onlyId] : [companyId])) as (MatchTxn & { counterparty: string })[];
  return rows.filter(r => cents(r.allocated) < cents(Math.abs(r.sum))).map(r => ({ ...r, counterparty: r.clientName }));
}

// Unpaid purchases that can be paid through the bank: not paid from a person's own funds (those are reimbursed to the person) and not in cash.
function unpaidPurchases(db: Database.Database, companyId: number, onlyId?: number): MatchDoc[] {
  const open = openDocuments(db, companyId).filter(d => d.kind === 'PURCHASE' && (!onlyId || d.id === onlyId));
  if (!open.length) return [];
  const extra = db.prepare(`SELECT p.id, p.paidBy, p.paymentMethod, p.cardLast4, COALESCE(p.clientCode, c.code, '') AS code, COALESCE(p.clientName, c.name, '') AS name
    FROM Purchase p LEFT JOIN Client c ON c.id=p.clientId WHERE p.companyId=?`).all(companyId) as { id: number; paidBy: string | null; paymentMethod: string | null; cardLast4: string | null; code: string; name: string }[];
  const byId = new Map(extra.map(e => [e.id, e]));
  const out: MatchDoc[] = [];
  for (const d of open) {
    const e = byId.get(d.id);
    if (!e || e.paidBy === 'PERSON' || e.paymentMethod === 'CASH') continue;
    out.push({ kind: 'purchase', id: d.id, label: d.label, date: d.date, gross: d.balance, supplierName: e.name || d.clientName, supplierCode: e.code || d.clientCode, cardLast4: e.cardLast4 });
  }
  return out;
}

// Received documents still waiting for confirmation (they cannot be linked yet, but the person can open them).
function draftDocuments(db: Database.Database, companyId: number): MatchDoc[] {
  const rows = db.prepare("SELECT id, fileName, extractedJson FROM PurchaseDocument WHERE companyId=? AND status IN ('NEW','EXTRACTED','FAILED') AND extractedJson IS NOT NULL").all(companyId) as { id: number; fileName: string; extractedJson: string }[];
  const out: MatchDoc[] = [];
  for (const r of rows) {
    let parsed;
    try { parsed = RecognizedDocumentSchema.safeParse(JSON.parse(r.extractedJson)); } catch { continue; }
    if (!parsed.success) continue;
    const x = parsed.data;
    if (x.totals.gross === null || !x.issueDate || x.payment.method === 'CASH') continue;
    out.push({ kind: 'document', id: r.id, label: [x.series, x.number].filter(Boolean).join('') || x.receipt?.receiptNo || r.fileName, date: x.issueDate, gross: x.totals.gross, supplierName: x.supplier.name || '', supplierCode: x.supplier.code || '', cardLast4: x.payment.cardLast4 });
  }
  return out;
}

// Ranked candidates. A bank line with two equally good documents (or a document with two equally good lines) is never presented as reliable.
export function rankMatches(docs: MatchDoc[], lines: (MatchTxn & { counterparty: string })[]): PurchaseSuggestion[] {
  const pairs: { doc: MatchDoc; line: (typeof lines)[number]; score: Score }[] = [];
  for (const line of lines) for (const doc of docs) {
    const score = scoreMatch(doc, line);
    if (score && score.confidence >= MIN_CONFIDENCE) pairs.push({ doc, line, score });
  }
  const byLine = new Map<number, number[]>(), byDoc = new Map<string, number[]>();
  for (const p of pairs) {
    (byLine.get(p.line.id) || byLine.set(p.line.id, []).get(p.line.id)!).push(p.score.confidence);
    const k = `${p.doc.kind}:${p.doc.id}`;
    (byDoc.get(k) || byDoc.set(k, []).get(k)!).push(p.score.confidence);
  }
  const contested = (list: number[] | undefined, confidence: number) => (list || []).filter(c => c >= confidence - 5).length > 1;
  return pairs.map(p => {
    const ambiguous = contested(byLine.get(p.line.id), p.score.confidence) || contested(byDoc.get(`${p.doc.kind}:${p.doc.id}`), p.score.confidence);
    const confidence = ambiguous ? Math.min(p.score.confidence, RELIABLE_CONFIDENCE - 5) : p.score.confidence;
    return {
      kind: p.doc.kind, bankTransactionId: p.line.id, documentId: p.doc.id, label: p.doc.label, supplierName: p.doc.supplierName, date: p.doc.date, amount: p.doc.gross,
      confidence, reasons: ambiguous ? [...p.score.reasons, 'AMBIGUOUS' as ReasonCode] : p.score.reasons, dayDelta: p.score.dayDelta,
      txn: { id: p.line.id, date: p.line.date, sum: p.line.sum, counterparty: p.line.counterparty, notes: p.line.notes },
    };
  }).sort((a, b) => b.confidence - a.confidence || a.txn.date.localeCompare(b.txn.date) || a.bankTransactionId - b.bankTransactionId);
}

// Whole bank side: lines with a suggested purchase, and lines with a suggested received (unconfirmed) document.
export function purchaseBankSuggestions(db: Database.Database, companyId: number) {
  const lines = outgoingLines(db, companyId);
  const all = rankMatches([...unpaidPurchases(db, companyId), ...draftDocuments(db, companyId)], lines);
  return { suggestions: all.filter(s => s.kind === 'purchase'), drafts: all.filter(s => s.kind === 'document'), reimbursements: reimbursementSuggestions(db, companyId) };
}

// One purchase: candidate bank lines and the payments already linked (with their allocation id, so a link can be undone).
export function bankMatchesForPurchase(db: Database.Database, companyId: number, purchaseId: number) {
  const p = db.prepare('SELECT id, paidBy FROM Purchase WHERE id=? AND companyId=?').get(purchaseId, companyId) as { id: number; paidBy: string | null } | undefined;
  if (!p) throw new HttpError(404, 'Įrašas nerastas');
  const linked = db.prepare(`SELECT a.id AS allocationId, a.amount, t.id AS bankTransactionId, t.date, t.sum, COALESCE(t.clientName,'') AS counterparty, COALESCE(t.notes,'') AS notes
    FROM PaymentAllocation a JOIN BankTransaction t ON t.id=a.bankTransactionId WHERE a.companyId=? AND a.purchaseId=? ORDER BY a.id`).all(companyId, purchaseId);
  const candidates = rankMatches(unpaidPurchases(db, companyId, purchaseId), outgoingLines(db, companyId));
  return { candidates, linked, ownFunds: p.paidBy === 'PERSON' };
}

// Links one bank line to one purchase for the open balance of the purchase (a person chose it).
export function linkPurchase(db: Database.Database, companyId: number, bankTransactionId: number, purchaseId: number) {
  if (!Number.isSafeInteger(bankTransactionId) || !Number.isSafeInteger(purchaseId)) throw new HttpError(400, 'Neteisingi priskyrimo duomenys');
  return db.transaction(() => {
    const doc = openDocuments(db, companyId).find(d => d.kind === 'PURCHASE' && d.id === purchaseId);
    if (!doc) throw new HttpError(409, 'Pagal dokumentą nėra likučio apmokėti');
    const own = db.prepare('SELECT paidBy FROM Purchase WHERE id=? AND companyId=?').get(purchaseId, companyId) as { paidBy: string | null } | undefined;
    if (own?.paidBy === 'PERSON') throw new HttpError(409, 'Pirkimas apmokėtas asmens lėšomis: jo nereikia susieti su įmonės banko operacija, pažymėkite kompensavimą');
    const line = outgoingLines(db, companyId, bankTransactionId)[0];
    if (!line) throw new HttpError(409, 'Banko operacija nerasta arba jau visiškai priskirta');
    const amount = Math.min(cents(Math.abs(line.sum)) - cents(line.allocated), cents(doc.balance)) / 100;
    return allocatePayment(db, companyId, { bankTransactionId, kind: 'PURCHASE', documentId: purchaseId, amount });
  })();
}

// Bulk link (explicit user action): only purchase suggestions at or above the threshold, each line and each purchase at most once.
export function linkReliable(db: Database.Database, companyId: number, threshold = RELIABLE_CONFIDENCE) {
  const picked = purchaseBankSuggestions(db, companyId).suggestions.filter(s => s.confidence >= threshold);
  const usedLines = new Set<number>(), usedDocs = new Set<number>();
  let applied = 0;
  const skipped: number[] = [];
  db.transaction(() => {
    for (const s of picked) {
      if (usedLines.has(s.bankTransactionId) || usedDocs.has(s.documentId)) { skipped.push(s.bankTransactionId); continue; }
      try { linkPurchase(db, companyId, s.bankTransactionId, s.documentId); usedLines.add(s.bankTransactionId); usedDocs.add(s.documentId); applied++; } catch { skipped.push(s.bankTransactionId); }
    }
  })();
  return { applied, skipped };
}

// ---------- reimbursement of own-funds purchases ----------

export interface ReimbursementSuggestion { bankTransactionId: number; person: string; purchaseIds: number[]; labels: string[]; amount: number; confidence: number; txn: BankLine }

// An outgoing line paid to the person who advanced the money, equal to one of their unreimbursed purchases or to everything owed to them.
export function reimbursementSuggestions(db: Database.Database, companyId: number): ReimbursementSuggestion[] {
  const owed = db.prepare("SELECT id, COALESCE(series,'')||number AS label, purchaseDate, paidByName, sumWithVat FROM Purchase WHERE companyId=? AND paidBy='PERSON' AND reimbursedAt IS NULL AND COALESCE(docType,'SF')='SF' ORDER BY purchaseDate, id")
    .all(companyId) as { id: number; label: string; purchaseDate: string; paidByName: string; sumWithVat: number }[];
  if (!owed.length) return [];
  const people = new Map<string, typeof owed>();
  for (const p of owed) (people.get(p.paidByName) || people.set(p.paidByName, []).get(p.paidByName)!).push(p);
  const out: ReimbursementSuggestion[] = [];
  for (const line of outgoingLines(db, companyId)) {
    if (line.allocated > 0) continue;
    const lineTokens = new Set(tokens([line.clientName, line.notes].join(' ')));
    for (const [person, list] of people) {
      const want = tokens(person);
      if (!want.length || !want.every(t => lineTokens.has(t))) continue;
      const amount = cents(Math.abs(line.sum));
      const total = list.reduce((a, p) => a + cents(p.sumWithVat), 0);
      const single = list.filter(p => cents(p.sumWithVat) === amount && p.purchaseDate <= line.date);
      const chosen = total === amount && list.every(p => p.purchaseDate <= line.date) ? list : single.length === 1 ? single : [];
      if (!chosen.length) continue;
      out.push({ bankTransactionId: line.id, person, purchaseIds: chosen.map(p => p.id), labels: chosen.map(p => p.label), amount: amount / 100, confidence: 90, txn: { id: line.id, date: line.date, sum: line.sum, counterparty: line.clientName, notes: line.notes } });
    }
  }
  return out;
}

// Marks the purchases as reimbursed on the date of the bank line, after checking that the line really pays them to that person.
export function linkReimbursement(db: Database.Database, companyId: number, bankTransactionId: number, purchaseIds: number[]) {
  const wanted = [...purchaseIds].sort((a, b) => a - b).join(',');
  const hit = reimbursementSuggestions(db, companyId).find(s => s.bankTransactionId === bankTransactionId && [...s.purchaseIds].sort((a, b) => a - b).join(',') === wanted);
  if (!hit) throw new HttpError(409, 'Banko operacija neatitinka šių išlaidų kompensavimo');
  db.transaction(() => { for (const id of hit.purchaseIds) reimbursePurchase(companyId, id, hit.txn.date); })();
  return hit;
}
