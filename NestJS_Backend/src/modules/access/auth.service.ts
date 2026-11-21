import { Inject, Injectable } from '@nestjs/common';
import type { AppRequest } from '../../common/http/app-request.js';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/env.module.js';
import { ApiKeyService } from '../api-keys/api-key.service.js';
import { isTrustedOrigin } from '../auth/origin-check.js';
import { ACCESS_COOKIE, readCookie } from '../auth/session-cookies.js';
import { SessionService } from '../auth/session.service.js';
import { AccessService } from './access.service.js';
import type { Principal } from './principal.js';

const BEARER = /^Bearer (\S+)$/;

/**
 * Turns request credentials into a Principal: a personal API key (Authorization:
 * Bearer) or the browser session cookie set by Okta SAML sign-in. An Authorization
 * header always wins; a bad one is never retried with the cookie.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly sessions: SessionService,
    private readonly access: AccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async authenticate(req: AppRequest): Promise<Principal | null> {
    if (req.headers.authorization !== undefined) {
      const match = BEARER.exec(req.headers.authorization);
      if (!match) return null;
      const key = await this.apiKeys.authenticate(match[1]);
      if (!key) return null;
      return this.access.loadPrincipal(key.userId, { method: 'api-key', apiKeyId: key.apiKeyId });
    }
    const accessToken = readCookie(req, ACCESS_COOKIE);
    if (!accessToken) return null;
    const session = await this.sessions.authenticate(accessToken);
    if (!session) return null;
    return this.access.loadPrincipal(session.userId, {
      method: 'session',
      sessionId: session.sessionId,
      accessExpiresAt: session.accessExpiresAt,
      sessionExpiresAt: session.sessionExpiresAt,
    });
  }

  /** Whether the request carried any credentials at all (for the audit reason). */
  presentedCredentials(req: AppRequest): boolean {
    return req.headers.authorization !== undefined || readCookie(req, ACCESS_COOKIE) !== undefined;
  }

  /** CSRF defence: cookie-authenticated state changes must come from our own origins. */
  isTrustedOrigin(req: AppRequest): boolean {
    return isTrustedOrigin(req, [...this.env.FRONTEND_ORIGINS, this.env.API_BASE_URL]);
  }
}
