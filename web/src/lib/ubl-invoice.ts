import { XMLParser } from 'fast-xml-parser';

export interface UblParty { name: string; regNumber: string; vatCode: string; }
export interface UblLine { name: string; code: string; quantity: number; unitPrice: number; net: number; rate: number; category: string; }
export interface UblInvoice { kind: 'invoice' | 'credit'; reference: { number: string; issueDate: string | null } | null; number: string; issueDate: string; dueDate: string | null; currency: string; supplier: UblParty; buyer: UblParty; lines: UblLine[]; totals: { net: number; tax: number; gross: number; payable: number }; }
export interface UblResult { invoice: UblInvoice | null; issues: string[]; warnings: string[]; }

const MAX_BYTES = 2_000_000;
const cents = (value: number) => Math.round(value * 100);
const arr = <T,>(value: T | T[] | undefined): T[] => value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
// A text node may be a plain string or an object with attributes (#text).
const text = (value: any): string => value === undefined || value === null ? '' : typeof value === 'object' ? text(value['#text']) : String(value).trim();
const num = (value: any): number | null => {
  const raw = text(value);
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  return Number(raw);
};

function party(node: any): UblParty {
  const p = node?.Party || {};
  const legal = arr<any>(p.PartyLegalEntity)[0] || {};
  const tax = arr<any>(p.PartyTaxScheme).map(t => text(t.CompanyID)).find(Boolean) || '';
  return {
    name: text(legal.RegistrationName) || text(arr<any>(p.PartyName)[0]?.Name),
    regNumber: text(legal.CompanyID) || text(p.PartyIdentification?.ID) || '',
    vatCode: tax.replace(/\s+/g, '').toUpperCase(),
  };
}

const SUPPORTED_CATEGORIES = new Set(['S', 'Z', 'E', 'O']);

// Strict UBL 2.1 / Peppol BIS invoice reader. Anything that cannot be mapped without guessing is reported in `issues`.
export function parseUblInvoice(xml: string): UblResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const fail = (message: string): UblResult => ({ invoice: null, issues: [...issues, message], warnings });
  if (typeof xml !== 'string' || !xml.trim()) return fail('Tuščias failas');
  if (Buffer.byteLength(xml) > MAX_BYTES) return fail('Failas per didelis (daugiausia 2 MB)');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return fail('XML su DOCTYPE/ENTITY nepriimamas');
  let doc: any;
  try {
    doc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, parseAttributeValue: false, trimValues: true, processEntities: true }).parse(xml);
  } catch {
    return fail('Failas nėra teisingas XML');
  }
  const inv = doc.Invoice || doc.CreditNote;
  if (!inv) return fail('Tai nėra UBL sąskaita ar kreditinis dokumentas (nėra elemento Invoice/CreditNote)');
  const typeCode = text(inv.InvoiceTypeCode) || text(inv.CreditNoteTypeCode) || (doc.CreditNote ? '381' : '380');
  const kind: UblInvoice['kind'] = typeCode === '381' ? 'credit' : 'invoice';
  if (typeCode !== '380' && typeCode !== '381') issues.push(`Dokumento tipas ${typeCode} nepalaikomas (priimami 380 — sąskaita faktūra ir 381 — kreditinis dokumentas)`);
  if (doc.CreditNote && typeCode !== '381') issues.push(`CreditNote dokumentas, kurio tipas ${typeCode}, nepalaikomas (tikimasi 381)`);
  let reference: UblInvoice['reference'] = null;
  if (kind === 'credit') {
    const refs = arr<any>(inv.BillingReference);
    if (refs.length > 1) issues.push('Kreditiniame dokumente yra kelios nuorodos į pradines sąskaitas (BillingReference): priimama tiksliai viena');
    else if (refs.length === 1) {
      const docRefs = arr<any>(refs[0].InvoiceDocumentReference);
      const refNumber = docRefs.length === 1 ? text(docRefs[0].ID) : '';
      const refDate = docRefs.length === 1 ? text(docRefs[0].IssueDate) : '';
      if (!refNumber) issues.push('Nuorodoje į pradinę sąskaitą nėra numerio (InvoiceDocumentReference/ID)');
      else if (refDate && (!/^\d{4}-\d{2}-\d{2}$/.test(refDate) || new Date(refDate + 'T00:00:00Z').toISOString().slice(0, 10) !== refDate)) issues.push('Neteisinga pradinės sąskaitos data nuorodoje');
      else reference = { number: refNumber, issueDate: refDate || null };
    }
  }
  const number = text(inv.ID);
  if (!number) issues.push('Nenurodytas dokumento numeris (ID)');
  const issueDate = text(inv.IssueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate) || new Date(issueDate + 'T00:00:00Z').toISOString().slice(0, 10) !== issueDate) issues.push('Neteisinga išrašymo data (IssueDate)');
  const dueRaw = text(inv.DueDate);
  const currency = text(inv.DocumentCurrencyCode);
  if (currency !== 'EUR') issues.push(`Valiuta ${currency || 'nenurodyta'}: priimami tik EUR dokumentai`);
  if (arr(inv.AllowanceCharge).length) issues.push('Dokumento lygio nuolaidos ir antkainiai nepalaikomi');

  const supplier = party(inv.AccountingSupplierParty);
  const buyer = party(inv.AccountingCustomerParty);
  if (!supplier.name) issues.push('Nenurodytas tiekėjas');
  if (!supplier.regNumber && !supplier.vatCode) issues.push('Tiekėjas neturi nei juridinio asmens kodo, nei PVM kodo');

  const lines: UblLine[] = arr<any>(doc.CreditNote ? inv.CreditNoteLine : inv.InvoiceLine).map((l, i) => {
    const label = `Eilutė ${text(l.ID) || i + 1}`;
    const qty = num(doc.CreditNote ? l.CreditedQuantity : l.InvoicedQuantity);
    const net = num(l.LineExtensionAmount);
    const tax = arr<any>(l.Item?.ClassifiedTaxCategory)[0] || {};
    const category = text(tax.ID) || 'S';
    const rate = num(tax.Percent);
    const price = num(l.Price?.PriceAmount);
    const base = num(l.Price?.BaseQuantity) ?? 1;
    if (qty === null || !(qty > 0)) issues.push(`${label}: neteisingas kiekis`);
    if (net === null) issues.push(`${label}: neteisinga eilutės suma`);
    if (kind === 'credit' && net !== null && net < 0) issues.push(`${label}: neigiama eilutės suma kreditiniame dokumente`);
    if (rate === null) issues.push(`${label}: nenurodytas PVM tarifas`);
    if (!SUPPORTED_CATEGORIES.has(category)) issues.push(`${label}: PVM kategorija ${category} (pvz., atvirkštinis apmokestinimas) įvedama rankiniu būdu`);
    if (arr(l.AllowanceCharge).length) issues.push(`${label}: eilutės lygio nuolaidos ir antkainiai nepalaikomi`);
    const quantity = qty ?? 0;
    const lineNet = net ?? 0;
    const unitPrice = price !== null && base > 0 && cents(quantity * (price / base)) === cents(lineNet) ? price / base : quantity > 0 ? Math.round(lineNet / quantity * 1e6) / 1e6 : 0;
    return { name: text(l.Item?.Name) || text(l.Item?.Description) || 'Prekė / Paslauga', code: text(l.Item?.SellersItemIdentification?.ID), quantity, unitPrice, net: lineNet, rate: rate ?? 0, category };
  });
  if (!lines.length) issues.push('Dokumente nėra eilučių');

  const m = inv.LegalMonetaryTotal || {};
  const totals = { net: num(m.TaxExclusiveAmount), tax: num(arr<any>(inv.TaxTotal)[0]?.TaxAmount), gross: num(m.TaxInclusiveAmount), payable: num(m.PayableAmount) };
  if (totals.net === null || totals.tax === null || totals.gross === null || totals.payable === null) {
    issues.push('Nerastos galutinės dokumento sumos');
  } else {
    const lineSum = lines.reduce((n, l) => n + cents(l.net), 0);
    if (lineSum !== cents(totals.net)) issues.push(`Eilučių suma (${(lineSum / 100).toFixed(2)}) nelygi galutinei sumai be PVM (${totals.net.toFixed(2)})`);
    if (cents(totals.net) + cents(totals.tax) !== cents(totals.gross)) issues.push('Suma be PVM + PVM nelygi sumai su PVM');
    if (kind === 'credit' && totals.net < 0) issues.push('Kreditinio dokumento galutinės sumos turi būti teigiamos');
    if (num(m.AllowanceTotalAmount) && cents(num(m.AllowanceTotalAmount)!) !== 0) issues.push('Dokumento lygio nuolaidos nepalaikomos');
    if (num(m.ChargeTotalAmount) && cents(num(m.ChargeTotalAmount)!) !== 0) issues.push('Dokumento lygio antkainiai nepalaikomi');
    if (num(m.PrepaidAmount) && cents(num(m.PrepaidAmount)!) !== 0) warnings.push('Sąskaitoje nurodytas išankstinis apmokėjimas: mokėtina suma skiriasi nuo galutinės sumos');
    if (cents(totals.payable) !== cents(totals.gross) && !num(m.PrepaidAmount)) warnings.push(`Mokėtina suma (${totals.payable.toFixed(2)}) skiriasi nuo galutinės sumos su PVM (${totals.gross.toFixed(2)})`);
  }
  if (issues.length) return { invoice: null, issues, warnings };
  return { invoice: { kind, reference, number, issueDate, dueDate: /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null, currency, supplier, buyer, lines, totals: totals as UblInvoice['totals'] }, issues, warnings };
}
