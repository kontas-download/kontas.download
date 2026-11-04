import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { getCompanyLogo } from './company-logo';
import { buildSignature, DEFAULT_SIGNATURE_CONFIG, normalizeSignatureConfig, type SignatureCompany, type SignatureConfig } from './signature-build';

// Company e-mail signature (on by default): appended to every letter the company sends (letters module, invoices, reminders).
// It is built by the configurator (person, position, own contacts, chosen company details, website, extra text). With the
// logo the letter also gets an HTML part that shows the logo inline; the plain-text part is always kept.
export function migrateMailSignature(db: Database.Database) {
  db.transaction(() => {
    if (!db.prepare('SELECT version FROM AppMigration WHERE version=?').get('2026-11-mail-signature-v1')) {
      db.exec(`CREATE TABLE IF NOT EXISTS CompanyMailSignature(
          companyId INTEGER PRIMARY KEY REFERENCES Company(id) ON DELETE CASCADE,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
          text TEXT,
          includeLogo INTEGER NOT NULL DEFAULT 1 CHECK(includeLogo IN (0,1)),
          updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`);
      db.prepare("INSERT INTO AppMigration VALUES(?,datetime('now'))").run('2026-11-mail-signature-v1');
    }
    if (!(db.prepare('PRAGMA table_info(CompanyMailSignature)').all() as { name: string }[]).some(c => c.name === 'configJson')) db.exec('ALTER TABLE CompanyMailSignature ADD COLUMN configJson TEXT');
  })();
}

export interface Signature { enabled: boolean; includeLogo: boolean; config: SignatureConfig; text: string; company: SignatureCompany | null; hasLogo: boolean }

function company(db: Database.Database, companyId: number) {
  return db.prepare('SELECT name, code, vatCode, address, email, phone, bankName, bankIban FROM Company WHERE id=?').get(companyId) as SignatureCompany | undefined;
}

export function getSignature(db: Database.Database, companyId: number): Signature {
  const row = db.prepare('SELECT enabled, includeLogo, configJson FROM CompanyMailSignature WHERE companyId=?').get(companyId) as { enabled: number; includeLogo: number; configJson: string | null } | undefined;
  let config = DEFAULT_SIGNATURE_CONFIG;
  try { if (row?.configJson) config = normalizeSignatureConfig(JSON.parse(row.configJson)); } catch { /* a damaged value falls back to the defaults */ }
  const c = company(db, companyId);
  return { enabled: row ? row.enabled === 1 : true, includeLogo: row ? row.includeLogo === 1 : true, config, text: buildSignature(config, c), company: c ?? null, hasLogo: Boolean(getCompanyLogo(companyId)) };
}

export function saveSignature(db: Database.Database, companyId: number, body: Record<string, unknown>): Signature {
  if (typeof body.enabled !== 'boolean' || typeof body.includeLogo !== 'boolean') throw new HttpError(400, 'Neteisingi parašo nustatymai');
  const config = normalizeSignatureConfig(body.config);
  db.prepare(`INSERT INTO CompanyMailSignature(companyId,enabled,includeLogo,configJson) VALUES(?,?,?,?)
    ON CONFLICT(companyId) DO UPDATE SET enabled=excluded.enabled, includeLogo=excluded.includeLogo, configJson=excluded.configJson, updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run(companyId, body.enabled ? 1 : 0, body.includeLogo ? 1 : 0, JSON.stringify(config));
  return getSignature(db, companyId);
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const htmlLines = (s: string) => escapeHtml(s).replace(/\r?\n/g, '<br>');
export const LOGO_CID = 'company-logo@kontas';

export interface SignedLetter { text: string; html?: string; attachments: { filename: string; content: Buffer; contentType: string; cid: string }[] }

/** The letter text with the company signature appended (plain text, and HTML with the inline logo when chosen). */
export function signLetter(db: Database.Database, companyId: number, text: string): SignedLetter {
  const s = getSignature(db, companyId);
  if (!s.enabled) return { text, attachments: [] };
  const signature = s.text;
  const signed = signature ? `${text.replace(/\s+$/, '')}\n\n-- \n${signature}` : text;
  const logo = s.includeLogo ? getCompanyLogo(companyId) : undefined;
  if (!logo) return { text: signed, attachments: [] };
  const ext = logo.mime === 'image/png' ? 'png' : 'jpg';
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111">${htmlLines(text.replace(/\s+$/, ''))}`
    + `<br><br><div style="border-top:1px solid #ddd;padding-top:10px;margin-top:10px;font-size:13px;color:#444">`
    + `<img src="cid:${LOGO_CID}" alt="" style="max-height:60px;max-width:200px;display:block;margin-bottom:8px">${htmlLines(signature)}</div></div>`;
  return { text: signed, html, attachments: [{ filename: `logo.${ext}`, content: Buffer.from(logo.data), contentType: logo.mime, cid: LOGO_CID }] };
}

/** What a letter's preview shows under the text: the signature as it will be added, and the logo address when it is included. */
export function signaturePreview(db: Database.Database, companyId: number): { text: string; logoUrl: string | null } | null {
  const s = getSignature(db, companyId);
  if (!s.enabled) return null;
  const text = s.text;
  const logoUrl = s.includeLogo && s.hasLogo ? `/api/companies/${companyId}/logo` : null;
  return text || logoUrl ? { text, logoUrl } : null;
}
