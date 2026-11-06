import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Write-through copy of the stored purchase-document files in Cloudflare R2. On Cloudflare Containers the disk is ephemeral
// (the container is destroyed when idle and on every deploy), so the local folder is only a cache and R2 holds the truth:
// documents/<companyId>/<year>/<sha256>.<ext>, the same relative path as PurchaseDocument.storagePath. Off (every function is a
// no-op) on local and Docker installs. The calls are synchronous like the file code around them: the bridge request runs in a child
// process, so a document is in R2 before its database row is written.

export interface DocumentR2 {
  size(key: string): number | null;
  put(key: string, data: Buffer): void;
  get(key: string): Buffer | null;
  remove(key: string): void;
  list(prefix: string): { key: string; size: number }[];
}

const PREFIX = 'documents/';
export const BRIDGE_CHILD_SCRIPT = `
const [op, key] = process.argv.slice(1);
const base = process.env.R2_BRIDGE_URL || '';
const headers = process.env.INTERNAL_BRIDGE_KEY ? { 'x-d1-bridge-key': process.env.INTERNAL_BRIDGE_KEY } : {};
const url = (extra) => base + (base.includes('?') ? '&' : '?') + extra;
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', async () => {
  try {
    if (op === 'list') {
      let cursor = '';
      const out = [];
      for (;;) {
        const res = await fetch(url('list=1&limit=1000&prefix=' + encodeURIComponent(key) + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '')), { headers });
        if (!res.ok) throw new Error('R2 list ' + res.status);
        const data = await res.json();
        for (const o of data.objects || []) out.push({ key: o.key, size: o.size });
        if (!data.truncated || !data.cursor) break;
        cursor = data.cursor;
      }
      process.stdout.write(JSON.stringify(out));
      return;
    }
    const res = await fetch(url('key=' + encodeURIComponent(key)), op === 'put' ? { method: 'PUT', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: Buffer.concat(chunks) } : { method: op === 'delete' ? 'DELETE' : 'GET', headers });
    if (op === 'get' && res.status === 404) process.exit(44);
    if (!res.ok) throw new Error('R2 ' + op + ' ' + res.status);
    if (op === 'get') process.stdout.write(Buffer.from(await res.arrayBuffer()));
  } catch (error) { process.stderr.write(String(error && error.message || error)); process.exit(1); }
});
`;

function run(op: 'get' | 'put' | 'delete' | 'list', key: string, input?: Buffer) {
  const res = spawnSync(process.execPath, ['-e', BRIDGE_CHILD_SCRIPT, op, key], { input: input ?? Buffer.alloc(0), maxBuffer: 64 * 1024 * 1024, timeout: 120_000, env: process.env });
  if (res.error) throw res.error;
  return res;
}

// The Worker's R2 bridge (R2_BRIDGE_URL + INTERNAL_BRIDGE_KEY): the same path the database snapshots and backups use.
export const bridgeClient: DocumentR2 = {
  list(prefix) {
    const res = run('list', prefix);
    if (res.status !== 0) throw new Error(`R2 list failed: ${res.stderr.toString()}`);
    return JSON.parse(res.stdout.toString()) as { key: string; size: number }[];
  },
  size(key) { return bridgeClient.list(key).find(o => o.key === key)?.size ?? null; },
  put(key, data) {
    const res = run('put', key, data);
    if (res.status !== 0) throw new Error(`R2 upload failed: ${res.stderr.toString()}`);
  },
  get(key) {
    const res = run('get', key);
    if (res.status === 44) return null;
    if (res.status !== 0) throw new Error(`R2 download failed: ${res.stderr.toString()}`);
    return res.stdout;
  },
  remove(key) {
    const res = run('delete', key);
    if (res.status !== 0) throw new Error(`R2 delete failed: ${res.stderr.toString()}`);
  },
};

// undefined = use the environment; null = forced off; a client = forced on (tests).
let override: DocumentR2 | null | undefined;
export function setDocumentR2(client: DocumentR2 | null | undefined) { override = client; }
function client(): DocumentR2 | null {
  if (override !== undefined) return override;
  return process.env.APP_ENV === 'cloudflare-containers' && process.env.R2_BRIDGE_URL ? bridgeClient : null;
}
export const documentR2Enabled = () => client() !== null;

const keyOf = (rel: string) => PREFIX + rel;
// Originals and visual PDFs are named by their SHA-256; the derived <hash>.prep.jpg copy is not verifiable that way.
const hashOf = (rel: string) => /^([0-9a-f]{64})\.(?!prep\.)[a-z0-9]+$/.exec(path.posix.basename(rel))?.[1] ?? null;

// Uploads before the caller commits. An object that already exists is never overwritten: the same size counts as the same content
// (the name is the content hash), a different size is refused.
export function remotePut(rel: string, data: Buffer) {
  const r2 = client();
  if (!r2) return;
  const existing = r2.size(keyOf(rel));
  if (existing === null) { r2.put(keyOf(rel), data); return; }
  if (existing !== data.length) throw new Error(`R2 object ${keyOf(rel)} already exists with different content`);
}

export function remoteRemove(rel: string) {
  client()?.remove(keyOf(rel));
}

// Makes sure the file is on the local disk: downloads it from R2 when missing, verifying the SHA-256 of an original. True when it is there.
export function ensureLocalFile(root: string, rel: string): boolean {
  const full = path.resolve(root, rel);
  if (fs.existsSync(full)) return true;
  const r2 = client();
  if (!r2) return false;
  const data = r2.get(keyOf(rel));
  if (!data) return false;
  const expected = hashOf(rel);
  if (expected && createHash('sha256').update(data).digest('hex') !== expected) throw new Error(`R2 object ${keyOf(rel)} failed the SHA-256 check`);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const temp = `${full}.${process.pid}.tmp`;
  fs.writeFileSync(temp, data);
  fs.renameSync(temp, full);
  return true;
}

// Downloads every document file that exists in R2 but not on this disk (before an archive or backup of the whole folder).
export function hydrateDocuments(root: string): number {
  const r2 = client();
  if (!r2) return 0;
  let fetched = 0;
  for (const object of r2.list(PREFIX)) {
    const rel = object.key.slice(PREFIX.length);
    if (!rel || rel.includes('..') || fs.existsSync(path.resolve(root, rel))) continue;
    try { if (ensureLocalFile(root, rel)) fetched++; } catch (error) { console.error('[documents] hydrate failed', rel, error instanceof Error ? error.message : error); }
  }
  return fetched;
}

// One-time catch-up at start: uploads local document files that R2 does not have yet.
export async function syncLocalDocumentsToR2(root: string, files: { rel: string }[]): Promise<{ uploaded: number; failed: number }> {
  const r2 = client();
  const out = { uploaded: 0, failed: 0 };
  if (!r2) return out;
  const have = new Set(r2.list(PREFIX).map(o => o.key));
  for (const { rel } of files) {
    if (have.has(keyOf(rel))) continue;
    try { remotePut(rel, fs.readFileSync(path.join(root, rel))); out.uploaded++; } catch (error) { out.failed++; console.error('[documents] sync failed', rel, error instanceof Error ? error.message : error); }
    await new Promise(resolve => setImmediate(resolve));
  }
  return out;
}
