import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, currentUser } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { listMailMessages, resolveRecipients, sendLetters } from '@/lib/mail';

// GET: the log of sent letters. POST: sends one letter per recipient (a client or a free address) with the company's SMTP.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json({ messages: listMailMessages(getDb(), await getActiveCompanyId()) });
  } catch (err) { return apiError(err); }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new HttpError(400, 'Neteisingi duomenys');
    const db = getDb(), companyId = await getActiveCompanyId();
    const recipients = resolveRecipients(db, companyId, body.clientIds, body.addresses);
    const user = await currentUser();
    return NextResponse.json(await sendLetters(db, companyId, { recipients, subject: body.subject, body: body.body, templateId: body.templateId }, user?.id ?? null));
  } catch (err) { return apiError(err); }
}
