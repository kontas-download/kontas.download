/**
 * Cloudflare R2 Database & File Backup Runner
 *
 * Capabilities:
 * 1. Database Backup: Creates consistent SQLite WAL snapshots & SQL dumps and uploads them to Cloudflare R2.
 * 2. Files Backup: Archives user documents, invoices, templates, and uploads to Cloudflare R2.
 * 3. Manifest: Generates backups/manifest.json tracking all point-in-time snapshots.
 * 4. Daemon mode: Runs backups automatically on a scheduled interval (e.g. every 6 hours).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');
const Database = require('better-sqlite3');

const R2_BRIDGE_URL = process.env.R2_BRIDGE_URL || '';
const DB_PATH = process.env.DATABASE_URL?.startsWith('file:') 
  ? process.env.DATABASE_URL.slice(5) 
  : path.join(__dirname, '..', 'prisma', 'dev.db');

async function uploadToR2(key, buffer, contentType = 'application/octet-stream') {
  const url = `${R2_BRIDGE_URL}?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      ...(process.env.INTERNAL_BRIDGE_KEY ? { 'x-d1-bridge-key': process.env.INTERNAL_BRIDGE_KEY } : {}),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Kontas-Backup/1.0',
    },
    body: buffer,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 Upload Error (${res.status}): ${text}`);
  }

  return await res.json();
}

async function listR2Backups(prefix = 'backups/') {
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

  const data = await res.json();
  return data.objects || [];
}

function generateSqlDump(db) {
  const lines = ['PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n'];
  const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();

  for (const t of tables) {
    lines.push(`-- Table: ${t.name}\n${t.sql};\n`);
    const rows = db.prepare(`SELECT * FROM "${t.name}"`).all();
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

function createFilesArchive() {
  const tmpDir = os.tmpdir();
  const archivePath = path.join(tmpDir, `kontas-files-${Date.now()}.tar.gz`);

  // Target directories containing uploaded or generated files
  const rootDir = path.resolve(__dirname, '..');
  const candidateDirs = [
    path.join(rootDir, 'public', 'invoices'),
    path.join(rootDir, 'public', 'uploads'),
    path.join(rootDir, 'docs', 'vmi'),
  ];

  const existingDirs = candidateDirs.filter(d => fs.existsSync(d) && fs.readdirSync(d).length > 0);

  if (existingDirs.length === 0) {
    // If no specific uploads folder exists, archive templates / public folder
    const publicDir = path.join(rootDir, 'public');
    if (fs.existsSync(publicDir)) {
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

async function runBackup(label = 'auto') {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Database file not found at ${DB_PATH}`);
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15); // YYYYMMDD-HHMMSS

  console.log(`[R2 Backup] Starting backup routine (${label}) at ${now.toISOString()}...`);

  const db = new Database(DB_PATH, { readonly: true });
  const check = db.prepare('PRAGMA integrity_check').get();
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

  console.log(`[R2 Backup] Uploading SQLite snapshot (${(dbBuffer.length / 1024 / 1024).toFixed(2)} MB)...`);
  const r2DbRes = await uploadToR2(dbKey, dbBuffer, 'application/vnd.sqlite3');
  await uploadToR2(latestDbKey, dbBuffer, 'application/vnd.sqlite3');
  console.log(`[✔] SQLite snapshot uploaded: ${r2DbRes.url}`);

  // 2. SQL Dump Export
  console.log('[R2 Backup] Generating SQL schema & data dump...');
  const sqlBuffer = generateSqlDump(db);
  const sqlKey = `backups/database/${dateStr}/kontas-export-${stamp}-${label}.sql`;
  const latestSqlKey = `backups/database/latest.sql`;
  await uploadToR2(sqlKey, sqlBuffer, 'application/sql; charset=utf-8');
  await uploadToR2(latestSqlKey, sqlBuffer, 'application/sql; charset=utf-8');
  console.log(`[✔] SQL dump uploaded: /storage/${sqlKey}`);

  // 3. User Files Archive
  let fileKey = null;
  const filesBuffer = createFilesArchive();
  if (filesBuffer && filesBuffer.length > 0) {
    console.log(`[R2 Backup] Uploading files archive (${(filesBuffer.length / 1024).toFixed(1)} KB)...`);
    fileKey = `backups/files/${dateStr}/kontas-files-${stamp}-${label}.tar.gz`;
    await uploadToR2(fileKey, filesBuffer, 'application/gzip');
    await uploadToR2(`backups/files/latest.tar.gz`, filesBuffer, 'application/gzip');
    console.log(`[✔] Files archive uploaded: /storage/${fileKey}`);
  }

  // 4. Update Backups Manifest
  const companyCount = db.prepare('SELECT COUNT(*) as n FROM Company').get().n;
  const salesCount = db.prepare('SELECT COUNT(*) as n FROM Sale').get().n;
  const purchasesCount = db.prepare('SELECT COUNT(*) as n FROM Purchase').get().n;
  const clientsCount = db.prepare('SELECT COUNT(*) as n FROM Client').get().n;

  const manifest = {
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
      }
    },
    files: fileKey ? {
      key: fileKey,
      size: filesBuffer.length,
      latest: `/storage/backups/files/latest.tar.gz`,
    } : null,
    storage: 'cloudflare-r2',
    bucket: 'kontas-storage',
  };

  const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8');
  await uploadToR2(`backups/manifest.json`, manifestBuffer, 'application/json');
  console.log('[✔] Backups manifest updated in Cloudflare R2 (/storage/backups/manifest.json)');

  db.close();
  return manifest;
}

function startBackupDaemon(intervalHours = 6) {
  console.log(`[R2 Backup Daemon] Initializing daemon (every ${intervalHours} hours)...`);
  // Delay initial backup by 5 minutes so container boot is instantaneous and uninterrupted
  const initialDelayMs = 5 * 60 * 1000;
  setTimeout(() => {
    runBackup('startup').catch(err => console.error('[R2 Backup Error]', err.message));
  }, initialDelayMs);

  const ms = intervalHours * 3600 * 1000;
  setInterval(() => {
    runBackup('scheduled').catch(err => console.error('[R2 Backup Scheduled Error]', err.message));
  }, ms);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--daemon')) {
    const hours = Number(process.env.BACKUP_INTERVAL_HOURS) || 6;
    startBackupDaemon(hours);
  } else if (args.includes('--list')) {
    listR2Backups().then(objs => {
      console.log(`[R2 Backups] Found ${objs.length} objects:`);
      for (const o of objs) {
        console.log(` - ${o.key} (${(o.size / 1024).toFixed(1)} KB, ${o.uploaded}) -> ${o.url}`);
      }
    }).catch(err => console.error(err));
  } else {
    runBackup('manual').then(m => {
      console.log('\n[SUCCESS] Backup successfully stored in Cloudflare R2:');
      console.log(JSON.stringify(m, null, 2));
    }).catch(err => {
      console.error('\n[FAILED] Backup failed:', err);
      process.exit(1);
    });
  }
}

module.exports = { runBackup, listR2Backups, uploadToR2 };
