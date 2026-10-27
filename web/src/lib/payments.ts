import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { todayVilnius } from './dates';

export interface OpenDocument { kind: 'SALE' | 'PURCHASE'; id: number; label: string; date: string; clientCode: string; clientName: string; due: number; paid: number; balance: number; }
export interface Suggestion { bankTransactionId: number; kind: 'SALE' | 'PURCHASE'; documentId: number; label: string; amount: number; confidence: 'high' | 'medium'; reasons: string[]; }
const cents = (value: number) => Math.round(value * 100);
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9а-я]+/g, '');
const fold = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9а-я]+/g, ' ').trim();

export function openDocuments(db: Database.Database, companyId: number): OpenDocument[] {
  const sales = db.prepare(`SELECT s.id, TRIM(COALESCE(s.series,'')||' '||COALESCE(s.number,'')) label, s.saleDate date, COALESCE(s.clientCode,'') clientCode, COALESCE(s.clientName,'') clientName,
      ROUND(s.sumWithVat + COALESCE((SELECT SUM(c.sumWithVat) FROM Sale c WHERE c.originalSaleId=s.id),0),2) due,
      ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE saleId=s.id),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE saleId=s.id),0),2) paid
    FROM Sale s WHERE s.companyId=? AND COALESCE(s.docType,'SF')='SF'
      AND (COALESCE(s.statusName,'')<>'Apmokėta'
        OR datetime(COALESCE(s.createdAt,'1970-01-01')) >= COALESCE((SELECT datetime(appliedAt) FROM AppMigration WHERE version='2026-10-bank-payments-v1'),'1970-01-01')
        OR EXISTS(SELECT 1 FROM PaymentAllocation a WHERE a.saleId=s.id)
        OR EXISTS(SELECT 1 FROM ManualSettlement m WHERE m.saleId=s.id))`).all(companyId) as Omit<OpenDocument, 'kind' | 'balance'>[];
  const purchases = db.prepare(`SELECT p.id, TRIM(COALESCE(p.series,'')||' '||COALESCE(p.number,'')) label, p.purchaseDate date, COALESCE(p.clientCode,'') clientCode, COALESCE(p.clientName,'') clientName,
      ROUND(p.sumWithVat + COALESCE((SELECT SUM(c.sumWithVat) FROM Purchase c WHERE c.originalPurchaseId=p.id),0),2) due, ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE purchaseId=p.id),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE purchaseId=p.id),0),2) paid
    FROM Purchase p WHERE p.companyId=? AND COALESCE(p.docType,'SF')='SF'`).all(companyId) as Omit<OpenDocument, 'kind' | 'balance'>[];
  const open = (kind: 'SALE' | 'PURCHASE') => (d: Omit<OpenDocument, 'kind' | 'balance'>) => ({ ...d, kind, balance: (cents(d.due) - cents(d.paid)) / 100 });
  return [...sales.map(open('SALE')), ...purchases.map(open('PURCHASE'))].filter(d => d.balance > 0);
}

// Documents where linked money exceeds what is due (for example a credit note issued after the invoice was paid): a refund is owed.
export function overpaidDocuments(db: Database.Database, companyId: number) {
  const sales = db.prepare(`SELECT 'SALE' kind, s.id, TRIM(COALESCE(s.series,'')||' '||COALESCE(s.number,'')) label, COALESCE(s.clientName,'') clientName,
      ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE saleId=s.id),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE saleId=s.id),0) - (s.sumWithVat + COALESCE((SELECT SUM(c.sumWithVat) FROM Sale c WHERE c.originalSaleId=s.id),0)),2) excess
    FROM Sale s WHERE s.companyId=? AND COALESCE(s.docType,'SF')='SF'`).all(companyId) as { kind: string; id: number; label: string; clientName: string; excess: number }[];
  const purchases = db.prepare(`SELECT 'PURCHASE' kind, p.id, TRIM(COALESCE(p.series,'')||' '||COALESCE(p.number,'')) label, COALESCE(p.clientName,'') clientName,
      ROUND(COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE purchaseId=p.id),0)+COALESCE((SELECT SUM(amount) FROM ManualSettlement WHERE purchaseId=p.id),0) - (p.sumWithVat + COALESCE((SELECT SUM(c.sumWithVat) FROM Purchase c WHERE c.originalPurchaseId=p.id),0)),2) excess
    FROM Purchase p WHERE p.companyId=? AND COALESCE(p.docType,'SF')='SF'`).all(companyId) as { kind: string; id: number; label: string; clientName: string; excess: number }[];
  return [...sales, ...purchases].filter(r => r.excess > 0.004);
}

export function unallocatedTransactions(db: Database.Database, companyId: number) {
  const rows = db.prepare(`SELECT t.id, t.date, t.sum, COALESCE(t.clientName,'') clientName, COALESCE(t.clientCode,'') clientCode, COALESCE(t.number,'') number, COALESCE(t.notes,'') notes,
      ROUND(ABS(t.sum) - COALESCE((SELECT SUM(amount) FROM PaymentAllocation WHERE bankTransactionId=t.id),0),2) remaining
    FROM BankTransaction t WHERE t.companyId=? AND t.sum<>0 ORDER BY t.date, t.id`).all(companyId) as { id: number; date: string; sum: number; clientName: string; clientCode: string; number: string; notes: string; remaining: number }[];
  return rows.filter(t => t.remaining > 0.004);
}

// A document number counts only as a whole token: "SF 12" must not match "SF 123". Leading zeros and separators are ignored.
// A purely numeric number needs at least 5 digits, otherwise years, amounts and codes would match.
export function numberPattern(label: string): RegExp | null {
  const parts = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]+|\d+/g);
  if (!parts) return null;
  // Without any non-zero digit the pattern would match any standalone series word ("PARD", "SF 0").
  if (!parts.some(part => /^\d+$/.test(part) && /[1-9]/.test(part))) return null;
  if (parts.length === 1 && /^\d+$/.test(parts[0]) && parts[0].replace(/^0+/, '').length < 5) return null;
  const body = parts.map(part => /^\d+$/.test(part) ? '0*' + part.replace(/^0+/, '') : part).join('[^a-z0-9]*');
  const last = parts[parts.length - 1];
  // A long enough number is distinctive on its own, even when the payer left out the series.
  const bare = /^\d+$/.test(last) && last.replace(/^0+/, '').length >= 5 ? '|0*' + last.replace(/^0+/, '') : '';
  return new RegExp('(?<![a-z0-9])(?:' + body + bare + ')(?![a-z0-9])(?![.,]\\d)');
}
const plain = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Suggestions are never applied automatically. "high" = the invoice number as a whole token and the exact balance both match,
// and no other document ties with it. A payment already suggested for a document reduces that document's balance for later rows.
export function suggestMatches(db: Database.Database, companyId: number): Suggestion[] {
  const docs = openDocuments(db, companyId).map(d => ({ ...d, left: cents(d.balance), pattern: numberPattern(d.label) }));
  const out: Suggestion[] = [];
  for (const t of unallocatedTransactions(db, companyId)) {
    const haystack = plain([t.clientName, t.number, t.notes].join(' '));
    const compact = key([t.clientName, t.number, t.notes].join(' '));
    const words = fold([t.clientName, t.notes].join(' '));
    const wanted = t.sum > 0 ? 'SALE' : 'PURCHASE';
    const remaining = cents(t.remaining);
    const scored: { doc: (typeof docs)[number]; score: number; numberHit: boolean; exact: boolean; reasons: string[] }[] = [];
    for (const d of docs.filter(x => x.kind === wanted && x.left > 0)) {
      const reasons: string[] = [];
      let score = 0;
      const numberHit = Boolean(d.pattern && d.pattern.test(haystack));
      if (numberHit) { score += 2; reasons.push('dokumento numeris mokėjimo paskirtyje'); }
      const exact = remaining === d.left;
      if (exact) { score += 2; reasons.push('suma lygi dokumento likučiui'); }
      const partyHit = (d.clientCode.length >= 4 && compact.includes(key(d.clientCode))) || (fold(d.clientName).length >= 5 && words.includes(fold(d.clientName)));
      if (partyHit) { score += 1; reasons.push('sutampa kontrahentas'); }
      if (numberHit || (exact && partyHit)) scored.push({ doc: d, score, numberHit, exact, reasons });
    }
    if (!scored.length) continue;
    scored.sort((a, b) => b.score - a.score || a.doc.date.localeCompare(b.doc.date) || a.doc.id - b.doc.id);
    const best = scored[0];
    const ambiguous = scored.length > 1 && scored[1].score === best.score;
    const amount = Math.min(remaining, best.doc.left);
    best.doc.left -= amount;
    out.push({ bankTransactionId: t.id, kind: best.doc.kind, documentId: best.doc.id, label: best.doc.label, amount: amount / 100, confidence: best.numberHit && best.exact && !ambiguous ? 'high' : 'medium', reasons: ambiguous ? [...best.reasons, 'yra kitas dokumentas su tokiu pačiu atitikimu: pasirinkite rankiniu būdu'] : best.reasons });
  }
  return out;
}

export function allocatePayment(db: Database.Database, companyId: number, input: { bankTransactionId: number; kind: 'SALE' | 'PURCHASE'; documentId: number; amount: number }) {
  if (!Number.isSafeInteger(input.bankTransactionId) || !Number.isSafeInteger(input.documentId) || !['SALE', 'PURCHASE'].includes(input.kind)) throw new HttpError(400, 'Neteisingi priskyrimo duomenys');
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount <= 0 || Math.abs(Math.round(input.amount * 100) - input.amount * 100) > 1e-6) throw new HttpError(400, 'Priskyrimo suma turi būti teigiama (iki dviejų skaitmenų po kablelio)');
  try {
    const res = db.prepare('INSERT INTO PaymentAllocation(companyId,bankTransactionId,saleId,purchaseId,amount,createdAt) VALUES(?,?,?,?,?,?)')
      .run(companyId, input.bankTransactionId, input.kind === 'SALE' ? input.documentId : null, input.kind === 'PURCHASE' ? input.documentId : null, input.amount, Date.now());
    return Number(res.lastInsertRowid);
  } catch (error) {
    const message = (error as Error).message || '';
    if (message === 'Payment company mismatch') throw new HttpError(409, 'Mokėjimas arba dokumentas nerastas');
    if (message.startsWith('Payment direction')) throw new HttpError(409, 'Gaunamąjį mokėjimą galima susieti tik su pardavimo sąskaita, išeinantįjį — su pirkimu');
    if (message.startsWith('Credit notes')) throw new HttpError(409, 'Kreditinio dokumento apmokėti negalima');
    if (message === 'Payment exceeds invoice balance') throw new HttpError(409, 'Suma viršija dokumento likutį');
    if (message === 'Bank transaction already classified') throw new HttpError(409, 'Banko operacija jau priskirta kitai paskirčiai');
    if (message === 'Payment exceeds bank transaction') throw new HttpError(409, 'Suma viršija banko operacijos likutį');
    throw error;
  }
}

// Counter account of a settlement outside the bank: cash goes to the cash desk (272); an offset or another way needs the account the money or debt moved to.
export function settleManually(db: Database.Database, companyId: number, input: { kind: 'SALE' | 'PURCHASE'; documentId: number; method: string; date?: string; note?: string; amount?: number; account?: string }) {
  if (!['SALE', 'PURCHASE'].includes(input.kind) || !Number.isSafeInteger(input.documentId)) throw new HttpError(400, 'Neteisingi duomenys');
  if (!['CASH', 'OFFSET', 'OTHER'].includes(input.method)) throw new HttpError(400, 'Būdas: CASH, OFFSET arba OTHER');
  const date = input.date ?? todayVilnius();
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date) throw new HttpError(400, 'Neteisinga data');
  let counter = '272';
  if (input.method !== 'CASH') {
    counter = typeof input.account === 'string' ? input.account.trim() : '';
    if (!/^\d{3,6}$/.test(counter) || !db.prepare('SELECT 1 FROM ChartOfAccount WHERE code=?').get(counter)) throw new HttpError(400, 'Įskaitymui ar kitam būdui nurodykite esamą sąskaitą iš sąskaitų plano');
    if (counter === (input.kind === 'SALE' ? '2410' : '4430')) throw new HttpError(400, 'Nurodykite korespondentinę sąskaitą, kuri skiriasi nuo dokumento atsiskaitymų sąskaitos');
  }
  return db.transaction(() => {
    const doc = openDocuments(db, companyId).find(d => d.kind === input.kind && d.id === input.documentId);
    if (!doc) throw new HttpError(409, 'Pagal dokumentą nėra likučio apmokėti');
    if (date < doc.date.slice(0, 10)) throw new HttpError(400, 'Apmokėjimo data negali būti ankstesnė už dokumento datą');
    const amount = input.amount === undefined ? doc.balance : input.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) throw new HttpError(400, 'Suma turi būti teigiama (iki dviejų skaitmenų po kablelio)');
    let id: number;
    try {
      const res = db.prepare('INSERT INTO ManualSettlement(companyId,saleId,purchaseId,amount,date,method,note,createdAt) VALUES(?,?,?,?,?,?,?,?)')
        .run(companyId, input.kind === 'SALE' ? input.documentId : null, input.kind === 'PURCHASE' ? input.documentId : null, amount, date, input.method, (input.note || '').slice(0, 500) || null, Date.now());
      id = Number(res.lastInsertRowid);
    } catch (error) {
      if ((error as Error).message === 'Payment exceeds invoice balance') throw new HttpError(409, 'Suma viršija dokumento likutį');
      throw error;
    }
    // Same journal effect as the matching bank movement: receivable (2410) or payable (4430) is cleared against cash or the chosen account. The journal brings period locks and audit.
    const [debit, credit] = input.kind === 'SALE' ? [counter, '2410'] : ['4430', counter];
    db.prepare("INSERT INTO GeneralEntry(companyId,date,docNumber,debitAccount,creditAccount,amount,clientName,description,sourceType,sourceId) VALUES(?,?,?,?,?,?,?,?,'SETTLEMENT',?)")
      .run(companyId, date, doc.label, debit, credit, amount, doc.clientName || null, `Apmokėjimas ne per banką (${input.method === 'CASH' ? 'grynieji' : input.method === 'OFFSET' ? 'įskaitymas' : 'kita'})${input.note ? ': ' + input.note.slice(0, 200) : ''}`, id);
    return id;
  })();
}
