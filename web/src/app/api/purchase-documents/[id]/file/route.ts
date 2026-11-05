import { requireApiAccess } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { readDocumentFile } from '@/lib/purchase-recognition';

// The stored original, unchanged. Company-scoped through the active company.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Neteisingas ID');
    const { row, data } = readDocumentFile(await getActiveCompanyId(), id);
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
