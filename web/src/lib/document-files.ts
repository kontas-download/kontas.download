import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hydrateDocuments } from './document-remote';

// Stored originals of purchase documents: write-once files named by their content hash under <data dir>/documents/<companyId>/<year>/.
// DOCUMENTS_DIR overrides the folder. Shared by recognition, backups and the company export.
export function documentsRootFor(dbFile: string) {
  return process.env.DOCUMENTS_DIR || path.join(path.dirname(dbFile), 'documents');
}

// Every stored file as a posix path relative to the root (the value kept in PurchaseDocument.storagePath).
export function listDocumentFiles(root: string): { rel: string; size: number }[] {
  const out: { rel: string; size: number }[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push({ rel: path.relative(root, full).split(path.sep).join('/'), size: fs.statSync(full).size });
    }
  };
  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

// tar.gz of the whole documents folder in the temp directory; null when there are no files. The caller deletes the returned file.
export function createDocumentsArchive(root: string): string | null {
  hydrateDocuments(root); // Cloudflare Containers: files kept only in R2 are fetched first
  if (!listDocumentFiles(root).length) return null;
  const target = path.join(os.tmpdir(), `kontas-documents-${Date.now()}-${process.pid}.tar.gz`);
  // GNU tar (Git for Windows) reads "C:" as a remote host unless told the names are local.
  try { execFileSync('tar', ['-czf', target, '-C', root, '.'], { stdio: 'ignore' }); } catch { execFileSync('tar', ['--force-local', '-czf', target, '-C', root, '.'], { stdio: 'ignore' }); }
  return target;
}
