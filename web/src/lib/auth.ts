import crypto from 'node:crypto';
import { getDb } from './db';
const options = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const SESSION_SECONDS = 14 * 24 * 60 * 60;
export type SessionUser = { id: number; email: string; name: string; role: string };
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, salt, 64, options, (err, result) => err ? reject(err) : resolve(result)));
  return ['scrypt', salt, key.toString('hex')].join(':');
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    if (parts[0] === 'scrypt' && parts.length === 3) {
      if (!/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
      const key = await new Promise<Buffer>((resolve, reject) => crypto.scrypt(password, parts[1], 64, options, (err, result) => err ? reject(err) : resolve(result)));
      return crypto.timingSafeEqual(key, Buffer.from(parts[2], 'hex'));
    }
    // Compatibility only: rehash legacy credentials immediately after a successful login.
    if (parts.length !== 2 || !/^[a-f0-9]{64}$/.test(parts[1])) return false;
    const key = crypto.createHash('sha256').update(parts[0] + password).digest();
    return crypto.timingSafeEqual(key, Buffer.from(parts[1], 'hex'));
  } catch { return false; }
}
function digest(token: string) { return crypto.createHash('sha256').update(token).digest('hex'); }
export function createSessionToken(user: { id: number }): string {
  const db = getDb();
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM AuthSession WHERE expiresAt <= ?').run(Date.now());
  db.prepare('INSERT INTO AuthSession (tokenHash, userId, expiresAt) VALUES (?, ?, ?)').run(digest(token), user.id, Date.now() + SESSION_SECONDS * 1000);
  return token;
}
export function verifySessionToken(token: string): SessionUser | null {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  // A disabled user loses every existing session at once, even before the session rows are deleted.
  return getDb().prepare('SELECT u.id, u.email, u.name, u.role FROM AuthSession s JOIN User u ON u.id = s.userId WHERE s.tokenHash = ? AND s.expiresAt > ? AND u.disabledAt IS NULL').get(digest(token), Date.now()) as SessionUser | undefined || null;
}
export function revokeSession(token: string) {
  getDb().prepare('DELETE FROM AuthSession WHERE tokenHash = ?').run(digest(token));
}
// Ends every session of a user, optionally keeping the one the request came from.
export function revokeUserSessions(userId: number, keepToken = '') {
  getDb().prepare('DELETE FROM AuthSession WHERE userId = ? AND tokenHash <> ?').run(userId, keepToken ? digest(keepToken) : '');
}
