import { HttpError } from './errors';

// Web Share Target: files shared from the phone's "Share" sheet arrive as a multipart POST. This module holds the logic without framework imports.
export const SHARE_PATH = '/purchase-documents/share';
export const SHARE_ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const SHARE_MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_ERRORS = 5;

export interface ShareDeps {
  store: (input: { buffer: Buffer; fileName: string; mimeType: string; source: 'UPLOAD'; sender: string | null }) => { id: number };
  // null when recognition is not enabled for the company.
  recognize: ((id: number) => Promise<unknown>) | null;
}
export interface ShareResult { location: string; stored: number[]; errors: string[] }

// Stores every file as an uploaded document, runs recognition when enabled and returns where the browser should go next:
// the review page for a single document, otherwise the inbox. A failure of one file does not stop the others.
export async function processSharedFiles(files: File[], sender: string | null, deps: ShareDeps, translate: (message: string) => string = m => m): Promise<ShareResult> {
  const stored: number[] = [];
  const errors: string[] = [];
  let single: number | null = null;
  for (const file of files.slice(0, SHARE_MAX_FILES)) {
    try {
      if (file.size > MAX_FILE_SIZE) throw new HttpError(413, 'Failas per didelis: leidžiama iki 20 MB');
      const row = deps.store({ buffer: Buffer.from(await file.arrayBuffer()), fileName: file.name, mimeType: file.type, source: 'UPLOAD', sender });
      stored.push(row.id);
      single = row.id;
      if (deps.recognize) await deps.recognize(row.id).catch(() => undefined); // a failed recognition is saved on the document itself
    } catch (error) {
      const existingId = (error as { existingId?: unknown }).existingId;
      if (typeof existingId === 'number') single = existingId;
      errors.push(`${file.name}: ${translate(error instanceof Error ? error.message : 'Klaida')}`.slice(0, 300));
    }
  }
  if (files.length > SHARE_MAX_FILES) errors.push(translate('Per daug failų'));
  const query = errors.slice(0, MAX_ERRORS).map(e => `shareError=${encodeURIComponent(e)}`).join('&');
  // One file: its review page (for an already uploaded file, the existing document). Otherwise the inbox, with the failures.
  if (files.length === 1 && single !== null) return { location: `/purchase-documents/${single}`, stored, errors };
  return { location: query ? `/purchase-documents?${query}` : '/purchase-documents', stored, errors };
}

// The files part of the form, ignoring everything else a sender may add.
export function sharedFilesFrom(form: FormData): File[] {
  return form.getAll('files').filter((value): value is File => typeof value !== 'string' && value.size > 0);
}
