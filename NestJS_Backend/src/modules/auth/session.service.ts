import { EntityManager } from '@mikro-orm/postgresql';
import { Inject, Injectable } from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/env.module.js';
import { User } from '../identity/user.entity.js';
import { AuthSession, type SessionRevokeReason } from './auth.entities.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken, verifyAccessToken } from './session-tokens.js';

const MINUTE_MS = 60_000;
// Writing lastSeenAt on every request would be a write per call; once a minute is enough.
const LAST_SEEN_RESOLUTION_MS = MINUTE_MS;
// Concurrent requests may present the refresh token that was rotated a moment ago.
export const REFRESH_REUSE_GRACE_MS = 30_000;

export interface SessionTokens {
  sessionId: string;
  userId: string;
  accessToken: string;
  accessExpiresAt: Date;
  /** Absent when the caller must keep its current refresh cookie (grace-period refresh). */
  refreshToken?: string;
  sessionExpiresAt: Date;
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  accessExpiresAt: Date;
  sessionExpiresAt: Date;
}

export type RefreshResult =
  | { outcome: 'refreshed'; tokens: SessionTokens }
  | { outcome: 'rejected'; reason: 'unknown token' | 'revoked' | 'expired' | 'idle' | 'user disabled' | 'reused'; sessionId?: string; userId?: string };

export interface ClientInfo {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Browser sessions: issue, check, refresh (with rotation) and revoke. */
@Injectable()
export class SessionService {
  constructor(
    private readonly em: EntityManager,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private get idleMs(): number {
    return this.env.SESSION_IDLE_TIMEOUT_MINUTES * MINUTE_MS;
  }

  private async accessTokenFor(session: { id: string; userId: string; expiresAt: Date }, now: Date) {
    const accessExpiresAt = new Date(
      Math.min(now.getTime() + this.env.SESSION_ACCESS_TTL_MINUTES * MINUTE_MS, session.expiresAt.getTime()),
    );
    const accessToken = await signAccessToken(
      this.env.SESSION_JWT_SECRET,
      { userId: session.userId, sessionId: session.id },
      now,
      accessExpiresAt,
    );
    return { accessToken, accessExpiresAt };
  }

  /** Starts a session for a user who has just signed in. */
  async start(userId: string, client: ClientInfo, now = new Date()): Promise<SessionTokens> {
    const em = this.em.fork();
    const refresh = generateRefreshToken();
    const session = em.create(AuthSession, {
      user: em.getReference(User, userId),
      refreshTokenHash: refresh.hash,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + this.env.SESSION_ABSOLUTE_TIMEOUT_MINUTES * MINUTE_MS),
      ipAddress: client.ipAddress?.slice(0, 64) || null,
      userAgent: client.userAgent?.slice(0, 500) || null,
      createdBy: userId,
      updatedBy: userId,
    });
    await em.flush();
    const access = await this.accessTokenFor({ id: session.id, userId, expiresAt: session.expiresAt }, now);
    return { sessionId: session.id, userId, ...access, refreshToken: refresh.token, sessionExpiresAt: session.expiresAt };
  }

  /** Resolves an access token to its live session, or null (expired, idle, revoked or forged). */
  async authenticate(accessToken: string, now = new Date()): Promise<ActiveSession | null> {
    const claims = await verifyAccessToken(this.env.SESSION_JWT_SECRET, accessToken, now);
    if (!claims) return null;
    const em = this.em.fork();
    const session = await em.findOne(AuthSession, { id: claims.sessionId, user: claims.userId, revokedAt: null });
    if (!session || session.expiresAt <= now || now.getTime() - session.lastSeenAt.getTime() > this.idleMs) {
      return null;
    }
    if (now.getTime() - session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
      await em.nativeUpdate(AuthSession, { id: session.id }, { lastSeenAt: now });
    }
    return { sessionId: session.id, userId: claims.userId, accessExpiresAt: claims.expiresAt, sessionExpiresAt: session.expiresAt };
  }

  /**
   * Exchanges a refresh token for a new access token and a new refresh token (rotation).
   * Presenting a rotated-out token after the grace period means it was stolen: the
   * whole session is revoked.
   */
  async refresh(refreshToken: string, now = new Date()): Promise<RefreshResult> {
    const em = this.em.fork();
    const hash = hashRefreshToken(refreshToken);
    const session = await em.findOne(
      AuthSession,
      { $or: [{ refreshTokenHash: hash }, { previousRefreshTokenHash: hash }] },
      { populate: ['user'] },
    );
    if (!session) {
      return { outcome: 'rejected', reason: 'unknown token' };
    }
    const ids = { sessionId: session.id, userId: session.user.id };
    if (session.revokedAt) {
      return { outcome: 'rejected', reason: 'revoked', ...ids };
    }
    if (session.expiresAt <= now) {
      return { outcome: 'rejected', reason: 'expired', ...ids };
    }
    if (now.getTime() - session.lastSeenAt.getTime() > this.idleMs) {
      await this.revoke(session.id, 'idle', now);
      return { outcome: 'rejected', reason: 'idle', ...ids };
    }
    if (session.user.status !== 'active') {
      await this.revoke(session.id, 'user-disabled', now);
      return { outcome: 'rejected', reason: 'user disabled', ...ids };
    }

    const current = { id: session.id, userId: session.user.id, expiresAt: session.expiresAt };
    if (session.refreshTokenHash === hash) {
      const next = generateRefreshToken();
      // Conditional update: of two concurrent refreshes with the same token, one rotates.
      const rotated = await em.nativeUpdate(
        AuthSession,
        { id: session.id, refreshTokenHash: hash, revokedAt: null },
        { refreshTokenHash: next.hash, previousRefreshTokenHash: hash, refreshedAt: now, lastSeenAt: now, updatedBy: session.user.id },
      );
      if (rotated === 1) {
        return {
          outcome: 'refreshed',
          tokens: { sessionId: session.id, userId: session.user.id, ...(await this.accessTokenFor(current, now)), refreshToken: next.token, sessionExpiresAt: session.expiresAt },
        };
      }
      // Lost the race: the token is now the previous one, still inside the grace period.
      return this.graceRefresh(current, now);
    }

    // Found by the previous token, so the session was rotated: refreshedAt is set.
    const rotatedAt = session.refreshedAt!.getTime();
    if (now.getTime() - rotatedAt <= REFRESH_REUSE_GRACE_MS) {
      return this.graceRefresh(current, now);
    }
    await this.revoke(session.id, 'refresh-reuse', now);
    return { outcome: 'rejected', reason: 'reused', ...ids };
  }

  private async graceRefresh(session: { id: string; userId: string; expiresAt: Date }, now: Date): Promise<RefreshResult> {
    return {
      outcome: 'refreshed',
      tokens: { sessionId: session.id, userId: session.userId, ...(await this.accessTokenFor(session, now)), sessionExpiresAt: session.expiresAt },
    };
  }

  /** The session an access or refresh token belongs to (even an expired access token), for sign-out. */
  async identify(tokens: { accessToken?: string; refreshToken?: string }): Promise<{ sessionId: string; userId: string } | null> {
    if (tokens.accessToken) {
      // Sign-out must also work after the access token expired.
      const claims = await verifyAccessToken(this.env.SESSION_JWT_SECRET, tokens.accessToken, new Date(), { allowExpired: true });
      if (claims) return { sessionId: claims.sessionId, userId: claims.userId };
    }
    if (tokens.refreshToken) {
      const session = await this.em.fork().findOne(AuthSession, { refreshTokenHash: hashRefreshToken(tokens.refreshToken) });
      if (session) return { sessionId: session.id, userId: session.user.id };
    }
    return null;
  }

  /** Ends a session immediately. Returns false if it was already ended. */
  async revoke(sessionId: string, reason: SessionRevokeReason, now = new Date()): Promise<boolean> {
    const updated = await this.em
      .fork()
      .nativeUpdate(AuthSession, { id: sessionId, revokedAt: null }, { revokedAt: now, revokeReason: reason });
    return updated === 1;
  }

  /** Removes sessions that ended more than `retentionDays` ago. */
  async purgeEnded(retentionDays: number, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * MINUTE_MS);
    return this.em.fork().nativeDelete(AuthSession, { $or: [{ expiresAt: { $lt: cutoff } }, { revokedAt: { $lt: cutoff } }] });
  }
}

