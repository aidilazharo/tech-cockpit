import { SAD_SECTION_KEYS, sadRead } from '../../src/modules/sad/domain/sections.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { RefusedSignIn } from '../../src/modules/identity/refused-sign-in.entity.js';
import { User } from '../../src/modules/identity/user.entity.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let admin: Actor;
let roleManager: Actor;
let userManager: Actor;
let reader: Actor;
let nobody: Actor;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'admin' });
  roleManager = await createActor(
    t.orm,
    [{ code: await createRole(t.orm, ['access:role:read', 'access:role:manage', 'audit:log:read']) }],
    { label: 'rolemgr' },
  );
  userManager = await createActor(
    t.orm,
    [
      {
        code: await createRole(t.orm, [
          'access:user:read',
          'access:user:manage',
          'access:assignment:read',
          'access:assignment:manage',
          // Holds the base permissions of approver roles, so it may assign them (anti-escalation).
          'approvals:task:act',
          'approvals:instance:read',
          'approvals:delegation:manage',
          'apikey:own:manage',
          'system:api-docs:read',
          'trm:application:read',
          'trm:roadmap:read',
          'trm:source-fields:read',
          'people:directory:read',
          // ARB members view every SAD section.
          ...SAD_SECTION_KEYS.map(sadRead),
        ], { personal: 'scope' }),
      },
    ],
    { label: 'usermgr' },
  );
  reader = await createActor(t.orm, [{ code: await createRole(t.orm, ['access:role:read', 'access:user:read']) }], { label: 'reader' });
  nobody = await createActor(t.orm, [], { label: 'nobody' });
});

afterAll(async () => {
  await t.close();
});

describe('GET /api/v1/me', () => {
  it('returns the caller, roles and effective permissions', async () => {
    const res = await t.http().get('/api/v1/me').set(reader.auth).expect(200);
    expect(res.body.user).toMatchObject({ username: reader.username, email: reader.email });
    expect(res.body.permissions).toEqual(['access:role:read', 'access:user:read']);
    expect(res.body.authMethod).toBe('api-key');
  });

  it('gives a system admin every permission', async () => {
    const res = await t.http().get('/api/v1/me').set(admin.auth).expect(200);
    expect(res.body.isSystemAdmin).toBe(true);
    expect(res.body.permissions).toContain('audit:log:read');
  });

  it('rejects a disabled user even with a valid key (P6)', async () => {
    const disabled = await createActor(t.orm, [{ code: 'system-admin' }], { status: 'disabled' });
    await t.http().get('/api/v1/me').set(disabled.auth).expect(401);
  });

  it('ignores expired role assignments (P5)', async () => {
    const expired = await createActor(t.orm, [
      { code: 'system-admin', validFrom: new Date(Date.now() - 7200_000), validTo: new Date(Date.now() - 3600_000) },
    ]);
    const res = await t.http().get('/api/v1/me').set(expired.auth).expect(200);
    expect(res.body.isSystemAdmin).toBe(false);
    expect(res.body.permissions).toEqual([]);
  });

  it('ignores role assignments that have not started yet', async () => {
    const future = await createActor(t.orm, [{ code: 'system-admin', validFrom: new Date(Date.now() + 3600_000) }]);
    const res = await t.http().get('/api/v1/me').set(future.auth).expect(200);
    expect(res.body.isSystemAdmin).toBe(false);
  });
});

describe('permissions catalogue', () => {
  it('lists every permission with a description', async () => {
    const res = await t.http().get('/api/v1/permissions').set(reader.auth).expect(200);
    expect(res.body.items).toContainEqual({ code: 'approvals:task:act', description: expect.any(String) });
  });

  it('requires access:role:read (P2)', async () => {
    await t.http().get('/api/v1/permissions').set(nobody.auth).expect(403);
  });
});

describe('roles', () => {
  it('lists seeded roles with their data access', async () => {
    const res = await t.http().get('/api/v1/roles').set(reader.auth).expect(200);
    const pm = res.body.items.find((role: { code: string }) => role.code === 'product-manager');
    expect(pm.dataAccess.financial).toBe('own');
    expect(pm.isSystem).toBe(true);
  });

  it('gives the seeded system administrator role all data access, and every other seeded role no contract access', async () => {
    const res = await t.http().get('/api/v1/roles').set(reader.auth).expect(200);
    const sysadmin = res.body.items.find((role: { code: string }) => role.code === 'system-admin');
    expect(sysadmin).toMatchObject({ isSystem: true, isSystemAdmin: true, dataAccess: { financial: 'all', contract: 'all', personal: 'all' } });
    const others = res.body.items.filter((role: { code: string; isSystem: boolean }) => role.isSystem && role.code !== 'system-admin');
    expect(others.length).toBeGreaterThan(0);
    for (const role of others) expect(role.dataAccess.contract).toBe('none');
  });

  it('creates, reads, updates and deletes a role', async () => {
    const code = `qa-${randomUUID().slice(0, 6)}`;
    const created = await t
      .http()
      .post('/api/v1/roles')
      .set(roleManager.auth)
      .send({ code, name: 'QA reviewer', permissions: ['access:role:read'], dataAccess: { financial: 'none', contract: 'none', personal: 'none' } })
      .expect(201);
    expect(created.body).toMatchObject({ code, name: 'QA reviewer', isSystem: false, version: 1 });

    await t.http().get(`/api/v1/roles/${created.body.id}`).set(reader.auth).expect(200);

    const updated = await t
      .http()
      .patch(`/api/v1/roles/${created.body.id}`)
      .set(roleManager.auth)
      .send({ name: 'QA lead', version: created.body.version })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'QA lead', version: 2 });

    await t.http().delete(`/api/v1/roles/${created.body.id}`).set(roleManager.auth).expect(204);
    await t.http().get(`/api/v1/roles/${created.body.id}`).set(reader.auth).expect(404);
  });

  it('rejects a stale version with 409 (optimistic locking)', async () => {
    const code = `lock-${randomUUID().slice(0, 6)}`;
    const role = await t.http().post('/api/v1/roles').set(admin.auth).send({ code, name: 'Lock', permissions: [], dataAccess: {} }).expect(201);
    await t.http().patch(`/api/v1/roles/${role.body.id}`).set(admin.auth).send({ name: 'A', version: 1 }).expect(200);
    await t.http().patch(`/api/v1/roles/${role.body.id}`).set(admin.auth).send({ name: 'B', version: 1 }).expect(409);
  });

  it('rejects unknown permission codes, unknown fields and bad codes (400)', async () => {
    const bad = await t.http().post('/api/v1/roles').set(admin.auth).send({ code: 'x1', name: 'X', permissions: ['made:up:read'], dataAccess: {} }).expect(400);
    expect(bad.body.errors[0].path).toBe('permissions.0');
    await t.http().post('/api/v1/roles').set(admin.auth).send({ code: 'x2', name: 'X', permissions: [], dataAccess: {}, isSystemAdmin: true }).expect(400);
    await t.http().post('/api/v1/roles').set(admin.auth).send({ code: 'Bad Code', name: 'X', permissions: [], dataAccess: {} }).expect(400);
  });

  it('rejects a duplicate role code with 409', async () => {
    await t.http().post('/api/v1/roles').set(admin.auth).send({ code: 'pmo', name: 'Dup', permissions: [], dataAccess: {} }).expect(409);
  });

  it('prevents privilege escalation: cannot grant permissions you do not hold', async () => {
    await t
      .http()
      .post('/api/v1/roles')
      .set(roleManager.auth)
      .send({ code: `esc-${randomUUID().slice(0, 6)}`, name: 'Escalate', permissions: ['access:user:manage'], dataAccess: {} })
      .expect(403);
  });

  it('protects seeded system roles from deletion and the system-admin role from changes', async () => {
    const roles = await t.http().get('/api/v1/roles').set(reader.auth).expect(200);
    const pmo = roles.body.items.find((role: { code: string }) => role.code === 'pmo');
    const sysadmin = roles.body.items.find((role: { code: string }) => role.code === 'system-admin');
    await t.http().delete(`/api/v1/roles/${pmo.id}`).set(admin.auth).expect(409);
    await t.http().patch(`/api/v1/roles/${sysadmin.id}`).set(admin.auth).send({ name: 'Root', version: sysadmin.version }).expect(409);
  });

  it('refuses to delete a role that is still assigned', async () => {
    const code = await createRole(t.orm, []);
    await createActor(t.orm, [{ code }]);
    const roles = await t.http().get('/api/v1/roles').set(reader.auth).expect(200);
    const role = roles.body.items.find((r: { code: string }) => r.code === code);
    await t.http().delete(`/api/v1/roles/${role.id}`).set(admin.auth).expect(409);
  });

  it('requires access:role:manage to change roles (P2)', async () => {
    await t.http().post('/api/v1/roles').set(reader.auth).send({ code: 'nope', name: 'Nope', permissions: [], dataAccess: {} }).expect(403);
  });

  it('returns 400 for a malformed id and 404 for an unknown one', async () => {
    await t.http().get('/api/v1/roles/not-a-uuid').set(reader.auth).expect(400);
    await t.http().get(`/api/v1/roles/${randomUUID()}`).set(reader.auth).expect(404);
  });
});

describe('users and role assignments', () => {
  it('adds a user by Okta username (names optional), assigns a scoped role and ends the assignment', async () => {
    const username = `New.User-${randomUUID().slice(0, 6)}@AIA.com`;
    const email = `nur-${randomUUID().slice(0, 6)}@aia.com`;
    const user = await t
      .http()
      .post('/api/v1/users')
      .set(userManager.auth)
      .send({ username: ` ${username} `, email: email.toUpperCase(), isExternal: false })
      .expect(201);
    expect(user.body).toMatchObject({ username: username.toLowerCase(), email, emailFromOkta: false, firstName: '', lastName: '', status: 'active', isExternal: false });

    const portfolioId = randomUUID();
    const assignment = await t
      .http()
      .post('/api/v1/role-assignments')
      .set(userManager.auth)
      .send({ userId: user.body.id, roleCode: 'arb-member', scopeType: 'global' })
      .expect(201);
    expect(assignment.body).toMatchObject({ roleCode: 'arb-member', active: true });

    await t
      .http()
      .post('/api/v1/role-assignments')
      .set(admin.auth)
      .send({ userId: user.body.id, roleCode: 'portfolio-lead', scopeType: 'portfolio', scopeId: portfolioId })
      .expect(201);

    const listed = await t.http().get(`/api/v1/users/${user.body.id}/role-assignments`).set(userManager.auth).expect(200);
    expect(listed.body.items.map((a: { roleCode: string }) => a.roleCode).sort()).toEqual(['arb-member', 'portfolio-lead']);

    const ended = await t.http().post(`/api/v1/role-assignments/${assignment.body.id}/end`).set(userManager.auth).expect(200);
    expect(ended.body.active).toBe(false);
  });

  it('requires a scope id for scoped assignments and none for global ones', async () => {
    await t.http().post('/api/v1/role-assignments').set(admin.auth).send({ userId: nobody.id, roleCode: 'pmo', scopeType: 'portfolio' }).expect(400);
    await t.http().post('/api/v1/role-assignments').set(admin.auth).send({ userId: nobody.id, roleCode: 'pmo', scopeType: 'global', scopeId: randomUUID() }).expect(400);
  });

  it('prevents escalation: cannot assign a role with permissions you do not hold, or system-admin', async () => {
    await t.http().post('/api/v1/role-assignments').set(userManager.auth).send({ userId: nobody.id, roleCode: 'pmo', scopeType: 'global' }).expect(403);
    await t.http().post('/api/v1/role-assignments').set(userManager.auth).send({ userId: nobody.id, roleCode: 'system-admin', scopeType: 'global' }).expect(403);
  });

  it('lets holders of "Grant the system administrator role" grant and end it: never to themselves or a vendor', async () => {
    const granter = await createActor(t.orm, [{ code: await createRole(t.orm, ['access:user:read', 'access:assignment:read', 'access:assignment:manage', 'access:system-admin:manage']) }], { label: 'granter' });
    const target = await createActor(t.orm, [], { label: 'new-admin' });
    const given = await t.http().post('/api/v1/role-assignments').set(granter.auth).send({ userId: target.id, roleCode: 'system-admin', scopeType: 'global' }).expect(201);
    expect((await t.http().get('/api/v1/me').set(target.auth).expect(200)).body.isSystemAdmin).toBe(true);
    await t.http().post(`/api/v1/role-assignments/${given.body.id}/end`).set(granter.auth).expect(200);
    await t.http().post('/api/v1/role-assignments').set(granter.auth).send({ userId: granter.id, roleCode: 'system-admin', scopeType: 'global' }).expect(403);
    const vendor = await createActor(t.orm, [{ code: 'vendor' }], { isExternal: true, label: 'granter-vendor' });
    await t.http().post('/api/v1/role-assignments').set(granter.auth).send({ userId: vendor.id, roleCode: 'system-admin', scopeType: 'global' }).expect(422);
  });

  it('keeps "Can act for staff" on roles: seeded on approver roles, set by role managers', async () => {
    const roles = (await t.http().get('/api/v1/roles').set(admin.auth).expect(200)).body.items as { code: string; canActForStaff: boolean }[];
    const acting = roles.filter((role) => role.canActForStaff).map((role) => role.code);
    expect(acting).toEqual(expect.arrayContaining(['tech-exco', 'finance-exco', 'arb-member', 'arb-chair', 'enterprise-architect', 'solution-architect', 'application-manager', 'pmo', 'portfolio-lead']));
    expect(acting).not.toContain('vendor');
    expect(acting).not.toContain('application-lead');
    const code = `acting-${randomUUID().slice(0, 6)}`;
    const created = await t.http().post('/api/v1/roles').set(admin.auth).send({ code, name: 'Acting', permissions: [], dataAccess: { financial: 'none', contract: 'none', personal: 'none' }, canActForStaff: true }).expect(201);
    expect(created.body.canActForStaff).toBe(true);
    const changed = await t.http().patch(`/api/v1/roles/${created.body.id}`).set(admin.auth).send({ canActForStaff: false, version: created.body.version }).expect(200);
    expect(changed.body.canActForStaff).toBe(false);
  });

  it('never gives the system-admin role to an external (vendor) user', async () => {
    const vendor = await createActor(t.orm, [{ code: 'vendor' }], { isExternal: true });
    await t.http().post('/api/v1/role-assignments').set(admin.auth).send({ userId: vendor.id, roleCode: 'system-admin', scopeType: 'global' }).expect(422);
  });

  it('never lets a vendor act as system admin, even if the data says they hold the role', async () => {
    // Cannot happen through the API (both directions are refused); the guard holds anyway.
    const later = await createActor(t.orm, [{ code: 'system-admin' }, { code: 'vendor' }], { isExternal: true, label: 'flagged' });

    const me = await t.http().get('/api/v1/me').set(later.auth).expect(200);

    expect(me.body.isSystemAdmin).toBe(false);
    expect(me.body.roles).toEqual(['vendor']);
    await t.http().get('/api/v1/roles').set(later.auth).expect(403);
    await t.http().get('/api/v1/audit-logs').set(later.auth).expect(403);
  });

  it('sets the vendor flag in TechCockpit: required when adding, changeable later, never while holding the administrator role', async () => {
    const add = (body: Record<string, unknown>) => t.http().post('/api/v1/users').set(userManager.auth).send({ username: `u-${randomUUID().slice(0, 6)}`, email: 'x@aia.com', ...body });
    await add({}).expect(400);
    const vendor = await add({ isExternal: true }).expect(201);
    expect(vendor.body.isExternal).toBe(true);
    const created = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'user.created', resourceId: vendor.body.id });
    expect(created.changes?.after).toMatchObject({ username: vendor.body.username, isExternal: true });
    const back = await t.http().patch(`/api/v1/users/${vendor.body.id}`).set(userManager.auth).send({ isExternal: false, version: vendor.body.version }).expect(200);
    expect(back.body.isExternal).toBe(false);

    const holder = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'admin-holder' });
    const current = await t.http().get(`/api/v1/users/${holder.id}`).set(admin.auth).expect(200);
    const refused = await t.http().patch(`/api/v1/users/${holder.id}`).set(admin.auth).send({ isExternal: true, version: current.body.version }).expect(422);
    expect(refused.body.detail).toBe('End the system administrator role first');
  });

  it('edits the username, names and email (audited), but not an email Okta sent', async () => {
    const added = await t.http().post('/api/v1/users').set(userManager.auth).send({ username: `typo-${randomUUID().slice(0, 6)}`, email: 'first@aia.com', isExternal: false }).expect(201);
    const renamed = `Fixed-${randomUUID().slice(0, 6)}`;
    const edited = await t
      .http()
      .patch(`/api/v1/users/${added.body.id}`)
      .set(userManager.auth)
      .send({ username: renamed, email: 'Second@AIA.com', firstName: 'Siti', lastName: '', version: added.body.version })
      .expect(200);
    expect(edited.body).toMatchObject({ username: renamed.toLowerCase(), email: 'second@aia.com', firstName: 'Siti', lastName: '' });
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'user.updated', resourceId: added.body.id });
    expect(audit.changes).toMatchObject({ before: { username: added.body.username, email: 'first@aia.com' }, after: { username: renamed.toLowerCase(), email: 'second@aia.com' } });

    await t.http().patch(`/api/v1/users/${added.body.id}`).set(userManager.auth).send({ username: reader.username.toUpperCase(), version: edited.body.version }).expect(409);
    await t.orm.em.fork().nativeUpdate(User, { id: added.body.id }, { emailFromOkta: true });
    const current = (await t.http().get(`/api/v1/users/${added.body.id}`).set(userManager.auth).expect(200)).body;
    expect(current.emailFromOkta).toBe(true);
    const fromOkta = await t.http().patch(`/api/v1/users/${added.body.id}`).set(userManager.auth).send({ email: 'third@aia.com', version: current.version }).expect(422);
    expect(fromOkta.body.detail).toBe('The email comes from Okta and cannot be changed here');
    await t.http().patch(`/api/v1/users/${added.body.id}`).set(userManager.auth).send({ username: 'two words', version: current.version }).expect(400);
  });

  it('lists users with search by username, name or email, and paging, and rejects a page size over 100', async () => {
    const res = await t.http().get('/api/v1/users').query({ q: 'usermgr', pageSize: 5 }).set(reader.auth).expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 5 });
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items.every((u: { username: string }) => u.username.includes('usermgr'))).toBe(true);
    await t.http().get('/api/v1/users').query({ pageSize: 500 }).set(reader.auth).expect(400);
  });

  it('disables a user, which immediately blocks their API key', async () => {
    const victim = await createActor(t.orm, [], { label: 'victim' });
    await t.http().get('/api/v1/me').set(victim.auth).expect(200);
    const current = await t.http().get(`/api/v1/users/${victim.id}`).set(userManager.auth).expect(200);
    await t.http().patch(`/api/v1/users/${victim.id}`).set(userManager.auth).send({ status: 'disabled', version: current.body.version }).expect(200);
    await t.http().get('/api/v1/me').set(victim.auth).expect(401);
  });

  it('rejects a duplicate username in any case with 409; a shared email is allowed', async () => {
    await t.http().post('/api/v1/users').set(userManager.auth).send({ username: reader.username.toUpperCase(), email: 'a@aia.com', isExternal: false }).expect(409);
    await t.http().post('/api/v1/users').set(userManager.auth).send({ username: `shared-${randomUUID().slice(0, 6)}`, email: reader.email, isExternal: false }).expect(201);
  });
});

describe('refused sign-ins', () => {
  const refused = async (username = `stranger-${randomUUID().slice(0, 8)}`) => {
    const em = t.orm.em.fork();
    const entry = em.create(RefusedSignIn, { username, email: `${username}@ext.com`, firstName: 'Str', lastName: 'Anger', attempts: 2, firstAttemptAt: new Date(Date.now() - 60_000), lastAttemptAt: new Date() });
    await em.flush();
    return entry;
  };

  it('lists them, newest first, for user managers only', async () => {
    const entry = await refused();
    await t.http().get('/api/v1/refused-sign-ins').set(reader.auth).expect(403);
    const list = await t.http().get('/api/v1/refused-sign-ins').set(userManager.auth).expect(200);
    expect(list.body.items[0]).toMatchObject({ id: entry.id, username: entry.username, email: entry.email, firstName: 'Str', lastName: 'Anger', attempts: 2 });
  });

  it('removes an entry when the person is added, or renamed to that username', async () => {
    const entry = await refused();
    await t.http().post('/api/v1/users').set(userManager.auth).send({ username: entry.username.toUpperCase(), email: 'e@aia.com', isExternal: false }).expect(201);
    expect(await t.orm.em.fork().findOne(RefusedSignIn, { id: entry.id })).toBeNull();

    const other = await refused();
    const user = await t.http().post('/api/v1/users').set(userManager.auth).send({ username: `before-${randomUUID().slice(0, 6)}`, email: 'e@aia.com', isExternal: false }).expect(201);
    await t.http().patch(`/api/v1/users/${user.body.id}`).set(userManager.auth).send({ username: other.username, version: user.body.version }).expect(200);
    expect(await t.orm.em.fork().findOne(RefusedSignIn, { id: other.id })).toBeNull();
  });

  it('dismisses an entry (audited), and answers 404 for an unknown one', async () => {
    const entry = await refused();
    await t.http().delete(`/api/v1/refused-sign-ins/${entry.id}`).set(reader.auth).expect(403);
    await t.http().delete(`/api/v1/refused-sign-ins/${entry.id}`).set(userManager.auth).expect(204);
    expect(await t.orm.em.fork().findOne(RefusedSignIn, { id: entry.id })).toBeNull();
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'refused-sign-in.dismissed', resourceId: entry.id });
    expect(audit.changes).toEqual({ before: { username: entry.username }, after: null });
    await t.http().delete(`/api/v1/refused-sign-ins/${entry.id}`).set(userManager.auth).expect(404);
  });
});

describe('departments', () => {
  it('lets any signed-in user list departments and only managers create them', async () => {
    const code = `D${randomUUID().slice(0, 6)}`.toUpperCase();
    await t.http().post('/api/v1/departments').set(nobody.auth).send({ code, name: 'Digital' }).expect(403);
    const created = await t.http().post('/api/v1/departments').set(admin.auth).send({ code, name: 'Digital' }).expect(201);
    const list = await t.http().get('/api/v1/departments').set(nobody.auth).expect(200);
    expect(list.body.items).toContainEqual(expect.objectContaining({ id: created.body.id, code }));
  });
});

describe('audit trail', () => {
  it('records views and changes, readable only with audit:log:read', async () => {
    const code = `aud-${randomUUID().slice(0, 6)}`;
    const role = await t.http().post('/api/v1/roles').set(roleManager.auth).send({ code, name: 'Audited', permissions: [], dataAccess: {} }).expect(201);
    await t.http().get(`/api/v1/roles/${role.body.id}`).set(reader.auth).expect(200);

    const logs = await t.http().get('/api/v1/audit-logs').query({ resourceType: 'role', resourceId: role.body.id }).set(roleManager.auth).expect(200);
    const actions = logs.body.items.map((entry: { action: string }) => entry.action);
    expect(actions).toContain('role.created');
    expect(actions).toContain('http.request');
    const created = logs.body.items.find((entry: { action: string }) => entry.action === 'role.created');
    expect(created.changes.after.code).toBe(code);
    expect(created.actorUserId).toBe(roleManager.id);
    const view = logs.body.items.find((entry: { action: string; httpMethod: string; actorUserId: string }) => entry.httpMethod === 'GET' && entry.actorUserId === reader.id);
    expect(view.statusCode).toBe(200);

    await t.http().get('/api/v1/audit-logs').set(reader.auth).expect(403);
  });

  it('records permission denials and failed logins as security events', async () => {
    await t.http().get('/api/v1/audit-logs').set(nobody.auth).expect(403);
    await t.http().get('/api/v1/me').set('Authorization', `Bearer tck_${'z'.repeat(16)}_${'y'.repeat(43)}`).expect(401);

    const denied = await t.http().get('/api/v1/audit-logs').query({ action: 'access.denied', actorUserId: nobody.id }).set(admin.auth).expect(200);
    expect(denied.body.items[0]).toMatchObject({ action: 'access.denied', statusCode: 403, path: '/api/v1/audit-logs' });
    const failed = await t.http().get('/api/v1/audit-logs').query({ action: 'auth.failed' }).set(admin.auth).expect(200);
    expect(failed.body.total).toBeGreaterThan(0);
  });

  it('cannot be altered, even by the database owner', async () => {
    const em = t.orm.em.fork();
    await expect(em.getConnection().execute('update audit_log set action = ?', ['tampered'])).rejects.toThrow(/append-only/);
    await expect(em.getConnection().execute('delete from audit_log')).rejects.toThrow(/append-only/);
  });
});
