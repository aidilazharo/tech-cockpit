import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { User } from '../identity/user.entity.js';

export const SESSION_REVOKE_REASONS = ['logout', 'idle', 'refresh-reuse', 'user-disabled'] as const;
export type SessionRevokeReason = (typeof SESSION_REVOKE_REASONS)[number];

/**
 * A browser sign-in (Okta SAML). Access tokens are short-lived JWTs that name this row,
 * so revoking it ends the session at once. Only the refresh token's hash is stored.
 */
export const AuthSessionSchema = defineEntity({
  name: 'AuthSession',
  tableName: 'auth_session',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    user: () => p.manyToOne(User).index(),
    refreshTokenHash: p.string().length(64).unique(),
    /** The hash before the latest rotation: reuse after the grace period revokes the session. */
    previousRefreshTokenHash: p.string().length(64).nullable().index(),
    refreshedAt: p.datetime().nullable(),
    /** Last activity; the idle timeout is measured from here. */
    lastSeenAt: p.datetime(),
    /** Absolute end of the session, fixed at sign-in. */
    expiresAt: p.datetime().index(),
    revokedAt: p.datetime().nullable(),
    revokeReason: p.enum(SESSION_REVOKE_REASONS).nullable(),
    ipAddress: p.string().length(64).nullable(),
    userAgent: p.string().length(500).nullable(),
  },
});

export class AuthSession extends AuthSessionSchema.class {}
AuthSessionSchema.setClass(AuthSession);

/**
 * Outstanding SAML AuthnRequest IDs. A response is accepted only if it answers one of
 * these, and each ID can be consumed once (replay protection).
 */
export const SamlRequestSchema = defineEntity({
  name: 'SamlRequest',
  tableName: 'saml_request',
  schema: WILDCARD_SCHEMA,
  properties: {
    requestId: p.string().length(100).primary(),
    issuedAt: p.datetime(),
    expiresAt: p.datetime().index(),
    consumedAt: p.datetime().nullable(),
    /** In-app path to open after sign-in (kept here, not in RelayState, so it cannot be altered) */
    returnTo: p.string().length(2048).default('/'),
  },
});

export class SamlRequest extends SamlRequestSchema.class {}
SamlRequestSchema.setClass(SamlRequest);
