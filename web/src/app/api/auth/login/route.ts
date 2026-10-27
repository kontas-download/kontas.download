import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { hashPassword, verifyPassword, createSessionToken, SESSION_SECONDS } from '@/lib/auth';
import { checkOrigin, isRole } from '@/lib/access';
import { logUser } from '@/lib/users';
import { apiError } from '@/lib/errors';
export async function POST(request: Request) {
  try {
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { email, password } = await request.json();
    if (typeof email !== 'string' || email.length > 254 || !email.trim() || typeof password !== 'string' || !password || password.length > 1024) {
      return NextResponse.json({ error: 'Nurodykite teisingą el. paštą ir slaptažodį' }, { status: 400 });
    }
    const db = getDb();
    const normalized = email.trim().toLowerCase();
    const now = Date.now();
    const allowed = db.transaction(() => {
      db.prepare('DELETE FROM LoginAttempt WHERE resetAt <= ?').run(now);
      const attempt = db.prepare('SELECT attempts FROM LoginAttempt WHERE email = ?').get(normalized) as { attempts: number } | undefined;
      if (attempt && attempt.attempts >= 10) return false;
      db.prepare('INSERT INTO LoginAttempt (email, attempts, resetAt) VALUES (?, 1, ?) ON CONFLICT(email) DO UPDATE SET attempts = attempts + 1').run(normalized, now + 15 * 60 * 1000);
      return true;
    }).immediate();
    if (!allowed) return NextResponse.json({ error: 'Per daug bandymų. Pabandykite vėliau.' }, { status: 429, headers: { 'Retry-After': '900' } });
    const user = db.prepare('SELECT id, email, name, passwordHash, role, disabledAt FROM User WHERE LOWER(email) = ?').get(normalized) as { id: number; email: string; name: string; passwordHash: string; role: string; disabledAt: number | null } | undefined;
    const valid = user ? await verifyPassword(password, user.passwordHash) : (await hashPassword(password), false);
    // Disabled users and unknown roles get the same answer as a wrong password.
    if (!user || !valid || user.disabledAt != null || !isRole(user.role)) return NextResponse.json({ error: 'Neteisingas el. paštas arba slaptažodis' }, { status: 401 });
    if (!user.passwordHash.startsWith('scrypt:')) db.prepare('UPDATE User SET passwordHash = ? WHERE id = ?').run(await hashPassword(password), user.id);
    db.prepare('DELETE FROM LoginAttempt WHERE email = ?').run(normalized);
    logUser(db, user.id, user, 'LOGIN');
    const token = createSessionToken(user);
    const response = NextResponse.json({ success: true, user: { id: user.id, email: user.email, name: user.name } });
    response.cookies.set({ name: 'auth_session', value: token, httpOnly: true, secure: process.env.COOKIE_SECURE !== 'false' && (process.env.NODE_ENV === 'production' || new URL(request.url).protocol === 'https:'), sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) { return apiError(error); }
}
