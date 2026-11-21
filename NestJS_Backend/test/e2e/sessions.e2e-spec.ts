import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { AuthMaintenanceService } from '../../src/modules/auth/auth-maintenance.service.js';
import { AuthSession, SamlRequest } from '../../src/modules/auth/auth.entities.js';
import { signAccessToken } from '../../src/modules/auth/session-tokens.js';
import { REFRESH_REUSE_GRACE_MS } from '../../src/modules/auth/session.service.js';
import { RefusedSignIn } from '../../src/modules/identity/refused-sign-in.entity.js';
import { User } from '../../src/modules/identity/user.entity.js';
import { createActor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { APP_ORIGIN, type BrowserSession, cookieHeader, setCookies, signInAs } from './support/sessions.js';
import { testIdpMetadata } from './support/test-idp.js';

/** A user an administrator added (only they can sign in); returns their Okta username. */
const newUser = async (label = 'session') => (await createActor(t.orm, [], { label })).username;
const MINUTE = 60_000;

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ idpMetadata: testIdpMetadata() });
});

afterAll(async () => {
  await t.close();
});

const me = (cookie: string) => t.http().get('/api/v1/me').set('Cookie', cookie);
const refresh = (session: Pick<BrowserSession, 'refresh'>, origin: string | null = APP_ORIGIN) => {
  const req = t.http().post('/api/v1/auth/refresh').set('Cookie', cookieHeader({ tc_refresh: session.refresh }));
  return origin ? req.set('Origin', origin) : req;
};

async function sessionRow(access: string) {
  const sid = JSON.parse(Buffer.from(access.split('.')[1], 'base64url').toString()).sid as string;
  return t.orm.em.fork().findOneOrFail(AuthSession, { id: sid });
}

async function ageSession(access: string, changes: Partial<Pick<AuthSession, 'lastSeenAt' | 'expiresAt' | 'refreshedAt'>>) {
  const row = await sessionRow(access);
  await t.orm.em.fork().nativeUpdate(AuthSession, { id: row.id }, changes);
  return row.id;
}

describe('session cookie authentication', () => {
  it('lets a signed-in browser call the API and shows the session limits', async () => {
    const session = await signInAs(t, await newUser());

    const res = await me(session.cookie).expect(200);

    const accessExpiresAt = Date.parse(res.body.session.accessExpiresAt);
    const expiresAt = Date.parse(res.body.session.expiresAt);
    expect(accessExpiresAt - Date.now()).toBeGreaterThan(14 * MINUTE);
    expect(accessExpiresAt - Date.now()).toBeLessThanOrEqual(15 * MINUTE);
    expect(expiresAt - Date.now()).toBeGreaterThan(239 * MINUTE);
  });

  it('records the session on every audited request', async () => {
    const session = await signInAs(t, await newUser());
    const row = await sessionRow(session.access);

    await me(session.cookie).expect(200);

    const [entry] = await t.orm.em.fork().find(AuditLog, { action: 'http.request', sessionId: row.id });
    expect(entry).toMatchObject({ authMethod: 'session', actorUserId: row.user.id });
  });

  it('refuses a forged access token', async () => {
    const forged = await signAccessToken('not-the-server-secret-but-32-chars-long', { userId: randomUUID(), sessionId: randomUUID() }, new Date(), new Date(Date.now() + MINUTE));

    await me(`tc_access=${forged}`).expect(401);
  });

  it('refuses a genuine token for a session that does not exist', async () => {
    const token = await signAccessToken(t.env.SESSION_JWT_SECRET, { userId: randomUUID(), sessionId: randomUUID() }, new Date(), new Date(Date.now() + MINUTE));

    await me(`tc_access=${token}`).expect(401);
  });

  it('never falls back to the cookie when an Authorization header is wrong', async () => {
    const session = await signInAs(t, await newUser());

    await me(session.cookie).set('Authorization', 'Bearer tck_wrong').expect(401);
  });

  it('ends the session after the idle timeout', async () => {
    const session = await signInAs(t, await newUser());
    await ageSession(session.access, { lastSeenAt: new Date(Date.now() - 31 * MINUTE) });

    await me(session.cookie).expect(401);
    const res = await refresh(session).expect(401);

    expect(setCookies(res).tc_access?.value).toBe('');
    expect((await sessionRow(session.access)).revokeReason).toBe('idle');
  });

  it('keeps an active session alive (activity is recorded at most once a minute)', async () => {
    const session = await signInAs(t, await newUser());
    const twoMinutesAgo = new Date(Date.now() - 2 * MINUTE);
    await ageSession(session.access, { lastSeenAt: twoMinutesAgo });

    await me(session.cookie).expect(200);

    expect((await sessionRow(session.access)).lastSeenAt.getTime()).toBeGreaterThan(twoMinutesAgo.getTime());
  });

  it('ends the session at the absolute timeout, even when active', async () => {
    const session = await signInAs(t, await newUser());
    await ageSession(session.access, { expiresAt: new Date(Date.now() - 1000) });

    await me(session.cookie).expect(401);
    await refresh(session).expect(401);
  });

  it('locks out a user who is disabled while signed in', async () => {
    const username = await newUser('disabled-later');
    const session = await signInAs(t, username);
    await t.orm.em.fork().nativeUpdate(User, { username }, { status: 'disabled' });

    await me(session.cookie).expect(401);
    await refresh(session).expect(401);
    expect((await sessionRow(session.access)).revokeReason).toBe('user-disabled');
  });
});

describe('CSRF protection for cookie sessions', () => {
  it('refuses a state-changing request from another site', async () => {
    const actor = await createActor(t.orm, [{ code: 'system-admin' }]);
    const session = await signInAs(t, actor.email);

    await t.http().post('/api/v1/me/api-keys').set('Cookie', session.cookie).set('Origin', 'https://evil.example.com').send({ name: 'x', expiresInDays: 1 }).expect(403);
    await t.http().post('/api/v1/me/api-keys').set('Cookie', session.cookie).send({ name: 'x', expiresInDays: 1 }).expect(403);

    const denied = await t.orm.em.fork().find(AuditLog, { action: 'access.denied', actorUserId: actor.id });
    expect(denied.map((entry) => entry.metadata)).toContainEqual({ reason: 'untrusted origin' });
  });

  it('accepts the same request from the TechCockpit web app (and API keys can now be created)', async () => {
    const actor = await createActor(t.orm, [{ code: 'system-admin' }]);
    const session = await signInAs(t, actor.email);

    const res = await t
      .http()
      .post('/api/v1/me/api-keys')
      .set('Cookie', session.cookie)
      .set('Origin', APP_ORIGIN)
      .send({ name: 'cli', expiresInDays: 30 })
      .expect(201);

    expect(res.body.token).toMatch(/^tck_/);
  });

  it('does not apply to API keys (no cookies, no Origin)', async () => {
    const actor = await createActor(t.orm, [{ code: 'system-admin' }]);

    await t.http().post('/api/v1/roles').set(actor.auth).send({ code: 'x', name: 'x', permissions: [], dataAccess: {} }).expect((res) => {
      expect(res.status).not.toBe(403);
    });
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates the refresh token and issues a new access token', async () => {
    const session = await signInAs(t, await newUser());

    const res = await refresh(session).expect(200);

    const cookies = setCookies(res);
    expect(cookies.tc_access?.value).toBeTruthy();
    expect(cookies.tc_refresh?.value).toBeTruthy();
    expect(cookies.tc_refresh?.value).not.toBe(session.refresh);
    expect(Date.parse(res.body.accessExpiresAt)).toBeGreaterThan(Date.now());
    await me(`tc_access=${cookies.tc_access!.value}`).expect(200);
    await refresh({ refresh: cookies.tc_refresh!.value! }).expect(200);
  });

  it('tolerates a concurrent request with the just-rotated token (grace period) without a new refresh cookie', async () => {
    const session = await signInAs(t, await newUser());
    await refresh(session).expect(200);

    const res = await refresh(session).expect(200);

    expect(setCookies(res).tc_access?.value).toBeTruthy();
    expect(setCookies(res).tc_refresh).toBeUndefined();
  });

  it('revokes the whole session when a rotated-out token is reused later (theft)', async () => {
    const session = await signInAs(t, await newUser());
    const rotated = setCookies(await refresh(session).expect(200));
    await ageSession(session.access, { refreshedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1000) });

    await refresh(session).expect(401);

    expect((await sessionRow(session.access)).revokeReason).toBe('refresh-reuse');
    // The legitimate holder is signed out too: the attacker's copy is worthless.
    await refresh({ refresh: rotated.tc_refresh!.value! }).expect(401);
    await me(`tc_access=${rotated.tc_access!.value}`).expect(401);
    const [audit] = await t.orm.em.fork().find(AuditLog, { action: 'auth.refresh.failed' }, { orderBy: { occurredAt: 'desc' } });
    expect(audit.metadata).toEqual({ reason: 'revoked' });
  });

  it('refuses without a refresh cookie', async () => {
    await t.http().post('/api/v1/auth/refresh').set('Origin', APP_ORIGIN).expect(401);
  });

  it('refuses an unknown refresh token and clears the cookies', async () => {
    const res = await refresh({ refresh: 'not-a-real-token' }).expect(401);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(setCookies(res).tc_refresh?.value).toBe('');
  });

  it('refuses a cross-site refresh', async () => {
    const session = await signInAs(t, await newUser());

    await refresh(session, 'https://evil.example.com').expect(403);
    await refresh(session, null).expect(403);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('ends the session and clears the cookies', async () => {
    const session = await signInAs(t, await newUser());

    const res = await t
      .http()
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader({ tc_access: session.access, tc_refresh: session.refresh }))
      .set('Origin', APP_ORIGIN)
      .expect(204);

    expect(setCookies(res).tc_access?.value).toBe('');
    expect(setCookies(res).tc_refresh?.value).toBe('');
    await me(session.cookie).expect(401);
    await refresh(session).expect(401);
    const row = await sessionRow(session.access);
    expect(row.revokeReason).toBe('logout');
    const [audit] = await t.orm.em.fork().find(AuditLog, { action: 'auth.logout', sessionId: row.id });
    expect(audit.actorUserId).toBe(row.user.id);
  });

  it('works with only the refresh cookie (access token already gone)', async () => {
    const session = await signInAs(t, await newUser());

    await t.http().post('/api/v1/auth/logout').set('Cookie', cookieHeader({ tc_refresh: session.refresh })).set('Origin', APP_ORIGIN).expect(204);

    expect((await sessionRow(session.access)).revokeReason).toBe('logout');
  });

  it('works with an expired access token', async () => {
    const session = await signInAs(t, await newUser());
    const row = await sessionRow(session.access);
    const expired = await signAccessToken(t.env.SESSION_JWT_SECRET, { userId: row.user.id, sessionId: row.id }, new Date(Date.now() - 20 * MINUTE), new Date(Date.now() - 5 * MINUTE));

    await t.http().post('/api/v1/auth/logout').set('Cookie', `tc_access=${expired}`).set('Origin', APP_ORIGIN).expect(204);

    expect((await sessionRow(session.access)).revokeReason).toBe('logout');
  });

  it('succeeds quietly when there is no session', async () => {
    await t.http().post('/api/v1/auth/logout').set('Origin', APP_ORIGIN).expect(204);
  });

  it('refuses a cross-site sign-out', async () => {
    const session = await signInAs(t, await newUser());

    await t.http().post('/api/v1/auth/logout').set('Cookie', session.cookie).set('Origin', 'https://evil.example.com').expect(403);

    expect((await sessionRow(session.access)).revokedAt).toBeNull();
  });
});

describe('housekeeping', () => {
  it('removes sessions that ended over 30 days ago, stale SAML requests and refused sign-ins over 90 days old, and keeps the rest', async () => {
    const old = await signInAs(t, await newUser('old'));
    const recent = await signInAs(t, await newUser('recent'));
    const oldId = await ageSession(old.access, { expiresAt: new Date(Date.now() - 31 * 24 * 60 * MINUTE) });
    const em = t.orm.em.fork();
    em.create(SamlRequest, { requestId: `_stale-${randomUUID()}`, issuedAt: new Date(0), expiresAt: new Date(Date.now() - 2 * 24 * 60 * MINUTE) });
    const DAY = 24 * 60 * MINUTE;
    const refused = (days: number) => em.create(RefusedSignIn, { username: `refused-${randomUUID()}`, firstAttemptAt: new Date(Date.now() - days * DAY), lastAttemptAt: new Date(Date.now() - days * DAY) });
    const expired = refused(91);
    const kept = refused(89);
    await em.flush();

    const removed = await t.app.get(AuthMaintenanceService).run();

    expect(removed.sessions).toBeGreaterThanOrEqual(1);
    expect(removed.requests).toBeGreaterThanOrEqual(1);
    expect(await t.orm.em.fork().findOne(AuthSession, { id: oldId })).toBeNull();
    expect(await sessionRow(recent.access)).toBeTruthy();
    expect(removed.refusedSignIns).toBeGreaterThanOrEqual(1);
    expect(await t.orm.em.fork().findOne(RefusedSignIn, { id: expired.id })).toBeNull();
    expect(await t.orm.em.fork().findOne(RefusedSignIn, { id: kept.id })).toBeTruthy();
    expect(await t.app.get(AuthMaintenanceService).run()).toEqual({ sessions: 0, requests: 0, refusedSignIns: 0 });
  });
});
