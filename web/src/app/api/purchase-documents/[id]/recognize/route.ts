import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { localizeDocuments } from '@/lib/purchase-document-api';
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
    const [document] = await localizeDocuments([await recognizeDocument(await getActiveCompanyId(), id, defaultRecognitionProvider)]);
    return NextResponse.json({ document });
  } catch (err) {
    return apiError(err);
  }
}
