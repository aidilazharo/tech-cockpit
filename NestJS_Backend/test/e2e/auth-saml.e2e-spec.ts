import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { AuthSession, SamlRequest } from '../../src/modules/auth/auth.entities.js';
import { SamlRequestStore } from '../../src/modules/auth/saml-request.store.js';
import { SamlService } from '../../src/modules/auth/saml.service.js';
import { SignInService } from '../../src/modules/auth/sign-in.service.js';
import { RefusedSignIn } from '../../src/modules/identity/refused-sign-in.entity.js';
import { User } from '../../src/modules/identity/user.entity.js';
import { createTestApp, type TestApp } from './support/app.js';
import { createActor } from './support/actors.js';
import { postAcs, setCookies, signInAs, startSignIn } from './support/sessions.js';
import {
  ACS_URL,
  attackerKeys,
  decodeAuthnRequest,
  samlResponse,
  SP_ENTITY_ID,
  TEST_IDP_SSO_URL,
  testIdpMetadata,
} from './support/test-idp.js';

const SIGN_IN_PAGE = 'http://localhost:5173/signin';
const newEmail = (label = 'okta') => `${label}-${randomUUID().slice(0, 8)}@test.aia.com`;

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ idpMetadata: testIdpMetadata() });
});

afterAll(async () => {
  await t.close();
});

beforeEach(() => {
  t.idp.isConfigured = true;
  t.idp.metadata = testIdpMetadata();
});

async function auditFor(action: string, filter: Record<string, unknown> = {}) {
  return t.orm.em.fork().find(AuditLog, { action, ...filter }, { orderBy: { occurredAt: 'desc' } });
}

describe('GET /api/v1/auth/saml/login', () => {
  it('redirects to Okta with a signed-in-browser binding cookie', async () => {
    const { res, requestId, location } = await startSignIn(t, '/trm/landscape');

    expect(location.startsWith(`${TEST_IDP_SSO_URL}?SAMLRequest=`)).toBe(true);
    expect(new URL(location).searchParams.has('RelayState')).toBe(false);
    const request = decodeAuthnRequest(location);
    expect(request).toContain(`ID="${requestId}"`);
    expect(request).toContain(`AssertionConsumerServiceURL="${ACS_URL}"`);
    expect(request).toContain(`>${SP_ENTITY_ID}</saml:Issuer>`);
    expect(request).toContain('nameid-format:emailAddress');

    const binding = setCookies(res).tc_saml_request;
    expect(binding).toMatchObject({ httpOnly: true, secure: true, sameSite: 'none', path: '/api/v1/auth/saml' });
    const stored = await t.orm.em.fork().findOneOrFail(SamlRequest, { requestId });
    expect(stored.returnTo).toBe('/trm/landscape');
  });

  it('never stores an off-site returnTo (open redirect)', async () => {
    const { requestId } = await startSignIn(t, '//evil.example.com/phish');

    expect((await t.orm.em.fork().findOneOrFail(SamlRequest, { requestId })).returnTo).toBe('/');
  });

  it('sends the user to the sign-in page when SSO is not configured', async () => {
    t.idp.isConfigured = false;

    const res = await t.http().get('/api/v1/auth/saml/login').expect(303);

    expect(res.headers.location).toBe(`${SIGN_IN_PAGE}?error=sso_unavailable`);
  });

  it('sends the user to the sign-in page when Okta metadata cannot be loaded', async () => {
    t.idp.metadata = null;

    const res = await t.http().get('/api/v1/auth/saml/login').expect(303);

    expect(res.headers.location).toBe(`${SIGN_IN_PAGE}?error=sso_unavailable`);
  });
});

describe('POST /api/v1/auth/saml/acs: successful sign-in', () => {
  it('signs in someone an administrator added, by Okta username in any case, and returns to the page', async () => {
    const actor = await createActor(t.orm, [], { label: 'added' });
    const oktaEmail = newEmail('okta-mail');
    const { requestId } = await startSignIn(t, '/approvals?tab=mine');
    const body = {
      SAMLResponse: samlResponse({
        inResponseTo: requestId,
        nameId: actor.username.toUpperCase(),
        attributes: { email: oktaEmail, firstName: 'Okta', lastName: 'Name', userType: 'Vendor' },
      }),
    };

    const res = await postAcs(t, body, requestId).expect(303);

    expect(res.headers.location).toBe('http://localhost:5173/approvals?tab=mine');
    const cookies = setCookies(res);
    expect(cookies.tc_access).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api' });
    expect(cookies.tc_refresh).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth' });
    expect(cookies.tc_saml_request?.value).toBe('');

    // Okta's email replaces the typed one; names and the vendor flag stay TechCockpit's.
    const user = await t.orm.em.fork().findOneOrFail(User, { id: actor.id });
    expect(user).toMatchObject({ email: oktaEmail, emailFromOkta: true, firstName: 'added', lastName: 'User', isExternal: false, status: 'active' });
    expect(user.lastLoginAt).toBeInstanceOf(Date);
    const [updated] = await auditFor('user.updated', { resourceId: actor.id });
    expect(updated).toMatchObject({ changes: { before: { email: actor.email, emailFromOkta: false }, after: { email: oktaEmail, emailFromOkta: true } }, metadata: { source: 'okta' } });

    const me = await t.http().get('/api/v1/me').set('Cookie', `tc_access=${cookies.tc_access!.value}`).expect(200);
    expect(me.body).toMatchObject({ user: { username: actor.username, email: oktaEmail }, roles: [], permissions: [], authMethod: 'session' });
    expect(Date.parse(me.body.session.accessExpiresAt)).toBeGreaterThan(Date.now());
    const [login] = await auditFor('auth.login', { actorUserId: actor.id });
    expect(login).toMatchObject({ authMethod: 'session', metadata: { method: 'saml', firstSignIn: true, vendor: false } });
    expect(login.sessionId).toBeTruthy();
    expect(await auditFor('user.created', { resourceId: actor.id })).toHaveLength(0);
  });

  it('keeps the stored email when Okta sends none, and applies existing roles to the session', async () => {
    const actor = await createActor(t.orm, [{ code: 'arb-member' }], { label: 'existing' });

    const session = await signInAs(t, actor.username, {});

    expect(await t.orm.em.fork().findOneOrFail(User, { id: actor.id })).toMatchObject({ email: actor.email, emailFromOkta: false, firstName: 'existing' });
    expect(await auditFor('user.updated', { resourceId: actor.id })).toHaveLength(0);
    const me = await t.http().get('/api/v1/me').set('Cookie', session.cookie).expect(200);
    expect(me.body.roles).toEqual(['arb-member']);
  });

  it('refuses someone nobody has added, lists them for administrators and tells them their username', async () => {
    const username = `new.person-${randomUUID().slice(0, 8)}@test.aia.com`;
    const attempt = async () => {
      const { requestId } = await startSignIn(t);
      return postAcs(t, { SAMLResponse: samlResponse({ inResponseTo: requestId, nameId: username.toUpperCase(), attributes: { email: username, firstName: 'New', lastName: 'Person' } }) }, requestId).expect(303);
    };

    const res = await attempt();

    expect(res.headers.location).toBe(`${SIGN_IN_PAGE}?error=not_registered`);
    const cookies = setCookies(res);
    expect(cookies.tc_access).toBeUndefined();
    expect(cookies.tc_refused).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/auth' });
    const told = await t.http().get('/api/v1/auth/refused-username').set('Cookie', `tc_refused=${cookies.tc_refused!.value}`).expect(200);
    expect(told.body).toEqual({ username });
    expect((await t.http().get('/api/v1/auth/refused-username').expect(200)).body).toEqual({ username: null });

    expect(await t.orm.em.fork().count(User, { username })).toBe(0);
    expect(await t.orm.em.fork().findOneOrFail(RefusedSignIn, { username })).toMatchObject({ email: username, firstName: 'New', lastName: 'Person', attempts: 1 });
    await attempt();
    expect((await t.orm.em.fork().findOneOrFail(RefusedSignIn, { username })).attempts).toBe(2);
    const [failure] = await auditFor('auth.login.failed', { metadata: { username } });
    expect(failure.metadata).toEqual({ method: 'saml', reason: 'not registered', username });
  });

  it('restarts an IdP-initiated sign-in (Okta dashboard) as SP-initiated', async () => {
    const body = { SAMLResponse: samlResponse({ inResponseTo: null, nameId: newEmail() }), RelayState: '/trm' };

    const res = await postAcs(t, body).expect(303);

    expect(res.headers.location).toBe('http://localhost:3000/api/v1/auth/saml/login?returnTo=%2Ftrm');
    expect(setCookies(res).tc_access).toBeUndefined();
  });

  it('ignores an unsafe RelayState on an IdP-initiated sign-in', async () => {
    const body = { SAMLResponse: samlResponse({ inResponseTo: null }), RelayState: 'https://evil.example.com' };

    const res = await postAcs(t, body).expect(303);

    expect(res.headers.location).toBe('http://localhost:3000/api/v1/auth/saml/login?returnTo=%2F');
  });
});

describe('POST /api/v1/auth/saml/acs: refused responses', () => {
  async function expectRefused(
    build: (requestId: string) => string,
    options: { cookie?: (requestId: string) => string | undefined; error?: string; reason: string },
  ) {
    const { requestId } = await startSignIn(t);
    const before = await t.orm.em.fork().count(AuthSession, {});

    const res = await postAcs(t, { SAMLResponse: build(requestId) }, options.cookie ? options.cookie(requestId) : requestId).expect(303);

    expect(res.headers.location).toBe(`${SIGN_IN_PAGE}?error=${options.error ?? 'sign_in_failed'}`);
    expect(setCookies(res).tc_access).toBeUndefined();
    expect(await t.orm.em.fork().count(AuthSession, {})).toBe(before);
    const [failure] = await auditFor('auth.login.failed');
    expect(failure.metadata).toEqual({ method: 'saml', reason: options.reason });
  }

  it('refuses a response signed by someone other than Okta', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, signingKey: attackerKeys.privateKey }), { reason: 'invalid-response' }));

  it('refuses an unsigned response', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, signResponse: false, signAssertion: false }), { reason: 'invalid-response' }));

  it('refuses a response whose outer envelope is not signed', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, signResponse: false }), { reason: 'invalid-response' }));

  it('refuses a response whose assertion is not signed', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, signAssertion: false }), { reason: 'invalid-response' }));

  it('refuses an assertion altered after signing', () =>
    expectRefused(
      (id) => samlResponse({ inResponseTo: id, nameId: 'victim@test.aia.com', afterSigning: (xml) => xml.replace('victim@', 'attacker@') }),
      { reason: 'invalid-response' },
    ));

  it('refuses a second, injected assertion (signature wrapping)', () =>
    expectRefused(
      (id) =>
        samlResponse({
          inResponseTo: id,
          afterSigning: (xml) => {
            const assertion = /<saml2:Assertion[\s\S]*<\/saml2:Assertion>/.exec(xml)![0];
            return xml.replace('</saml2p:Response>', `${assertion.replace('someone@', 'attacker@')}</saml2p:Response>`);
          },
        }),
      { reason: 'invalid-response' },
    ));

  it('refuses a response from another identity provider', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, issuer: 'http://www.okta.com/someone-else' }), { reason: 'invalid-response' }));

  it('refuses an assertion meant for another application (audience)', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, audience: 'https://other-app.example.com' }), { reason: 'invalid-response' }));

  it('refuses an expired assertion', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, issuedAt: new Date(Date.now() - 10 * 60_000) }), { reason: 'invalid-response' }));

  it('refuses a response addressed to another service (Destination)', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, destination: 'https://other-app.example.com/acs' }), { reason: 'invalid-response' }));

  it('refuses a signed response without a Destination', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, destination: null }), { reason: 'invalid-response' }));

  it('refuses an assertion for another recipient', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, recipient: 'https://other-app.example.com/acs' }), { reason: 'invalid-response' }));

  it('refuses a response that is not SAML at all', () =>
    expectRefused(() => Buffer.from('<html/>').toString('base64'), { reason: 'invalid-response' }));

  it('refuses a sign-in that was not started in this browser (login CSRF)', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id }), { cookie: () => undefined, error: 'sign_in_expired', reason: 'request-mismatch' }));

  it('refuses a response to a different sign-in than the one this browser started', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id }), { cookie: () => '_another-request', error: 'sign_in_expired', reason: 'request-mismatch' }));

  it('refuses a response to a request TechCockpit never sent', () =>
    expectRefused(() => samlResponse({ inResponseTo: '_forged-request' }), { cookie: () => '_forged-request', reason: 'invalid-response' }));

  it('refuses a NameID that is not an Okta username', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, nameId: 'two words' }), { reason: 'invalid-identity' }));

  it('refuses to replay a response that was already used', async () => {
    const { requestId } = await startSignIn(t);
    const body = { SAMLResponse: samlResponse({ inResponseTo: requestId, nameId: newEmail('replay') }) };
    await postAcs(t, body, requestId).expect(303);

    const replay = await postAcs(t, body, requestId).expect(303);

    expect(replay.headers.location).toBe(`${SIGN_IN_PAGE}?error=sign_in_failed`);
    expect(setCookies(replay).tc_access).toBeUndefined();
  });

  it('refuses a signed response that carries no assertion (NoPassive)', () =>
    expectRefused((id) => samlResponse({ inResponseTo: id, noPassive: true }), { reason: 'invalid-response' }));

  it('lets only one of two simultaneous uses of the same response through', async () => {
    // Both requests can pass the outstanding-request check before either consumes it;
    // the atomic consume is the final gate. Simulate losing that race.
    const store = t.app.get(SamlRequestStore);
    const consume = vi.spyOn(store, 'consume').mockResolvedValueOnce(null);

    await expectRefused((id) => samlResponse({ inResponseTo: id }), { reason: 'replayed' });
    consume.mockRestore();
  });

  it('refuses a response to a sign-in request that has expired', async () => {
    const { requestId } = await startSignIn(t);
    await t.orm.em.fork().nativeUpdate(SamlRequest, { requestId }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await postAcs(t, { SAMLResponse: samlResponse({ inResponseTo: requestId }) }, requestId).expect(303);

    expect(res.headers.location).toBe(`${SIGN_IN_PAGE}?error=sign_in_failed`);
  });

  it('refuses a disabled user and records who tried', async () => {
    const actor = await createActor(t.orm, [{ code: 'system-admin' }], { status: 'disabled', label: 'disabled' });
    const { requestId } = await startSignIn(t);

    const res = await postAcs(t, { SAMLResponse: samlResponse({ inResponseTo: requestId, nameId: actor.email }) }, requestId).expect(303);

    expect(res.headers.location).toBe(`${SIGN_IN_PAGE}?error=account_disabled`);
    expect(setCookies(res).tc_access).toBeUndefined();
    const [failure] = await auditFor('auth.login.failed', { actorUserId: actor.id });
    expect(failure.metadata).toEqual({ method: 'saml', reason: 'account disabled' });
  });

  it('answers 500, without a session, when something unexpected fails at any stage of sign-in', async () => {
    const saml = t.app.get(SamlService);
    const signIn = t.app.get(SignInService);
    const boom = new Error('unexpected');

    const start = vi.spyOn(saml, 'startLogin').mockRejectedValueOnce(boom);
    await t.http().get('/api/v1/auth/saml/login').expect(500);
    start.mockRestore();

    const { requestId } = await startSignIn(t);
    const complete = vi.spyOn(saml, 'completeLogin').mockRejectedValueOnce(boom);
    await postAcs(t, { SAMLResponse: samlResponse({ inResponseTo: requestId }) }, requestId).expect(500);
    complete.mockRestore();

    const actor = await createActor(t.orm, [], { label: 'boom' });
    const second = await startSignIn(t);
    const finish = vi.spyOn(signIn, 'signIn').mockRejectedValueOnce(boom);
    const res = await postAcs(t, { SAMLResponse: samlResponse({ inResponseTo: second.requestId, nameId: actor.username }) }, second.requestId).expect(500);
    expect(setCookies(res).tc_access).toBeUndefined();
    finish.mockRestore();
  });

  it('reports SSO as unavailable when Okta metadata cannot be loaded at the ACS', async () => {
    const { requestId } = await startSignIn(t);
    t.idp.metadata = null;

    const res = await postAcs(t, { SAMLResponse: samlResponse({ inResponseTo: requestId }) }, requestId).expect(303);

    expect(res.headers.location).toBe(`${SIGN_IN_PAGE}?error=sso_unavailable`);
  });

  it.each([
    ['no SAMLResponse', {}],
    ['an unexpected field', { SAMLResponse: 'abc', extra: 'x' }],
  ])('rejects a form with %s', async (_label, body) => {
    await t.http().post('/api/v1/auth/saml/acs').type('form').send(body).expect(400);
  });
});

describe('GET /api/v1/auth/saml/metadata', () => {
  it('publishes the SP metadata Okta administrators need', async () => {
    const res = await t.http().get('/api/v1/auth/saml/metadata').expect(200);

    expect(res.headers['content-type']).toContain('application/samlmetadata+xml');
    expect(res.text).toContain(`entityID="${SP_ENTITY_ID}"`);
    expect(res.text).toContain(`Location="${ACS_URL}"`);
    expect(res.text).toContain('WantAssertionsSigned="true"');
  });
});
