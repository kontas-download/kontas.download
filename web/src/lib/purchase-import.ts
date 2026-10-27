import { createHash } from 'node:crypto';
import { inheritCreditCodes } from './tax-line-codes';
import type Database from 'better-sqlite3';
import { getDb } from './db';
import { HttpError } from './errors';
import { findItem, inventorySettings } from './inventory';
import { totalLines } from './money';
import { createPurchase } from './purchases';
import { insertPurchaseCredit, planPurchaseCredit } from './purchase-credit';
import { parseUblInvoice, type UblInvoice } from './ubl-invoice';

export interface CreditOriginal { id: number; number: string; series: string | null; purchaseDate: string; sumWithoutVat: number; vat: number; sumWithVat: number }
export interface CreditPreview {
  reference: { number: string; issueDate: string | null } | null;
  original: CreditOriginal | null;
  // Offered only when the file has no reference: purchases of the same supplier the user may pick explicitly.
  candidates: CreditOriginal[];
  effect: { net: number; vat: number; gross: number; deductionPercent: number | null; deductibleVatReversed: number | null } | null;
}
export interface ImportPreview {
  kind: 'invoice' | 'credit';
  credit: CreditPreview | null;
  ok: boolean;
  issues: string[];
  warnings: string[];
  needsSupplier: boolean;
  supplier: { clientId: number | null; name: string; code: string; vatCode: string } | null;
  invoice: { number: string; issueDate: string; dueDate: string | null; net: number; vat: number; gross: number; lines: number } | null;
  sha256: string;
}

const norm = (value: string) => value.replace(/\s+/g, '').toUpperCase();

function matchSupplier(db: Database.Database, companyId: number, inv: UblInvoice) {
  const { regNumber, vatCode } = inv.supplier;
  const row = (regNumber && db.prepare('SELECT id FROM Client WHERE companyId=? AND code=?').get(companyId, regNumber))
    || (vatCode && db.prepare('SELECT id FROM Client WHERE companyId=? AND UPPER(REPLACE(vatCode,\' \',\'\'))=?').get(companyId, vatCode));
  return row ? (row as { id: number }).id : null;
}

function buyerMatches(db: Database.Database, companyId: number, inv: UblInvoice): boolean | null {
  const c = db.prepare('SELECT code, vatCode FROM Company WHERE id=?').get(companyId) as { code: string | null; vatCode: string | null };
  const checks: boolean[] = [];
  if (c.vatCode && inv.buyer.vatCode) checks.push(norm(c.vatCode) === norm(inv.buyer.vatCode));
  if (c.code && inv.buyer.regNumber) checks.push(norm(c.code) === norm(inv.buyer.regNumber));
  return checks.length ? checks.some(Boolean) : null;
}

const SUPPLIER_SQL = '(clientId=? OR (clientId IS NULL AND clientName=?))';
const ORIGINAL_COLUMNS = 'id,number,series,purchaseDate,sumWithoutVat,vat,sumWithVat';

// Finds the purchase a supplier credit note refers to. Anything ambiguous is refused; nothing is guessed.
function resolveOriginal(db: Database.Database, companyId: number, inv: UblInvoice, clientId: number | null, chosenId: number | undefined): { original: CreditOriginal | null; candidates: CreditOriginal[]; issue?: string } {
  const none = { original: null, candidates: [] as CreditOriginal[] };
  const base = `FROM Purchase WHERE companyId=? AND COALESCE(docType,'SF')='SF' AND ${SUPPLIER_SQL}`;
  const ref = inv.reference;
  if (!ref) {
    const candidates = db.prepare(`SELECT ${ORIGINAL_COLUMNS} ${base} ORDER BY purchaseDate DESC, id DESC LIMIT 50`).all(companyId, clientId, inv.supplier.name) as CreditOriginal[];
    if (chosenId === undefined) return { ...none, candidates, issue: 'Kreditiniame dokumente nėra nuorodos į pradinę sąskaitą (BillingReference): pasirinkite pradinį pirkimą rankiniu būdu' };
    const chosen = candidates.find(c => c.id === chosenId);
    if (!chosen) return { ...none, candidates, issue: 'Pasirinktas pirkimas nerastas tarp šio tiekėjo įmonės pirkimų' };
    return { original: chosen, candidates };
  }
  const found = db.prepare(`SELECT ${ORIGINAL_COLUMNS},clientId,clientName FROM Purchase WHERE companyId=? AND COALESCE(docType,'SF')='SF' AND REPLACE(TRIM(COALESCE(series,''))||TRIM(number),' ','')=REPLACE(?,' ','')`).all(companyId, ref.number.trim()) as (CreditOriginal & { clientId: number | null; clientName: string | null })[];
  if (!found.length) return { ...none, issue: `Pradinė sąskaita ${ref.number} nerasta įmonės pirkimuose` };
  const dated = ref.issueDate ? found.filter(f => f.purchaseDate === ref.issueDate) : found;
  if (!dated.length) return { ...none, issue: `Sąskaita ${ref.number} rasta, bet jos data nesutampa su nuorodoje nurodyta data (${ref.issueDate})` };
  const same = dated.filter(f => clientId !== null ? f.clientId === clientId : f.clientId === null && f.clientName === inv.supplier.name);
  if (!same.length) return { ...none, issue: `Sąskaita ${ref.number} rasta, bet priklauso kitam tiekėjui` };
  if (same.length > 1) return { ...none, issue: `Nuorodą į sąskaitą ${ref.number} atitinka keli pirkimai: pradinis dokumentas nenustatytas` };
  const original: CreditOriginal = { id: same[0].id, number: same[0].number, series: same[0].series, purchaseDate: same[0].purchaseDate, sumWithoutVat: same[0].sumWithoutVat, vat: same[0].vat, sumWithVat: same[0].sumWithVat };
  if (chosenId !== undefined && chosenId !== original.id) return { ...none, issue: 'Pasirinktas pirkimas nesutampa su faile nurodyta nuoroda į pradinę sąskaitą' };
  return { original, candidates: [] };
}

const creditReason = (inv: UblInvoice, original: CreditOriginal) => `Importuota iš XML: kreditinė sąskaita ${inv.number} prie ${original.series || ''}${original.number}`.slice(0, 500);

export function previewXmlPurchase(db: Database.Database, companyId: number, xml: string, options: { originalPurchaseId?: number; warehouseName?: string } = {}): ImportPreview {
  const sha256 = createHash('sha256').update(xml).digest('hex');
  const parsed = parseUblInvoice(xml);
  const issues = [...parsed.issues];
  const warnings = [...parsed.warnings];
  const inv = parsed.invoice;
  if (!inv) return { kind: 'invoice', credit: null, ok: false, issues, warnings, needsSupplier: false, supplier: null, invoice: null, sha256 };
  const isCredit = inv.kind === 'credit';

  if (db.prepare('SELECT 1 FROM PurchaseSource WHERE companyId=? AND sha256=?').get(companyId, sha256)) issues.push('Šis failas jau importuotas');
  const match = buyerMatches(db, companyId, inv);
  if (match === false) issues.push(isCredit ? 'Kreditinis dokumentas išrašytas kitam asmeniui: pirkėjo kodas arba PVM kodas nesutampa su įmonės duomenimis' : 'Sąskaita išrašyta kitam asmeniui: pirkėjo kodas arba PVM kodas nesutampa su įmonės duomenimis');
  if (match === null) warnings.push('Nepavyko palyginti pirkėjo: įmonės duomenyse arba sąskaitoje nėra juridinio asmens kodo ir PVM kodo');

  const clientId = matchSupplier(db, companyId, inv);
  const duplicate = db.prepare(`SELECT 1 FROM Purchase WHERE companyId=? AND number=? AND COALESCE(series,'')='' AND (clientId=? OR (clientId IS NULL AND clientName=?))`).get(companyId, inv.number, clientId, inv.supplier.name);
  if (duplicate) issues.push(isCredit ? `Šio tiekėjo dokumentas ${inv.number} jau yra pirkimuose` : `Šio tiekėjo sąskaita ${inv.number} jau yra pirkimuose`);

  let totals = { sumWithoutVat: 0, vat: 0, sumWithVat: 0 };
  try {
    totals = totalLines(buildItems(inv));
    if (Math.round(totals.sumWithoutVat * 100) !== Math.round(inv.totals.net * 100)) issues.push(`Suma be PVM po perskaičiavimo (${totals.sumWithoutVat.toFixed(2)}) nelygi sąskaitos sumai (${inv.totals.net.toFixed(2)})`);
    if (Math.round(totals.vat * 100) !== Math.round(inv.totals.tax * 100)) issues.push(`PVM po perskaičiavimo pagal eilutes (${totals.vat.toFixed(2)}) skiriasi nuo sąskaitos PVM (${inv.totals.tax.toFixed(2)}): įveskite sąskaitą rankiniu būdu`);
  } catch (error) {
    issues.push(error instanceof HttpError ? error.message : 'Nepavyko perskaičiuoti eilučių');
  }
  // Same stock-card / warehouse check as the inventory posting, so a warehouse mismatch is reported before the commit.
  if (!isCredit) {
    const settings = inventorySettings(db, companyId);
    if (settings.method !== 'OFF' && !(settings.startDate && inv.issueDate < settings.startDate)) {
      try { for (const l of inv.lines) findItem(db, companyId, l.code || null, options.warehouseName || null); } catch (error) { if (!(error instanceof HttpError)) throw error; issues.push(error.message); }
    }
  }
  let credit: CreditPreview | null = null;
  if (isCredit) {
    if (clientId === null) issues.push('Tiekėjas nerastas žinyne: kreditinis dokumentas negali remtis nežinomo tiekėjo pirkimais');
    const resolved = clientId === null ? { original: null, candidates: [] as CreditOriginal[] } : resolveOriginal(db, companyId, inv, clientId, options.originalPurchaseId);
    if ('issue' in resolved && resolved.issue) issues.push(resolved.issue);
    credit = { reference: inv.reference, original: resolved.original, candidates: resolved.candidates, effect: null };
    if (resolved.original) {
      try {
        const plan = planPurchaseCredit(db, companyId, resolved.original.id, { number: inv.number, purchaseDate: inv.issueDate, reason: creditReason(inv, resolved.original), items: buildItems(inv) });
        if (plan.original.currencyCode && plan.original.currencyCode !== 'EUR') issues.push(`Pradinio dokumento valiuta ${plan.original.currencyCode}`);
        credit.effect = { net: plan.totals.sumWithoutVat, vat: plan.totals.vat, gross: plan.totals.sumWithVat, deductionPercent: plan.deductionPercent, deductibleVatReversed: plan.deductibleVat === null ? null : -plan.deductibleVat };
      } catch (error) {
        issues.push(error instanceof HttpError ? error.message : 'Nepavyko patikrinti kreditinio dokumento');
      }
    }
  }
  return {
    kind: inv.kind, credit,
    ok: issues.length === 0,
    issues, warnings,
    needsSupplier: !isCredit && clientId === null,
    supplier: { clientId, name: inv.supplier.name, code: inv.supplier.regNumber, vatCode: inv.supplier.vatCode },
    invoice: { number: inv.number, issueDate: inv.issueDate, dueDate: inv.dueDate, net: inv.totals.net, vat: inv.totals.tax, gross: inv.totals.gross, lines: inv.lines.length },
    sha256,
  };
}

function buildItems(inv: UblInvoice) {
  return inv.lines.map(l => ({ itemName: l.name.slice(0, 300), itemCode: l.code || undefined, quantity: l.quantity, price: l.unitPrice, vatRate: l.rate }));
}

// Creates the purchase (and the supplier when explicitly allowed) and keeps the original XML. All or nothing.
export function importXmlPurchase(companyId: number, xml: string, options: { filename?: string; createSupplier?: boolean; originalPurchaseId?: number; deductionPercent?: number; debitAccount?: string; warehouseName?: string } = {}) {
  const db = getDb();
  return db.transaction(() => {
    const preview = previewXmlPurchase(db, companyId, xml, { originalPurchaseId: options.originalPurchaseId, warehouseName: options.warehouseName });
    if (!preview.ok) throw Object.assign(new HttpError(422, 'Sąskaita neimportuota: ' + preview.issues[0]), { preview });
    const inv = parseUblInvoice(xml).invoice!;
    if (inv.kind === 'credit') {
      const original = preview.credit!.original!;
      const purchaseId = insertPurchaseCredit(db, companyId, original.id, { number: inv.number, purchaseDate: inv.issueDate, reason: creditReason(inv, original), items: buildItems(inv) });
      db.prepare('INSERT INTO PurchaseSource(companyId,purchaseId,sha256,filename,docNumber,supplierName,xml,importedAt) VALUES(?,?,?,?,?,?,?,?)')
        .run(companyId, purchaseId, preview.sha256, options.filename?.slice(0, 200) || null, inv.number, inv.supplier.name, xml, Date.now());
      return { purchase: db.prepare('SELECT * FROM Purchase WHERE id=?').get(purchaseId), items: db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(purchaseId), preview, createdSupplier: false, missingTaxCodes: inheritCreditCodes(db, companyId, 'PURCHASE', original.id, purchaseId) };
    }
    let clientId = preview.supplier!.clientId;
    if (clientId === null) {
      if (!options.createSupplier) throw new HttpError(409, 'Tiekėjas nerastas žinyne. Patvirtinkite jo sukūrimą.');
      const res = db.prepare("INSERT INTO Client(companyId,name,code,vatCode,createdAt,updatedAt) VALUES(?,?,?,?,datetime('now'),datetime('now'))").run(companyId, inv.supplier.name.slice(0, 256), inv.supplier.regNumber || null, inv.supplier.vatCode || null);
      clientId = Number(res.lastInsertRowid);
    }
    const { purchase, items, purchaseId } = createPurchase(companyId, {
      series: '', number: inv.number, purchaseDate: inv.issueDate, clientId, clientName: inv.supplier.name, clientCode: inv.supplier.regNumber || null,
      notes: `Importuota iš XML${inv.dueDate ? `; apmokėti iki ${inv.dueDate}` : ''}`, items: buildItems(inv),
      ...(options.deductionPercent !== undefined ? { deductionPercent: options.deductionPercent } : {}), ...(options.debitAccount ? { debitAccount: options.debitAccount } : {}), ...(options.warehouseName ? { warehouseName: options.warehouseName } : {}),
    });
    db.prepare('INSERT INTO PurchaseSource(companyId,purchaseId,sha256,filename,docNumber,supplierName,xml,importedAt) VALUES(?,?,?,?,?,?,?,?)')
      .run(companyId, purchaseId, preview.sha256, options.filename?.slice(0, 200) || null, inv.number, inv.supplier.name, xml, Date.now());
    return { purchase, items, preview, createdSupplier: preview.supplier!.clientId === null };
  })();
}
