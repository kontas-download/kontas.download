import { createHash } from 'node:crypto';
import { getDb } from './db';
import { HttpError } from './errors';
import { invoiceFilename, type InvoiceDocument } from './invoice-document';

export interface ArchiveEntry { id: number; saleId: number; docNumber: string; filename: string; sha256: string; size: number; recipient: string | null; messageId: string | null; createdAt: number; }

// Stores the exact bytes that were attached to the email. Repeating the same requestId is a no-op.
export function archiveInvoicePdf(doc: InvoiceDocument, pdf: Buffer, delivery: { requestId: string; recipient: string; messageId: string }) {
  getDb().prepare('INSERT OR IGNORE INTO InvoiceArchive(companyId,saleId,requestId,docNumber,filename,sha256,size,pdf,snapshot,recipient,messageId,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(doc.companyId, doc.id, delivery.requestId, doc.number, invoiceFilename(doc), createHash('sha256').update(pdf).digest('hex'), pdf.length, pdf, JSON.stringify(doc), delivery.recipient, delivery.messageId, Date.now());
}
// Archives the sent PDF and stores the outcome on the delivery row. Never throws: a failed archive must not hide that the email was sent.
export function archiveDeliveredPdf(doc: InvoiceDocument, pdf: Buffer, delivery: { requestId: string; recipient: string; messageId: string }): 'ok' | 'failed' {
  let status: 'ok' | 'failed' = 'ok';
  try { archiveInvoicePdf(doc, pdf, delivery); } catch (error) { console.error('Invoice archive failed', error); status = 'failed'; }
  getDb().prepare('UPDATE InvoiceDelivery SET archiveStatus=? WHERE companyId=? AND requestId=?').run(status, doc.companyId, delivery.requestId);
  return status;
}
// Repeated request of an already sent email: returns the stored archive status and, when it was 'failed', re-renders the PDF and archives it again.
export async function settleDeliveryArchive(doc: InvoiceDocument, requestId: string, render: () => Promise<Buffer>): Promise<'ok' | 'failed' | null> {
  const row = getDb().prepare("SELECT recipient,messageId,archiveStatus FROM InvoiceDelivery WHERE companyId=? AND requestId=? AND status='sent'").get(doc.companyId, requestId) as { recipient: string; messageId: string; archiveStatus: 'ok' | 'failed' | null } | undefined;
  if (!row || row.archiveStatus !== 'failed') return row?.archiveStatus ?? null;
  try { return archiveDeliveredPdf(doc, await render(), { requestId, recipient: row.recipient, messageId: row.messageId }); }
  catch (error) { console.error('Invoice archive retry failed', error); return 'failed'; }
}
export function listInvoiceArchive(companyId: number, saleId: number): ArchiveEntry[] {
  return getDb().prepare('SELECT id,saleId,docNumber,filename,sha256,size,recipient,messageId,createdAt FROM InvoiceArchive WHERE companyId=? AND saleId=? ORDER BY id DESC').all(companyId, saleId) as ArchiveEntry[];
}
export function readInvoiceArchive(companyId: number, saleId: number, id: number) {
  const row = getDb().prepare('SELECT filename,sha256,pdf FROM InvoiceArchive WHERE id=? AND companyId=? AND saleId=?').get(id, companyId, saleId) as { filename: string; sha256: string; pdf: Buffer } | undefined;
  if (!row) throw new HttpError(404, 'Archyvinė kopija nerasta');
  if (createHash('sha256').update(row.pdf).digest('hex') !== row.sha256) throw new HttpError(500, 'Archyvinė kopija pažeista: kontrolinė suma nesutampa');
  return row;
}
