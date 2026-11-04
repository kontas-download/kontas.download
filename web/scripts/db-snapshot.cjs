/**
 * SQLite <-> Cloudflare R2 snapshot persistence for Cloudflare Containers.
 *
 * The container disk is ephemeral, so the live SQLite file is the only copy while the container runs.
 * - `restore`: before the app starts, downloads the newest snapshot from R2 (if any) over the image's baked dev.db.
 * - `--daemon`: every SNAPSHOT_INTERVAL_S seconds, if the database changed, uploads a consistent gzip snapshot.
 *
 * Unlike row-by-row D1 sync this keeps updates and deletes and needs no R2 S3 credentials (uses the Worker bridge).
 * Set DB_SNAPSHOT_SKIP_RESTORE=1 to force the database baked into the image (e.g. right after a data repair).
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const Database = require('better-sqlite3');

const BRIDGE = process.env.R2_BRIDGE_URL || '';
const KEY = process.env.INTERNAL_BRIDGE_KEY || '';
const DB_PATH = process.env.DATABASE_URL?.startsWith('file:')
  ? process.env.DATABASE_URL.slice(5)
  : path.join(__dirname, '..', 'prisma', 'dev.db');
const LATEST = 'db/latest.db.gz';
const INTERVAL_MS = (Number(process.env.SNAPSHOT_INTERVAL_S) || 30) * 1000;

const headers = (extra = {}) => ({ ...(KEY ? { 'x-d1-bridge-key': KEY } : {}), ...extra });
const objectUrl = (key) => `${BRIDGE}?key=${encodeURIComponent(key)}`;

async function restore() {
  if (!BRIDGE) {
    console.log('[DB Snapshot] R2_BRIDGE_URL is not set; snapshots are disabled.');
    return false;
  }
  if (process.env.DB_SNAPSHOT_SKIP_RESTORE === '1') {
    console.log('[DB Snapshot] Restore skipped (DB_SNAPSHOT_SKIP_RESTORE=1).');
    return false;
  }
  const res = await fetch(objectUrl(LATEST), { headers: headers() });
  if (res.status === 404) {
    console.log('[DB Snapshot] No snapshot in R2 yet; keeping the database from the image.');
    return false;
  }
  if (!res.ok) throw new Error(`R2 GET ${res.status}: ${await res.text()}`);

  const raw = zlib.gunzipSync(Buffer.from(await res.arrayBuffer()));
  const tmp = `${DB_PATH}.restore`;
  fs.writeFileSync(tmp, raw);
  const check = new Database(tmp, { readonly: true });
  const ok = check.pragma('integrity_check', { simple: true });
  check.close();
  if (ok !== 'ok') {
    fs.rmSync(tmp, { force: true });
    throw new Error(`Snapshot failed integrity_check: ${ok}`);
  }
  for (const ext of ['-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
  fs.renameSync(tmp, DB_PATH);
  console.log(`[DB Snapshot] Restored ${raw.length} bytes from R2 (${LATEST}).`);
  return true;
}

async function upload(key, buf) {
  const res = await fetch(objectUrl(key), {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/gzip' }),
    body: buf,
  });
  if (!res.ok) throw new Error(`R2 PUT ${key} ${res.status}: ${await res.text()}`);
}

async function snapshot(db) {
  const tmp = path.join(os.tmpdir(), `kontas-snapshot-${process.pid}.db`);
  try {
    await db.backup(tmp);
    const gz = zlib.gzipSync(fs.readFileSync(tmp), { level: 6 });
    const hour = new Date().toISOString().slice(0, 13).replace(/[-T]/g, '');
    await upload(LATEST, gz);
    await upload(`db/snapshots/${hour}.db.gz`, gz); // at most one per hour; overwritten within the hour
    return gz.length;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

function startDaemon() {
  if (!BRIDGE) return console.log('[DB Snapshot] R2_BRIDGE_URL is not set; snapshots are disabled.');
  const db = new Database(DB_PATH);
  db.pragma('busy_timeout = 5000');
  let lastVersion = -1;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const version = db.pragma('data_version', { simple: true });
      if (version === lastVersion) return;
      const bytes = await snapshot(db);
      lastVersion = version;
      console.log(`[DB Snapshot] Uploaded ${bytes} bytes to R2.`);
    } catch (err) {
      console.warn('[DB Snapshot] Upload failed, will retry:', err.message);
    } finally {
      running = false;
    }
  };

  // First upload shortly after boot so the baked database is also protected.
  setTimeout(tick, Number(process.env.SNAPSHOT_FIRST_DELAY_S ?? 15) * 1000);
  setInterval(tick, INTERVAL_MS);
  process.on('SIGTERM', () => tick().finally(() => process.exit(0)));
}

if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'restore') {
    // A failed restore must not block startup: the image database is a valid fallback.
    restore().catch((err) => console.warn('[DB Snapshot] Restore failed:', err.message));
  } else if (process.argv.includes('--daemon')) {
    startDaemon();
  } else {
    console.error('Usage: db-snapshot.cjs restore | --daemon');
    process.exit(2);
  }
}

module.exports = { restore, snapshot };
