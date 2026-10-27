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
export function listInvoiceArchive(companyId: number, saleId: number): ArchiveEntry[] {
  return getDb().prepare('SELECT id,saleId,docNumber,filename,sha256,size,recipient,messageId,createdAt FROM InvoiceArchive WHERE companyId=? AND saleId=? ORDER BY id DESC').all(companyId, saleId) as ArchiveEntry[];
}
export function readInvoiceArchive(companyId: number, saleId: number, id: number) {
  const row = getDb().prepare('SELECT filename,sha256,pdf FROM InvoiceArchive WHERE id=? AND companyId=? AND saleId=?').get(id, companyId, saleId) as { filename: string; sha256: string; pdf: Buffer } | undefined;
  if (!row) throw new HttpError(404, 'Archyvinė kopija nerasta');
  if (createHash('sha256').update(row.pdf).digest('hex') !== row.sha256) throw new HttpError(500, 'Archyvinė kopija pažeista: kontrolinė suma nesutampa');
  return row;
}
