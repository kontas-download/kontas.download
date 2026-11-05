import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
import { apiError, assertFormCompany, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { localizeDocuments } from '@/lib/purchase-document-api';
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

// multipart/form-data: file (PDF, JPEG, PNG, WebP; up to 20 MB), optional companyId of the open form.
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
    const document = await withCurrentActor(() => storeDocument(companyId, { buffer, fileName: file.name, mimeType: file.type, source: 'UPLOAD' }));
    const safe: Partial<typeof document> = { ...document };
    delete safe.storagePath;
    delete safe.extractedJson;
    return NextResponse.json({ success: true, document: safe }, { status: 201 });
  } catch (err) {
    return apiError(err);
  }
}
