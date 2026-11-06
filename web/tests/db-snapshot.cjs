const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const execFileAsync = require('node:util').promisify(execFile);
const Database = require('better-sqlite3');

const script = path.join(__dirname, '../scripts/db-snapshot.cjs');
const startBridge = () => new Promise(resolve => {
  const store = new Map();
  const server = http.createServer((req, res) => {
    const key = new URL(req.url, 'http://x').searchParams.get('key');
    if (req.headers['x-d1-bridge-key'] !== 'secret') { res.statusCode = 401; return res.end('no'); }
    if (req.method === 'PUT') { const parts = []; req.on('data', d => parts.push(d)); req.on('end', () => { store.set(key, Buffer.concat(parts)); res.end('{}'); }); return; }
    if (store.has(key)) return res.end(store.get(key));
    res.statusCode = 404; res.end('{}');
  }).listen(0, () => resolve({ server, store, url: `http://127.0.0.1:${server.address().port}` }));
});

test('R2 snapshot daemon uploads changes and restore brings them back (updates included)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const dbPath = path.join(dir, 'a.db');
  const db = new Database(dbPath);
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t VALUES (1, 'old')");
  db.close();
  const { server, store, url } = await startBridge();
  const env = { ...process.env, R2_BRIDGE_URL: url, INTERNAL_BRIDGE_KEY: 'secret', DATABASE_URL: 'file:' + dbPath, SNAPSHOT_INTERVAL_S: '1', SNAPSHOT_FIRST_DELAY_S: '0.5' };
  try {
    const daemon = spawn(process.execPath, [script, '--daemon'], { env, stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2500));
    const writer = new Database(dbPath);
    writer.prepare("UPDATE t SET v = 'new' WHERE id = 1").run();
    writer.close();
    await new Promise(r => setTimeout(r, 3500));
    const exited = new Promise(r => daemon.once('exit', r));
    daemon.kill();
    await exited;
    assert.ok(store.has('db/latest.db.gz'));
    fs.rmSync(dbPath);
    await execFileAsync(process.execPath, [script, 'restore'], { env });
    const restored = new Database(dbPath, { readonly: true });
    assert.equal(restored.prepare('SELECT v FROM t WHERE id = 1').get().v, 'new');
    restored.close();
    // Missing/unauthorized bridge must not break startup: the image database stays in place
    fs.writeFileSync(path.join(dir, 'marker'), '');
    await execFileAsync(process.execPath, [script, 'restore'], { env: { ...env, INTERNAL_BRIDGE_KEY: 'wrong' } });
    assert.ok(fs.existsSync(dbPath));
  } finally { server.closeAllConnections(); server.close(); }
});

// ---- Strict restore (Cloudflare Containers): the image holds no database ----
const runRestore = (env) => new Promise(resolve => {
  execFile(process.execPath, [script, 'restore'], { env }, (error, stdout, stderr) => resolve({ code: error ? error.code : 0, out: stdout + stderr }));
});
const makeSnapshotDb = (dir, withCompany = true) => {
  const file = path.join(dir, 'src.db');
  const db = new Database(file);
  db.exec(withCompany ? "CREATE TABLE Company (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO Company VALUES (1, 'A')" : 'CREATE TABLE other (id INTEGER)');
  db.close();
  return fs.readFileSync(file);
};
const strictEnv = (dir, url, extra = {}) => {
  const env = { ...process.env, APP_ENV: 'cloudflare-containers', R2_BRIDGE_URL: url, INTERNAL_BRIDGE_KEY: 'secret', DATABASE_URL: 'file:' + path.join(dir, 'live.db'), ...extra };
  delete env.KONTAS_ALLOW_EMPTY_DATABASE;
  return Object.assign(env, extra);
};

test('strict restore: success restores the snapshot and exits 0', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const { server, store, url } = await startBridge();
  try {
    store.set('db/latest.db.gz', require('node:zlib').gzipSync(makeSnapshotDb(dir)));
    const r = await runRestore(strictEnv(dir, url));
    assert.equal(r.code, 0, r.out);
    const db = new Database(path.join(dir, 'live.db'), { readonly: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Company').get().n, 1);
    db.close();
  } finally { server.closeAllConnections(); server.close(); }
});

test('strict restore: wrong key / network error exits non-zero', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const { server, store, url } = await startBridge();
  try {
    store.set('db/latest.db.gz', require('node:zlib').gzipSync(makeSnapshotDb(dir)));
    const denied = await runRestore(strictEnv(dir, url, { INTERNAL_BRIDGE_KEY: 'wrong' }));
    assert.notEqual(denied.code, 0);
    const dead = await runRestore(strictEnv(dir, 'http://127.0.0.1:1'));
    assert.notEqual(dead.code, 0);
    assert.ok(!fs.existsSync(path.join(dir, 'live.db')));
    const unset = await runRestore(strictEnv(dir, ''));
    assert.notEqual(unset.code, 0);
  } finally { server.closeAllConnections(); server.close(); }
});

test('strict restore: no snapshot is refused unless KONTAS_ALLOW_EMPTY_DATABASE=1', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const { server, url } = await startBridge();
  try {
    const refused = await runRestore(strictEnv(dir, url));
    assert.notEqual(refused.code, 0);
    assert.match(refused.out, /KONTAS_ALLOW_EMPTY_DATABASE/);
    const allowed = await runRestore(strictEnv(dir, url, { KONTAS_ALLOW_EMPTY_DATABASE: '1' }));
    assert.equal(allowed.code, 0, allowed.out);
    assert.ok(!fs.existsSync(path.join(dir, 'live.db')));
  } finally { server.closeAllConnections(); server.close(); }
});

test('strict restore: corrupt, non-SQLite or Company-less snapshots are refused and nothing is written', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'));
  const { server, store, url } = await startBridge();
  const zlib = require('node:zlib');
  try {
    for (const bad of [Buffer.from('this is not a database at all'), makeSnapshotDb(dir, false), makeSnapshotDb(dir).subarray(0, 100)]) {
      store.set('db/latest.db.gz', zlib.gzipSync(bad));
      const r = await runRestore(strictEnv(dir, url, { KONTAS_ALLOW_EMPTY_DATABASE: '1' }));
      assert.notEqual(r.code, 0, 'a bad snapshot must fail even with the empty-database flag');
      assert.ok(!fs.existsSync(path.join(dir, 'live.db')));
      assert.ok(!fs.existsSync(path.join(dir, 'live.db.restore')));
    }
  } finally { server.closeAllConnections(); server.close(); }
});

test('image bakes no database and the entrypoint stops when the restore fails', { skip: !fs.existsSync(path.join(__dirname, '..', '..', 'providers', 'cloudflare-containers', 'Dockerfile')) && 'private provider folder is not part of the release' }, () => {
  const root = path.join(__dirname, '..', '..');
  const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
  const dockerfile = read('providers', 'cloudflare-containers', 'Dockerfile');
  assert.ok(!/COPY[^\n]*dev\.db/.test(dockerfile), 'Dockerfile must not COPY a database');
  const ignore = read('.dockerignore');
  assert.ok(ignore.includes('**/*.db'));
  assert.ok(!/^!.*\.db\s*$/m.test(ignore), '.dockerignore must have no database exception');
  const entry = read('providers', 'cloudflare-containers', 'entrypoint.sh');
  assert.match(entry, /db-snapshot\.cjs restore \|\| \{[^}]*exit 1/);
  assert.match(entry, /litestream restore -config[^\n]*\|\| \{[^}]*exit 1/);
  assert.match(entry, /KONTAS_ALLOW_EMPTY_DATABASE/);
  assert.ok(entry.indexOf('db-snapshot.cjs restore') < entry.indexOf('exec $SERVER_CMD'));
  const worker = read('providers', 'cloudflare-containers', 'src', 'worker.ts');
  assert.match(worker, /status: 503/);
  assert.match(worker, /nepavyko atkurti duomen/);
});
