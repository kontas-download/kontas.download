import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { localizePreview } from '@/lib/purchase-document-api';
import { deleteDocument, previewDocument } from '@/lib/purchase-recognition';

type Context = { params: Promise<{ id: string }> };
async function documentId(context: Context) {
  const id = Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
  return id;
}

// Detail with the review preview; a document that was not recognized yet gets an empty draft for manual entry.
export async function GET(_request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    const id = await documentId(context);
    return NextResponse.json(await localizePreview(previewDocument(companyId, id)), { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    deleteDocument(await getActiveCompanyId(), await documentId(context));
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err);
  }
}
