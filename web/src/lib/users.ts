import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { hashPassword, revokeUserSessions } from './auth';
import { isRole, type Role } from './access';
import { HttpError } from './errors';

// User management for administrators. Password hashes never leave this module; a generated password is returned once.
export const MIN_PASSWORD = 10;
export const MAX_PASSWORD = 1024;
export interface PublicUser { id: number; email: string; name: string; role: string; disabled: boolean; disabledAt: number | null; createdAt: string | null; lastAction: string | null; lastActionAt: string | null }
const SELECT = `SELECT u.id,u.email,u.name,u.role,u.disabledAt,u.createdAt,
  (SELECT action FROM UserLog l WHERE l.userId=u.id OR l.actorId=u.id ORDER BY l.id DESC LIMIT 1) AS lastAction,
  (SELECT createdAt FROM UserLog l WHERE l.userId=u.id OR l.actorId=u.id ORDER BY l.id DESC LIMIT 1) AS lastActionAt FROM User u`;
type Row = Omit<PublicUser, 'disabled'>;
const toPublic = (row: Row): PublicUser => ({ ...row, disabled: row.disabledAt != null });

export function listUsers(db: Database.Database): PublicUser[] {
  return (db.prepare(SELECT + ' ORDER BY u.disabledAt IS NOT NULL, LOWER(u.name), u.id').all() as Row[]).map(toPublic);
}
export function getUser(db: Database.Database, id: number): PublicUser {
  const row = db.prepare(SELECT + ' WHERE u.id=?').get(id) as Row | undefined;
  if (!row) throw new HttpError(404, 'Naudotojas nerastas');
  return toPublic(row);
}
export function logUser(db: Database.Database, actorId: number | null, user: { id: number; email: string }, action: string, details?: Record<string, unknown>) {
  db.prepare('INSERT INTO UserLog(actorId,userId,userEmail,action,detailsJson) VALUES(?,?,?,?,?)').run(actorId, user.id, user.email, action, details ? JSON.stringify(details) : null);
}
export function generatePassword(): string {
  return crypto.randomBytes(15).toString('base64url');
}
export function checkPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD) throw new HttpError(400, `Slaptažodį turi sudaryti bent ${MIN_PASSWORD} simbolių`);
  if (value.length > MAX_PASSWORD) throw new HttpError(400, 'Slaptažodis per ilgas');
  return value;
}
function checkName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 200) throw new HttpError(400, 'Nurodykite vardą (iki 200 simbolių)');
  return name;
}
function checkEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Nurodykite teisingą el. paštą');
  return email;
}
function checkRole(value: unknown): Role {
  if (!isRole(value)) throw new HttpError(400, 'Rolė: admin arba accountant');
  return value;
}
// Password field of a request: a given password, or `generate: true` for a random one.
async function passwordFrom(body: Record<string, unknown>): Promise<{ hash: string; generated: string | null }> {
  if (body.generatePassword === true) { const generated = generatePassword(); return { hash: await hashPassword(generated), generated }; }
  return { hash: await hashPassword(checkPassword(body.password)), generated: null };
}
function otherActiveAdmins(db: Database.Database, id: number): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM User WHERE role='admin' AND disabledAt IS NULL AND id<>?").get(id) as { n: number }).n;
}
function guardLastAdmin(db: Database.Database, user: { id: number; role: string; disabledAt: number | null }) {
  if (user.role === 'admin' && user.disabledAt == null && otherActiveAdmins(db, user.id) === 0) throw new HttpError(409, 'Negalima išjungti, pažeminti ar ištrinti paskutinio aktyvaus administratoriaus');
}
function rawUser(db: Database.Database, id: number) {
  const user = db.prepare('SELECT id,email,role,disabledAt FROM User WHERE id=?').get(id) as { id: number; email: string; role: string; disabledAt: number | null } | undefined;
  if (!user) throw new HttpError(404, 'Naudotojas nerastas');
  return user;
}

export async function createUser(db: Database.Database, actorId: number, body: Record<string, unknown>) {
  const email = checkEmail(body.email), name = checkName(body.name), role = checkRole(body.role);
  const { hash, generated } = await passwordFrom(body);
  const id = db.transaction(() => {
    if (db.prepare('SELECT id FROM User WHERE LOWER(email)=LOWER(?)').get(email)) throw new HttpError(409, 'Naudotojas su tokiu el. paštu jau egzistuoja');
    const created = Number(db.prepare("INSERT INTO User(email,name,passwordHash,role,createdAt) VALUES(?,?,?,?,datetime('now'))").run(email, name, hash, role).lastInsertRowid);
    logUser(db, actorId, { id: created, email }, 'CREATE', { name, role });
    db.prepare('DELETE FROM LoginAttempt WHERE email=?').run(email.toLowerCase());
    return created;
  }).immediate();
  return { user: getUser(db, id), password: generated };
}

// Changes name, role, enabled state and/or password. Disabling or resetting the password ends the user's sessions
// (except the administrator's own current session when they reset their own password).
export async function updateUser(db: Database.Database, actorId: number, id: number, body: Record<string, unknown>, currentToken = '') {
  const resetting = body.generatePassword === true || body.password !== undefined;
  const password = resetting ? await passwordFrom(body) : null;
  const name = body.name !== undefined ? checkName(body.name) : undefined;
  const role = body.role !== undefined ? checkRole(body.role) : undefined;
  if (body.disabled !== undefined && typeof body.disabled !== 'boolean') throw new HttpError(400, 'disabled: true arba false');
  const disabled = body.disabled as boolean | undefined;
  if (name === undefined && role === undefined && disabled === undefined && !password) throw new HttpError(400, 'Nėra pakeitimų');
  db.transaction(() => {
    const user = rawUser(db, id);
    if ((role !== undefined && role !== user.role && role !== 'admin') || (disabled === true && user.disabledAt == null)) guardLastAdmin(db, user);
    if (name !== undefined) db.prepare('UPDATE User SET name=? WHERE id=?').run(name, id);
    if (role !== undefined && role !== user.role) { db.prepare('UPDATE User SET role=? WHERE id=?').run(role, id); logUser(db, actorId, user, 'ROLE', { from: user.role, to: role }); }
    if (name !== undefined) logUser(db, actorId, user, 'RENAME', { name });
    if (disabled === true && user.disabledAt == null) {
      db.prepare('UPDATE User SET disabledAt=? WHERE id=?').run(Date.now(), id);
      revokeUserSessions(id);
      logUser(db, actorId, user, 'DISABLE');
    }
    if (disabled === false && user.disabledAt != null) {
      db.prepare('UPDATE User SET disabledAt=NULL WHERE id=?').run(id);
      logUser(db, actorId, user, 'ENABLE');
    }
    if (password) {
      db.prepare('UPDATE User SET passwordHash=? WHERE id=?').run(password.hash, id);
      db.prepare('DELETE FROM LoginAttempt WHERE email=?').run(user.email.toLowerCase());
      revokeUserSessions(id, id === actorId ? currentToken : '');
      logUser(db, actorId, user, 'PASSWORD_RESET', { generated: Boolean(password.generated) });
    }
  }).immediate();
  return { user: getUser(db, id), password: password?.generated ?? null };
}

// A user who left traces (audit rows, changes to other users) is disabled instead, so history keeps its author.
export function deleteUser(db: Database.Database, actorId: number, id: number): { deleted: boolean; user?: PublicUser } {
  return db.transaction(() => {
    const user = rawUser(db, id);
    guardLastAdmin(db, user);
    const referenced = db.prepare('SELECT 1 FROM AccountingAudit WHERE actorId=? LIMIT 1').get(id) || db.prepare('SELECT 1 FROM UserLog WHERE actorId=? AND userId<>? LIMIT 1').get(id, id);
    if (referenced) {
      if (user.disabledAt == null) {
        db.prepare('UPDATE User SET disabledAt=? WHERE id=?').run(Date.now(), id);
        logUser(db, actorId, user, 'DISABLE', { instead: 'DELETE' });
      }
      revokeUserSessions(id);
      return { deleted: false, user: getUser(db, id) };
    }
    revokeUserSessions(id);
    db.prepare('DELETE FROM User WHERE id=?').run(id);
    db.prepare('DELETE FROM LoginAttempt WHERE email=?').run(user.email.toLowerCase());
    logUser(db, actorId, user, 'DELETE');
    return { deleted: true };
  }).immediate();
}
