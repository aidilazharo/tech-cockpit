import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiKey } from '../../src/modules/api-keys/api-key.entity.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let owner: Actor;
let other: Actor;
let securityAdmin: Actor;

beforeAll(async () => {
  t = await createTestApp();
  const keyRole = await createRole(t.orm, ['apikey:own:manage']);
  owner = await createActor(t.orm, [{ code: keyRole }], { label: 'owner' });
  other = await createActor(t.orm, [{ code: keyRole }], { label: 'other' });
  securityAdmin = await createActor(t.orm, [{ code: await createRole(t.orm, ['apikey:any:revoke']) }], { label: 'secadmin' });
});

afterAll(async () => {
  await t.close();
});

describe('personal API keys', () => {
  it('lists own keys without ever returning secrets or hashes', async () => {
    const res = await t.http().get('/api/v1/me/api-keys').set(owner.auth).expect(200);
    expect(res.body.items).toHaveLength(1);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('secretHash');
    expect(body).not.toContain(owner.token);
    // The secret is the token's last 43 characters (base64url, so it may itself hold an underscore).
    expect(body).not.toContain(owner.token.slice(-43));
    expect(res.body.items[0].keyPrefix).toMatch(/^tck_[A-Za-z0-9_-]{6}$/);
    expect(res.body.items[0]).toMatchObject({ name: 'e2e', revokedAt: null });
  });

  it('refuses to create keys when authenticated with an API key', async () => {
    const res = await t.http().post('/api/v1/me/api-keys').set(owner.auth).send({ name: 'CLI', expiresInDays: 30 }).expect(403);
    expect(res.body.detail).toMatch(/API key/);
  });

  it('records when a key was last used', async () => {
    const em = t.orm.em.fork();
    const key = await em.findOneOrFail(ApiKey, { user: owner.id });
    expect(key.lastUsedAt).not.toBeNull();
  });

  it('revokes an own key, which stops it working immediately', async () => {
    const extra = await createActor(t.orm, [{ code: await createRole(t.orm, ['apikey:own:manage']) }]);
    const list = await t.http().get('/api/v1/me/api-keys').set(extra.auth).expect(200);
    const revoked = await t.http().post(`/api/v1/me/api-keys/${list.body.items[0].id}/revoke`).set(extra.auth).expect(200);
    expect(revoked.body.revokedAt).not.toBeNull();
    await t.http().get('/api/v1/me').set(extra.auth).expect(401);
  });

  it('cannot revoke someone else\'s key through the personal endpoint (404, no leak)', async () => {
    const list = await t.http().get('/api/v1/me/api-keys').set(other.auth).expect(200);
    await t.http().post(`/api/v1/me/api-keys/${list.body.items[0].id}/revoke`).set(owner.auth).expect(404);
  });

  it('lets a security admin revoke any key', async () => {
    const victim = await createActor(t.orm, [{ code: await createRole(t.orm, ['apikey:own:manage']) }]);
    const em = t.orm.em.fork();
    const key = await em.findOneOrFail(ApiKey, { user: victim.id });
    await t.http().post(`/api/v1/api-keys/${key.id}/revoke`).set(owner.auth).expect(403);
    await t.http().post(`/api/v1/api-keys/${key.id}/revoke`).set(securityAdmin.auth).expect(200);
    await t.http().get('/api/v1/me').set(victim.auth).expect(401);
    await t.http().post(`/api/v1/api-keys/${randomUUID()}/revoke`).set(securityAdmin.auth).expect(404);
  });

  it('rejects an expired key', async () => {
    const expiring = await createActor(t.orm, []);
    const em = t.orm.em.fork();
    const key = await em.findOneOrFail(ApiKey, { user: expiring.id });
    key.expiresAt = new Date(Date.now() - 1000);
    await em.flush();
    await t.http().get('/api/v1/me').set(expiring.auth).expect(401);
  });

  it('rejects a key whose secret has been tampered with', async () => {
    const tampered = owner.token.slice(0, -1) + (owner.token.endsWith('A') ? 'B' : 'A');
    await t.http().get('/api/v1/me').set('Authorization', `Bearer ${tampered}`).expect(401);
  });
});
