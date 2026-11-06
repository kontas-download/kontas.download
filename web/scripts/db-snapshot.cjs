/**
 * SQLite <-> Cloudflare R2 snapshot persistence for Cloudflare Containers.
 *
 * The container disk is ephemeral, so the live SQLite file is the only copy while the container runs.
 * - `restore`: before the app starts, downloads the newest snapshot from R2 (if any) over the (absent) local database; the image bakes none.
 * - `--daemon`: every SNAPSHOT_INTERVAL_S seconds, if the database changed, uploads a consistent gzip snapshot.
 *
 * Unlike row-by-row D1 sync this keeps updates and deletes and needs no R2 S3 credentials (uses the Worker bridge).
 * Cloudflare mode (APP_ENV=cloudflare-containers) is strict: any restore failure exits non-zero, and a missing snapshot
 * is refused unless KONTAS_ALLOW_EMPTY_DATABASE=1 (first installation).
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

// Strict mode (Cloudflare Containers): the image carries NO database, so the portal must never start
// on anything but the newest R2 snapshot. Only an explicit KONTAS_ALLOW_EMPTY_DATABASE=1 (first installation)
// permits starting without a snapshot, and only when R2 answers "no snapshot exists" (404).
const isStrict = () => process.env.APP_ENV === 'cloudflare-containers';
const allowEmpty = () => process.env.KONTAS_ALLOW_EMPTY_DATABASE === '1';

class RestoreRefused extends Error {}

function verifyDatabase(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  if (head.toString('latin1') !== 'SQLite format 3\0') throw new Error('Restored file has no SQLite header');
  const check = new Database(file, { readonly: true });
  try {
    const ok = check.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') throw new Error(`Snapshot failed integrity_check: ${ok}`);
    if (isStrict()) check.prepare('SELECT COUNT(*) AS n FROM Company').get();
  } finally {
    check.close();
  }
}

function noSnapshot(reason) {
  if (!isStrict()) {
    console.log(`[DB Snapshot] ${reason}; keeping the local database.`);
    return false;
  }
  if (allowEmpty()) {
    console.warn(`[DB Snapshot] ${reason}. KONTAS_ALLOW_EMPTY_DATABASE=1: starting with an EMPTY database (first installation). / Pirmas diegimas: paleidziama su TUSCIA duomenu baze.`);
    return false;
  }
  throw new RestoreRefused(`${reason}. Refusing to start without a database. Set KONTAS_ALLOW_EMPTY_DATABASE=1 only for a first installation. / Atsisakoma paleisti be duomenu bazes. KONTAS_ALLOW_EMPTY_DATABASE=1 nustatykite tik pirmam diegimui.`);
}

async function restore() {
  if (!BRIDGE) {
    if (isStrict()) throw new RestoreRefused('R2_BRIDGE_URL is not set; cannot restore the database. / Nenustatytas R2_BRIDGE_URL, duomenu baze neatkurta.');
    console.log('[DB Snapshot] R2_BRIDGE_URL is not set; snapshots are disabled.');
    return false;
  }
  if (process.env.DB_SNAPSHOT_SKIP_RESTORE === '1') {
    if (isStrict() && !fs.existsSync(DB_PATH)) return noSnapshot('Restore skipped (DB_SNAPSHOT_SKIP_RESTORE=1) and no local database exists');
    console.log('[DB Snapshot] Restore skipped (DB_SNAPSHOT_SKIP_RESTORE=1).');
    return false;
  }
  const res = await fetch(objectUrl(LATEST), { headers: headers() });
  if (res.status === 404) return noSnapshot('No snapshot in R2 yet');
  if (!res.ok) throw new Error(`R2 GET ${res.status}: ${await res.text()}`);

  const raw = zlib.gunzipSync(Buffer.from(await res.arrayBuffer()));
  const tmp = `${DB_PATH}.restore`;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(tmp, raw);
  try {
    verifyDatabase(tmp);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
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
    restore().catch((err) => {
      if (isStrict()) {
        console.error('[DB Snapshot] Restore FAILED, the container must not start / Atkurti nepavyko, konteineris nepaleidziamas:', err.message);
        process.exit(1);
      }
      // Outside Cloudflare a failed restore must not block startup: the local database is a valid fallback.
      console.warn('[DB Snapshot] Restore failed:', err.message);
    });
  } else if (process.argv.includes('--daemon')) {
    startDaemon();
  } else {
    console.error('Usage: db-snapshot.cjs restore | --daemon');
    process.exit(2);
  }
}

module.exports = { restore, snapshot, verifyDatabase };
