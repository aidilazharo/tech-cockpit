import { describe, expect, it } from 'vitest';
import { generateApiKey, hashSecret, parseApiKey, secretMatches } from './api-key.crypto.js';

describe('API key crypto', () => {
  it('generates tck_<keyId>_<secret> tokens with a 256-bit secret', () => {
    const key = generateApiKey();
    expect(key.token).toMatch(/^tck_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}$/);
    const parsed = parseApiKey(key.token)!;
    expect(parsed.keyId).toBe(key.keyId);
    expect(Buffer.from(parsed.secret, 'base64url')).toHaveLength(32);
  });

  it('never stores the secret, only its SHA-256 hash', () => {
    const key = generateApiKey();
    expect(key.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(key.secretHash).toBe(hashSecret(parseApiKey(key.token)!.secret));
    expect(key.secretHash).not.toContain(parseApiKey(key.token)!.secret);
  });

  it('produces different keys every time', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.token).not.toBe(b.token);
    expect(a.keyId).not.toBe(b.keyId);
  });

  it('parses keys whose id and secret contain _ and - (base64url)', () => {
    const keyId = 'ab_cd-ef_gh-ij_k'; // 16 chars
    const secret = `${'_-'.repeat(21)}Z`; // 43 chars
    expect(parseApiKey(`tck_${keyId}_${secret}`)).toEqual({ keyId, secret });
  });

  it.each(['', 'tck_short_secret', 'Bearer tck_x', `abc_${'a'.repeat(16)}_${'b'.repeat(43)}`, `tck_${'a'.repeat(16)}_${'b'.repeat(44)}`, `tck_${'a'.repeat(16)}_${'b'.repeat(42)}!`])(
    'rejects the malformed token %j',
    (token) => {
      expect(parseApiKey(token)).toBeNull();
    },
  );

  it('matches the right secret and rejects a wrong one', () => {
    const key = generateApiKey();
    const { secret } = parseApiKey(key.token)!;
    expect(secretMatches(secret, key.secretHash)).toBe(true);
    expect(secretMatches(secret.replace(/.$/, secret.endsWith('A') ? 'B' : 'A'), key.secretHash)).toBe(false);
  });

  it('rejects a malformed stored hash instead of throwing', () => {
    expect(secretMatches('x', 'not-hex')).toBe(false);
  });
});
