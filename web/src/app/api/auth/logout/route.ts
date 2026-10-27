import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { revokeSession } from '@/lib/auth';
import { checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
export async function POST(request: Request) {
  try {
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const token = (await cookies()).get('auth_session')?.value;
    if (token) revokeSession(token);
    const response = NextResponse.json({ success: true });
    response.cookies.set({ name: 'auth_session', value: '', httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
    return response;
  } catch (error) { return apiError(error); }
}
