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
