import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { validEmail } from './company-mail';
import { mailConfiguration } from './invoice-mail';
import { receivables } from './receivables';
import { todayVilnius } from './dates';
import { signLetter } from './mail-signature';

// Letters to clients or any address: templates with placeholders, one-off or group sending, every letter logged.
export const MAX_RECIPIENTS = 200;
export const PLACEHOLDERS = ['client_name', 'client_code', 'company_name', 'date', 'balance', 'open_invoices'] as const;

export interface MailTemplateRow { id: number; name: string; subject: string; body: string; updatedAt: string }
export interface Recipient { clientId?: number | null; email: string; name?: string | null }
export interface SendResult { email: string; name: string | null; status: 'SENT' | 'FAILED'; error: string | null }

const text = (value: unknown, max: number, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `Nurodykite: ${label}`);
  if (value.length > max) throw new HttpError(400, `Per ilgas tekstas: ${label}`);
  return value.trim();
};

export function listMailTemplates(db: Database.Database, companyId: number): MailTemplateRow[] {
  return db.prepare('SELECT id, name, subject, body, updatedAt FROM MailTemplate WHERE companyId=? ORDER BY name COLLATE NOCASE').all(companyId) as MailTemplateRow[];
}

export function saveMailTemplate(db: Database.Database, companyId: number, body: Record<string, unknown>, id?: number): MailTemplateRow {
  const name = text(body.name, 200, 'pavadinimas'), subject = text(body.subject, 200, 'tema'), content = text(body.body, 20000, 'tekstas');
  try {
    if (id) {
      if (!db.prepare('UPDATE MailTemplate SET name=?, subject=?, body=?, updatedAt=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=? AND companyId=?').run(name, subject, content, id, companyId).changes) throw new HttpError(404, 'Šablonas nerastas');
    } else {
      id = Number(db.prepare('INSERT INTO MailTemplate(companyId,name,subject,body) VALUES(?,?,?,?)').run(companyId, name, subject, content).lastInsertRowid);
    }
  } catch (err) {
    if (err instanceof Error && /UNIQUE/.test(err.message)) throw new HttpError(409, 'Šablonas tokiu pavadinimu jau yra');
    throw err;
  }
  return db.prepare('SELECT id, name, subject, body, updatedAt FROM MailTemplate WHERE id=?').get(id) as MailTemplateRow;
}

export function deleteMailTemplate(db: Database.Database, companyId: number, id: number) {
  if (!db.prepare('DELETE FROM MailTemplate WHERE id=? AND companyId=?').run(id, companyId).changes) throw new HttpError(404, 'Šablonas nerastas');
}

const money = (v: number) => v.toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Replaces {placeholder} markers; unknown markers stay as typed. */
export function renderLetter(template: string, values: Partial<Record<(typeof PLACEHOLDERS)[number], string>>) {
  return template.replace(/\{([a-z_]+)\}/g, (all, key: string) => (key in values ? values[key as keyof typeof values] ?? '' : all));
}

function valuesFor(db: Database.Database, companyId: number, recipient: Recipient, open: ReturnType<typeof receivables>) {
  const company = db.prepare('SELECT name FROM Company WHERE id=?').get(companyId) as { name: string };
  const client = recipient.clientId ? db.prepare('SELECT name, code FROM Client WHERE id=? AND companyId=?').get(recipient.clientId, companyId) as { name: string; code: string | null } | undefined : undefined;
  const mine = client ? open.filter(r => r.clientId === recipient.clientId) : [];
  return {
    client_name: client?.name ?? recipient.name ?? '',
    client_code: client?.code ?? '',
    company_name: company.name,
    date: todayVilnius(),
    balance: money(mine.reduce((n, r) => n + r.balance, 0)),
    open_invoices: mine.map(r => `${r.label} (${r.date.slice(0, 10)}): ${money(r.balance)}`).join('\n'),
  };
}

/** Recipients from clients (their e-mail) and free addresses; duplicates and invalid addresses are refused before anything is sent. */
export function resolveRecipients(db: Database.Database, companyId: number, clientIds: unknown, addresses: unknown): Recipient[] {
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const add = (r: Recipient) => { const key = r.email.toLowerCase(); if (!seen.has(key)) { seen.add(key); out.push(r); } };
  for (const id of Array.isArray(clientIds) ? clientIds : []) {
    const client = db.prepare('SELECT id, name, email FROM Client WHERE id=? AND companyId=?').get(Number(id), companyId) as { id: number; name: string; email: string | null } | undefined;
    if (!client) throw new HttpError(400, 'Kontrahentas nerastas');
    for (const email of (client.email || '').split(/[;,\s]+/).filter(Boolean)) {
      if (!validEmail(email)) throw new HttpError(400, `Neteisingas kontrahento „${client.name}“ el. paštas: ${email}`);
      add({ clientId: client.id, email, name: client.name });
    }
  }
  for (const email of typeof addresses === 'string' ? addresses.split(/[;,\s]+/).filter(Boolean) : []) {
    if (!validEmail(email)) throw new HttpError(400, `Neteisingas el. pašto adresas: ${email}`);
    add({ clientId: null, email, name: null });
  }
  if (!out.length) throw new HttpError(400, 'Pasirinkite gavėjus su el. pašto adresais');
  if (out.length > MAX_RECIPIENTS) throw new HttpError(400, `Vienu kartu galima siųsti ne daugiau kaip ${MAX_RECIPIENTS} gavėjų`);
  return out;
}

/** Text of each letter with the recipient's values, without sending (preview and the send step use the same function). */
export function composeLetters(db: Database.Database, companyId: number, recipients: Recipient[], subject: string, body: string) {
  const open = /\{(balance|open_invoices)\}/.test(subject + body) ? receivables(db, companyId, todayVilnius()) : [];
  return recipients.map(r => { const v = valuesFor(db, companyId, r, open); return { ...r, subject: renderLetter(subject, v), body: renderLetter(body, v) }; });
}

/** Sends one personalised letter per recipient through the company's own SMTP; failures are logged and do not stop the batch. */
export async function sendLetters(db: Database.Database, companyId: number, input: { recipients: Recipient[]; subject: unknown; body: unknown; templateId?: unknown }, actorId: number | null): Promise<{ batchId: string; results: SendResult[] }> {
  const subject = text(input.subject, 200, 'tema'), body = text(input.body, 20000, 'tekstas');
  const templateId = input.templateId == null || input.templateId === '' ? null : Number(input.templateId);
  if (templateId !== null && !db.prepare('SELECT 1 FROM MailTemplate WHERE id=? AND companyId=?').get(templateId, companyId)) throw new HttpError(400, 'Šablonas nerastas');
  const config = mailConfiguration(companyId);
  const company = db.prepare('SELECT name, email FROM Company WHERE id=?').get(companyId) as { name: string; email: string | null };
  const letters = composeLetters(db, companyId, input.recipients, subject, body);
  const batchId = crypto.randomUUID();
  const log = db.prepare('INSERT INTO MailMessage(companyId,batchId,templateId,clientId,recipient,recipientName,subject,body,status,error,messageId,actorId) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  const transport = nodemailer.createTransport({ ...config.transport, pool: true, maxConnections: 1, maxMessages: MAX_RECIPIENTS });
  const results: SendResult[] = [];
  try {
    for (const letter of letters) {
      try {
        const signed = signLetter(db, companyId, letter.body);
        const sent = await transport.sendMail({ from: { name: company.name, address: config.from }, to: letter.email, replyTo: validEmail(company.email) ? company.email : undefined, subject: letter.subject, text: signed.text, html: signed.html, attachments: signed.attachments, disableFileAccess: true, disableUrlAccess: true });
        if (!sent.accepted?.length || sent.rejected?.length) throw new Error('Gavėjas atmestas');
        log.run(companyId, batchId, templateId, letter.clientId ?? null, letter.email, letter.name ?? null, letter.subject, signed.text, 'SENT', null, sent.messageId ?? null, actorId);
        results.push({ email: letter.email, name: letter.name ?? null, status: 'SENT', error: null });
      } catch (err) {
        const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        log.run(companyId, batchId, templateId, letter.clientId ?? null, letter.email, letter.name ?? null, letter.subject, letter.body, 'FAILED', message, null, actorId);
        results.push({ email: letter.email, name: letter.name ?? null, status: 'FAILED', error: message });
      }
    }
  } finally { transport.close(); }
  return { batchId, results };
}

export function listMailMessages(db: Database.Database, companyId: number, limit = 300) {
  return db.prepare(`SELECT m.id, m.batchId, m.recipient, m.recipientName, m.subject, m.body, m.status, m.error, m.createdAt, t.name AS templateName
    FROM MailMessage m LEFT JOIN MailTemplate t ON t.id=m.templateId WHERE m.companyId=? ORDER BY m.id DESC LIMIT ?`).all(companyId, limit);
}
