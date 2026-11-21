import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

// tck_<16-char key id>_<43-char secret>; both base64url. Fixed lengths make parsing
// unambiguous even though base64url contains "_".
const TOKEN = /^tck_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/;

export interface GeneratedApiKey {
  /** Shown to the user once; never stored. */
  token: string;
  keyId: string;
  secretHash: string;
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function generateApiKey(): GeneratedApiKey {
  const keyId = randomBytes(12).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  return { token: `tck_${keyId}_${secret}`, keyId, secretHash: hashSecret(secret) };
}

export function parseApiKey(token: string): { keyId: string; secret: string } | null {
  const match = TOKEN.exec(token);
  return match ? { keyId: match[1], secret: match[2] } : null;
}

/** Constant-time comparison of a presented secret with the stored hash. */
export function secretMatches(secret: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashSecret(secret), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
