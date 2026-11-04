import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { todayVilnius } from './dates';
import { validEmail } from './company-mail';
import { mailConfiguration, sendInvoiceEmail } from './invoice-mail';
import { invoiceDocument, invoiceEmailDraft } from './invoice-document';
import { renderInvoicePdf } from './invoice-pdf';
import { archiveDeliveredPdf } from './invoice-archive';
import { issueRecurring, listTemplates } from './recurring';
import { assertReminderAllowed, receivables } from './receivables';
import { reminderMailDraft } from './doc-language';
import { allocatePayment, openDocuments, suggestMatches, unallocatedTransactions } from './payments';
import { calendarEvents } from './tax-calendar';
import { renderLetter, sendLetters } from './mail';

// Robot: once a day per company and job it issues due recurring invoices (and e-mails them), sends overdue reminders by the
// company's rules, allocates bank payments that match an invoice unambiguously, sends the weekly summary and tax-deadline
// reminders. Every job is off until switched on; every run is logged; letters go through the same logs as manual sending.
export const JOBS = ['recurring', 'reminders', 'bank', 'digest', 'tax'] as const;
export type Job = (typeof JOBS)[number];

export interface AutomationSettings {
  recurringEnabled: boolean; remindersEnabled: boolean; reminderDays: number[]; reminderTemplateId: number | null;
  bankMatchEnabled: boolean; digestEnabled: boolean; digestWeekday: number; taxEnabled: boolean; taxDaysBefore: number; notifyEmail: string;
}
type Row = Record<string, unknown>;
type Detail = { text: string; ok: boolean };

const DEFAULTS: AutomationSettings = { recurringEnabled: false, remindersEnabled: false, reminderDays: [3, 14, 30], reminderTemplateId: null, bankMatchEnabled: false, digestEnabled: false, digestWeekday: 1, taxEnabled: false, taxDaysBefore: 5, notifyEmail: '' };
const days = (value: unknown) => String(value ?? '').split(/[^0-9]+/).map(Number).filter(n => Number.isInteger(n) && n > 0 && n <= 365).sort((a, b) => a - b).filter((n, i, a) => a.indexOf(n) === i).slice(0, 6);
const addDays = (date: string, n: number) => new Date(Date.parse(date + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (date: string) => ((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1; // 1 = Monday
const eur = (v: number) => v.toLocaleString('lt-LT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export function getAutomationSettings(db: Database.Database, companyId: number): AutomationSettings {
  const r = db.prepare('SELECT * FROM AutomationSettings WHERE companyId=?').get(companyId) as Row | undefined;
  if (!r) return { ...DEFAULTS };
  return {
    recurringEnabled: r.recurringEnabled === 1, remindersEnabled: r.remindersEnabled === 1, reminderDays: days(r.reminderDays), reminderTemplateId: (r.reminderTemplateId as number | null) ?? null,
    bankMatchEnabled: r.bankMatchEnabled === 1, digestEnabled: r.digestEnabled === 1, digestWeekday: Number(r.digestWeekday) || 1,
    taxEnabled: r.taxEnabled === 1, taxDaysBefore: Number(r.taxDaysBefore) || 5, notifyEmail: String(r.notifyEmail ?? ''),
  };
}

export function saveAutomationSettings(db: Database.Database, companyId: number, body: Row): AutomationSettings {
  const flag = (k: keyof AutomationSettings) => { if (typeof body[k] !== 'boolean') throw new HttpError(400, 'Neteisingi automatizavimo nustatymai'); return body[k] ? 1 : 0; };
  const reminderDays = days(Array.isArray(body.reminderDays) ? body.reminderDays.join(',') : body.reminderDays);
  if (body.remindersEnabled && !reminderDays.length) throw new HttpError(400, 'Nurodykite, po kiek dienų siųsti priminimus');
  const digestWeekday = Number(body.digestWeekday), taxDaysBefore = Number(body.taxDaysBefore);
  if (!Number.isInteger(digestWeekday) || digestWeekday < 1 || digestWeekday > 7) throw new HttpError(400, 'Neteisinga savaitės diena');
  if (!Number.isInteger(taxDaysBefore) || taxDaysBefore < 1 || taxDaysBefore > 30) throw new HttpError(400, 'Dienų iki termino: nuo 1 iki 30');
  const notifyEmail = typeof body.notifyEmail === 'string' ? body.notifyEmail.trim() : '';
  if (notifyEmail && !validEmail(notifyEmail)) throw new HttpError(400, 'Neteisingas pranešimų el. pašto adresas');
  if ((body.digestEnabled || body.taxEnabled) && !notifyEmail) throw new HttpError(400, 'Nurodykite el. paštą suvestinei ir mokesčių priminimams');
  const templateId = body.reminderTemplateId == null || body.reminderTemplateId === '' ? null : Number(body.reminderTemplateId);
  if (templateId !== null && !db.prepare('SELECT 1 FROM MailTemplate WHERE id=? AND companyId=?').get(templateId, companyId)) throw new HttpError(400, 'Šablonas nerastas');
  db.prepare(`INSERT INTO AutomationSettings(companyId,recurringEnabled,remindersEnabled,reminderDays,reminderTemplateId,bankMatchEnabled,digestEnabled,digestWeekday,taxEnabled,taxDaysBefore,notifyEmail)
    VALUES(@companyId,@recurringEnabled,@remindersEnabled,@reminderDays,@reminderTemplateId,@bankMatchEnabled,@digestEnabled,@digestWeekday,@taxEnabled,@taxDaysBefore,@notifyEmail)
    ON CONFLICT(companyId) DO UPDATE SET recurringEnabled=excluded.recurringEnabled, remindersEnabled=excluded.remindersEnabled, reminderDays=excluded.reminderDays,
      reminderTemplateId=excluded.reminderTemplateId, bankMatchEnabled=excluded.bankMatchEnabled, digestEnabled=excluded.digestEnabled, digestWeekday=excluded.digestWeekday,
      taxEnabled=excluded.taxEnabled, taxDaysBefore=excluded.taxDaysBefore, notifyEmail=excluded.notifyEmail, updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
    .run({ companyId, recurringEnabled: flag('recurringEnabled'), remindersEnabled: flag('remindersEnabled'), reminderDays: reminderDays.join(','), reminderTemplateId: templateId, bankMatchEnabled: flag('bankMatchEnabled'), digestEnabled: flag('digestEnabled'), digestWeekday, taxEnabled: flag('taxEnabled'), taxDaysBefore, notifyEmail: notifyEmail || null });
  return getAutomationSettings(db, companyId);
}

// ---------- jobs ----------

async function emailInvoice(db: Database.Database, companyId: number, saleId: number): Promise<Detail> {
  const doc = invoiceDocument(saleId, companyId);
  const to = (doc.mailTo || doc.buyer.email || '').split(/[;,\s]+/).find(Boolean) || '';
  if (!validEmail(to)) return { text: `${doc.number}: kontrahentas neturi el. pašto, sąskaita neišsiųsta`, ok: false };
  const draft = invoiceEmailDraft(doc);
  const pdf = await renderInvoicePdf(doc);
  const requestId = crypto.randomUUID();
  db.prepare("INSERT INTO InvoiceDelivery(companyId,saleId,requestId,recipient,status,createdAt) VALUES(?,?,?,?,'sending',?)").run(companyId, saleId, requestId, to, Date.now());
  try {
    const messageId = await sendInvoiceEmail(doc, pdf, to, draft.subject, draft.text);
    db.prepare("UPDATE InvoiceDelivery SET status='sent',messageId=? WHERE companyId=? AND requestId=?").run(messageId, companyId, requestId);
    archiveDeliveredPdf(doc, pdf, { requestId, recipient: to, messageId });
    return { text: `${doc.number}: išsiųsta ${to}`, ok: true };
  } catch (err) {
    db.prepare("UPDATE InvoiceDelivery SET status='uncertain' WHERE companyId=? AND requestId=?").run(companyId, requestId);
    return { text: `${doc.number}: siuntimas nepavyko (${err instanceof Error ? err.message : err})`, ok: false };
  }
}

async function runRecurring(db: Database.Database, companyId: number): Promise<Detail[]> {
  const out: Detail[] = [];
  let smtp = true;
  try { mailConfiguration(companyId); } catch { smtp = false; }
  const templates = (listTemplates(db, companyId) as unknown as (Row & { id: number; name: string })[]).filter(t => t.due);
  for (const t of templates) {
    const mode = (db.prepare('SELECT autoMode FROM RecurringInvoice WHERE id=?').get(t.id) as { autoMode: string }).autoMode;
    if (mode === 'MANUAL') continue;
    // Catch up missed periods (the robot was off for a while), at most 12 per template and run.
    for (let i = 0; i < 12; i++) {
      const due = db.prepare('SELECT nextDate, active FROM RecurringInvoice WHERE id=?').get(t.id) as { nextDate: string; active: number };
      if (!due.active || due.nextDate > todayVilnius()) break;
      try {
        const issued = issueRecurring(companyId, t.id);
        const saleId = Number(issued.saleId);
        out.push({ text: `„${t.name}“: išrašyta ${(issued.sale as Row).series ?? ''} ${(issued.sale as Row).number ?? ''} (laikotarpis ${issued.periodDate})`, ok: true });
        if (mode === 'ISSUE_SEND') out.push(smtp ? await emailInvoice(db, companyId, saleId) : { text: 'SMTP nenustatytas: sąskaita išrašyta, bet neišsiųsta', ok: false });
      } catch (err) {
        out.push({ text: `„${t.name}“: ${err instanceof Error ? err.message : err}`, ok: false });
        break;
      }
    }
  }
  return out;
}

async function runReminders(db: Database.Database, companyId: number, s: AutomationSettings): Promise<Detail[]> {
  const out: Detail[] = [];
  mailConfiguration(companyId);
  const template = s.reminderTemplateId ? db.prepare('SELECT subject, body FROM MailTemplate WHERE id=? AND companyId=?').get(s.reminderTemplateId, companyId) as { subject: string; body: string } | undefined : undefined;
  const company = (db.prepare('SELECT name FROM Company WHERE id=?').get(companyId) as { name: string }).name;
  for (const r of receivables(db, companyId, todayVilnius())) {
    const step = r.reminders;
    if (r.daysOverdue <= 0 || step >= s.reminderDays.length || r.daysOverdue < s.reminderDays[step]) continue;
    if (r.lastReminder && Date.now() - r.lastReminder < 3 * 86_400_000) continue; // the next step waits at least 3 days after the previous reminder
    const to = r.clientEmail.split(/[;,\s]+/).find(Boolean) || '';
    if (!validEmail(to)) { out.push({ text: `${r.label}: kontrahentas neturi el. pašto`, ok: false }); continue; }
    try {
      const open = assertReminderAllowed(db, companyId, r.saleId, Date.now());
      const doc = invoiceDocument(r.saleId, companyId);
      const draft = reminderMailDraft(doc.lang, { number: doc.number, date: doc.date, dueDate: doc.dueDate, balance: open.balance, currency: doc.currency, seller: doc.seller.name });
      const values = { client_name: r.clientName, client_code: doc.buyer.code ?? '', company_name: company, date: todayVilnius(), balance: eur(open.balance), open_invoices: `${r.label} (${r.date.slice(0, 10)}): ${eur(open.balance)}` };
      const subject = template ? renderLetter(template.subject, values).replace(/[\r\n]+/g, ' ').slice(0, 200) : draft.subject;
      const text = template ? renderLetter(template.body, values) : draft.text;
      const pdf = await renderInvoicePdf(doc);
      const requestId = crypto.randomUUID();
      assertReminderAllowed(db, companyId, r.saleId, Date.now());
      db.prepare("INSERT INTO ReminderLog(companyId,saleId,requestId,recipient,status,balance,createdAt) VALUES(?,?,?,?,'sending',?,?)").run(companyId, r.saleId, requestId, to, open.balance, Date.now());
      try {
        const messageId = await sendInvoiceEmail(doc, pdf, to, subject, text);
        db.prepare("UPDATE ReminderLog SET status='sent',messageId=? WHERE companyId=? AND requestId=?").run(messageId, companyId, requestId);
        out.push({ text: `${r.label}: ${step + 1}-as priminimas išsiųstas ${to} (vėluoja ${r.daysOverdue} d., skola ${eur(open.balance)})`, ok: true });
      } catch (err) {
        db.prepare("UPDATE ReminderLog SET status='uncertain' WHERE companyId=? AND requestId=?").run(companyId, requestId);
        out.push({ text: `${r.label}: siuntimas nepavyko (${err instanceof Error ? err.message : err})`, ok: false });
      }
    } catch (err) {
      out.push({ text: `${r.label}: ${err instanceof Error ? err.message : err}`, ok: false });
    }
  }
  return out;
}

function runBank(db: Database.Database, companyId: number): Detail[] {
  const out: Detail[] = [];
  // Only "high" suggestions: the invoice number as a whole token and the exact open balance, with no tie. The rest stays for the accountant.
  for (const m of suggestMatches(db, companyId).filter(x => x.confidence === 'high')) {
    try {
      allocatePayment(db, companyId, { bankTransactionId: m.bankTransactionId, kind: m.kind, documentId: m.documentId, amount: m.amount });
      out.push({ text: `${m.label}: susietas mokėjimas ${eur(m.amount)}`, ok: true });
    } catch (err) {
      out.push({ text: `${m.label}: ${err instanceof Error ? err.message : err}`, ok: false });
    }
  }
  return out;
}

function upcomingTax(db: Database.Database, companyId: number, today: string, horizon: number) {
  return calendarEvents(db, companyId, today, addDays(today, horizon)).filter(e => !e.done && e.dueWorkingDay >= today && e.dueWorkingDay <= addDays(today, horizon));
}

async function notify(db: Database.Database, companyId: number, email: string, subject: string, body: string) {
  const { results } = await sendLetters(db, companyId, { recipients: [{ email, clientId: null, name: null }], subject, body }, null);
  if (results[0]?.status !== 'SENT') throw new Error(results[0]?.error || 'siuntimas nepavyko');
}

async function runDigest(db: Database.Database, companyId: number, s: AutomationSettings, today: string): Promise<Detail[]> {
  if (weekday(today) !== s.digestWeekday) return [];
  const key = `digest:${today}`;
  if (db.prepare('SELECT 1 FROM AutomationSent WHERE companyId=? AND key=?').get(companyId, key)) return [];
  const from = addDays(today, -7);
  const sales = db.prepare("SELECT COUNT(*) n, COALESCE(SUM(sumWithVat),0) total FROM Sale WHERE companyId=? AND COALESCE(docType,'SF')<>'KS' AND saleDate>=? AND saleDate<?").get(companyId, from, today) as { n: number; total: number };
  const paid = db.prepare('SELECT COALESCE(SUM(sum),0) s FROM BankTransaction WHERE companyId=? AND sum>0 AND date>=? AND date<?').get(companyId, from, today) as { s: number };
  const open = receivables(db, companyId, today);
  const overdue = open.filter(r => r.daysOverdue > 0);
  const payables = openDocuments(db, companyId).filter(d => d.kind === 'PURCHASE');
  const unmatched = unallocatedTransactions(db, companyId).length;
  const tax = upcomingTax(db, companyId, today, 14);
  const company = (db.prepare('SELECT name FROM Company WHERE id=?').get(companyId) as { name: string }).name;
  const top = overdue.slice(0, 10).map(r => `  • ${r.clientName}: ${r.label}, ${eur(r.balance)}, vėluoja ${r.daysOverdue} d.`).join('\n');
  const body = [
    `${company} – savaitės suvestinė (${from} – ${addDays(today, -1)})`, '',
    `Išrašyta sąskaitų: ${sales.n}, suma ${eur(sales.total)}`,
    `Gauta į banką: ${eur(paid.s)}`,
    `Neapmokėtos pardavimų sąskaitos: ${open.length}, iš viso ${eur(open.reduce((n, r) => n + r.balance, 0))}`,
    `Iš jų vėluoja: ${overdue.length}, ${eur(overdue.reduce((n, r) => n + r.balance, 0))}`,
    ...(top ? ['', 'Didžiausios vėluojančios:', top] : []),
    `Neapmokėtos pirkimų sąskaitos: ${payables.length}, ${eur(payables.reduce((n, d) => n + d.balance, 0))}`,
    `Nesusietų banko mokėjimų: ${unmatched}`,
    ...(tax.length ? ['', 'Artimiausi mokesčių terminai (14 d.):', ...tax.map(e => `  • ${e.dueWorkingDay}: ${e.title}`)] : []),
  ].join('\n');
  await notify(db, companyId, s.notifyEmail, `Savaitės suvestinė – ${company}`, body);
  db.prepare('INSERT INTO AutomationSent(companyId,key) VALUES(?,?)').run(companyId, key);
  return [{ text: `suvestinė išsiųsta ${s.notifyEmail}`, ok: true }];
}

async function runTax(db: Database.Database, companyId: number, s: AutomationSettings, today: string): Promise<Detail[]> {
  const fresh = upcomingTax(db, companyId, today, s.taxDaysBefore).filter(e => !db.prepare('SELECT 1 FROM AutomationSent WHERE companyId=? AND key=?').get(companyId, `tax:${e.code}:${e.periodEnd}`));
  if (!fresh.length) return [];
  const company = (db.prepare('SELECT name FROM Company WHERE id=?').get(companyId) as { name: string }).name;
  const body = [`${company}: artėja mokesčių terminai.`, '', ...fresh.map(e => `• ${e.dueWorkingDay}: ${e.title} (laikotarpis ${e.periodStart} – ${e.periodEnd})`), '', 'Pažymėti kaip atliktus galite skiltyje „Mokesčių kalendorius“.'].join('\n');
  await notify(db, companyId, s.notifyEmail, `Mokesčių terminai – ${company}`, body);
  for (const e of fresh) db.prepare('INSERT OR IGNORE INTO AutomationSent(companyId,key) VALUES(?,?)').run(companyId, `tax:${e.code}:${e.periodEnd}`);
  return fresh.map(e => ({ text: `priminimas: ${e.dueWorkingDay} ${e.title}`, ok: true }));
}

// ---------- runner ----------

export interface RunSummary { companyId: number; job: Job; status: 'OK' | 'ERROR' | 'SKIPPED'; details: Detail[]; message?: string }
let running: Promise<RunSummary[]> | null = null;

/** Runs the enabled jobs of every company (or one) that have not run today. `force` runs them again (button "Run now"). */
export function runAutomation(db: Database.Database, options: { companyId?: number; force?: boolean; trigger?: string } = {}): Promise<RunSummary[]> {
  if (running) return running; // a second trigger while a run is in progress waits for the same run
  running = (async () => {
    const today = todayVilnius();
    const out: RunSummary[] = [];
    const companies = options.companyId ? [options.companyId] : (db.prepare('SELECT companyId FROM AutomationSettings').all() as { companyId: number }[]).map(r => r.companyId);
    for (const companyId of companies) {
      const s = getAutomationSettings(db, companyId);
      const enabled: Record<Job, boolean> = { recurring: s.recurringEnabled, reminders: s.remindersEnabled, bank: s.bankMatchEnabled, digest: s.digestEnabled, tax: s.taxEnabled };
      for (const job of JOBS) {
        if (!enabled[job]) continue;
        if (!options.force && db.prepare("SELECT 1 FROM AutomationRun WHERE companyId=? AND job=? AND runDate=? AND status='OK'").get(companyId, job, today)) { out.push({ companyId, job, status: 'SKIPPED', details: [] }); continue; }
        let details: Detail[] = [], status: 'OK' | 'ERROR' = 'OK', message: string | undefined;
        try {
          details = job === 'recurring' ? await runRecurring(db, companyId)
            : job === 'reminders' ? await runReminders(db, companyId, s)
            : job === 'bank' ? runBank(db, companyId)
            : job === 'digest' ? await runDigest(db, companyId, s, today)
            : await runTax(db, companyId, s, today);
        } catch (err) {
          status = 'ERROR'; message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        }
        db.prepare('INSERT INTO AutomationRun(companyId,job,runDate,status,message,detailsJson,trigger) VALUES(?,?,?,?,?,?,?)').run(companyId, job, today, status, message ?? null, JSON.stringify(details), options.trigger ?? 'schedule');
        out.push({ companyId, job, status, details, message });
      }
    }
    return out;
  })().finally(() => { running = null; });
  return running;
}

export function listAutomationRuns(db: Database.Database, companyId: number, limit = 100) {
  return (db.prepare('SELECT id, job, runDate, status, message, detailsJson, trigger, createdAt FROM AutomationRun WHERE companyId=? ORDER BY id DESC LIMIT ?').all(companyId, limit) as (Row & { detailsJson: string })[])
    .map(r => ({ ...r, details: JSON.parse(r.detailsJson) as Detail[] }));
}
