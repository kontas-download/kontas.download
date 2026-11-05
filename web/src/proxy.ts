import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// Only an optimistic redirect. Every protected page/API verifies the database session.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  // The share target POST (phone "Share" sheet) is answered by its own handler, which checks the session and redirects to /login itself:
  // a proxy redirect with status 307 would replay the multipart POST against the login page.
  if (path === '/purchase-documents/share' || path === '/manifest.webmanifest' || path.startsWith('/icons/')) return NextResponse.next();
  if (path === '/login' || path.startsWith('/api/') || path.startsWith('/_next/') || path === '/favicon.ico') return NextResponse.next();
  if (!/^[a-f0-9]{64}$/.test(request.cookies.get('auth_session')?.value || '')) return NextResponse.redirect(new URL('/login', request.url));
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
