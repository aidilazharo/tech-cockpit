import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { generateRefreshToken, hashRefreshToken, signAccessToken, verifyAccessToken } from './session-tokens.js';

const SECRET = 'a-test-signing-secret-of-at-least-32-chars';
const claims = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-21T10:00:00Z');
const inFifteenMinutes = new Date(now.getTime() + 15 * 60_000);

describe('access tokens', () => {
  it('round-trips the user and session', async () => {
    const token = await signAccessToken(SECRET, claims, now, inFifteenMinutes);

    expect(await verifyAccessToken(SECRET, token, now)).toEqual({ ...claims, expiresAt: inFifteenMinutes });
  });

  it('accepts an expired but genuine token only when asked to (sign-out)', async () => {
    const token = await signAccessToken(SECRET, claims, now, inFifteenMinutes);
    const later = new Date(inFifteenMinutes.getTime() + 60_000);

    expect(await verifyAccessToken(SECRET, token, later, { allowExpired: true })).toEqual({ ...claims, expiresAt: inFifteenMinutes });
  });

  it('never accepts a forged token, even when expired tokens are allowed', async () => {
    const token = await signAccessToken('another-signing-secret-of-32-characters!', claims, now, inFifteenMinutes);
    const later = new Date(inFifteenMinutes.getTime() + 60_000);

    expect(await verifyAccessToken(SECRET, token, later, { allowExpired: true })).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signAccessToken(SECRET, claims, now, inFifteenMinutes);

    expect(await verifyAccessToken(SECRET, token, new Date(inFifteenMinutes.getTime() + 1000))).toBeNull();
  });

  it('rejects a token signed with another key', async () => {
    const token = await signAccessToken('another-signing-secret-of-32-characters!', claims, now, inFifteenMinutes);

    expect(await verifyAccessToken(SECRET, token, now)).toBeNull();
  });

  it('rejects a tampered token', async () => {
    const token = await signAccessToken(SECRET, claims, now, inFifteenMinutes);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...claims, sub: randomUUID() })).toString('base64url');

    expect(await verifyAccessToken(SECRET, `${header}.${forged}.${signature}`, now)).toBeNull();
  });

  it('rejects the "none" algorithm', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: claims.userId, sid: claims.sessionId, iss: 'techcockpit', aud: 'techcockpit-web', exp: 4102444800 }),
    ).toString('base64url');

    expect(await verifyAccessToken(SECRET, `${header}.${payload}.`, now)).toBeNull();
  });

  it('rejects a token for another audience or issuer', async () => {
    const key = new TextEncoder().encode(SECRET);
    const sign = (issuer: string, audience: string) =>
      new SignJWT({ sid: claims.sessionId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(claims.userId)
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt(now)
        .setExpirationTime(inFifteenMinutes)
        .sign(key);

    expect(await verifyAccessToken(SECRET, await sign('techcockpit', 'another-app'), now)).toBeNull();
    expect(await verifyAccessToken(SECRET, await sign('someone-else', 'techcockpit-web'), now)).toBeNull();
    const later = new Date(inFifteenMinutes.getTime() + 60_000);
    expect(await verifyAccessToken(SECRET, await sign('techcockpit', 'another-app'), later, { allowExpired: true })).toBeNull();
  });

  it('rejects claims that are not UUIDs', async () => {
    const token = await signAccessToken(SECRET, { userId: 'admin', sessionId: claims.sessionId }, now, inFifteenMinutes);

    expect(await verifyAccessToken(SECRET, token, now)).toBeNull();
  });

  it.each(['', 'garbage', 'a.b.c'])('rejects the malformed token %j', async (token) => {
    expect(await verifyAccessToken(SECRET, token, now)).toBeNull();
  });
});

describe('refresh tokens', () => {
  it('are random, URL-safe and stored only as a hash', () => {
    const first = generateRefreshToken();
    const second = generateRefreshToken();

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(hashRefreshToken(first.token));
    expect(first.hash).not.toContain(first.token);
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
