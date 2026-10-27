import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { getActiveCompanyId } from '@/lib/company';
import { getDb } from '@/lib/db';
import { invoiceDocument } from '@/lib/invoice-document';
import { renderInvoicePdf } from '@/lib/invoice-pdf';
import { validEmail, mailConfiguration, sendInvoiceEmail } from '@/lib/invoice-mail';
import { assertReminderAllowed } from '@/lib/receivables';
import { reminderMailDraft } from '@/lib/doc-language';
import { apiError, HttpError } from '@/lib/errors';
export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

// Draft only: nothing is sent until the user confirms with POST.
export async function GET(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    const id = Number((await context.params).id);
    const open = assertReminderAllowed(getDb(), companyId, id, Date.now());
    const doc = invoiceDocument(id, companyId, new URL(request.url).searchParams.get('lang'));
    let configured = true;
    try { mailConfiguration(companyId); } catch { configured = false; }
    const draft = reminderMailDraft(doc.lang, { number: doc.number, date: doc.date, dueDate: doc.dueDate, balance: open.balance, currency: doc.currency, seller: doc.seller.name });
    return NextResponse.json({
      to: doc.buyer.email || '',
      lang: doc.lang,
      subject: draft.subject,
      text: draft.text,
      balance: open.balance,
      configured,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const id = Number((await context.params).id);
    const body = await request.json();
    if (!body || !validEmail(body.to) || typeof body.subject !== 'string' || !body.subject.trim() || body.subject.length > 200 || /[\r\n]/.test(body.subject) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 10000 || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.requestId)) throw new HttpError(400, 'Patikrinkite adresą, temą ir laiško tekstą');
    const db = getDb();
    const previous = db.prepare('SELECT saleId,status,messageId FROM ReminderLog WHERE companyId=? AND requestId=?').get(companyId, body.requestId) as { saleId: number; status: string; messageId: string | null } | undefined;
    if (previous) {
      if (previous.saleId !== id) throw new HttpError(409, 'Siuntimo identifikatorius jau naudojamas');
      if (previous.status === 'sent') return NextResponse.json({ success: true, messageId: previous.messageId, duplicate: true });
      throw new HttpError(409, 'Ankstesnis siuntimas nepatvirtintas. Prieš kartodami patikrinkite paštą.');
    }
    const open = assertReminderAllowed(db, companyId, id, Date.now());
    const doc = invoiceDocument(id, companyId, body?.lang);
    mailConfiguration(companyId);
    const pdf = await renderInvoicePdf(doc);
    // The balance and the 3-day window are checked again after the slow rendering, in the same synchronous step as the reservation below.
    assertReminderAllowed(db, companyId, id, Date.now());
    const reserved = db.prepare("INSERT OR IGNORE INTO ReminderLog(companyId,saleId,requestId,recipient,status,balance,createdAt) VALUES(?,?,?,?,'sending',?,?)").run(companyId, id, body.requestId, body.to, open.balance, Date.now());
    if (!reserved.changes) throw new HttpError(409, 'Siuntimas jau vykdomas');
    try {
      const messageId = await sendInvoiceEmail(doc, pdf, body.to, body.subject.trim(), body.text);
      db.prepare("UPDATE ReminderLog SET status='sent',messageId=? WHERE companyId=? AND requestId=?").run(messageId, companyId, body.requestId);
      return NextResponse.json({ success: true, messageId });
    } catch {
      db.prepare("UPDATE ReminderLog SET status='uncertain' WHERE companyId=? AND requestId=?").run(companyId, body.requestId);
      throw new HttpError(502, 'Nepavyko patvirtinti siuntimo. Prieš kartodami patikrinkite paštą, kad išvengtumėte dublikato.');
    }
  } catch (error) {
    return apiError(error);
  }
}
