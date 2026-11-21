import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { TrmApplication } from '../../src/modules/trm/trm.entities.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { resetTrm, SYS, trmExports } from './support/trm-fixtures.js';

let t: TestApp;
let admin: Actor;
let classifier: Actor;
let viewer: Actor;
let nobody: Actor;
let crm = '';

const http = () => t.http();
const field = (key: string) => `/api/v1/field-classes/${encodeURIComponent(key)}`;

beforeAll(async () => {
  t = await createTestApp();
  await resetTrm(t.orm);
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'fc-admin' });
  const run = (await http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
  const expected: Record<string, number> = {};
  for (const [file, records] of Object.entries(trmExports())) {
    expected[file] = records.length;
    await http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(admin.auth).send({ file, records }).expect(200);
  }
  await http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected }).expect(200);
  crm = (await t.orm.em.fork().findOneOrFail(TrmApplication, { snSysId: SYS.appCrm })).id;
  classifier = await createActor(t.orm, [{ code: await createRole(t.orm, ['access:field-class:manage']) }], { label: 'fc-classifier' });
  viewer = await createActor(t.orm, [{ code: 'trm-viewer' }], { label: 'fc-viewer' }); // financial: none, personal: scope
  nobody = await createActor(t.orm, [], { label: 'fc-nobody' });
});

afterAll(async () => {
  // Leave the defaults for other suites.
  for (const key of ['trm.application.licenceCost', 'trm.application.itApplicationOwner']) {
    await http().put(field(key)).set(admin.auth).send({ dataClass: null });
  }
  await t.close();
});

describe('Field classification', () => {
  it('lists the classified fields with their class and default, for maintainers only', async () => {
    await http().get('/api/v1/field-classes').set(nobody.auth).expect(403);
    const items = (await http().get('/api/v1/field-classes').set(classifier.auth).expect(200)).body.items as { key: string; dataClass: string; defaultClass: string; module: string; label: string }[];
    const byKey = new Map(items.map((item) => [item.key, item]));
    expect(byKey.get('trm.application.licenceCost')).toMatchObject({ module: 'trm', dataClass: 'financial', defaultClass: 'financial' });
    expect(byKey.get('trm.application.itApplicationOwner')).toMatchObject({ dataClass: 'personal' });
    expect(byKey.get('trm.service.ownedBy')).toMatchObject({ dataClass: 'personal' });
    expect(byKey.get('trm.initiative.estimatedCost')).toMatchObject({ dataClass: 'financial' });
    expect(byKey.get('trm.initiative.owner')).toMatchObject({ dataClass: 'personal' });
    expect(byKey.get('sad.application-people')).toMatchObject({ module: 'sad', dataClass: 'personal' });
    expect(byKey.get('sad.api-people')).toMatchObject({ dataClass: 'personal' });
    expect(byKey.get('sad.version-people')).toMatchObject({ dataClass: 'personal' });
    // Approval types without their own classification keep today's rule: every context field is financial.
    expect(byKey.get('approvals.sad-version.applicationId')).toMatchObject({ module: 'approvals', dataClass: 'financial' });
    expect(items.every((item) => item.label.length > 0)).toBe(true);
  });

  it('reclassifies a field, which changes who sees it at once, and is audited', async () => {
    const before = (await http().get(`/api/v1/trm/applications/${crm}`).set(viewer.auth).expect(200)).body;
    expect(before.costs.licence).toBeNull();
    expect(before.people.itApplicationOwner).toBe('Person Owner');

    const internal = await http().put(field('trm.application.licenceCost')).set(classifier.auth).send({ dataClass: 'internal' }).expect(200);
    expect(internal.body).toMatchObject({ key: 'trm.application.licenceCost', dataClass: 'internal', defaultClass: 'financial' });
    await http().put(field('trm.application.itApplicationOwner')).set(classifier.auth).send({ dataClass: 'financial' }).expect(200);

    const after = (await http().get(`/api/v1/trm/applications/${crm}`).set(viewer.auth).expect(200)).body;
    expect(after.costs.licence).toBe('136.22');
    expect(after.costs.infraCloud).toBeNull(); // still financial
    expect(after.people.itApplicationOwner).toBeNull();
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'access.field-class.updated', resourceId: 'trm.application.licenceCost' });
    expect(audit.changes).toEqual({ before: { dataClass: 'financial' }, after: { dataClass: 'internal' } });

    // Back to the default.
    expect((await http().put(field('trm.application.licenceCost')).set(classifier.auth).send({ dataClass: null }).expect(200)).body.dataClass).toBe('financial');
    expect((await http().get(`/api/v1/trm/applications/${crm}`).set(viewer.auth).expect(200)).body.costs.licence).toBeNull();
  });

  it('changes an administrator\'s class, and records only real changes', async () => {
    const key = 'trm.service.ownedBy';
    const audits = async () => t.orm.em.fork().count(AuditLog, { action: 'access.field-class.updated', resourceId: key });
    await http().put(field(key)).set(classifier.auth).send({ dataClass: 'contract' }).expect(200);
    expect((await http().put(field(key)).set(classifier.auth).send({ dataClass: 'financial' }).expect(200)).body).toMatchObject({ dataClass: 'financial', defaultClass: 'personal' });
    expect(await audits()).toBe(2);
    await http().put(field(key)).set(classifier.auth).send({ dataClass: 'financial' }).expect(200); // unchanged: not recorded again
    expect(await audits()).toBe(2);
    // Choosing the default class is the same as going back to it.
    expect((await http().put(field(key)).set(classifier.auth).send({ dataClass: 'personal' }).expect(200)).body.dataClass).toBe('personal');
    expect((await http().get('/api/v1/field-classes').set(classifier.auth).expect(200)).body.items).toContainEqual(expect.objectContaining({ key, dataClass: 'personal' }));
    expect(await audits()).toBe(3);
  });

  it('refuses unknown fields, unknown classes and people without the permission', async () => {
    await http().put(field('trm.application.nope')).set(classifier.auth).send({ dataClass: 'internal' }).expect(404);
    await http().put(field('trm.application.licenceCost')).set(classifier.auth).send({ dataClass: 'secret' }).expect(400);
    await http().put(field('trm.application.licenceCost')).set(nobody.auth).send({ dataClass: 'internal' }).expect(403);
    await http().put(field('Not a key')).set(classifier.auth).send({ dataClass: 'internal' }).expect(400);
    await http().put(field('trm.application.licenceCost')).set(classifier.auth).send({ dataClass: 'internal', extra: true }).expect(400);
  });
});
