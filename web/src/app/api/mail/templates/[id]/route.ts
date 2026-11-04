import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { deleteMailTemplate, saveMailTemplate } from '@/lib/mail';

async function templateId(context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
  return id;
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Neteisingi duomenys');
    return NextResponse.json({ template: saveMailTemplate(getDb(), await getActiveCompanyId(), body, await templateId(context)) });
  } catch (err) { return apiError(err); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    deleteMailTemplate(getDb(), await getActiveCompanyId(), await templateId(context));
    return NextResponse.json({ success: true });
  } catch (err) { return apiError(err); }
}
