import { parseSetCookie, type SetCookie } from 'cookie';
import type { Response } from 'supertest';
import { samlResponse } from './test-idp.js';
import type { TestApp } from './app.js';

export const APP_ORIGIN = 'http://localhost:5173';

/** Cookies set by a response, by name. */
export function setCookies(res: Response): Record<string, SetCookie> {
  const headers = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return Object.fromEntries(
    headers.map((header) => {
      const cookie = parseSetCookie(header);
      return [cookie.name, cookie];
    }),
  );
}

export function cookieHeader(cookies: Record<string, string | undefined>): string {
  return Object.entries(cookies)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/** GET /auth/saml/login; returns the request ID bound to the "browser". */
export async function startSignIn(t: TestApp, returnTo?: string) {
  const res = await t
    .http()
    .get('/api/v1/auth/saml/login')
    .query(returnTo === undefined ? {} : { returnTo })
    .expect(303);
  return { res, requestId: setCookies(res).tc_saml_request?.value ?? '', location: res.headers.location as string };
}

export function postAcs(t: TestApp, body: Record<string, string>, requestId?: string) {
  const req = t.http().post('/api/v1/auth/saml/acs').type('form').send(body);
  return requestId ? req.set('Cookie', cookieHeader({ tc_saml_request: requestId })) : req;
}

export interface BrowserSession {
  access: string;
  refresh: string;
  cookie: string;
}

/** Full SP-initiated sign-in through the test IdP as a user who has been added; returns the session cookies. */
export async function signInAs(
  t: TestApp,
  username: string,
  attributes: Record<string, string> = { firstName: 'Test', lastName: 'User' },
): Promise<BrowserSession> {
  const { requestId } = await startSignIn(t);
  const res = await postAcs(t, { SAMLResponse: samlResponse({ inResponseTo: requestId, nameId: username, attributes }) }, requestId).expect(303);
  const cookies = setCookies(res);
  const access = cookies.tc_access?.value;
  const refresh = cookies.tc_refresh?.value;
  if (!access || !refresh) {
    throw new Error(`Sign-in failed: redirected to ${res.headers.location as string}`);
  }
  return { access, refresh, cookie: cookieHeader({ tc_access: access }) };
}
