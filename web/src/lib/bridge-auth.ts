import crypto from 'node:crypto';

// Shared secret of the Worker -> container internal calls (INTERNAL_BRIDGE_KEY). Fails closed when the key is not configured.
export function bridgeAuthorized(request: Request): boolean {
  const expected = process.env.INTERNAL_BRIDGE_KEY || '';
  const given = request.headers.get('x-d1-bridge-key') || '';
  return Boolean(expected) && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
