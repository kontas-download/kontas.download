import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { requireAdminApi, checkOrigin } from '@/lib/access';
import { getDb } from '@/lib/db';
import { apiError } from '@/lib/errors';
import { runBackup, listR2Backups } from '@/lib/r2-backup';

// Whole-database snapshot for administrators.
// - GET: Downloads consistent SQLite backup directly, or ?r2=1 / ?list=1 for Cloudflare R2 operations
// - POST: Triggers immediate backup to Cloudflare R2
export async function GET(request?: Request) {
  let dir = '';
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;

    const url = request?.url ? new URL(request.url) : new URL('http://localhost:3000/api/admin/backup');

    // 1. List available backups from Cloudflare R2
    if (url.searchParams.has('list')) {
      const objects = await listR2Backups(url.searchParams.get('prefix') || 'backups/');
      return NextResponse.json({ success: true, objects });
    }

    // 2. Trigger on-demand backup of Container SQLite & Files to Cloudflare R2 via GET
    if (url.searchParams.has('r2')) {
      const manifest = await runBackup(url.searchParams.get('label') || 'admin-api');
      return NextResponse.json({ success: true, manifest });
    }

    // 3. Trigger on-demand backup of Cloudflare D1 directly into Cloudflare R2
    if (url.searchParams.has('d1')) {
      const bridgeUrl = process.env.D1_BACKUP_BRIDGE_URL || (process.env.D1_BRIDGE_URL || '').replace(/d1-bridge$/, 'd1-backup');
      try {
        const d1Res = await fetch(`${bridgeUrl}?reason=admin-api`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', ...(process.env.INTERNAL_BRIDGE_KEY ? { 'x-d1-bridge-key': process.env.INTERNAL_BRIDGE_KEY } : {}) },
        });
        const data = await d1Res.json();
        return NextResponse.json(data);
      } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
      }
    }

    // 3. Direct streaming download of SQLite snapshot
    for (const entry of fs.readdirSync(os.tmpdir())) {
      if (!entry.startsWith('kontas-backup-')) continue;
      const stale = path.join(os.tmpdir(), entry);
      try { 
        if (Date.now() - fs.statSync(stale).mtimeMs > 3_600_000) {
          fs.rmSync(stale, { recursive: true, force: true }); 
        }
      } catch { /* another request may be removing it */ }
    }

    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kontas-backup-'));
    const file = path.join(dir, 'backup.db');
    await getDb().backup(file);
    const size = fs.statSync(file).size;
    const stream = fs.createReadStream(file);
    const target = dir;
    stream.on('close', () => fs.rm(target, { recursive: true, force: true }, () => {}));
    const name = 'kontas-' + new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15) + '.db';
    return new NextResponse(Readable.toWeb(stream) as ReadableStream, { 
      headers: { 
        'Content-Type': 'application/vnd.sqlite3', 
        'Content-Length': String(size), 
        'Content-Disposition': `attachment; filename="${name}"`, 
        'Cache-Control': 'no-store' 
      } 
    });
  } catch (error) {
    if (dir) fs.rm(dir, { recursive: true, force: true }, () => {});
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;

    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;

    let label = 'admin-manual';
    try {
      const body = await request.json();
      if (body.label) label = body.label;
    } catch {}

    const manifest = await runBackup(label);
    return NextResponse.json({ success: true, manifest });
  } catch (error) {
    return apiError(error);
  }
}
