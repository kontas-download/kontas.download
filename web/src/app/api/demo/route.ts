import { requireAdminApi, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { readLimitedText } from '@/lib/request-body';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { createDemoCompany } from '@/lib/demo-data';

// Creates a demonstration company with fictional data. Administrators only, like creating any other company.
// Body: none or {name}. The active company is not changed here: the client switches to it through /api/companies/switch.
export async function POST(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const raw = (await readLimitedText(request, 4096)).trim();
    const body = raw ? JSON.parse(raw) : {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Tikimasi objekto' }, { status: 400 });
    const { companyId, name } = createDemoCompany(getDb(), { name: body.name });
    return NextResponse.json({ companyId, name });
  } catch (err) {
    return apiError(err);
  }
}
