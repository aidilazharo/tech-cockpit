import { createHash, randomBytes } from 'node:crypto';
import { errors, type JWTPayload, jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';

const ISSUER = 'techcockpit';
const AUDIENCE = 'techcockpit-web';
const ALGORITHM = 'HS256';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export interface VerifiedAccess extends AccessClaims {
  expiresAt: Date;
}

// Re-checked here because an expired token (allowExpired) skips jose's claim checks.
const ClaimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  iss: z.literal(ISSUER),
  aud: z.literal(AUDIENCE),
  exp: z.number(),
});

const keyFor = (secret: string) => new TextEncoder().encode(secret);

/** Short-lived access token (JWT, HS256) carried in an httpOnly cookie. */
export function signAccessToken(secret: string, claims: AccessClaims, issuedAt: Date, expiresAt: Date): Promise<string> {
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(keyFor(secret));
}

/**
 * The claims of a valid token, or null for anything expired, forged or malformed.
 * `allowExpired` accepts a correctly signed but expired token (used only for sign-out).
 */
export async function verifyAccessToken(
  secret: string,
  token: string,
  now = new Date(),
  options: { allowExpired?: boolean } = {},
): Promise<VerifiedAccess | null> {
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keyFor(secret), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience: AUDIENCE,
      currentDate: now,
    }));
  } catch (error) {
    // jose checks the signature before the claims, so JWTExpired means the signature is valid.
    if (!(options.allowExpired && error instanceof errors.JWTExpired)) {
      return null;
    }
    payload = error.payload;
  }
  const claims = ClaimsSchema.safeParse(payload);
  return claims.success
    ? { userId: claims.data.sub, sessionId: claims.data.sid, expiresAt: new Date(claims.data.exp * 1000) }
    : null;
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Opaque refresh token; only its SHA-256 hash is stored. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}
