import { readdir, readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { runTrmSync } from '../../src/modules/trm/cli/trm-sync-client.js';
import type { SyncFile } from '../../src/modules/trm/domain/sync-files.js';
import { TrmSyncService } from '../../src/modules/trm/trm-sync.service.js';
import { TrmApplication, TrmSyncRecord, TrmSyncRun } from '../../src/modules/trm/trm.entities.js';
import { createActor, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { resetTrm, SYS, trmExports } from './support/trm-fixtures.js';

let t: TestApp;
let admin: Actor;
let otherAdmin: Actor;
let architect: Actor;
let nobody: Actor;

type Rows = Record<string, unknown>[];

/** Starts a run, sends every export in batches and completes it (as the CLI does). */
async function sync(actor: Actor, files: Partial<Record<SyncFile, Rows>>, dryRun = false) {
  const run = await t.http().post('/api/v1/trm/sync-runs').set(actor.auth).send({ dryRun }).expect(201);
  const expected: Record<string, number> = {};
  for (const [file, rows] of Object.entries(files)) {
    expected[file] = rows.length;
    for (let i = 0; i < rows.length; i += 2) {
      await t.http().put(`/api/v1/trm/sync-runs/${run.body.id}/records`).set(actor.auth).send({ file, records: rows.slice(i, i + 2) }).expect(200);
    }
  }
  return (await t.http().post(`/api/v1/trm/sync-runs/${run.body.id}/complete`).set(actor.auth).send({ expected }).expect(200)).body;
}

const counts = (report: { records: { recordType: string }[] }, recordType: string) => report.records.find((r) => r.recordType === recordType);

beforeAll(async () => {
  t = await createTestApp();
  await resetTrm(t.orm);
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'sync-admin' });
  otherAdmin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'sync-admin2' });
  architect = await createActor(t.orm, [{ code: 'enterprise-architect' }], { label: 'sync-ea' });
  nobody = await createActor(t.orm, [], { label: 'sync-nobody' });
});

afterAll(async () => {
  await t.close();
});

describe('TRM sync: who may load exports', () => {
  it('is for system admins only', async () => {
    await t.http().post('/api/v1/trm/sync-runs').send({}).expect(401);
    await t.http().post('/api/v1/trm/sync-runs').set(architect.auth).send({}).expect(403);
    await t.http().post('/api/v1/trm/sync-runs').set(nobody.auth).send({}).expect(403);
    await t.http().get('/api/v1/trm/sync-runs').set(architect.auth).expect(403);
  });
});

describe('TRM sync: loading exports', () => {
  it('reports a dry run without changing anything', async () => {
    const run = await sync(admin, trmExports(), true);
    expect(run).toMatchObject({ status: 'completed', dryRun: true });
    expect(counts(run.report, 'applications')).toMatchObject({ received: 5, inserted: 5 });
    expect(await t.orm.em.fork().count(TrmApplication, {})).toBe(0);
    expect(await t.orm.em.fork().count(TrmSyncRecord, {})).toBe(0);
  });

  it('loads every export, links the records and reports what it could not match', async () => {
    const run = await sync(admin, trmExports());
    expect(run.status).toBe('completed');
    expect(run.received).toEqual({
      business_capability: 5,
      product_standard: 2,
      business_application: 5,
      mapped_application_service: 4,
      business_service: 2,
      ba_as_sm: 3,
      ba_as_bs: 4,
      ba_as_server: 3,
    });
    const { report } = run;
    expect(counts(report, 'applications')).toEqual({ recordType: 'applications', refreshed: true, received: 5, inserted: 5, updated: 0, unchanged: 0, nowMissing: 0, returned: 0 });
    expect(counts(report, 'services')).toMatchObject({ received: 5, inserted: 5 }); // CRM Prod arrives twice: one record
    expect(counts(report, 'capabilities')).toMatchObject({ inserted: 5 });
    expect(counts(report, 'productStandards')).toMatchObject({ inserted: 2 });
    expect(counts(report, 'softwareModels')).toMatchObject({ inserted: 3 });
    expect(counts(report, 'servers')).toMatchObject({ inserted: 3 });
    expect(report.links).toEqual(
      expect.arrayContaining([
        { linkType: 'application-service', source: 'ba_as_sm', count: 3 },
        { linkType: 'application-service', source: 'ba_as_bs', count: 3 },
        { linkType: 'application-service', source: 'ba_as_server', count: 3 },
        { linkType: 'service-business-service', source: 'ba_as_bs', count: 2 },
        { linkType: 'service-server', source: 'ba_as_server', count: 3 },
        { linkType: 'service-software', source: 'ba_as_sm', count: 3 },
      ]),
    );
    expect(report.unmatched).toEqual(
      expect.arrayContaining([
        { file: 'ba_as_bs', field: 'u_business_application_1', name: 'Twin', problem: 'ambiguous', rows: 1 },
        { file: 'ba_as_bs', field: 'u_business_service_1', name: 'Unknown service', problem: 'not-found', rows: 1 },
        { file: 'ba_as_sm', field: 'sm_u_product_standard', name: 'Nginx', problem: 'not-found', rows: 1 },
      ]),
    );
    expect(report.capabilityMismatches).toBe(1);
    expect(report.capabilityIssues).toEqual([]);

    const em = t.orm.em.fork();
    const crm = await em.findOneOrFail(TrmApplication, { snSysId: SYS.appCrm }, { populate: ['capability'] });
    expect(crm.capability?.name).toBe('Identity check');
    expect(crm.licenceCost).toBe('136.22');
    expect(crm.source.it_application_owner).toBe('Person Owner'); // every field kept
    expect((await em.findOneOrFail(TrmApplication, { snSysId: SYS.appHr })).capabilityMismatch).toBe(true);

    const audit = await em.findOneOrFail(AuditLog, { action: 'trm.sync.completed', resourceId: run.id });
    expect(audit.actorUserId).toBe(admin.id);
  });

  it('leaves unchanged records alone, updates changed ones and flags records missing from a complete export', async () => {
    const files = trmExports();
    files.business_application = files.business_application
      .filter((row) => row.sys_id !== SYS.appTwinB)
      .map((row) => (row.sys_id === SYS.appBilling ? { ...row, install_status: 'In Production' } : row));
    const run = await sync(admin, { business_application: files.business_application });
    expect(counts(run.report, 'applications')).toMatchObject({ received: 4, inserted: 0, updated: 1, unchanged: 3, nowMissing: 1 });
    expect(run.report.filesIncluded).toEqual(['business_application']);
    // Other record types were not part of this run: nothing flagged.
    expect(counts(run.report, 'services')).toMatchObject({ refreshed: false, nowMissing: 0 });

    const em = t.orm.em.fork();
    expect((await em.findOneOrFail(TrmApplication, { snSysId: SYS.appTwinB })).missingSince).toBeInstanceOf(Date);
    expect((await em.findOneOrFail(TrmApplication, { snSysId: SYS.appBilling })).installStatus).toBe('In Production');

    const back = await sync(admin, { business_application: trmExports().business_application });
    expect(counts(back.report, 'applications')).toMatchObject({ returned: 1, updated: 1 });
    expect((await t.orm.em.fork().findOneOrFail(TrmApplication, { snSysId: SYS.appTwinB })).missingSince).toBeNull();
  });

  it('lists runs newest first and shows one with its report', async () => {
    const list = await t.http().get('/api/v1/trm/sync-runs').set(admin.auth).expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(4);
    expect(list.body.items[0]).not.toHaveProperty('report');
    expect(list.body.items[0].startedBy.name).toContain('sync-admin');
    const one = await t.http().get(`/api/v1/trm/sync-runs/${list.body.items[0].id}`).set(admin.auth).expect(200);
    expect(one.body.report.filesIncluded).toEqual(['business_application']);
    await t.http().get('/api/v1/trm/sync-runs/00000000-0000-4000-8000-000000000000').set(admin.auth).expect(404);
  });
});

describe('TRM sync: refusals', () => {
  it('allows one receiving run at a time, only for the person who started it', async () => {
    const run = (await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
    expect(run).toMatchObject({ status: 'receiving', dryRun: false, received: {}, report: null });
    await t.http().post('/api/v1/trm/sync-runs').set(otherAdmin.auth).send({}).expect(409);
    const batch = { file: 'business_application', records: [{ sys_id: 'x' }] };
    await t.http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(otherAdmin.auth).send(batch).expect(403);
    await t.http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(otherAdmin.auth).send({ expected: {} }).expect(403);

    await t.http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(admin.auth).send(batch).expect(200);
    const short = await t.http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected: { business_application: 2 } }).expect(422);
    expect(short.body.detail).toContain('business_application (sent 2, received 1)');
    const other = await t.http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected: { ba_as_bs: 1 } }).expect(422);
    expect(other.body.detail).toContain('ba_as_bs (sent 1, received 0)');
    expect(other.body.detail).toContain('business_application (sent 0, received 1)');

    const abandoned = await t.http().post(`/api/v1/trm/sync-runs/${run.id}/abandon`).set(admin.auth).expect(200);
    expect(abandoned.body.status).toBe('abandoned');
    expect(await t.orm.em.fork().count(TrmSyncRecord, { run: run.id })).toBe(0);
    await t.http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(admin.auth).send(batch).expect(409);
    await t.http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected: {} }).expect(409);
    await t.http().post('/api/v1/trm/sync-runs/00000000-0000-4000-8000-000000000000/abandon').set(admin.auth).expect(404);
  });

  it('lets a new run start when the previous one has been idle for 2 hours', async () => {
    const stale = (await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
    await t.orm.em.fork().nativeUpdate(TrmSyncRun, { id: stale.id }, { updatedAt: new Date(Date.now() - 3 * 3600_000) });
    const fresh = await t.http().post('/api/v1/trm/sync-runs').set(otherAdmin.auth).send({}).expect(201);
    expect((await t.http().get(`/api/v1/trm/sync-runs/${stale.id}`).set(admin.auth).expect(200)).body).toMatchObject({ status: 'abandoned', error: 'No activity for 2 hours' });
    await t.http().post(`/api/v1/trm/sync-runs/${fresh.body.id}/abandon`).set(otherAdmin.auth).expect(200);
  });

  it('marks the run failed and changes nothing when applying it fails', async () => {
    const before = await t.orm.em.fork().findOneOrFail(TrmApplication, { snSysId: SYS.appCrm });
    const spy = vi.spyOn(t.app.get(TrmSyncService) as unknown as { apply: () => Promise<void> }, 'apply').mockRejectedValueOnce(new Error('database went away'));
    const run = (await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
    const records = trmExports().business_application.map((row) => ({ ...row, install_status: 'Retired' }));
    await t.http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(admin.auth).send({ file: 'business_application', records }).expect(200);
    await t.http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected: { business_application: 5 } }).expect(500);
    spy.mockRestore();
    expect((await t.http().get(`/api/v1/trm/sync-runs/${run.id}`).set(admin.auth).expect(200)).body).toMatchObject({ status: 'failed', error: 'The sync failed and nothing was changed.' });
    expect(await t.orm.em.fork().count(TrmSyncRecord, { run: run.id })).toBe(0);
    expect((await t.orm.em.fork().findOneOrFail(TrmApplication, { snSysId: SYS.appCrm })).installStatus).toBe(before.installStatus);
  });

  it('rejects malformed batches', async () => {
    const run = (await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
    const url = `/api/v1/trm/sync-runs/${run.id}/records`;
    await t.http().put(url).set(admin.auth).send({ file: 'unknown_export', records: [{}] }).expect(400);
    await t.http().put(url).set(admin.auth).send({ file: 'business_application', records: [] }).expect(400);
    await t.http().put(url).set(admin.auth).send({ file: 'business_application', records: Array.from({ length: 501 }, () => ({})) }).expect(400);
    await t.http().put(url).set(admin.auth).send({ file: 'business_application', records: [{ nested: { not: 'allowed' } }] }).expect(400);
    await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({ dryRun: 'yes' }).expect(400);
    await t.http().post(`/api/v1/trm/sync-runs/${run.id}/abandon`).set(admin.auth).expect(200);
  });
});

describe("TRM sync: the sanitised sample exports (test/fixtures/apm/), through the CLI", () => {
  it('loads every sample file and reports the names the sanitised samples cannot match', async () => {
    await resetTrm(t.orm);
    await t.app.listen(0, '127.0.0.1');
    const lines: string[] = [];
    const run = await runTrmSync(
      { dir: 'test/fixtures/apm', apiUrl: await t.app.getUrl(), apiKey: admin.token, dryRun: false },
      { fetch, listFiles: (dir) => readdir(dir), readFile: (path) => readFile(path, 'utf8'), log: (line) => lines.push(line) },
    );
    expect(run.status).toBe('completed');
    expect(lines[0]).toBe('Found 8 export(s) in test/fixtures/apm.');
    const report = run.report!;
    expect(counts(report, 'applications')).toMatchObject({ inserted: 20 });
    expect(counts(report, 'capabilities')).toMatchObject({ inserted: 20 });
    expect(counts(report, 'productStandards')).toMatchObject({ inserted: 20 });
    expect(counts(report, 'services')).toMatchObject({ inserted: 31 }); // 20 + 20, 9 shared
    expect(counts(report, 'softwareModels')).toMatchObject({ inserted: 8 });
    expect(counts(report, 'servers')).toMatchObject({ inserted: 18 });
    expect(report.capabilityIssues).toEqual([]);
    expect(report.unmatched.length).toBeGreaterThan(0);
    expect(report.skipped).toEqual([]);
  });
});
