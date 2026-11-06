import { requireApiAccess } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { preparedImage, readDocumentFile } from '@/lib/purchase-recognition';

// The stored original, unchanged. ?variant=visual: the PDF kept beside an XML e-invoice. ?variant=prepared: the derived JPEG copy of a photo
// (rotated, limited in size; the only form in which a HEIC photo can be shown by most browsers). Company-scoped through the active company.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const requested = new URL(request.url).searchParams.get('variant');
    const companyId = await getActiveCompanyId();
    let file: { row: { fileName: string; mimeType: string }; data: Buffer };
    if (requested === 'prepared') {
      const prepared = await preparedImage(companyId, id);
      file = { row: { fileName: `${prepared.row.fileName.replace(/\.[^.]*$/, '')}.jpg`, mimeType: prepared.mimeType }, data: prepared.data };
    } else file = readDocumentFile(companyId, id, requested === 'visual' ? 'visual' : undefined);
    const { row, data } = file;
    const asciiName = row.fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': row.mimeType,
        'Content-Disposition': `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
        'Content-Length': String(data.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
