import type Database from 'better-sqlite3';
import { getDb } from './db';

// Who may send purchase documents to the company mailbox: the explicit list (addresses and @domains), the contacts of the company's own
// clients and the company's own people (forwarders). Kept free of the mail client and of the recognition code so both can use it.

const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'icloud.com', 'me.com', 'aol.com', 'inbox.lt', 'one.lt',
  'mail.lt', 'takas.lt', 'centras.lt', 'mail.ru', 'bk.ru', 'list.ru', 'inbox.ru', 'proton.me', 'protonmail.com', 'pm.me', 'zoho.com', 'tutanota.com',
]);
// Families with many country domains.
const PUBLIC_FAMILIES = /^(yandex|gmx|yahoo|hotmail|outlook|live)\./;
export function isPublicMailDomain(domain: string): boolean {
  const d = domain.trim().toLowerCase().replace(/^@/, '');
  return PUBLIC_DOMAINS.has(d) || PUBLIC_FAMILIES.test(d);
}

const ADDRESS = /[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/gi;
/** Every e-mail address in a free text ("Name <a@b.lt>; c@d.lt"), lower-case. */
export function addressesOf(text: string | null | undefined): string[] {
  return (String(text ?? '').match(ADDRESS) || []).map(a => a.toLowerCase());
}
export const domainOf = (address: string) => address.slice(address.lastIndexOf('@') + 1).toLowerCase();

/** Exact address or @domain, case-insensitive. An empty list refuses everyone. */
export function senderAllowed(address: string, allowed: string[]): boolean {
  const a = address.trim().toLowerCase();
  if (!a || !a.includes('@')) return false;
  const domain = a.slice(a.lastIndexOf('@'));
  return allowed.some(entry => (entry.startsWith('@') ? entry === domain : entry === a));
}
export const splitAllowed = (text: string | null | undefined) => String(text ?? '').split(/[\r\n]+/).map(l => l.trim().toLowerCase()).filter(Boolean);

export interface SenderContext { allowed: string[]; acceptKnown: boolean; known: Set<string>; knownDomains: Set<string>; own: Set<string> }
export type SenderClass = 'LISTED' | 'KNOWN' | 'OWN';

function ownAddresses(db: Database.Database, companyId: number): Set<string> {
  const own = new Set<string>();
  const add = (text: string | null | undefined) => { for (const a of addressesOf(text)) own.add(a); };
  add((db.prepare('SELECT email FROM Company WHERE id=?').get(companyId) as { email: string | null } | undefined)?.email);
  add((db.prepare('SELECT sender FROM CompanyMailSettings WHERE companyId=?').get(companyId) as { sender: string } | undefined)?.sender);
  add((db.prepare('SELECT username FROM CompanyDocumentInbox WHERE companyId=?').get(companyId) as { username: string } | undefined)?.username);
  // Users are not bound to single companies: every enabled user works with every company.
  for (const u of db.prepare('SELECT email FROM User WHERE disabledAt IS NULL').all() as { email: string }[]) add(u.email);
  return own;
}

function clientContacts(db: Database.Database, companyId: number) {
  const rows = db.prepare("SELECT id, email, correspondenceEmail FROM Client WHERE companyId=? AND (COALESCE(email,'')<>'' OR COALESCE(correspondenceEmail,'')<>'') ORDER BY id").all(companyId) as { id: number; email: string | null; correspondenceEmail: string | null }[];
  return rows.map(r => ({ id: r.id, addresses: [...addressesOf(r.email), ...addressesOf(r.correspondenceEmail)] }));
}

export function senderContext(db: Database.Database, companyId: number): SenderContext {
  const row = db.prepare('SELECT allowedSenders, acceptKnownContacts FROM CompanyDocumentInbox WHERE companyId=?').get(companyId) as { allowedSenders: string; acceptKnownContacts: number } | undefined;
  const known = new Set<string>(), knownDomains = new Set<string>();
  for (const c of clientContacts(db, companyId)) for (const a of c.addresses) { known.add(a); if (!isPublicMailDomain(domainOf(a))) knownDomains.add(domainOf(a)); }
  return { allowed: splitAllowed(row?.allowedSenders), acceptKnown: row ? Boolean(row.acceptKnownContacts) : true, known, knownDomains, own: ownAddresses(db, companyId) };
}

/** Why the address is accepted, or null when no rule accepts it. OWN = the company's own person or address (a forwarder). */
export function classifySender(ctx: SenderContext, address: string | null | undefined): SenderClass | null {
  const a = String(address ?? '').trim().toLowerCase();
  if (!a.includes('@')) return null;
  if (ctx.own.has(a)) return 'OWN';
  if (senderAllowed(a, ctx.allowed)) return 'LISTED';
  if (ctx.acceptKnown && (ctx.known.has(a) || ctx.knownDomains.has(domainOf(a)))) return 'KNOWN';
  return null;
}

/** The client of the company whose contact address is `address` (exact), else the only client of the same non-public domain. */
export function findClientByEmail(db: Database.Database, companyId: number, address: string | null | undefined): number | null {
  const a = String(address ?? '').trim().toLowerCase();
  if (!a.includes('@')) return null;
  const contacts = clientContacts(db, companyId);
  const exact = contacts.find(c => c.addresses.includes(a));
  if (exact) return exact.id;
  const domain = domainOf(a);
  if (isPublicMailDomain(domain)) return null;
  const sameDomain = contacts.filter(c => c.addresses.some(x => domainOf(x) === domain));
  return sameDomain.length === 1 ? sameDomain[0].id : null;
}

// Learning flow: the address of a confirmed document that no rule accepts (so the person can be offered to allow it).
export function addressToSuggest(companyId: number, sender: string | null, originalSender: string | null): string | null {
  const address = (originalSender || sender || '').trim().toLowerCase();
  if (!address.includes('@')) return null;
  return classifySender(senderContext(getDb(), companyId), address) === null ? address : null;
}
