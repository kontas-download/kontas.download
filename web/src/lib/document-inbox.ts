import { simpleParser } from 'mailparser';
import { getDb } from './db';
import { HttpError } from './errors';
import { encryptSecret, decryptSecret, validEmail } from './company-mail';
import { detectMime, getRecognitionSettings, looksLikeUblInvoice, storeDocument } from './purchase-recognition';
import { parseUblInvoice } from './ubl-invoice';
import { classifySender, senderAllowed, senderContext, type SenderContext } from './document-inbox-senders';
import { bodyText, originalSenderFromText } from './document-inbox-forward';

// Purchase documents received by e-mail. The company points the program at any IMAP mailbox; every few minutes the program
// reads new messages, accepts only the allowed senders and stores PDF / image attachments as received documents (source EMAIL).
// An XML e-invoice (UBL) is stored as a queue item read by the UBL reader (no recognition); a PDF of the same invoice in the same message
// becomes its visual original. Nothing is confirmed automatically: the documents wait in "Gauti dokumentai" like uploaded ones. The IMAP client is injected,
// so tests use a fake and this module never imports the network library.

export const MAX_ATTACHMENTS = 10;
export const MIN_INLINE_IMAGE = 20 * 1024; // smaller inline images are signatures and logos
export const MAX_MESSAGES_PER_RUN = 25;

// ---------- IMAP client contract ----------

export class InboxError extends Error {}
export interface InboxSession {
  /** Opens the folder; answers its UIDVALIDITY. Throws InboxError when the folder does not exist. */
  open(folder: string): Promise<{ uidValidity: string }>;
  /** UIDs greater than `after`, ascending. With `unseenOnly` only messages without \Seen. */
  listUids(after: number, unseenOnly: boolean): Promise<number[]>;
  fetchSource(uid: number): Promise<Buffer>;
  /** Moves the message to `processedFolder` (created when missing) or, when that is empty, flags it \Seen. */
  markDone(uid: number, processedFolder: string): Promise<void>;
  close(): Promise<void>;
}
export interface InboxConnection { host: string; port: number; secure: boolean; username: string; password: string }
export interface InboxDeps {
  connect: (connection: InboxConnection) => Promise<InboxSession>;
  /** null when the program has no recognition to run. */
  recognize?: ((companyId: number, documentId: number) => Promise<unknown>) | null;
}

// ---------- settings ----------

interface InboxRow {
  companyId: number; enabled: number; host: string; port: number; secure: number; username: string; passwordEncrypted: string; folder: string;
  processedFolder: string; allowedSenders: string; acceptKnownContacts: number; lastUidValidity: string | null; lastUid: number; lastRunAt: string | null; lastError: string | null;
}
const inboxRow = (companyId: number) => getDb().prepare('SELECT * FROM CompanyDocumentInbox WHERE companyId=?').get(companyId) as InboxRow | undefined;

export function getInboxSettings(companyId: number) {
  const r = inboxRow(companyId);
  // The password never leaves the server: only whether one is stored.
  return {
    enabled: Boolean(r?.enabled), host: r?.host ?? '', port: r?.port ?? 993, secure: r ? Boolean(r.secure) : true, username: r?.username ?? '',
    hasPassword: Boolean(r?.passwordEncrypted), folder: r?.folder || 'INBOX', processedFolder: r?.processedFolder ?? '',
    allowedSenders: r?.allowedSenders ?? '', acceptKnownContacts: r ? Boolean(r.acceptKnownContacts) : true, lastRunAt: r?.lastRunAt ?? null, lastError: r?.lastError ?? null,
  };
}

const DOMAIN_RULE = /^@[^\s@,;<>]+\.[^\s@,;<>]+$/;
/** One e-mail address or @domain per line; returns the normalized (lower-case, unique) list. */
export function parseAllowedSenders(text: unknown): string[] {
  if (text === undefined || text === null || text === '') return [];
  if (typeof text !== 'string' || text.length > 20_000) throw new HttpError(400, 'Neteisingas leidžiamų siuntėjų sąrašas');
  const list: string[] = [];
  for (const raw of text.split(/[\r\n]+/)) {
    const entry = raw.trim().toLowerCase();
    if (!entry) continue;
    const valid: boolean = validEmail(entry) || DOMAIN_RULE.test(entry);
    if (!valid) throw new HttpError(400, `Neteisingas siuntėjas: ${entry.slice(0, 100)}. Nurodykite el. pašto adresą arba @domeną, po vieną eilutėje.`);
    if (!list.includes(entry)) list.push(entry);
  }
  if (list.length > 200) throw new HttpError(400, 'Per daug leidžiamų siuntėjų (daugiausia 200)');
  return list;
}
export { senderAllowed };

const folderName = (value: unknown, label: string, required: boolean) => {
  if (value === undefined || value === null) return required ? 'INBOX' : '';
  if (typeof value !== 'string' || value.length > 200 || /[\r\n\0]/.test(value) || (required && !value.trim())) throw new HttpError(400, `Neteisingas aplanko pavadinimas (${label})`);
  return value.trim();
};
function validHost(host: unknown): host is string { return typeof host === 'string' && !!host.trim() && host.length <= 253 && !/[\s/@?#]/.test(host); }

// Cloudflare Containers sleep when idle, so the Worker's 15-minute cron wakes the container only when this marker in R2 says some mailbox
// is enabled (db/ is a private prefix). Published after every settings change and every poll; a no-op elsewhere.
export const INBOX_MARKER_KEY = 'db/document-inbox.json';
export async function publishInboxMarker(): Promise<void> {
  const bridge = process.env.R2_BRIDGE_URL;
  if (process.env.APP_ENV !== 'cloudflare-containers' || !bridge) return;
  const enabled = (getDb().prepare('SELECT COUNT(*) AS n FROM CompanyDocumentInbox WHERE enabled=1').get() as { n: number }).n;
  const res = await fetch(`${bridge}?key=${encodeURIComponent(INBOX_MARKER_KEY)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(process.env.INTERNAL_BRIDGE_KEY ? { 'x-d1-bridge-key': process.env.INTERNAL_BRIDGE_KEY } : {}) },
    body: JSON.stringify({ enabled, updatedAt: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`R2 marker upload failed (${res.status})`);
}

export function saveInboxSettings(companyId: number, body: Record<string, unknown>) {
  const { enabled, host, port, secure, username, password, clearPassword } = body;
  if (typeof enabled !== 'boolean') throw new HttpError(400, 'Nurodykite, ar dėžutė įjungta');
  if (!validHost(host) && (enabled || (typeof host === 'string' && host.trim()))) throw new HttpError(400, 'Neteisingas pašto serveris');
  if (!Number.isInteger(port) || Number(port) < 1 || Number(port) > 65535) throw new HttpError(400, 'Neteisingas prievadas');
  if (typeof secure !== 'boolean') throw new HttpError(400, 'Nurodykite, ar naudojamas SSL/TLS');
  if (typeof username !== 'string' || username.length > 254 || /[\r\n]/.test(username)) throw new HttpError(400, 'Neteisingas naudotojo vardas');
  if (password !== undefined && password !== null && (typeof password !== 'string' || password.length > 4096)) throw new HttpError(400, 'Neteisingas slaptažodis');
  const folder = folderName(body.folder, 'gaunamieji', true);
  const processedFolder = folderName(body.processedFolder, 'apdoroti', false);
  const allowed = parseAllowedSenders(body.allowedSenders);
  if (body.acceptKnownContacts !== undefined && typeof body.acceptKnownContacts !== 'boolean') throw new HttpError(400, 'Neteisingas nustatymas: priimti iš žinomų kontrahentų');
  const previous = inboxRow(companyId);
  const acceptKnown = typeof body.acceptKnownContacts === 'boolean' ? body.acceptKnownContacts : previous ? Boolean(previous.acceptKnownContacts) : true;
  const secret = clearPassword === true ? '' : typeof password === 'string' && password ? encryptSecret(password, companyId) : previous?.passwordEncrypted || '';
  if (enabled && (!username.trim() || !secret)) throw new HttpError(400, 'Norėdami įjungti dėžutę, nurodykite naudotojo vardą ir slaptažodį.');
  if (previous && previous.username !== username && secret && !(typeof password === 'string' && password)) throw new HttpError(400, 'Keičiant naudotojo vardą įveskite naują slaptažodį.');
  getDb().prepare(`INSERT INTO CompanyDocumentInbox(companyId,enabled,host,port,secure,username,passwordEncrypted,folder,processedFolder,allowedSenders,acceptKnownContacts,updatedAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(companyId) DO UPDATE SET enabled=excluded.enabled,host=excluded.host,port=excluded.port,secure=excluded.secure,username=excluded.username,
      passwordEncrypted=excluded.passwordEncrypted,folder=excluded.folder,processedFolder=excluded.processedFolder,allowedSenders=excluded.allowedSenders,acceptKnownContacts=excluded.acceptKnownContacts,updatedAt=excluded.updatedAt,
      -- another mailbox or folder means another UID space: start from scratch
      lastUid=CASE WHEN CompanyDocumentInbox.host=excluded.host AND CompanyDocumentInbox.username=excluded.username AND CompanyDocumentInbox.folder=excluded.folder THEN CompanyDocumentInbox.lastUid ELSE 0 END,
      lastUidValidity=CASE WHEN CompanyDocumentInbox.host=excluded.host AND CompanyDocumentInbox.username=excluded.username AND CompanyDocumentInbox.folder=excluded.folder THEN CompanyDocumentInbox.lastUidValidity ELSE NULL END`)
    .run(companyId, enabled ? 1 : 0, typeof host === 'string' ? host.trim() : '', port, Number(secure), username.trim(), secret, folder, processedFolder, allowed.join('\n'), Number(acceptKnown));
  publishInboxMarker().catch(err => console.error('[document-inbox] marker', err instanceof Error ? err.message : err));
  return getInboxSettings(companyId);
}

// The person agrees to accept mail from one more address (the learning flow after a confirmation, or from the refusal log).
export function allowSender(companyId: number, address: unknown) {
  const entry = typeof address === 'string' ? address.trim().toLowerCase() : '';
  if (!validEmail(entry)) throw new HttpError(400, 'Neteisingas siuntėjas: ' + String(address).slice(0, 100) + '. Nurodykite el. pašto adresą arba @domeną, po vieną eilutėje.');
  const list = parseAllowedSenders(inboxRow(companyId)?.allowedSenders ?? '');
  if (!list.includes(entry)) list.push(entry);
  if (list.length > 200) throw new HttpError(400, 'Per daug leidžiamų siuntėjų (daugiausia 200)');
  const joined = list.join(String.fromCharCode(10));
  getDb().prepare(`INSERT INTO CompanyDocumentInbox(companyId,allowedSenders) VALUES(?,?)
    ON CONFLICT(companyId) DO UPDATE SET allowedSenders=excluded.allowedSenders,updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(companyId, joined);
  return getInboxSettings(companyId);
}

function connectionFor(companyId: number, body: Record<string, unknown>, stored: InboxRow | undefined): InboxConnection {
  const host = typeof body.host === 'string' ? body.host.trim() : stored?.host ?? '';
  const port = Number.isInteger(body.port) ? Number(body.port) : stored?.port ?? 993;
  const secure = typeof body.secure === 'boolean' ? body.secure : stored ? Boolean(stored.secure) : true;
  const username = typeof body.username === 'string' ? body.username.trim() : stored?.username ?? '';
  const typed = typeof body.password === 'string' ? body.password : '';
  if (!validHost(host) || port < 1 || port > 65535) throw new HttpError(400, 'Neteisingas pašto serveris');
  if (!username) throw new HttpError(400, 'Nurodykite naudotojo vardą');
  if (typed.length > 4096) throw new HttpError(400, 'Neteisingas slaptažodis');
  if (!typed && !stored?.passwordEncrypted) throw new HttpError(400, 'Pirmiausia įveskite slaptažodį.');
  const password = typed || decryptSecret(stored!.passwordEncrypted, companyId, 'Nepavyko nuskaityti išsaugoto slaptažodžio. Patikrinkite šifravimo raktą.');
  return { host, port, secure, username, password };
}
const failureText = (error: unknown) => (error instanceof InboxError ? error.message : 'Nepavyko prisijungti prie pašto dėžutės.');

// Logs in and opens the folder with the typed values (or the stored ones). Failures come back as { ok:false, error }.
export async function testConnection(companyId: number, body: Record<string, unknown>, deps: InboxDeps): Promise<{ ok: true } | { ok: false; error: string }> {
  const stored = inboxRow(companyId);
  const connection = connectionFor(companyId, body, stored);
  const folder = folderName(body.folder ?? stored?.folder, 'gaunamieji', true);
  let session: InboxSession | null = null;
  try {
    session = await deps.connect(connection);
    await session.open(folder);
    return { ok: true };
  } catch (error) {
    if (!(error instanceof InboxError)) console.error('Document inbox test failed', error instanceof Error ? error.message : error);
    return { ok: false, error: failureText(error) };
  } finally {
    await session?.close().catch(() => undefined);
  }
}

// ---------- polling ----------

export interface PollResult { messages: number; imported: number; skipped: number }
const running = new Set<number>();
export const pollInProgress = (companyId: number) => running.has(companyId);

const XML_LINE = 'XML e-sąskaita nepriimta';
const imageExt = /\.(pdf|jpe?g|png|webp|heic|heif)$/i;
const isXmlAttachment = (name: string, type: string) => /\.xml$/i.test(name) || /^(application|text)\/xml/i.test(type);
const stem = (name: string) => name.replace(/\.[^.]+$/, '').trim().toLowerCase();

function log(companyId: number, uidValidity: string, uid: number, m: { messageId: string | null; sender: string | null; subject: string | null; status: string; detail: string[] }) {
  getDb().prepare('INSERT OR IGNORE INTO DocumentInboxMessage(companyId,uidValidity,uid,messageId,sender,subject,status,detail) VALUES(?,?,?,?,?,?,?,?)')
    .run(companyId, uidValidity, uid, m.messageId?.slice(0, 500) ?? null, m.sender?.slice(0, 254) ?? null, m.subject?.slice(0, 300) ?? null, m.status, m.detail.join('\n').slice(0, 2000));
}

async function handleMessage(companyId: number, uidValidity: string, uid: number, source: Buffer, ctx: SenderContext, deps: InboxDeps, recognizing: boolean): Promise<'IMPORTED' | 'SKIPPED' | 'OTHER'> {
  const parsed = await simpleParser(source);
  const messageId = parsed.messageId ?? null;
  const subject = parsed.subject ?? null;
  const sender = parsed.from?.value?.[0]?.address?.trim().toLowerCase() || null;
  const entry = (status: string, detail: string[]) => log(companyId, uidValidity, uid, { messageId, sender, subject, status, detail });
  if (messageId && getDb().prepare('SELECT 1 FROM DocumentInboxMessage WHERE companyId=? AND messageId=?').get(companyId, messageId.slice(0, 500))) return 'OTHER'; // the same message under a new UID
  const via = sender ? classifySender(ctx, sender) : null;
  if (!sender || !via) { entry('SKIPPED_SENDER', [`Siuntėjas nėra leidžiamų sąraše: ${sender ?? 'nežinomas'}`]); return 'SKIPPED'; }
  // Best effort only: the header is written by the receiving server and some hosts do not write it at all. The allowed sender list
  // is the real protection; this just refuses messages the receiving server itself judged forged.
  const auth = parsed.headers.get('authentication-results');
  const authText = Array.isArray(auth) ? auth.map(String).join(' ') : typeof auth === 'string' ? auth : auth ? JSON.stringify(auth) : '';
  if (/dmarc=fail/i.test(authText)) { entry('SKIPPED_SENDER', [`DMARC patikra nepavyko: laiškas galėjo būti suklastotas (${sender})`]); return 'SKIPPED'; }

  const detail: string[] = [];
  let stored = 0, duplicates = 0, errors = 0, used = 0;
  interface Entry { name: string; content: Buffer; kind: 'xml' | 'doc'; original: string | null }
  const entries: Entry[] = [];
  // A message from the company's own person is a forward: the original sender is read from the body ("Forwarded message" block)
  // or from an attached message (message/rfc822), whose own attachments are the documents.
  const forwarded = via === 'OWN';
  const inlineOriginal = forwarded ? originalSenderFromText(bodyText(parsed), ctx.own) : null;
  interface Flat { filename?: string; contentType?: string; content: Buffer; related?: boolean; contentDisposition?: string; original: string | null }
  const flat: Flat[] = [];
  const expand = async (list: typeof parsed.attachments, depth: number, original: string | null) => {
    for (const a of list) {
      if (/^message\/rfc822$/i.test(a.contentType || '')) {
        if (depth >= 2) continue;
        const nested = await simpleParser(a.content).catch(() => null);
        if (!nested) continue;
        const from = nested.from?.value?.[0]?.address?.trim().toLowerCase() || null;
        const own = forwarded ? (from && !ctx.own.has(from) ? from : originalSenderFromText(bodyText(nested), ctx.own) ?? original) : null;
        await expand(nested.attachments, depth + 1, own);
        continue;
      }
      flat.push({ filename: a.filename, contentType: a.contentType, content: a.content, related: a.related, contentDisposition: a.contentDisposition, original });
    }
  };
  await expand(parsed.attachments, 0, inlineOriginal);
  for (const attachment of flat) {
    const name = (attachment.filename || 'priedas').slice(0, 200);
    const type = attachment.contentType || '';
    const content = attachment.content;
    const inline = attachment.related || attachment.contentDisposition === 'inline';
    if (inline && /^image\//i.test(type) && content.length < MIN_INLINE_IMAGE) continue;
    if (isXmlAttachment(name, type) || (!imageExt.test(name) && looksLikeUblInvoice(content))) {
      if (!looksLikeUblInvoice(content)) continue;
      // An e-invoice the UBL reader cannot map is not queued (a PDF of the same message still is).
      const result = parseUblInvoice(content.toString('utf8'));
      if (!result.invoice) { detail.push(`${XML_LINE} (${name})${result.issues[0] ? `: ${result.issues[0]}` : ''}`.slice(0, 400)); continue; }
      entries.push({ name, content, kind: 'xml', original: attachment.original });
      continue;
    }
    if (!imageExt.test(name) && !detectMime(content)) continue; // not a document type the program reads (signature files, calendar invites, ...)
    entries.push({ name, content, kind: 'doc', original: attachment.original });
  }
  // A PDF of the same invoice (same file name, or the only PDF next to the only XML) is the XML's visual original, not a second queue item.
  const xmls = entries.filter(e => e.kind === 'xml');
  const pdfs = entries.filter(e => e.kind === 'doc' && detectMime(e.content) === 'application/pdf');
  const visualOf = new Map<Entry, Entry>();
  const taken = new Set<Entry>();
  for (const x of xmls) {
    const same = pdfs.find(p => !taken.has(p) && stem(p.name) === stem(x.name));
    if (same) { visualOf.set(x, same); taken.add(same); }
  }
  if (xmls.length === 1 && pdfs.length === 1 && !visualOf.size) { visualOf.set(xmls[0], pdfs[0]); taken.add(pdfs[0]); }
  // XML first, so a PDF released by a failed XML is still visited.
  for (const entry of [...xmls, ...entries.filter(e => e.kind === 'doc')]) {
    if (taken.has(entry)) continue;
    if (++used > MAX_ATTACHMENTS) { detail.push(`Per daug priedų: apdorota tik pirmieji ${MAX_ATTACHMENTS}`); break; }
    const visual = visualOf.get(entry);
    try {
      const row = storeDocument(companyId, { buffer: entry.content, fileName: entry.name, source: 'EMAIL', sender, originalSender: entry.original, ...(visual ? { visual: { buffer: visual.content, fileName: visual.name } } : {}) });
      stored++;
      if (visual && !row.visualSha256) detail.push(`Dublikatas: ${visual.name}`);
      // XML needs no recognition; the PDF/image documents are recognized when the company has it on.
      if (entry.kind === 'doc' && recognizing && deps.recognize) await deps.recognize(companyId, row.id).catch(() => undefined); // a failed recognition is saved on the document itself
    } catch (error) {
      if (typeof (error as { existingId?: unknown }).existingId === 'number') { duplicates++; detail.push(`Dublikatas: ${entry.name}`); continue; }
      errors++;
      detail.push(`${entry.name} | ${error instanceof Error ? error.message : 'Klaida'}`);
      // The XML could not be stored: its PDF is then read as an ordinary document (visited later by this loop).
      if (visual) { taken.delete(visual); }
    }
  }
  const originals = [...new Set(entries.map(e => e.original).filter((a): a is string => Boolean(a)))];
  if (originals.length) detail.unshift(`Persiųsta: pradinis siuntėjas ${originals.join(', ')}`);
  if (stored) detail.unshift(`Išsaugota dokumentų: ${stored}`);
  if (stored || duplicates) { entry('IMPORTED', detail); return 'IMPORTED'; }
  if (errors) { entry('FAILED', detail); return 'OTHER'; }
  entry('NO_ATTACHMENTS', detail.length ? detail : ['Laiške nėra tinkamų priedų']);
  return 'OTHER';
}

// Reads the new messages of one company's mailbox. One poll per company at a time; a second call while one runs is refused.
export async function pollInbox(companyId: number, deps: InboxDeps): Promise<PollResult> {
  if (running.has(companyId)) throw new HttpError(409, 'Dėžutė jau tikrinama. Palaukite kelias sekundes.');
  running.add(companyId);
  const db = getDb();
  const result: PollResult = { messages: 0, imported: 0, skipped: 0 };
  let session: InboxSession | null = null;
  try {
    const row = inboxRow(companyId);
    if (!row?.enabled) throw new HttpError(409, 'El. pašto dėžutė neįjungta.');
    const connection = connectionFor(companyId, {}, row);
    const ctx = senderContext(db, companyId);
    const recognition = getRecognitionSettings(companyId);
    const recognizing = recognition.enabled && recognition.hasKey;
    try {
      session = await deps.connect(connection);
      const { uidValidity } = await session.open(row.folder || 'INBOX');
      let lastUid = row.lastUid;
      // A new UIDVALIDITY renumbers the mailbox: start over (the log and the document hashes keep it from importing anything twice).
      if (row.lastUidValidity !== null && row.lastUidValidity !== uidValidity) lastUid = 0;
      // The first run reads only unread mail, so old history of a normal mailbox is not pulled in.
      const uids = (await session.listUids(lastUid, lastUid === 0)).filter(u => u > lastUid).sort((a, b) => a - b).slice(0, MAX_MESSAGES_PER_RUN);
      const save = (uid: number) => db.prepare('UPDATE CompanyDocumentInbox SET lastUidValidity=?, lastUid=? WHERE companyId=?').run(uidValidity, uid, companyId);
      save(lastUid);
      for (const uid of uids) {
        result.messages++;
        if (!db.prepare('SELECT 1 FROM DocumentInboxMessage WHERE companyId=? AND uidValidity=? AND uid=?').get(companyId, uidValidity, uid)) {
          const outcome = await handleMessage(companyId, uidValidity, uid, await session.fetchSource(uid), ctx, deps, recognizing);
          if (outcome === 'IMPORTED') result.imported++;
          if (outcome === 'SKIPPED') result.skipped++;
        }
        await session.markDone(uid, row.processedFolder);
        save(uid);
      }
    } finally {
      await session?.close().catch(() => undefined);
    }
    db.prepare("UPDATE CompanyDocumentInbox SET lastRunAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), lastError=NULL WHERE companyId=?").run(companyId);
    return result;
  } catch (error) {
    const message = error instanceof HttpError || error instanceof InboxError ? error.message : 'Nepavyko perskaityti pašto dėžutės.';
    if (!(error instanceof HttpError || error instanceof InboxError)) console.error('Document inbox poll failed', error instanceof Error ? error.message : error);
    db.prepare("UPDATE CompanyDocumentInbox SET lastRunAt=strftime('%Y-%m-%dT%H:%M:%fZ','now'), lastError=? WHERE companyId=?").run(message.slice(0, 500), companyId);
    throw error;
  } finally {
    running.delete(companyId);
  }
}

// Every enabled mailbox; a failing one never stops the others (its error is stored on its own row).
export async function pollAllInboxes(deps: InboxDeps): Promise<{ companyId: number; ok: boolean }[]> {
  const ids = (getDb().prepare('SELECT companyId FROM CompanyDocumentInbox WHERE enabled=1 ORDER BY companyId').all() as { companyId: number }[]).map(r => r.companyId);
  const out: { companyId: number; ok: boolean }[] = [];
  for (const companyId of ids) {
    try { await pollInbox(companyId, deps); out.push({ companyId, ok: true }); } catch { out.push({ companyId, ok: false }); }
  }
  await publishInboxMarker().catch(err => console.error('[document-inbox] marker', err instanceof Error ? err.message : err));
  return out;
}

// `canAllow`: refused only because the sender is not accepted (a failed DMARC check is never offered for allowing).
export function inboxLog(companyId: number, limit = 50) {
  const rows = getDb().prepare('SELECT id, uid, sender, subject, receivedAt, status, detail FROM DocumentInboxMessage WHERE companyId=? ORDER BY id DESC LIMIT ?').all(companyId, limit) as
    { id: number; uid: number; sender: string | null; subject: string | null; receivedAt: string; status: string; detail: string }[];
  return rows.map(r => ({ ...r, canAllow: r.status === 'SKIPPED_SENDER' && Boolean(r.sender) && !r.detail.startsWith('DMARC patikra') }));
}
