import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { hashPassword, verifyPassword, revokeUserSessions } from '@/lib/auth';
import { checkOrigin, currentUser } from '@/lib/access';
import { apiError, HttpError } from '@/lib/errors';
import { checkPassword, logUser } from '@/lib/users';

// The signed-in user changes their own password. Every other session of the user ends; this one stays.
// Wrong current passwords count towards the same throttle as sign-in attempts for that e-mail.
export async function POST(request: Request) {
  try {
    const user = await currentUser();
    if (!user) return NextResponse.json({ error: 'Reikia prisijungti' }, { status: 401 });
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    const current = body?.currentPassword;
    if (typeof current !== 'string' || !current || current.length > 1024) throw new HttpError(400, 'Nurodykite dabartinį slaptažodį');
    const next = checkPassword(body?.newPassword);
    const db = getDb();
    const key = user.email.trim().toLowerCase();
    const now = Date.now();
    const allowed = db.transaction(() => {
      db.prepare('DELETE FROM LoginAttempt WHERE resetAt <= ?').run(now);
      const attempt = db.prepare('SELECT attempts FROM LoginAttempt WHERE email = ?').get(key) as { attempts: number } | undefined;
      if (attempt && attempt.attempts >= 10) return false;
      db.prepare('INSERT INTO LoginAttempt (email, attempts, resetAt) VALUES (?, 1, ?) ON CONFLICT(email) DO UPDATE SET attempts = attempts + 1').run(key, now + 15 * 60 * 1000);
      return true;
    }).immediate();
    if (!allowed) return NextResponse.json({ error: 'Per daug bandymų. Pabandykite vėliau.' }, { status: 429, headers: { 'Retry-After': '900' } });
    const stored = db.prepare('SELECT passwordHash FROM User WHERE id = ?').get(user.id) as { passwordHash: string };
    if (!(await verifyPassword(current, stored.passwordHash))) throw new HttpError(400, 'Dabartinis slaptažodis nurodytas neteisingai');
    if (current === next) throw new HttpError(400, 'Naujas slaptažodis turi skirtis nuo dabartinio');
    const hash = await hashPassword(next);
    const token = (await cookies()).get('auth_session')?.value || '';
    db.transaction(() => {
      db.prepare('UPDATE User SET passwordHash = ? WHERE id = ?').run(hash, user.id);
      db.prepare('DELETE FROM LoginAttempt WHERE email = ?').run(key);
      revokeUserSessions(user.id, token);
      logUser(db, user.id, user, 'PASSWORD_CHANGE');
    }).immediate();
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiError(error); }
}
