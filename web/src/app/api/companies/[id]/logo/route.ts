import { NextResponse } from 'next/server';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { deleteCompanyLogo, getCompanyLogo, saveCompanyLogo, LOGO_MAX_BYTES } from '@/lib/company-logo';

type Ctx = { params: Promise<{ id: string }> };
async function companyId(context: Ctx) {
  const id = Number((await context.params).id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, context: Ctx) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const id = await companyId(context);
    const logo = id ? getCompanyLogo(id) : undefined;
    if (!logo) return NextResponse.json({ error: 'Logotipo nėra' }, { status: 404 });
    return new Response(new Uint8Array(logo.data), { headers: { 'Content-Type': logo.mime, 'Cache-Control': 'private, no-cache', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { return apiError(error); }
}

// The request body is the raw image file (Content-Type is ignored; the file signature decides).
export async function PUT(request: Request, context: Ctx) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await companyId(context);
    if (!id) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });
    const length = Number(request.headers.get('content-length') || 0);
    if (length > LOGO_MAX_BYTES + 1024) return NextResponse.json({ error: 'Logotipas per didelis (daugiausia 512 KB)' }, { status: 413 });
    saveCompanyLogo(id, Buffer.from(await request.arrayBuffer()));
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const id = await companyId(context);
    if (!id) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });
    deleteCompanyLogo(id);
    return NextResponse.json({ success: true });
  } catch (error) { return apiError(error); }
}
