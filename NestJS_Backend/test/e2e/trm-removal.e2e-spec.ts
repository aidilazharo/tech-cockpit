import { randomUUID } from 'node:crypto';
import type { EntityName } from '@mikro-orm/postgresql';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { ApprovalInstance, ApprovalRuleSet } from '../../src/modules/approvals/approval.entities.js';
import { User } from '../../src/modules/identity/user.entity.js';
import { SadDocument, SadVersion } from '../../src/modules/sad/sad.entities.js';
import type { SyncFile } from '../../src/modules/trm/domain/sync-files.js';
import {
  TrmApplication,
  TrmApplicationService,
  TrmCapability,
  TrmPlannedApplication,
  TrmProductStandard,
  TrmServer,
  TrmService,
  TrmServiceServer,
  TrmServiceSoftware,
  TrmSoftwareModel,
  TrmSyncRun,
} from '../../src/modules/trm/trm.entities.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { resetTrm, SYS, trmExports } from './support/trm-fixtures.js';

const PERMISSION = 'trm:synced-record:delete';
const WORKFLOW = `rm-${randomUUID().slice(0, 8)}`;
const NOBODY_ID = '00000000-0000-4000-8000-000000000000';

type Rows = Record<string, string>[];
type Synced = typeof TrmApplication | typeof TrmService | typeof TrmCapability | typeof TrmProductStandard | typeof TrmSoftwareModel;

let t: TestApp;
let admin: Actor;
let deleter: Actor;
let scopedDeleter: Actor;
let architect: Actor;
let nobody: Actor;
let ruleSetId: string;

const em = () => t.orm.em.fork();
const url = (path: string) => `/api/v1/trm/missing-records${path}`;

async function sync(actor: Actor, files: Partial<Record<SyncFile, Rows>>) {
  const run = await t.http().post('/api/v1/trm/sync-runs').set(actor.auth).send({ dryRun: false }).expect(201);
  const expected: Record<string, number> = {};
  for (const [file, rows] of Object.entries(files)) {
    expected[file] = rows.length;
    for (let i = 0; i < rows.length; i += 500) {
      await t.http().put(`/api/v1/trm/sync-runs/${run.body.id}/records`).set(actor.auth).send({ file, records: rows.slice(i, i + 500) }).expect(200);
    }
  }
  return (await t.http().post(`/api/v1/trm/sync-runs/${run.body.id}/complete`).set(actor.auth).send({ expected }).expect(200)).body;
}

async function idOf(entity: Synced, snSysId: string): Promise<string> {
  return (await em().findOneOrFail(entity as typeof TrmApplication, { snSysId })).id;
}
const serverId = async (name: string) => (await em().findOneOrFail(TrmServer, { name })).id;

/** Marks records as no longer in the ServiceNow export, the way a sync run does. */
async function flag(entity: Synced | typeof TrmServer, where: object): Promise<void> {
  await em().nativeUpdate(entity as EntityName<object>, where, { missingSince: new Date(Date.now() - 86_400_000) } as never);
}
const flagSys = (entity: Synced, ...sysIds: string[]) => flag(entity, { snSysId: { $in: sysIds } });

const remove = (actor: Actor, recordType: string, ids: string[]) =>
  t.http().post(url('/delete')).set(actor.auth).send({ recordType, ids });

async function openApproval(applicationId: string, status: 'in_progress' | 'returned' | 'awaiting_info' | 'approved' | 'cancelled') {
  const e = em();
  e.create(ApprovalInstance, {
    workflowCode: WORKFLOW,
    subjectType: 'sad-version',
    subjectId: randomUUID(),
    subjectTitle: 'Removal test',
    ruleSet: e.getReference(ApprovalRuleSet, ruleSetId),
    ruleKey: 'all',
    steps: [],
    context: {},
    status,
    currentStepIndex: 0,
    round: 1,
    submittedBy: e.getReference(User, admin.id),
    applicationId,
  });
  await e.flush();
}

async function sadVersion(applicationId: string, status: 'draft' | 'in_approval' | 'current' | 'superseded' | 'cancelled') {
  const e = em();
  const document = e.create(SadDocument, { application: e.getReference(TrmApplication, applicationId), lastNumber: 0 });
  e.create(SadVersion, { document, status, templateVersion: 3, startedBy: e.getReference(User, admin.id) });
  await e.flush();
}

beforeAll(async () => {
  t = await createTestApp();
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'rm-admin' });
  architect = await createActor(t.orm, [{ code: 'enterprise-architect' }], { label: 'rm-architect' });
  nobody = await createActor(t.orm, [], { label: 'rm-nobody' });
  const role = await createRole(t.orm, [PERMISSION]);
  deleter = await createActor(t.orm, [{ code: role }], { label: 'rm-deleter' });
  scopedDeleter = await createActor(t.orm, [{ code: role, scopeType: 'department', scopeId: randomUUID() }], { label: 'rm-scoped' });
  const e = em();
  const ruleSet = e.create(ApprovalRuleSet, { workflowCode: WORKFLOW, ruleVersion: 1, status: 'published', definition: { rules: [] } as never, publishedAt: new Date() });
  await e.flush();
  ruleSetId = ruleSet.id;
});

afterAll(async () => {
  const e = em();
  await e.nativeDelete(ApprovalInstance, { workflowCode: WORKFLOW });
  await e.nativeDelete(ApprovalRuleSet, { workflowCode: WORKFLOW });
  await t.close();
});

beforeEach(async () => {
  await resetTrm(t.orm);
  await sync(admin, trmExports());
});

afterEach(async () => {
  await em().nativeDelete(ApprovalInstance, { workflowCode: WORKFLOW });
});

describe('who may use it', () => {
  it('needs a sign-in', async () => {
    await t.http().get(url('/summary')).expect(401);
    await t.http().get(url('?recordType=applications')).expect(401);
    await t.http().post(url('/delete')).send({ recordType: 'applications', ids: [NOBODY_ID] }).expect(401);
  });

  it('refuses people without the permission, including enterprise architects', async () => {
    for (const actor of [nobody, architect]) {
      await t.http().get(url('/summary')).set(actor.auth).expect(403);
      await t.http().get(url('?recordType=applications')).set(actor.auth).expect(403);
      await remove(actor, 'applications', [NOBODY_ID]).expect(403);
    }
  });

  it('refuses a grant that is limited to one department: removal is global', async () => {
    await t.http().get(url('/summary')).set(scopedDeleter.auth).expect(403);
    await t.http().get(url('?recordType=applications')).set(scopedDeleter.auth).expect(403);
    const id = await idOf(TrmApplication, SYS.appHr);
    await flagSys(TrmApplication, SYS.appHr);
    await remove(scopedDeleter, 'applications', [id]).expect(403);
    expect(await em().count(TrmApplication, { id })).toBe(1);
  });

  it('allows a role that holds the permission globally, not only system administrators', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    await t.http().get(url('/summary')).set(deleter.auth).expect(200);
    const id = await idOf(TrmApplication, SYS.appHr);
    const res = await remove(deleter, 'applications', [id]).expect(200);
    expect(res.body).toEqual({ deleted: [id], refused: [] });
  });
});

describe('what is flagged', () => {
  it('counts the flagged records of every type', async () => {
    await flagSys(TrmApplication, SYS.appHr, SYS.appTwinB);
    await flagSys(TrmService, SYS.svcSales);
    await flagSys(TrmCapability, SYS.capPayments);
    await flagSys(TrmProductStandard, SYS.stdOracle);
    await flagSys(TrmSoftwareModel, SYS.modelNginx);
    await flag(TrmServer, { name: 'SRV-BIL-01' });

    const res = await t.http().get(url('/summary')).set(admin.auth).expect(200);
    expect(res.body).toEqual({
      items: [
        { recordType: 'applications', count: 2 },
        { recordType: 'services', count: 1 },
        { recordType: 'capabilities', count: 1 },
        { recordType: 'productStandards', count: 1 },
        { recordType: 'softwareModels', count: 1 },
        { recordType: 'servers', count: 1 },
      ],
      total: 7,
    });
  });

  it('reports zero for a clean database', async () => {
    const res = await t.http().get(url('/summary')).set(admin.auth).expect(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toHaveLength(6);
    expect(res.body.items.every((item: { count: number }) => item.count === 0)).toBe(true);
  });

  it('lists only flagged records of the chosen type, with their ids', async () => {
    await flagSys(TrmApplication, SYS.appHr, SYS.appTwinB);
    await flagSys(TrmService, SYS.svcSales);
    const res = await t.http().get(url('?recordType=applications')).set(admin.auth).expect(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 25, total: 2 });
    expect(res.body.items.map((item: { snSysId: string }) => item.snSysId).sort()).toEqual([SYS.appHr, SYS.appTwinB].sort());
    const hr = res.body.items.find((item: { snSysId: string }) => item.snSysId === SYS.appHr);
    expect(hr).toMatchObject({ id: await idOf(TrmApplication, SYS.appHr), recordType: 'applications', number: 'APM-HR Portal', name: 'HR Portal', blockers: [] });
    expect(typeof hr.missingSince).toBe('string');
  });

  it('lists services, capabilities, standards, models and servers too', async () => {
    await flagSys(TrmService, SYS.svcSales);
    await flagSys(TrmCapability, SYS.capPayments);
    await flagSys(TrmProductStandard, SYS.stdOracle);
    await flagSys(TrmSoftwareModel, SYS.modelNginx);
    await flag(TrmServer, { name: 'SRV-BIL-01' });
    const names: Record<string, string | null> = {};
    for (const recordType of ['services', 'capabilities', 'productStandards', 'softwareModels', 'servers']) {
      const res = await t.http().get(url(`?recordType=${recordType}`)).set(admin.auth).expect(200);
      expect(res.body.total).toBe(1);
      names[recordType] = res.body.items[0].name;
    }
    expect(names).toEqual({ services: 'Sales', capabilities: 'Payments', productStandards: 'Oracle 11g', softwareModels: 'Nginx 1.24', servers: 'SRV-BIL-01' });
  });

  it('filters by text in the name or number, and pages', async () => {
    await flagSys(TrmApplication, SYS.appHr, SYS.appTwinA, SYS.appTwinB);
    const byName = await t.http().get(url('?recordType=applications&q=portal')).set(admin.auth).expect(200);
    expect(byName.body.items.map((item: { name: string }) => item.name)).toEqual(['HR Portal']);
    const byNumber = await t.http().get(url('?recordType=applications&q=APM-TWIN')).set(admin.auth).expect(200);
    expect(byNumber.body.total).toBe(2);
    const none = await t.http().get(url('?recordType=applications&q=zzz')).set(admin.auth).expect(200);
    expect(none.body).toMatchObject({ items: [], total: 0 });
    const second = await t.http().get(url('?recordType=applications&page=2&pageSize=2')).set(admin.auth).expect(200);
    expect(second.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(second.body.items).toHaveLength(1);
  });

  it('treats % and _ in the search text as plain characters', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    const res = await t.http().get(url('?recordType=applications&q=%25')).set(admin.auth).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('shows what stops a record from being removed', async () => {
    await flagSys(TrmApplication, SYS.appCrm, SYS.appHr);
    await sadVersion(await idOf(TrmApplication, SYS.appCrm), 'current');
    await openApproval(await idOf(TrmApplication, SYS.appHr), 'in_progress');
    await flagSys(TrmCapability, SYS.capFinance);
    const apps = (await t.http().get(url('?recordType=applications')).set(admin.auth).expect(200)).body.items;
    const byKey = (key: string) => apps.find((item: { snSysId: string }) => item.snSysId === key);
    expect(byKey(SYS.appCrm).blockers).toEqual(['has-sad-history']);
    expect(byKey(SYS.appHr).blockers).toEqual(['open-approval']);
    const caps = (await t.http().get(url('?recordType=capabilities')).set(admin.auth).expect(200)).body.items;
    expect(caps[0].blockers).toEqual(['has-children']);
  });

  it('rejects a missing or unknown record type and bad paging', async () => {
    await t.http().get(url('')).set(admin.auth).expect(400);
    await t.http().get(url('?recordType=users')).set(admin.auth).expect(400);
    await t.http().get(url('?recordType=applications&pageSize=101')).set(admin.auth).expect(400);
    await t.http().get(url('?recordType=applications&page=0')).set(admin.auth).expect(400);
    await t.http().get(url('?recordType=applications&extra=1')).set(admin.auth).expect(400);
  });
});

describe('removing records', () => {
  it('removes an application with the links that hang off it, and nothing else', async () => {
    await flagSys(TrmApplication, SYS.appCrm);
    const id = await idOf(TrmApplication, SYS.appCrm);
    expect(await em().count(TrmApplicationService, { application: id })).toBeGreaterThan(0);
    const servicesBefore = await em().count(TrmService, {});

    const res = await remove(admin, 'applications', [id]).expect(200);

    expect(res.body).toEqual({ deleted: [id], refused: [] });
    expect(await em().count(TrmApplication, { id })).toBe(0);
    expect(await em().count(TrmApplicationService, { application: id })).toBe(0);
    expect(await em().count(TrmApplication, {})).toBe(4);
    expect(await em().count(TrmService, {})).toBe(servicesBefore);
  });

  it('removes a service with its server and software links, keeping the servers and models', async () => {
    await flagSys(TrmService, SYS.svcCrmDr);
    const id = await idOf(TrmService, SYS.svcCrmDr);
    const server = await serverId('SRV-CRM-02');
    expect(await em().count(TrmServiceServer, { service: id })).toBe(1);
    expect(await em().count(TrmServiceSoftware, { service: id })).toBe(1);

    const res = await remove(admin, 'services', [id]).expect(200);

    expect(res.body.deleted).toEqual([id]);
    expect(await em().count(TrmServiceServer, { service: id })).toBe(0);
    expect(await em().count(TrmServiceSoftware, { service: id })).toBe(0);
    expect(await em().count(TrmServer, { id: server })).toBe(1);
    expect(await em().count(TrmSoftwareModel, { snSysId: SYS.modelNginx })).toBe(1);
  });

  it('removes a server and its service links', async () => {
    await flag(TrmServer, { name: 'SRV-CRM-01' });
    const id = await serverId('SRV-CRM-01');
    expect(await em().count(TrmServiceServer, { server: id })).toBe(1);
    const res = await remove(admin, 'servers', [id]).expect(200);
    expect(res.body.deleted).toEqual([id]);
    expect(await em().count(TrmServer, { id })).toBe(0);
    expect(await em().count(TrmServiceServer, { server: id })).toBe(0);
  });

  it('removes a software model and its software links', async () => {
    await flagSys(TrmSoftwareModel, SYS.modelOracle);
    const id = await idOf(TrmSoftwareModel, SYS.modelOracle);
    expect(await em().count(TrmServiceSoftware, { softwareModel: id })).toBe(1);
    const res = await remove(admin, 'softwareModels', [id]).expect(200);
    expect(res.body.deleted).toEqual([id]);
    expect(await em().count(TrmServiceSoftware, { softwareModel: id })).toBe(0);
  });

  it('removes a product standard and leaves its software models without a standard', async () => {
    await flagSys(TrmProductStandard, SYS.stdPostgres);
    const id = await idOf(TrmProductStandard, SYS.stdPostgres);
    const model = await em().findOneOrFail(TrmSoftwareModel, { snSysId: SYS.modelPostgres });
    expect(model.productStandard?.id).toBe(id);

    await remove(admin, 'productStandards', [id]).expect(200);

    expect(await em().count(TrmProductStandard, { id })).toBe(0);
    expect((await em().findOneOrFail(TrmSoftwareModel, { snSysId: SYS.modelPostgres })).productStandard).toBeNull();
  });

  it('removes a capability: its applications lose the capability and its children become top level', async () => {
    await flagSys(TrmCapability, SYS.capFinance, SYS.capPayments);
    const finance = await idOf(TrmCapability, SYS.capFinance);
    const payments = await idOf(TrmCapability, SYS.capPayments);
    expect((await em().findOneOrFail(TrmApplication, { snSysId: SYS.appBilling })).capability?.id).toBe(payments);

    const res = await remove(admin, 'capabilities', [payments, finance]).expect(200);

    expect(res.body.deleted.sort()).toEqual([finance, payments].sort());
    expect(await em().count(TrmCapability, { id: { $in: [finance, payments] } })).toBe(0);
    expect((await em().findOneOrFail(TrmApplication, { snSysId: SYS.appBilling })).capability).toBeNull();
  });

  it('removes a flagged parent capability and leaves a flagged child without a parent', async () => {
    await flagSys(TrmCapability, SYS.capFinance, SYS.capPayments);
    const finance = await idOf(TrmCapability, SYS.capFinance);
    await remove(admin, 'capabilities', [finance]).expect(200);
    const payments = await em().findOneOrFail(TrmCapability, { snSysId: SYS.capPayments });
    expect(payments.parent).toBeNull();
  });

  it('removes an application whose SAD was only ever cancelled, with that SAD', async () => {
    await flagSys(TrmApplication, SYS.appBilling);
    const id = await idOf(TrmApplication, SYS.appBilling);
    await sadVersion(id, 'cancelled');
    const res = await remove(admin, 'applications', [id]).expect(200);
    expect(res.body.deleted).toEqual([id]);
    expect(await em().count(SadDocument, { application: id })).toBe(0);
  });

  it('removes an application whose approvals are finished, and keeps their history', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    const id = await idOf(TrmApplication, SYS.appHr);
    await openApproval(id, 'approved');
    await openApproval(id, 'cancelled');
    const res = await remove(admin, 'applications', [id]).expect(200);
    expect(res.body.deleted).toEqual([id]);
    expect(await em().count(ApprovalInstance, { applicationId: id })).toBe(2);
  });

  it('keeps a planned roadmap application that was linked to the removed application, and unlinks it', async () => {
    await flagSys(TrmApplication, SYS.appTwinA);
    const id = await idOf(TrmApplication, SYS.appTwinA);
    const e = em();
    e.create(TrmPlannedApplication, { name: 'Twin successor', linkedApplication: e.getReference(TrmApplication, id) });
    await e.flush();

    const res = await remove(admin, 'applications', [id]).expect(200);

    expect(res.body.deleted).toEqual([id]);
    expect((await em().findOneOrFail(TrmPlannedApplication, { name: 'Twin successor' })).linkedApplication).toBeNull();
  });

  it('answers each id on its own: removes what it can, says why for the rest', async () => {
    await flagSys(TrmApplication, SYS.appHr, SYS.appCrm);
    const hr = await idOf(TrmApplication, SYS.appHr);
    const crm = await idOf(TrmApplication, SYS.appCrm);
    const billing = await idOf(TrmApplication, SYS.appBilling);
    await sadVersion(crm, 'current');

    const res = await remove(admin, 'applications', [hr, crm, billing, NOBODY_ID]).expect(200);

    expect(res.body.deleted).toEqual([hr]);
    expect(res.body.refused).toEqual([
      { id: crm, reason: 'has-sad-history' },
      { id: billing, reason: 'not-missing' },
      { id: NOBODY_ID, reason: 'not-found' },
    ]);
    expect(await em().count(TrmApplication, { id: { $in: [crm, billing] } })).toBe(2);
    expect(await em().count(TrmApplication, { id: hr })).toBe(0);
  });

  it('does not remove a record of another type that has the same id', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    const app = await idOf(TrmApplication, SYS.appHr);
    const res = await remove(admin, 'services', [app]).expect(200);
    expect(res.body).toEqual({ deleted: [], refused: [{ id: app, reason: 'not-found' }] });
    expect(await em().count(TrmApplication, { id: app })).toBe(1);
  });
});

describe('what stops a removal', () => {
  it('keeps an application that has any SAD history except cancelled drafts', async () => {
    for (const [key, status] of [
      [SYS.appCrm, 'draft'],
      [SYS.appBilling, 'in_approval'],
      [SYS.appHr, 'current'],
      [SYS.appTwinA, 'superseded'],
    ] as const) {
      await flagSys(TrmApplication, key);
      const id = await idOf(TrmApplication, key);
      await sadVersion(id, status);
      const res = await remove(admin, 'applications', [id]).expect(200);
      expect(res.body, status).toEqual({ deleted: [], refused: [{ id, reason: 'has-sad-history' }] });
      expect(await em().count(TrmApplication, { id })).toBe(1);
    }
  });

  it('keeps an application with a running approval until it finishes', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    const id = await idOf(TrmApplication, SYS.appHr);
    for (const status of ['in_progress', 'returned', 'awaiting_info'] as const) {
      await openApproval(id, status);
      const res = await remove(admin, 'applications', [id]).expect(200);
      expect(res.body, status).toEqual({ deleted: [], refused: [{ id, reason: 'open-approval' }] });
      await em().nativeDelete(ApprovalInstance, { workflowCode: WORKFLOW });
    }
    await openApproval(id, 'approved');
    await remove(admin, 'applications', [id]).expect(200);
  });

  it('keeps applications and capabilities that an EA roadmap initiative uses', async () => {
    await flagSys(TrmApplication, SYS.appCrm, SYS.appBilling, SYS.appHr);
    await flagSys(TrmCapability, SYS.capIdentity);
    const [crm, billing, hr, identity] = [
      await idOf(TrmApplication, SYS.appCrm),
      await idOf(TrmApplication, SYS.appBilling),
      await idOf(TrmApplication, SYS.appHr),
      await idOf(TrmCapability, SYS.capIdentity),
    ];
    await t.http().post('/api/v1/trm/initiatives').set(admin.auth).send({
      name: 'Modernise', description: null, rationale: null, startDate: '2027-01-01', endDate: '2027-12-31', status: 'proposed',
      ownerId: null, estimatedCost: null, capabilityIds: [identity],
      actions: [
        { action: 'enhance', applicationId: crm },
        { action: 'replace', applicationId: hr, replacementApplicationId: billing },
      ],
    }).expect(201);

    const apps = await remove(admin, 'applications', [crm, billing, hr]).expect(200);
    expect(apps.body).toEqual({
      deleted: [],
      refused: [
        { id: crm, reason: 'used-by-initiative' },
        { id: billing, reason: 'used-by-initiative' },
        { id: hr, reason: 'used-by-initiative' },
      ],
    });
    const caps = await remove(admin, 'capabilities', [identity]).expect(200);
    expect(caps.body).toEqual({ deleted: [], refused: [{ id: identity, reason: 'used-by-initiative' }] });
  });

  it('keeps a capability that still has children that are in ServiceNow', async () => {
    await flagSys(TrmCapability, SYS.capFinance);
    const finance = await idOf(TrmCapability, SYS.capFinance);
    const res = await remove(admin, 'capabilities', [finance]).expect(200);
    expect(res.body).toEqual({ deleted: [], refused: [{ id: finance, reason: 'has-children' }] });
    expect(await em().count(TrmCapability, { id: finance })).toBe(1);
  });

  it('keeps a record that is back in ServiceNow', async () => {
    const id = await idOf(TrmApplication, SYS.appHr);
    for (const entityCase of [
      ['applications', id],
      ['services', await idOf(TrmService, SYS.svcSales)],
      ['capabilities', await idOf(TrmCapability, SYS.capPayments)],
      ['productStandards', await idOf(TrmProductStandard, SYS.stdOracle)],
      ['softwareModels', await idOf(TrmSoftwareModel, SYS.modelNginx)],
      ['servers', await serverId('SRV-BIL-01')],
    ] as const) {
      const res = await remove(admin, entityCase[0], [entityCase[1]]).expect(200);
      expect(res.body, entityCase[0]).toEqual({ deleted: [], refused: [{ id: entityCase[1], reason: 'not-missing' }] });
    }
  });

  it('is refused while a sync run is still receiving records', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    const id = await idOf(TrmApplication, SYS.appHr);
    const run = await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({ dryRun: false }).expect(201);
    try {
      const res = await remove(admin, 'applications', [id]).expect(409);
      expect(res.body.status).toBe(409);
      expect(await em().count(TrmApplication, { id })).toBe(1);
    } finally {
      await t.http().post(`/api/v1/trm/sync-runs/${run.body.id}/abandon`).set(admin.auth).expect(200);
    }
    await remove(admin, 'applications', [id]).expect(200);
  });

  it('ignores a receiving run that has been idle for hours, as starting a new run does', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    const id = await idOf(TrmApplication, SYS.appHr);
    const run = await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({ dryRun: false }).expect(201);
    await em().nativeUpdate(TrmSyncRun, { id: run.body.id }, { updatedAt: new Date(Date.now() - 3 * 3_600_000) } as never);
    const res = await remove(admin, 'applications', [id]).expect(200);
    expect(res.body.deleted).toEqual([id]);
  });
});

describe('records and history', () => {
  it('writes one audit entry per removed record, naming who did it and what it was', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    await flagSys(TrmService, SYS.svcSales);
    const hr = await idOf(TrmApplication, SYS.appHr);
    const sales = await idOf(TrmService, SYS.svcSales);
    await remove(deleter, 'applications', [hr]).expect(200);
    await remove(admin, 'services', [sales]).expect(200);

    const e = em();
    const first = await e.findOneOrFail(AuditLog, { action: 'trm.record.deleted', resourceId: hr });
    expect(first.actorUserId).toBe(deleter.id);
    expect(first.resourceType).toBe('trm-synced-record');
    expect(first.changes?.after).toBeNull();
    expect(first.changes?.before).toMatchObject({ recordType: 'applications', number: 'APM-HR Portal', name: 'HR Portal', snSysId: SYS.appHr });
    const second = await e.findOneOrFail(AuditLog, { action: 'trm.record.deleted', resourceId: sales });
    expect(second.actorUserId).toBe(admin.id);
    expect(second.changes?.before).toMatchObject({ recordType: 'services', name: 'Sales', snSysId: SYS.svcSales });
  });

  it('writes no audit entry for a record it refused', async () => {
    const id = await idOf(TrmApplication, SYS.appHr);
    await remove(admin, 'applications', [id]).expect(200);
    expect(await em().count(AuditLog, { action: 'trm.record.deleted', resourceId: id })).toBe(0);
  });

  it('removes what the sync flagged: a record dropped from the export is listed, then removed', async () => {
    const files = trmExports();
    files.business_application = files.business_application.filter((row) => row.sys_id !== SYS.appTwinB);
    const report = await sync(admin, { business_application: files.business_application });
    expect(report.report.records.find((r: { recordType: string }) => r.recordType === 'applications')).toMatchObject({ nowMissing: 1 });

    const listed = await t.http().get(url('?recordType=applications')).set(admin.auth).expect(200);
    expect(listed.body.items.map((item: { snSysId: string }) => item.snSysId)).toEqual([SYS.appTwinB]);
    const id = listed.body.items[0].id;
    await remove(admin, 'applications', [id]).expect(200);
    expect(await em().count(TrmApplication, {})).toBe(4);
  });

  it('inserts a removed record again, as a new record, when a later export contains it', async () => {
    await flagSys(TrmApplication, SYS.appHr);
    const before = await idOf(TrmApplication, SYS.appHr);
    await remove(admin, 'applications', [before]).expect(200);

    const report = await sync(admin, trmExports());

    expect(report.report.records.find((r: { recordType: string }) => r.recordType === 'applications')).toMatchObject({ inserted: 1 });
    const after = await em().findOneOrFail(TrmApplication, { snSysId: SYS.appHr });
    expect(after.id).not.toBe(before);
    expect(after.missingSince).toBeNull();
  });
});

describe('what it accepts', () => {
  const bad = (body: unknown) => t.http().post(url('/delete')).set(admin.auth).send(body as object);

  it('rejects a body that is empty, too long, repeated, mistyped or carries extra fields', async () => {
    await bad({ recordType: 'applications', ids: [] }).expect(400);
    await bad({ recordType: 'applications', ids: Array.from({ length: 101 }, () => randomUUID()) }).expect(400);
    const id = randomUUID();
    await bad({ recordType: 'applications', ids: [id, id] }).expect(400);
    await bad({ recordType: 'applications', ids: ['not-a-uuid'] }).expect(400);
    await bad({ recordType: 'users', ids: [id] }).expect(400);
    await bad({ ids: [id] }).expect(400);
    await bad({ recordType: 'applications' }).expect(400);
    await bad({ recordType: 'applications', ids: [id], force: true }).expect(400);
  });

  it('accepts exactly 100 ids', async () => {
    const ids = Array.from({ length: 100 }, () => randomUUID());
    const res = await bad({ recordType: 'applications', ids }).expect(200);
    expect(res.body.deleted).toEqual([]);
    expect(res.body.refused).toHaveLength(100);
  });
});
