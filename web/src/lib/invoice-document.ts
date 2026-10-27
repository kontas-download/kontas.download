import { taxMode, type TaxMode } from './tax';
import { getDb } from './db';
import { HttpError } from './errors';
import { invoiceMailDraft, isDocLang, resolveDocLang, type DocLang } from './doc-language';
export interface Party { name: string; code: string | null; vatCode: string | null; address: string | null; email: string | null; bankName?: string | null; bankIban?: string | null; bankSwift?: string | null; isVatPayer: number; }
export interface DocumentItem { itemName: string; quantity: number; price: number; vatRate: number; sumWithoutVat: number; sumWithVat: number; }
export interface InvoiceDocument { lang: DocLang; vatMode: TaxMode; companyId: number; id: number; number: string; date: string; dueDate: string | null; currency: string; isVatPayer: boolean; seller: Party; buyer: Party; items: DocumentItem[]; net: number; vat: number; total: number; correction?: { originalNumber: string; originalDate: string; reason: string }; }
interface SaleRow { id: number; companyId: number; clientId: number | null; clientName: string; clientCode: string | null; clientVatCode: string | null; series: string | null; number: string; saleDate: string; payUntil: string | null; currencyCode: string; sellerIsVatPayer: number | null; sellerVatMode: TaxMode | null; docType: string | null; originalSaleId: number | null; correctionReason: string | null; sumWithoutVat: number; vat: number; sumWithVat: number; }
// `requestedLang` (chosen for this document) wins over the language stored on the customer; the default is Lithuanian.
export function invoiceDocument(id: number, companyId: number, requestedLang?: unknown): InvoiceDocument {
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas sąskaitos numeris');
  if (requestedLang !== undefined && requestedLang !== null && requestedLang !== '' && !isDocLang(requestedLang)) throw new HttpError(400, 'Nežinoma dokumento kalba (leidžiama: lt, ru, en)');
  const db = getDb();
  return db.transaction(() => {
    const sale = db.prepare('SELECT id,companyId,clientId,clientName,clientCode,clientVatCode,series,number,saleDate,payUntil,currencyCode,sellerIsVatPayer,sellerVatMode,docType,originalSaleId,correctionReason,sumWithoutVat,vat,sumWithVat FROM Sale WHERE id=? AND companyId=?').get(id,companyId) as SaleRow | undefined;
    if (!sale) throw new HttpError(404, 'Sąskaita nerasta');
    const seller = db.prepare('SELECT name,code,vatCode,address,email,bankName,bankIban,bankSwift,isVatPayer FROM Company WHERE id=?').get(companyId) as Party;
    // Legacy imports may not have clientId. Only an unambiguous code match is accepted.
    type StoredClient = Party & { documentLang?: string | null };
    let clients: StoredClient[] = [];
    if (sale.clientId) clients = db.prepare('SELECT name,code,vatCode,address,email,isVatPayer,documentLang FROM Client WHERE id=? AND companyId=?').all(sale.clientId,companyId) as StoredClient[];
    else if (sale.clientCode) clients = db.prepare('SELECT name,code,vatCode,address,email,isVatPayer,documentLang FROM Client WHERE code=? AND companyId=? LIMIT 2').all(sale.clientCode,companyId) as StoredClient[];
    const client = clients.length === 1 ? clients[0] : undefined;
    const buyer: Party = { name: sale.clientName || client?.name || '', code: sale.clientCode || client?.code || null, vatCode: sale.clientVatCode || null, address: client?.address || null, email: client?.email || null, isVatPayer: client?.isVatPayer ?? (sale.clientVatCode ? 1 : 0) };
    const items = db.prepare('SELECT itemName,quantity,price,vatRate,sumWithoutVat,sumWithVat FROM SaleItem WHERE saleId=? ORDER BY id').all(id) as DocumentItem[];
    if (!items.length) throw new HttpError(409, 'Sąskaitoje nėra eilučių. Prieš siųsdami patikrinkite dokumentą.');
    let correction: InvoiceDocument['correction'];
    if (sale.docType === 'KS') {
      const original = sale.originalSaleId ? db.prepare('SELECT series,number,saleDate FROM Sale WHERE id=? AND companyId=?').get(sale.originalSaleId,companyId) as {series:string|null;number:string;saleDate:string}|undefined : undefined;
      if (!original) throw new HttpError(409, 'Nerasta kreditinio dokumento pirminė sąskaita.');
      correction = { originalNumber: [original.series,original.number].filter(Boolean).join(' '), originalDate: original.saleDate, reason: sale.correctionReason || '' };
    }
    const vatMode=taxMode(sale.sellerVatMode,sale.sellerIsVatPayer ?? seller.isVatPayer);
    const isVatPayer=vatMode==='STANDARD_VAT';
    const net = items.reduce((s,i)=>s + Math.round(i.sumWithoutVat * 100),0);
    const total = items.reduce((s,i)=>s + Math.round(i.sumWithVat * 100),0);
    if (Math.abs(net - Math.round(sale.sumWithoutVat * 100)) > 1 || Math.abs(total - Math.round(sale.sumWithVat * 100)) > 1 || Math.abs(Math.round((sale.sumWithoutVat + sale.vat - sale.sumWithVat)*100)) > 1) throw new HttpError(409, 'Eilučių sumos nesutampa su sąskaitos suma. Prieš spausdindami ar siųsdami ištaisykite pirminius duomenis.');
    if (!isVatPayer && (Math.abs(sale.vat) > 0.001 || items.some(i=>Math.abs(i.sumWithVat-i.sumWithoutVat)>0.001))) throw new HttpError(409, 'PVM neatitinka pardavėjo statuso šioje sąskaitoje.');
    if (!seller.name || !buyer.name) throw new HttpError(409, 'Užpildykite pardavėjo ir pirkėjo pavadinimus');
    return { lang: resolveDocLang(requestedLang, client?.documentLang), vatMode, companyId, id, number: [sale.series,sale.number].filter(Boolean).join(' '), date: sale.saleDate, dueDate: sale.payUntil, currency: sale.currencyCode || 'EUR', isVatPayer, seller, buyer, items: items.map(i=>({...i, price: i.price === 0 && i.quantity > 0 && i.sumWithoutVat !== 0 ? i.sumWithoutVat / i.quantity : i.price})), net: sale.sumWithoutVat, vat: sale.vat, total: sale.sumWithVat, ...(correction ? { correction } : {}) };
  })();
}
export function invoiceFilename(doc: Pick<InvoiceDocument,'number'>) { return 'Invoice-' + doc.number.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80) + '.pdf'; }
export function invoiceEmailDraft(doc: InvoiceDocument) {
  return { to: doc.buyer.email || '', lang: doc.lang, ...invoiceMailDraft(doc.lang, { number: doc.number, total: doc.total, currency: doc.currency, dueDate: doc.dueDate, seller: doc.seller.name }) };
}
