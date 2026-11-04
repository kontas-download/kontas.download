import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/access';
import { checkForUpdate } from '@/lib/update-check';

// Administrators only: whether a newer kontas.download version is published. ?force=1 skips the 12 h cache.
export async function GET(request?: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const force = request?.url ? new URL(request.url).searchParams.get('force') === '1' : false;
  return NextResponse.json(await checkForUpdate({ force }), { headers: { 'cache-control': 'no-store' } });
}
