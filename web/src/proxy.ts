import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Only an optimistic redirect. Every protected page/API verifies the database session.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === '/login' || path.startsWith('/api/') || path.startsWith('/_next/') || path === '/favicon.ico') return NextResponse.next();
  if (!/^[a-f0-9]{64}$/.test(request.cookies.get('auth_session')?.value || '')) return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
