import { NextResponse } from 'next/server';
import { requireApiAccess, requireAdminApi, checkOrigin } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';
import { getAutomationSettings, listAutomationRuns, runAutomation, saveAutomationSettings } from '@/lib/automation';

// GET: the company's automation switches and the run log. PUT: save the switches (administrators). POST: run now (administrators).
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const db = getDb(), companyId = await getActiveCompanyId();
    return NextResponse.json({ settings: getAutomationSettings(db, companyId), runs: listAutomationRuns(db, companyId) });
  } catch (err) { return apiError(err); }
}

export async function PUT(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Neteisingi duomenys');
    return NextResponse.json({ settings: saveAutomationSettings(getDb(), await getActiveCompanyId(), body) });
  } catch (err) { return apiError(err); }
}

export async function POST(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const db = getDb(), companyId = await getActiveCompanyId();
    const results = await runAutomation(db, { companyId, force: true, trigger: 'manual' });
    return NextResponse.json({ results, runs: listAutomationRuns(db, companyId) });
  } catch (err) { return apiError(err); }
}
