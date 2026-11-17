import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { localizeDocuments } from '@/lib/purchase-document-api';
import { pairBatch } from '@/lib/purchase-document-pairing';
import { documentCounts, listDocuments, storeDocument } from '@/lib/purchase-recognition';

export async function GET(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companyId = await getActiveCompanyId();
    const status = new URL(request.url).searchParams.get('status') || undefined;
    return NextResponse.json({ documents: await localizeDocuments(listDocuments(companyId, status)), counts: documentCounts(companyId) });
  } catch (err) {
    return apiError(err);
  }
}

// multipart/form-data: file (PDF, JPEG, PNG, WebP; up to 20 MB), optional companyId of the open form and optional batchId
// (the same value on every file of one multi-file upload, so an invoice and its receipt can be paired).
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const form = await request.formData();
    assertFormCompany(form.get('companyId'), companyId);
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Pridėkite failą');
    if (file.size > 20 * 1024 * 1024) throw new HttpError(413, 'Failas per didelis: leidžiama iki 20 MB');
    const buffer = Buffer.from(await file.arrayBuffer());
    const rawBatch = form.get('batchId');
    const batchId = typeof rawBatch === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(rawBatch) ? rawBatch : null;
    const document = await withCurrentActor(() => storeDocument(companyId, { buffer, fileName: file.name, mimeType: file.type, source: 'UPLOAD', batchId }));
    pairBatch(companyId, batchId); // an XML e-invoice needs no recognition, so its batch is evaluated right away
    const safe: Partial<typeof document> = { ...document };
    delete safe.storagePath;
    delete safe.extractedJson;
    return NextResponse.json({ success: true, document: safe }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
