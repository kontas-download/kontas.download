import pkg from '../../package.json';

// Checks the public release feed (https://kontas.download/latest.json) for a newer version.
// Only a plain GET of a static file: nothing about this installation is sent.
// UPDATE_CHECK=off disables it; UPDATE_FEED_URL points it at another feed (own mirror, tests).

export type UpdateStatus = {
  current: string;
  latest: string | null;
  available: boolean;
  downloadUrl: string | null;
  notesUrl: string | null;
  checkedAt: string | null;
  disabled: boolean;
  error: string | null;
};

const CACHE_MS = 12 * 60 * 60 * 1000;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
let cache: { at: number; status: UpdateStatus } | null = null;

export const currentVersion = (): string => pkg.version;

/** Compares two x.y.z versions: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

const feedUrl = () => (process.env.UPDATE_FEED_URL ?? 'https://kontas.download/latest.json').trim();
const isDisabled = () => ['off', '0', 'false', 'no'].includes((process.env.UPDATE_CHECK || '').toLowerCase()) || !feedUrl();
const httpsUrl = (value: unknown, base: string): string | null => {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? url.href : null;
  } catch { return null; }
};

const base = (): UpdateStatus => ({ current: currentVersion(), latest: null, available: false, downloadUrl: null, notesUrl: null, checkedAt: null, disabled: false, error: null });

export async function checkForUpdate({ force = false } = {}): Promise<UpdateStatus> {
  if (isDisabled()) return { ...base(), disabled: true };
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.status;
  const status = base();
  const feed = feedUrl();
  try {
    const res = await fetch(feed, { cache: 'no-store', signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Record<string, unknown>;
    const latest = typeof data.version === 'string' ? data.version.trim() : '';
    if (!VERSION_RE.test(latest)) throw new Error('invalid feed');
    status.latest = latest;
    status.available = compareVersions(latest, status.current) > 0;
    status.downloadUrl = httpsUrl(data.url, feed);
    status.notesUrl = httpsUrl(data.notes, feed);
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
  }
  status.checkedAt = new Date().toISOString();
  cache = { at: Date.now(), status };
  return status;
}

/** Test hook. */
export function resetUpdateCache() { cache = null; }
