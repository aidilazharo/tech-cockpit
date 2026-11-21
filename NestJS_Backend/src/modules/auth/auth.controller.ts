import { Controller, ForbiddenException, Get, Header, HttpCode, Inject, Post, Redirect, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiConsumes, ApiNoContentResponse, ApiOkResponse, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import type { AppRequest } from '../../common/http/app-request.js';
import { ZodBody, ZodQuery, ZodResponse } from '../../common/zod/index.js';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/env.module.js';
import { Public } from '../access/decorators.js';
import { AuditService } from '../audit/audit.service.js';
import { SsoUnavailableError } from './idp-metadata.service.js';
import { isTrustedOrigin } from './origin-check.js';
import { appUrl, safeReturnTo } from './return-to.js';
import { SAML_REQUEST_TTL_MS } from './saml-request.store.js';
import { SamlLoginError, SamlService } from './saml.service.js';
import {
  ACCESS_COOKIE,
  clearSamlRequestCookie,
  clearSessionCookies,
  readCookie,
  REFRESH_COOKIE,
  REFUSED_COOKIE,
  SAML_REQUEST_COOKIE,
  setRefusedCookie,
  setSamlRequestCookie,
  setSessionCookies,
} from './session-cookies.js';
import { SessionService } from './session.service.js';
import { AccountDisabledError, NotRegisteredError, SignInService } from './sign-in.service.js';

const LoginQuerySchema = z.object({
  returnTo: z.string().max(4096).optional().describe('In-app path to open after signing in, e.g. /trm'),
});

// Okta posts exactly these two form fields.
const AcsBodySchema = z
  .object({
    SAMLResponse: z.string().min(1).max(500_000),
    RelayState: z.string().max(4096).optional(),
  })
  .strict()
  .meta({ id: 'SamlAcsForm' });

const SessionInfoSchema = z
  .object({
    accessExpiresAt: z.date().describe('When the access token expires; refresh before then'),
    expiresAt: z.date().describe('Absolute end of the session; sign in again after this'),
  })
  .meta({ id: 'SessionInfo' });

/** Error codes the sign-in page understands. Details stay in the audit log. */
type SignInPageError = 'sso_unavailable' | 'sign_in_failed' | 'sign_in_expired' | 'account_disabled' | 'not_registered';
const RefusedUsernameSchema = z.object({ username: z.string().nullable() }).meta({ id: 'RefusedUsername' });

type RedirectTo = { url: string; statusCode: number };

const see = (url: string): RedirectTo => ({ url, statusCode: 303 });

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly saml: SamlService,
    private readonly signIn: SignInService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  private get trustedOrigins(): string[] {
    return [...this.env.FRONTEND_ORIGINS, this.env.API_BASE_URL];
  }

  private signInPage(error: SignInPageError): RedirectTo {
    return see(appUrl(this.env.APP_BASE_URL, `/signin?error=${error}`));
  }

  private async refuseCrossSite(req: AppRequest): Promise<void> {
    if (!isTrustedOrigin(req, this.trustedOrigins)) {
      await this.audit.recordSecurityEvent('access.denied', req, 403, { reason: 'untrusted origin' });
      throw new ForbiddenException('Cross-site request refused.');
    }
  }

  @Get('saml/login')
  @Public('Starts browser sign-in, so there is no session yet')
  @Redirect()
  @ApiResponse({ status: 303, description: 'To Okta, or to the sign-in page when single sign-on is unavailable' })
  async login(@ZodQuery(LoginQuerySchema) query: z.infer<typeof LoginQuerySchema>, @Res({ passthrough: true }) res: Response) {
    if (!this.saml.isConfigured) {
      return this.signInPage('sso_unavailable');
    }
    try {
      const { redirectUrl, requestId } = await this.saml.startLogin(safeReturnTo(query.returnTo));
      setSamlRequestCookie(res, requestId, SAML_REQUEST_TTL_MS);
      return see(redirectUrl);
    } catch (error) {
      if (error instanceof SsoUnavailableError) return this.signInPage('sso_unavailable');
      throw error;
    }
  }

  @Post('saml/acs')
  @Public('Okta posts the signed SAML response here; it is fully validated before a session exists')
  @Redirect()
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiResponse({ status: 303, description: 'Into the app when signed in, otherwise to the sign-in page with an error code' })
  async acs(
    @ZodBody(AcsBodySchema) body: z.infer<typeof AcsBodySchema>,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RedirectTo> {
    const boundRequestId = readCookie(req, SAML_REQUEST_COOKIE);
    clearSamlRequestCookie(res);

    let result;
    try {
      result = await this.saml.completeLogin(body.SAMLResponse, boundRequestId);
    } catch (error) {
      if (error instanceof SamlLoginError && error.reason === 'unsolicited') {
        // Okta dashboard tile: restart as an SP-initiated sign-in (seamless, Okta has a session).
        const returnTo = encodeURIComponent(safeReturnTo(body.RelayState));
        return see(`${this.env.API_BASE_URL}/api/v1/auth/saml/login?returnTo=${returnTo}`);
      }
      if (error instanceof SamlLoginError) {
        this.saml.logFailure(error);
        await this.audit.recordSecurityEvent('auth.login.failed', req, 303, { method: 'saml', reason: error.reason });
        return this.signInPage(error.reason === 'request-mismatch' ? 'sign_in_expired' : 'sign_in_failed');
      }
      if (error instanceof SsoUnavailableError) {
        await this.audit.recordSecurityEvent('auth.login.failed', req, 303, { method: 'saml', reason: 'sso unavailable' });
        return this.signInPage('sso_unavailable');
      }
      throw error;
    }

    try {
      const { user, tokens, firstSignIn } = await this.signIn.signIn(result.identity, {
        ipAddress: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      });
      setSessionCookies(res, tokens);
      await this.audit.recordSecurityEvent(
        'auth.login',
        req,
        303,
        { method: 'saml', firstSignIn, vendor: user.isExternal },
        { userId: user.id, sessionId: tokens.sessionId },
      );
      return see(appUrl(this.env.APP_BASE_URL, result.returnTo));
    } catch (error) {
      if (error instanceof AccountDisabledError) {
        await this.audit.recordSecurityEvent('auth.login.failed', req, 303, { method: 'saml', reason: 'account disabled' }, { userId: error.userId });
        return this.signInPage('account_disabled');
      }
      if (error instanceof NotRegisteredError) {
        await this.audit.recordSecurityEvent('auth.login.failed', req, 303, { method: 'saml', reason: 'not registered', username: error.username });
        setRefusedCookie(res, error.username);
        return this.signInPage('not_registered');
      }
      throw error;
    }
  }

  @Get('refused-username')
  @Public('Shows a refused person the Okta username they signed in with; it reads only their own short-lived cookie')
  @ZodResponse({ status: 200, schema: RefusedUsernameSchema, description: 'The Okta username of the last refused sign-in in this browser, or null' })
  refusedUsername(@Req() req: AppRequest) {
    return { username: readCookie(req, REFUSED_COOKIE) ?? null };
  }

  @Get('saml/metadata')
  @Public('SAML service provider metadata is public by design (entity ID, ACS URL; no secrets)')
  @Header('content-type', 'application/samlmetadata+xml')
  @ApiProduces('application/samlmetadata+xml')
  @ApiOkResponse({ description: 'SP metadata for the Okta administrators' })
  metadata(): string {
    return this.saml.serviceProviderMetadata();
  }

  @Post('refresh')
  @Public('Renews the access token with the refresh cookie, so the access token may have expired')
  @HttpCode(200)
  @ZodResponse({ status: 200, schema: SessionInfoSchema, description: 'New session cookies were set' })
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    await this.refuseCrossSite(req);
    const token = readCookie(req, REFRESH_COOKIE);
    if (!token) {
      throw new UnauthorizedException('You are not signed in.');
    }
    const result = await this.sessions.refresh(token);
    if (result.outcome === 'rejected') {
      clearSessionCookies(res);
      await this.audit.recordSecurityEvent(
        'auth.refresh.failed',
        req,
        401,
        { reason: result.reason },
        result.userId ? { userId: result.userId, sessionId: result.sessionId } : undefined,
      );
      throw new UnauthorizedException('Your session has ended. Please sign in again.');
    }
    setSessionCookies(res, result.tokens);
    return { accessExpiresAt: result.tokens.accessExpiresAt, expiresAt: result.tokens.sessionExpiresAt };
  }

  @Post('logout')
  @Public('Signing out must work even after the access token has expired')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Signed out of TechCockpit (the Okta session is not ended)' })
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.refuseCrossSite(req);
    const session = await this.sessions.identify({
      accessToken: readCookie(req, ACCESS_COOKIE),
      refreshToken: readCookie(req, REFRESH_COOKIE),
    });
    clearSessionCookies(res);
    if (session && (await this.sessions.revoke(session.sessionId, 'logout'))) {
      await this.audit.recordSecurityEvent('auth.logout', req, 204, undefined, session);
    }
  }
}
