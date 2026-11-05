import { NextResponse } from 'next/server';
import { requireApiAccess } from '@/lib/access';
import { apiError, currentErrorLang, translateServerError } from '@/lib/errors';
import { getActiveCompanyId } from '@/lib/company';
import { inboxLog } from '@/lib/document-inbox';

// The last 50 processed messages. The detail lines are stored in Lithuanian and translated here.
export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const lang = await currentErrorLang();
    const line = (text: string) => {
      const [name, ...rest] = text.split(' | ');
      return rest.length ? `${name}: ${translateServerError(rest.join(' | '), lang)}` : translateServerError(text, lang);
    };
    const rows = inboxLog(await getActiveCompanyId(), 50).map(r => ({ ...r, detail: r.detail.split('\n').filter(Boolean).map(line) }));
    return NextResponse.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return apiError(err);
  }
}
