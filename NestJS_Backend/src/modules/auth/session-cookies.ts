import { parseCookie } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';
import type { SessionTokens } from './session.service.js';

export const ACCESS_COOKIE = 'tc_access';
export const REFRESH_COOKIE = 'tc_refresh';
export const SAML_REQUEST_COOKIE = 'tc_saml_request';
export const REFUSED_COOKIE = 'tc_refused';
const REFUSED_TTL_MS = 10 * 60 * 1000;

const ACCESS_PATH = '/api';
const REFRESH_PATH = '/api/v1/auth';
const SAML_PATH = '/api/v1/auth/saml';

// Secure is always set: browsers accept Secure cookies from http://localhost, so dev and
// production behave the same. httpOnly keeps tokens away from page scripts.
const base: CookieOptions = { httpOnly: true, secure: true };

export function readCookie(req: Request, name: string): string | undefined {
  return req.headers.cookie ? parseCookie(req.headers.cookie)[name] : undefined;
}

export function setSessionCookies(res: Response, tokens: SessionTokens, now = new Date()): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    sameSite: 'lax',
    path: ACCESS_PATH,
    maxAge: tokens.accessExpiresAt.getTime() - now.getTime(),
  });
  if (tokens.refreshToken) {
    // Strict: only ever sent by the app itself, never on a cross-site navigation.
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      ...base,
      sameSite: 'strict',
      path: REFRESH_PATH,
      maxAge: tokens.sessionExpiresAt.getTime() - now.getTime(),
    });
  }
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base, sameSite: 'lax', path: ACCESS_PATH });
  res.clearCookie(REFRESH_COOKIE, { ...base, sameSite: 'strict', path: REFRESH_PATH });
}

/**
 * Binds a sign-in to the browser that started it. SameSite=None because Okta returns
 * the user with a cross-site POST; without this, an attacker could make a victim's
 * browser complete the attacker's own sign-in (login CSRF).
 */
export function setSamlRequestCookie(res: Response, requestId: string, maxAgeMs: number): void {
  res.cookie(SAML_REQUEST_COOKIE, requestId, { ...base, sameSite: 'none', path: SAML_PATH, maxAge: maxAgeMs });
}

export function clearSamlRequestCookie(res: Response): void {
  res.clearCookie(SAML_REQUEST_COOKIE, { ...base, sameSite: 'none', path: SAML_PATH });
}

/** The Okta username of a refused sign-in, so the sign-in page can show it (the person's own, short-lived). */
export function setRefusedCookie(res: Response, username: string): void {
  res.cookie(REFUSED_COOKIE, username, { ...base, sameSite: 'lax', path: REFRESH_PATH, maxAge: REFUSED_TTL_MS });
}
