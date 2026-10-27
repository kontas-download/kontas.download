import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { verifySessionToken } from './auth';
import { getDb } from './db';
import { withActor } from './audit-actor';
// Roles: 'admin' can do everything; 'accountant' does the accounting work in every company but cannot manage users,
// download the whole database, move company packages, read the audit history, close periods or create/delete companies.
export const ROLES = ['admin', 'accountant'] as const;
export type Role = typeof ROLES[number];
export const isRole = (value: unknown): value is Role => typeof value === 'string' && (ROLES as readonly string[]).includes(value);
export async function currentUser() {
  return verifySessionToken((await cookies()).get('auth_session')?.value || '');
}
// Runs a synchronous database write so that its audit rows record the signed-in user.
export async function withCurrentActor<T>(fn: () => T): Promise<T> {
  const user = await currentUser();
  return withActor(getDb(), user?.id, fn);
}
export async function requirePageAccess() {
  const user = await currentUser();
  if (!user || !isRole(user.role)) redirect('/login');
  return user;
}
export async function requireAdminPage() {
  const user = await requirePageAccess();
  if (user.role !== 'admin') redirect('/');
  return user;
}
export async function requireApiAccess() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 });
  // This installation has shared companies, not tenant memberships: every signed-in role sees every company.
  if (!isRole(user.role)) return NextResponse.json({ error: 'Prieiga uždrausta' }, { status: 403 });
  return null;
}
export async function requireAdminApi() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Prieinama tik administratoriui' }, { status: 403 });
  return null;
}
export async function checkOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
  const origin = request.headers.get('origin');
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  // When the program is configured for a loopback address (localhost), the other loopback spellings of the same port are the same browser tab.
  const loopback = (value: string) => { try { const url = new URL(value); return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ? url.port || '80' : null; } catch { return null; } };
  const port = loopback(expected);
  const allowed = origin === expected || (origin !== null && port !== null && loopback(origin) === port);
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && !allowed)) {
    return NextResponse.json({ error: 'Netinkamas užklausos šaltinis' }, { status: 403 });
  }
  return null;
}
