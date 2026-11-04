import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { listMailTemplates, saveMailTemplate } from '@/lib/mail';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    return NextResponse.json({ templates: listMailTemplates(getDb(), await getActiveCompanyId()) });
  } catch (err) { return apiError(err); }
}

export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Neteisingi duomenys');
    return NextResponse.json({ template: saveMailTemplate(getDb(), await getActiveCompanyId(), body) });
  } catch (err) { return apiError(err); }
}
