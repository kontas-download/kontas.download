import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError } from '@/lib/errors';

// Whole-database snapshot for administrators, made with SQLite's online backup API (consistent while the app keeps running).
// There is deliberately no restore endpoint: restoring is an operator procedure (see ACCOUNTING.md). The file contains every
// company, user password hashes and encrypted SMTP passwords, but not the encryption key.
export async function GET() {
  let dir = '';
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    // Copies whose download never started (the client disconnected early) would otherwise stay in the temp folder.
    for (const entry of fs.readdirSync(os.tmpdir())) {
      if (!entry.startsWith('kontas-backup-')) continue;
      const stale = path.join(os.tmpdir(), entry);
      try { if (Date.now() - fs.statSync(stale).mtimeMs > 3_600_000) fs.rmSync(stale, { recursive: true, force: true }); } catch { /* another request may be removing it */ }
    }
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kontas-backup-'));
    const file = path.join(dir, 'backup.db');
    await getDb().backup(file);
    const size = fs.statSync(file).size;
    const stream = fs.createReadStream(file);
    const target = dir;
    stream.on('close', () => fs.rm(target, { recursive: true, force: true }, () => {}));
    const name = 'kontas-' + new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15) + '.db';
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, { headers: { 'Content-Type': 'application/vnd.sqlite3', 'Content-Length': String(size), 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
    return apiError(error);
  }
}
