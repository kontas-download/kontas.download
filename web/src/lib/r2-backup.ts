/**
 * Cloudflare R2 Database & Files Backup Service
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { getDb } from '@/lib/db';
import { documentsRootFor, listDocumentFiles } from '@/lib/document-files';

const R2_BRIDGE_URL = process.env.R2_BRIDGE_URL || '';

export interface R2ObjectItem {
  key: string;
  size: number;
  uploaded: string;
  etag: string;
  url: string;
}

export interface BackupManifest {
  timestamp: string;
  label: string;
  database: {
    key: string;
    size: number;
    latest: string;
    sqlKey: string;
    sqlSize: number;
    tables: {
      companies: number;
      sales: number;
      purchases: number;
      clients: number;
    };
  };
  files: {
    key: string;
    size: number;
    latest: string;
  } | null;
  // Originals of purchase documents: write-once files, only the ones missing in the bucket are uploaded.
  documents?: { total: number; uploaded: number; alreadyStored: number; failed: number; prefix: string };
  storage: string;
  bucket: string;
}

export async function uploadToR2(key: string, buffer: Buffer | Uint8Array, contentType = 'application/octet-stream') {
  const url = `${R2_BRIDGE_URL}?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      ...(process.env.INTERNAL_BRIDGE_KEY ? { 'x-d1-bridge-key': process.env.INTERNAL_BRIDGE_KEY } : {}),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Kontas-Backup/1.0',
    },
    body: buffer as any,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 Upload Error (${res.status}): ${text}`);
  }

  return await res.json();
}

export async function listR2Backups(prefix = 'backups/'): Promise<R2ObjectItem[]> {
  const url = `${R2_BRIDGE_URL}?list=1&prefix=${encodeURIComponent(prefix)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      ...(process.env.INTERNAL_BRIDGE_KEY ? { 'x-d1-bridge-key': process.env.INTERNAL_BRIDGE_KEY } : {}),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Kontas-Backup/1.0',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 List Error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { objects?: R2ObjectItem[] };
  return data.objects || [];
}

export function generateSqlDump(): Buffer {
  const db = getDb();
  const lines = ['PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n'];
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string; sql: string }[];

  for (const t of tables) {
    lines.push(`-- Table: ${t.name}\n${t.sql};\n`);
    const rows = db.prepare(`SELECT * FROM "${t.name}"`).all() as Record<string, unknown>[];
    if (rows.length === 0) continue;

    const cols = Object.keys(rows[0]);
    const colList = cols.map(c => `"${c}"`).join(', ');

    for (const r of rows) {
      const vals = cols.map(c => {
        const val = r[c];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
        return `'${String(val).replace(/'/g, "''")}'`;
      }).join(', ');
      lines.push(`INSERT OR REPLACE INTO "${t.name}" (${colList}) VALUES (${vals});\n`);
    }
  }

  lines.push('COMMIT;\nPRAGMA foreign_keys = ON;\n');
  return Buffer.from(lines.join(''), 'utf-8');
}

export function createFilesArchive(): Buffer | null {
  const tmpDir = os.tmpdir();
  const archivePath = path.join(tmpDir, `kontas-files-${Date.now()}.tar.gz`);
  const rootDir = process.cwd();

  const candidateDirs = [
    path.join(rootDir, 'public', 'invoices'),
    path.join(rootDir, 'public', 'uploads'),
    path.join(rootDir, 'docs', 'vmi'),
  ];

  // Runtime-only paths: the ignore comments keep the build from tracing (and shipping) the whole project into the image.
  const existingDirs = candidateDirs.filter(d => fs.existsSync(/*turbopackIgnore: true*/ d) && fs.readdirSync(/*turbopackIgnore: true*/ d).length > 0);

  if (existingDirs.length === 0) {
    const publicDir = path.join(rootDir, 'public');
    if (fs.existsSync(/*turbopackIgnore: true*/ publicDir)) {
      execSync(`tar -czf "${archivePath}" -C "${rootDir}" public`, { stdio: 'ignore' });
    } else {
      return null;
    }
  } else {
    const relDirs = existingDirs.map(d => path.relative(rootDir, d)).join(' ');
    execSync(`tar -czf "${archivePath}" -C "${rootDir}" ${relDirs}`, { stdio: 'ignore' });
  }

  if (fs.existsSync(archivePath)) {
    const buffer = fs.readFileSync(archivePath);
    try { fs.unlinkSync(archivePath); } catch {}
    return buffer;
  }
  return null;
}

// Uploads the original files of purchase documents to backups/documents/<storagePath>. The names are content hashes and the files
// never change, so a key that already exists with the same size is skipped. A failed file is counted and retried by the next backup.
export async function backupDocuments(): Promise<NonNullable<BackupManifest['documents']>> {
  const prefix = 'backups/documents/';
  const files = listDocumentFiles(documentsRootFor(getDb().name));
  const existing = new Map((await listR2Backups(prefix)).map(o => [o.key, o.size]));
  const root = documentsRootFor(getDb().name);
  let uploaded = 0, alreadyStored = 0, failed = 0;
  for (const file of files) {
    const key = prefix + file.rel;
    if (existing.get(key) === file.size) { alreadyStored++; continue; }
    try {
      await uploadToR2(key, fs.readFileSync(path.join(root, file.rel)));
      uploaded++;
    } catch (error) {
      failed++;
      console.error('Document backup failed', file.rel, error);
    }
  }
  return { total: files.length, uploaded, alreadyStored, failed, prefix };
}

export async function runBackup(label = 'manual'): Promise<BackupManifest> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);

  const db = getDb();
  const check = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string };
  if (check.integrity_check !== 'ok') {
    throw new Error(`Integrity check failed: ${JSON.stringify(check)}`);
  }

  // 1. Consistent SQLite Online Snapshot
  const tmpDbPath = path.join(os.tmpdir(), `kontas-backup-${stamp}.db`);
  await db.backup(tmpDbPath);
  const dbBuffer = fs.readFileSync(tmpDbPath);
  try { fs.unlinkSync(tmpDbPath); } catch {}

  const dbKey = `backups/database/${dateStr}/kontas-db-${stamp}-${label}.db`;
  const latestDbKey = `backups/database/latest.db`;

  await uploadToR2(dbKey, dbBuffer, 'application/vnd.sqlite3');
  await uploadToR2(latestDbKey, dbBuffer, 'application/vnd.sqlite3');

  // 2. SQL Dump Export
  const sqlBuffer = generateSqlDump();
  const sqlKey = `backups/database/${dateStr}/kontas-export-${stamp}-${label}.sql`;
  const latestSqlKey = `backups/database/latest.sql`;
  await uploadToR2(sqlKey, sqlBuffer, 'application/sql; charset=utf-8');
  await uploadToR2(latestSqlKey, sqlBuffer, 'application/sql; charset=utf-8');

  // 3. User Files Archive
  let fileKey: string | null = null;
  const filesBuffer = createFilesArchive();
  if (filesBuffer && filesBuffer.length > 0) {
    fileKey = `backups/files/${dateStr}/kontas-files-${stamp}-${label}.tar.gz`;
    await uploadToR2(fileKey, filesBuffer, 'application/gzip');
    await uploadToR2(`backups/files/latest.tar.gz`, filesBuffer, 'application/gzip');
  }

  // 4. Originals of purchase documents (not part of the database file)
  const documents = await backupDocuments();

  // 5. Manifest
  const companyCount = (db.prepare('SELECT COUNT(*) as n FROM Company').get() as { n: number }).n;
  const salesCount = (db.prepare('SELECT COUNT(*) as n FROM Sale').get() as { n: number }).n;
  const purchasesCount = (db.prepare('SELECT COUNT(*) as n FROM Purchase').get() as { n: number }).n;
  const clientsCount = (db.prepare('SELECT COUNT(*) as n FROM Client').get() as { n: number }).n;

  const manifest: BackupManifest = {
    timestamp: now.toISOString(),
    label,
    database: {
      key: dbKey,
      size: dbBuffer.length,
      latest: `/storage/${latestDbKey}`,
      sqlKey: sqlKey,
      sqlSize: sqlBuffer.length,
      tables: {
        companies: companyCount,
        sales: salesCount,
        purchases: purchasesCount,
        clients: clientsCount,
      },
    },
    files: fileKey ? {
      key: fileKey,
      size: filesBuffer!.length,
      latest: `/storage/backups/files/latest.tar.gz`,
    } : null,
    documents,
    storage: 'cloudflare-r2',
    bucket: 'kontas-storage',
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
  await uploadToR2(`backups/manifest.json`, manifestBuffer, 'application/json');

  return manifest;
}
