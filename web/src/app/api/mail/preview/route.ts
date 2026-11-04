import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { composeLetters, resolveRecipients } from '@/lib/mail';
import { signLetter } from '@/lib/mail-signature';

// The letters as they would be sent (placeholders filled per recipient); nothing is sent or stored.
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
    const letters = composeLetters(db, companyId, recipients, String(body.subject ?? ''), String(body.body ?? '')).map(l => { const signed = signLetter(db, companyId, l.body); return { ...l, body: signed.text, withLogo: signed.attachments.length > 0 }; });
    return NextResponse.json({ letters });
  } catch (err) { return apiError(err); }
}
