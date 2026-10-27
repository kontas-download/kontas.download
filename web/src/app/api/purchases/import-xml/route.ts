import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { importXmlPurchase, previewXmlPurchase } from '@/lib/purchase-import';
import { NextResponse } from 'next/server';

// body: { xml, filename?, commit?, createSupplier?, originalPurchaseId? (credit note without a reference), deductionPercent?, debitAccount? }. Without commit it only reports what would happen.
export async function POST(request: Request) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const companyId = await getActiveCompanyId();
    const body = await request.json();
    if (typeof body?.xml !== 'string' || !body.xml.trim()) throw new HttpError(400, 'Pateikite XML tekstą');
    const originalPurchaseId = body.originalPurchaseId === undefined || body.originalPurchaseId === null ? undefined : Number(body.originalPurchaseId);
    if (originalPurchaseId !== undefined && !Number.isSafeInteger(originalPurchaseId)) throw new HttpError(400, 'Neteisingas originalPurchaseId');
    if (body.commit !== true) {
      const preview = previewXmlPurchase(getDb(), companyId, body.xml, { originalPurchaseId });
      return NextResponse.json({ committed: false, ...preview });
    }
    try {
      const result = importXmlPurchase(companyId, body.xml, { filename: typeof body.filename === 'string' ? body.filename : undefined, createSupplier: body.createSupplier === true, originalPurchaseId, deductionPercent: body.deductionPercent, debitAccount: typeof body.debitAccount === 'string' ? body.debitAccount : undefined });
      return NextResponse.json({ committed: true, ...result });
    } catch (error) {
      const preview = (error as { preview?: unknown }).preview;
      if (preview) return NextResponse.json({ committed: false, error: (error as Error).message, ...(preview as object) }, { status: 422 });
      throw error;
    }
  } catch (err) {
    return apiError(err);
  }
}
