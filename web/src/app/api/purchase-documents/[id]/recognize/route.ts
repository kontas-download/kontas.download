import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { localizeDocuments } from '@/lib/purchase-document-api';
import { pairBatch } from '@/lib/purchase-document-pairing';
import { recognizeDocument } from '@/lib/purchase-recognition';
import { defaultRecognitionProvider } from '@/lib/recognition/factory';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const companyId = await getActiveCompanyId();
    const recognized = await recognizeDocument(companyId, id, defaultRecognitionProvider);
    pairBatch(companyId, (recognized as { batchId?: string | null }).batchId);
    const [document] = await localizeDocuments([recognized]);
    return NextResponse.json({ document });
  } catch (err) {
    return apiError(err);
  }
}
