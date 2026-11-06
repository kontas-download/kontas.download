import type Database from 'better-sqlite3';
import { RecognizedDocumentSchema } from './recognition/types';

// Content duplicates of a received purchase document (the file hash check only catches byte-identical files).
// strong: same supplier and the same document number (or the same receipt + cash register number);
// possible: same supplier, same gross total (+-0.01) and a date within 3 days.
export interface DuplicateSubject {
  clientId: number | null; supplierCode: string; supplierVatCode: string; supplierName: string;
  series: string; number: string; receiptNo: string; cashRegisterNo: string; date: string; gross: number | null;
}
export interface DuplicateHit { kind: 'purchase' | 'document'; id: number; number: string; date: string; gross: number | null; strength: 'strong' | 'possible' }
type Other = Pick<DuplicateSubject, 'series' | 'number' | 'receiptNo' | 'cashRegisterNo' | 'date' | 'gross'>;

const DATE_WINDOW_DAYS = 3;
const alnum = (v: string) => (v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

// Case, spaces, dashes and leading zeros do not matter: "SF-0012", "sf 12" and "SF12" are the same number.
export function normalizeDocNumber(value: string): string {
  const parts = (value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().match(/[a-z]+|\d+/g) || [];
  return parts.map(p => (/^\d+$/.test(p) ? p.replace(/^0+(?=\d)/, '') : p)).join('');
}

const days = (a: string, b: string) => Math.abs(Date.parse(a.slice(0, 10) + 'T00:00:00Z') - Date.parse(b.slice(0, 10) + 'T00:00:00Z')) / 86400000;

// Pure comparison of one document with another already-filed document of the same supplier.
export function classifyDuplicate(subject: Other, other: Other): 'strong' | 'possible' | null {
  const n1 = normalizeDocNumber(subject.series + subject.number), n2 = normalizeDocNumber(other.series + other.number);
  if (n1 && n1 === n2) return 'strong';
  const r1 = normalizeDocNumber(subject.receiptNo), r2 = normalizeDocNumber(other.receiptNo);
  const c1 = normalizeDocNumber(subject.cashRegisterNo), c2 = normalizeDocNumber(other.cashRegisterNo);
  if (r1 && r1 === r2 && c1 && c1 === c2) return 'strong';
  if (subject.gross !== null && other.gross !== null && subject.date && other.date && Math.abs(subject.gross - other.gross) <= 0.01 + 1e-9 && days(subject.date, other.date) <= DATE_WINDOW_DAYS) return 'possible';
  return null;
}

function sameSupplier(a: Pick<DuplicateSubject, 'clientId' | 'supplierCode' | 'supplierVatCode' | 'supplierName'>, b: typeof a): boolean {
  if (a.clientId !== null && a.clientId === b.clientId) return true;
  const code = (v: string) => alnum(v);
  if (code(a.supplierCode) && code(a.supplierCode) === code(b.supplierCode)) return true;
  if (code(a.supplierVatCode) && code(a.supplierVatCode) === code(b.supplierVatCode)) return true;
  // Names are compared unless both sides carry identifying codes (then differing codes mean different suppliers).
  const hasCode = (x: typeof a) => Boolean(x.clientId !== null || code(x.supplierCode) || code(x.supplierVatCode));
  return !(hasCode(a) && hasCode(b)) && Boolean(alnum(a.supplierName)) && alnum(a.supplierName) === alnum(b.supplierName);
}

const rank = (h: DuplicateHit) => (h.strength === 'strong' ? 0 : 1);

// Purchases already filed and other open documents of the queue (two photos of one receipt). `excludeDocumentId` is the document being reviewed.
export function findDuplicates(db: Database.Database, companyId: number, subject: DuplicateSubject, excludeDocumentId: number | null): DuplicateHit[] {
  const hits: DuplicateHit[] = [];
  if (!alnum(subject.supplierName) && subject.clientId === null && !alnum(subject.supplierCode) && !alnum(subject.supplierVatCode)) return hits;

  const rows = db.prepare(`SELECT p.id, p.clientId, p.clientCode, p.clientName, c.vatCode, COALESCE(p.series,'') AS series, p.number, p.purchaseDate AS date, p.sumWithVat AS gross,
      COALESCE(p.receiptNo,'') AS receiptNo, COALESCE(p.cashRegisterNo,'') AS cashRegisterNo
    FROM Purchase p LEFT JOIN Client c ON c.id=p.clientId WHERE p.companyId=? AND COALESCE(p.docType,'SF')='SF'
      AND (? IS NOT NULL AND p.clientId=? OR ?<>'' AND p.clientCode=? OR ?<>'' AND c.vatCode=? OR lower(COALESCE(p.clientName,''))=lower(?))`)
    .all(companyId, subject.clientId, subject.clientId, subject.supplierCode, subject.supplierCode, subject.supplierVatCode, subject.supplierVatCode, subject.supplierName) as
    { id: number; clientId: number | null; clientCode: string | null; clientName: string | null; vatCode: string | null; series: string; number: string; date: string; gross: number; receiptNo: string; cashRegisterNo: string }[];
  for (const r of rows) {
    const party = { clientId: r.clientId, supplierCode: r.clientCode || '', supplierVatCode: r.vatCode || '', supplierName: r.clientName || '' };
    if (!sameSupplier(subject, party)) continue;
    const strength = classifyDuplicate(subject, r);
    if (strength) hits.push({ kind: 'purchase', id: r.id, number: `${r.series}${r.number}`, date: r.date, gross: r.gross, strength });
  }

  const queue = db.prepare("SELECT id, extractedJson FROM PurchaseDocument WHERE companyId=? AND status IN ('NEW','EXTRACTED','FAILED') AND extractedJson IS NOT NULL").all(companyId) as { id: number; extractedJson: string }[];
  for (const d of queue) {
    if (d.id === excludeDocumentId) continue;
    let parsed;
    try { parsed = RecognizedDocumentSchema.safeParse(JSON.parse(d.extractedJson)); } catch { continue; }
    if (!parsed.success) continue;
    const x = parsed.data;
    const other = {
      series: x.series?.trim() || '', number: x.number?.trim() || '', receiptNo: x.receipt?.receiptNo?.trim() || '', cashRegisterNo: x.receipt?.cashRegisterNo?.trim() || '',
      date: x.issueDate || '', gross: x.totals.gross,
    };
    const party = { clientId: null, supplierCode: x.supplier.code || '', supplierVatCode: x.supplier.vatCode || '', supplierName: x.supplier.name || '' };
    // A queue document has no supplier id yet: compare by code / VAT code / name only.
    if (!sameSupplier({ ...subject, clientId: null }, party) && !(subject.clientId !== null && queueSupplierMatches(db, companyId, subject.clientId, party))) continue;
    const strength = classifyDuplicate(subject, other);
    if (strength) hits.push({ kind: 'document', id: d.id, number: other.series + other.number || other.receiptNo, date: other.date, gross: other.gross, strength });
  }
  return hits.sort((a, b) => rank(a) - rank(b) || b.date.localeCompare(a.date));
}

// The reviewed supplier is a known client: a queue document matches when its codes / name are the client's.
function queueSupplierMatches(db: Database.Database, companyId: number, clientId: number, party: { supplierCode: string; supplierVatCode: string; supplierName: string }) {
  const c = db.prepare('SELECT name, code, vatCode FROM Client WHERE id=? AND companyId=?').get(clientId, companyId) as { name: string; code: string | null; vatCode: string | null } | undefined;
  if (!c) return false;
  return sameSupplier({ clientId: null, supplierCode: c.code || '', supplierVatCode: c.vatCode || '', supplierName: c.name }, { clientId: null, ...party });
}
