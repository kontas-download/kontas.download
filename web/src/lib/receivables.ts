import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { openDocuments } from './payments';

export const REMINDER_MIN_DAYS = 3;
export type Bucket = 'NOT_DUE' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS';
export interface Receivable { saleId: number; label: string; date: string; dueDate: string | null; clientId: number | null; clientName: string; clientEmail: string; balance: number; daysOverdue: number; bucket: Bucket; lastReminder: number | null; reminders: number; }

const DAY = 86_400_000;
export function daysBetween(from: string, to: string) {
  return Math.round((Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10)) - Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))) / DAY);
}
export function bucketFor(days: number): Bucket {
  return days <= 0 ? 'NOT_DUE' : days <= 30 ? 'D1_30' : days <= 60 ? 'D31_60' : days <= 90 ? 'D61_90' : 'D90_PLUS';
}

// Open sales with their overdue age. A sale without a due date is treated as due on the invoice date.
export function receivables(db: Database.Database, companyId: number, asOf: string): Receivable[] {
  const meta = new Map((db.prepare(`SELECT s.id, s.payUntil, s.clientId, COALESCE(c.email,'') email,
      (SELECT MAX(createdAt) FROM ReminderLog r WHERE r.companyId=s.companyId AND r.saleId=s.id AND r.status='sent') lastReminder,
      (SELECT COUNT(*) FROM ReminderLog r WHERE r.companyId=s.companyId AND r.saleId=s.id AND r.status='sent') reminders
    FROM Sale s LEFT JOIN Client c ON c.id=s.clientId AND c.companyId=s.companyId WHERE s.companyId=?`).all(companyId) as { id: number; payUntil: string | null; clientId: number | null; email: string; lastReminder: number | null; reminders: number }[]).map(r => [r.id, r]));
  return openDocuments(db, companyId).filter(d => d.kind === 'SALE').map(d => {
    const m = meta.get(d.id)!;
    const dueDate = m.payUntil ? m.payUntil.slice(0, 10) : null;
    const days = daysBetween(dueDate || d.date.slice(0, 10), asOf);
    return { saleId: d.id, label: d.label, date: d.date, dueDate, clientId: m.clientId, clientName: d.clientName, clientEmail: m.email, balance: d.balance, daysOverdue: Math.max(days, 0), bucket: bucketFor(days), lastReminder: m.lastReminder, reminders: m.reminders };
  }).sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
}

// Re-checks the balance at send time and refuses duplicates inside REMINDER_MIN_DAYS.
export function assertReminderAllowed(db: Database.Database, companyId: number, saleId: number, now: number) {
  const sale = db.prepare("SELECT docType FROM Sale WHERE id=? AND companyId=?").get(saleId, companyId) as { docType: string | null } | undefined;
  if (!sale) throw new HttpError(404, 'Sąskaita nerasta');
  if (sale.docType === 'KS') throw new HttpError(409, 'Priminimas dėl kreditinio dokumento nesiunčiamas');
  const open = openDocuments(db, companyId).find(d => d.kind === 'SALE' && d.id === saleId);
  if (!open) throw new HttpError(409, 'Pagal sąskaitą skolos nėra: ji jau apmokėta banko duomenyse');
  const last = db.prepare("SELECT MAX(createdAt) t FROM ReminderLog WHERE companyId=? AND saleId=? AND status IN ('sent','sending','uncertain')").get(companyId, saleId) as { t: number | null };
  if (last.t && now - last.t < REMINDER_MIN_DAYS * DAY) throw new HttpError(409, `Priminimas dėl šios sąskaitos jau buvo siųstas prieš mažiau nei ${REMINDER_MIN_DAYS} d.`);
  return open;
}
