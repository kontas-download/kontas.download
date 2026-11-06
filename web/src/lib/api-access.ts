import type Database from 'better-sqlite3';
import { HttpError } from './errors';
import { encryptSecret } from './company-mail';

// Access data of the state systems the program may file to, per company. The password is write-only: reads return `hasSecret` only.
export const API_PROVIDERS = ['VMI_EDS', 'SODRA_EDAS', 'RC', 'BANK'] as const;
export type ApiProvider = (typeof API_PROVIDERS)[number];
// Only these take a user name and a password. RC and BANK are placeholders: no way to connect yet.
export const CREDENTIAL_PROVIDERS: readonly ApiProvider[] = ['VMI_EDS', 'SODRA_EDAS'];
export const ENVIRONMENTS = ['TEST', 'PRODUCTION'] as const;
export type ApiEnvironment = (typeof ENVIRONMENTS)[number];
export type ConnectionStatus = 'NOT_CONNECTED' | 'CONFIGURED' | 'CONNECTED';

export interface PublicCredential { provider: ApiProvider; username: string; hasSecret: boolean; environment: ApiEnvironment; status: ConnectionStatus; lastCheckedAt: string | null; lastError: string | null; updatedAt: string | null }
type Row = { provider: ApiProvider; username: string; secretEncrypted: string; environment: ApiEnvironment; status: ConnectionStatus; lastCheckedAt: string | null; lastError: string | null; updatedAt: string };

export function parseProvider(value: unknown): ApiProvider {
  if (typeof value !== 'string' || !(CREDENTIAL_PROVIDERS as readonly string[]).includes(value)) throw new HttpError(400, 'Nežinomas prieigos tipas');
  return value as ApiProvider;
}

const publicRow = (provider: ApiProvider, row?: Row): PublicCredential => ({
  provider, username: row?.username || '', hasSecret: Boolean(row?.secretEncrypted), environment: row?.environment || 'TEST', status: row?.status || 'NOT_CONNECTED',
  lastCheckedAt: row?.lastCheckedAt ?? null, lastError: row?.lastError ?? null, updatedAt: row?.updatedAt ?? null,
});

export function listCredentials(db: Database.Database, companyId: number): PublicCredential[] {
  const rows = new Map((db.prepare('SELECT provider,username,secretEncrypted,environment,status,lastCheckedAt,lastError,updatedAt FROM CompanyApiCredential WHERE companyId=?').all(companyId) as Row[]).map(r => [r.provider, r]));
  return CREDENTIAL_PROVIDERS.map(p => publicRow(p, rows.get(p)));
}

// Status stored with the row: CONFIGURED once both the user name and the password exist. CONNECTED is set only by a provider after a real check.
export function saveCredential(db: Database.Database, companyId: number, providerInput: unknown, body: Record<string, unknown>): PublicCredential {
  const provider = parseProvider(providerInput);
  const { username, password, clearSecret, environment } = body;
  if (username !== undefined && (typeof username !== 'string' || username.length > 200)) throw new HttpError(400, 'Neteisingas vartotojo vardas');
  if (password !== undefined && password !== null && (typeof password !== 'string' || password.length > 500)) throw new HttpError(400, 'Neteisingas slaptažodis');
  if (environment !== undefined && !(ENVIRONMENTS as readonly unknown[]).includes(environment)) throw new HttpError(400, 'Neteisinga aplinka');
  const previous = db.prepare('SELECT username,secretEncrypted,environment FROM CompanyApiCredential WHERE companyId=? AND provider=?').get(companyId, provider) as Pick<Row, 'username' | 'secretEncrypted' | 'environment'> | undefined;
  const user = typeof username === 'string' ? username.trim() : previous?.username || '';
  const secret = clearSecret === true ? '' : typeof password === 'string' && password ? encryptSecret(password, companyId) : previous?.secretEncrypted || '';
  const env = (environment as ApiEnvironment | undefined) || previous?.environment || 'TEST';
  const status: ConnectionStatus = user && secret ? 'CONFIGURED' : 'NOT_CONNECTED';
  db.prepare(`INSERT INTO CompanyApiCredential(companyId,provider,username,secretEncrypted,environment,status,lastCheckedAt,lastError,updatedAt) VALUES(?,?,?,?,?,?,NULL,NULL,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    ON CONFLICT(companyId,provider) DO UPDATE SET username=excluded.username,secretEncrypted=excluded.secretEncrypted,environment=excluded.environment,status=excluded.status,lastCheckedAt=NULL,lastError=NULL,updatedAt=excluded.updatedAt`)
    .run(companyId, provider, user, secret, env, status);
  return listCredentials(db, companyId).find(c => c.provider === provider)!;
}

export function clearCredential(db: Database.Database, companyId: number, providerInput: unknown): PublicCredential {
  const provider = parseProvider(providerInput);
  db.prepare('DELETE FROM CompanyApiCredential WHERE companyId=? AND provider=?').run(companyId, provider);
  return publicRow(provider);
}

/** Status of a provider for a company; providers without credentials (RC, BANK) are never connected. */
export function connectionStatus(db: Database.Database, companyId: number, provider: ApiProvider): ConnectionStatus {
  const row = db.prepare('SELECT username,secretEncrypted,status FROM CompanyApiCredential WHERE companyId=? AND provider=?').get(companyId, provider) as Pick<Row, 'username' | 'secretEncrypted' | 'status'> | undefined;
  if (!row || !row.username || !row.secretEncrypted) return 'NOT_CONNECTED';
  return row.status === 'CONNECTED' ? 'CONNECTED' : 'CONFIGURED';
}

// ---------- installation-wide settings ----------

export const APP_BASE_URL_KEY = 'appBaseUrl';

export function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') throw new HttpError(400, 'Neteisingas programos adresas');
  const text = value.trim().replace(/\/+$/, '');
  if (!text) return '';
  let url: URL;
  try { url = new URL(text); } catch { throw new HttpError(400, 'Neteisingas programos adresas'); }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.search || url.hash || url.username || url.password) throw new HttpError(400, 'Neteisingas programos adresas');
  return (url.origin + url.pathname).replace(/\/+$/, '');
}

export function getStoredBaseUrl(db: Database.Database): string {
  return (db.prepare('SELECT value FROM AppSetting WHERE key=?').get(APP_BASE_URL_KEY) as { value: string } | undefined)?.value || '';
}

/** The public address of this installation: the saved setting first, then the APP_BASE_URL environment variable. No trailing slash. */
export function appBaseUrl(db: Database.Database): string {
  return (getStoredBaseUrl(db) || process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
}

export function saveBaseUrl(db: Database.Database, value: unknown): string {
  const url = normalizeBaseUrl(value);
  if (!url) db.prepare('DELETE FROM AppSetting WHERE key=?').run(APP_BASE_URL_KEY);
  else db.prepare("INSERT INTO AppSetting(key,value,updatedAt) VALUES(?,?,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt").run(APP_BASE_URL_KEY, url);
  return url;
}
