import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApprovalWorkflowRegistry } from '../../src/modules/approvals/approval-workflow.registry.js';
import { ApprovalService } from '../../src/modules/approvals/approval.service.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let admin: Actor;
let approver: Actor;
let submitter: Actor;
let otherSubmitter: Actor;
let deptManager: Actor;
let keyAdmin: Actor;
let auditor: Actor;
let nobody: Actor;
let vendor: Actor;
let directory: Actor;
let vendorDirectory: Actor;
let plainApprover: Actor;
let approverRole: string;

const WF = `fa-${randomUUID().slice(0, 6)}`;

beforeAll(async () => {
  t = await createTestApp();
  t.app.get(ApprovalWorkflowRegistry).register({
    code: WF,
    name: 'Project closure (test)',
    contextSchema: z.object({ tco: z.number(), departmentId: z.uuid().nullable(), category: z.enum(['run', 'change']) }),
    approversSeeFinancials: false,
  });
  approverRole = await createRole(t.orm, ['approvals:task:act', 'approvals:instance:read'], {}, { canActForStaff: true });
  const submitterRole = await createRole(t.orm, ['approvals:instance:read']);
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'admin' });
  approver = await createActor(t.orm, [{ code: approverRole }], { label: 'approver' });
  submitter = await createActor(t.orm, [{ code: submitterRole }], { label: 'submitter' });
  otherSubmitter = await createActor(t.orm, [{ code: submitterRole }], { label: 'other' });
  deptManager = await createActor(t.orm, [{ code: await createRole(t.orm, ['access:department:manage']) }], { label: 'dept' });
  keyAdmin = await createActor(t.orm, [{ code: await createRole(t.orm, ['apikey:any:revoke']) }], { label: 'keys' });
  auditor = await createActor(t.orm, [{ code: await createRole(t.orm, ['audit:log:read']) }], { label: 'auditor' });
  nobody = await createActor(t.orm, [], { label: 'nobody' });
  vendor = await createActor(t.orm, [{ code: 'vendor' }], { isExternal: true, label: 'vendor' });
  directory = await createActor(t.orm, [{ code: await createRole(t.orm, ['people:directory:read']) }], { label: 'directory' });
  vendorDirectory = await createActor(t.orm, [{ code: await createRole(t.orm, ['people:directory:read']) }], { isExternal: true, label: 'vendor-directory' });
  plainApprover = await createActor(t.orm, [{ code: submitterRole }], { label: 'approver-plain' });

  const definition = {
    rules: [
      {
        key: 'all',
        name: 'All',
        priority: 1,
        when: null,
        steps: [{ key: 'review', name: 'Review', approvers: [{ kind: 'role', roleCode: approverRole, scope: 'global' }], quorum: 'any', reReview: 'rejecters' }],
      },
    ],
  };
  const draft = await t.http().post('/api/v1/approval-rule-sets').set(admin.auth).send({ workflowCode: WF, definition }).expect(201);
  await t.http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(admin.auth).expect(200);
});

afterAll(async () => {
  await t.close();
});

const submit = (by: Actor, title: string) =>
  t.app.get(ApprovalService).submit({
    workflowCode: WF,
    subjectType: 'project',
    subjectId: randomUUID(),
    subjectTitle: title,
    context: { tco: 1, departmentId: null, category: 'run' },
    scope: {},
    submittedBy: by.id,
  });

describe('Approval Centre API additions', () => {
  it('describes routing fields with types and offers approver roles for the rule screen', async () => {
    const workflows = await t.http().get('/api/v1/approval-workflows').set(admin.auth).expect(200);
    const options = await t.http().get('/api/v1/approval-rule-options').set(admin.auth).expect(200);

    expect(workflows.body.items.find((w: { code: string }) => w.code === WF).fields).toEqual([
      { path: 'tco', type: 'number', values: null },
      { path: 'departmentId', type: 'string', values: null },
      { path: 'category', type: 'enum', values: ['run', 'change'] },
    ]);
    expect(options.body.roles).toContainEqual({ code: 'system-admin', name: expect.any(String) });
    await t.http().get('/api/v1/approval-rule-options').set(nobody.auth).expect(403);
  });

  it('lists only my requests with mine=true, with the workflow name', async () => {
    const mine = await submit(submitter, 'Mine');
    await submit(otherSubmitter, 'Not mine');

    const res = await t.http().get('/api/v1/approval-instances').query({ mine: true }).set(submitter.auth).expect(200);

    expect(res.body.items.map((item: { id: string }) => item.id)).toEqual([mine]);
    expect(res.body.items[0]).toMatchObject({ subjectTitle: 'Mine', workflowName: 'Project closure (test)' });
  });

  it('shows the workflow name on tasks and the timeline', async () => {
    const id = await submit(submitter, 'Named');

    const tasks = await t.http().get('/api/v1/approval-tasks').set(approver.auth).expect(200);
    const view = await t.http().get(`/api/v1/approval-instances/${id}`).set(approver.auth).expect(200);

    expect(tasks.body.items.find((task: { instance: { id: string } }) => task.instance.id === id).instance.workflowName).toBe('Project closure (test)');
    expect(view.body.workflowName).toBe('Project closure (test)');
  });

  it('lists my decisions, newest first ("Done by me")', async () => {
    const first = await submit(submitter, 'Decided first');
    const second = await submit(submitter, 'Decided second');
    const taskOf = async (id: string) =>
      (await t.http().get('/api/v1/approval-tasks').set(approver.auth)).body.items.find((x: { instance: { id: string } }) => x.instance.id === id).taskId;
    await t.http().post(`/api/v1/approval-tasks/${await taskOf(first)}/approve`).set(approver.auth).send({ comment: 'Fine' }).expect(200);
    await t.http().post(`/api/v1/approval-tasks/${await taskOf(second)}/reject`).set(approver.auth).send({ comment: 'Not yet' }).expect(200);

    const res = await t.http().get('/api/v1/me/approval-decisions').set(approver.auth).expect(200);

    expect(res.body.items.slice(0, 2)).toMatchObject([
      { decision: 'rejected', comment: 'Not yet', stepName: 'Review', instance: { id: second, subjectTitle: 'Decided second', status: 'returned' } },
      { decision: 'approved', comment: 'Fine', instance: { id: first, status: 'approved', workflowName: 'Project closure (test)' } },
    ]);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    await t.http().get('/api/v1/me/approval-decisions').set(submitter.auth).expect(403);
  });
});

describe('Departments: rename and deactivate', () => {
  it('renames and deactivates a department, keeping the code, and lists inactive ones too', async () => {
    const code = `D${randomUUID().slice(0, 6)}`.toUpperCase();
    const created = await t.http().post('/api/v1/departments').set(deptManager.auth).send({ code, name: 'Old name' }).expect(201);

    const renamed = await t.http().patch(`/api/v1/departments/${created.body.id}`).set(deptManager.auth).send({ name: 'New name', version: created.body.version }).expect(200);
    const inactive = await t.http().patch(`/api/v1/departments/${created.body.id}`).set(deptManager.auth).send({ active: false, version: renamed.body.version }).expect(200);

    expect(inactive.body).toMatchObject({ code, name: 'New name', active: false });
    const list = await t.http().get('/api/v1/departments').set(nobody.auth).expect(200);
    expect(list.body.items).toContainEqual(expect.objectContaining({ id: created.body.id, active: false }));
  });

  it('refuses a stale version (409), a code change (400) and people without the permission (403)', async () => {
    const created = await t.http().post('/api/v1/departments').set(deptManager.auth).send({ code: `S${randomUUID().slice(0, 6)}`.toUpperCase(), name: 'S' }).expect(201);
    await t.http().patch(`/api/v1/departments/${created.body.id}`).set(deptManager.auth).send({ name: 'T', version: created.body.version }).expect(200);

    await t.http().patch(`/api/v1/departments/${created.body.id}`).set(deptManager.auth).send({ name: 'U', version: created.body.version }).expect(409);
    await t.http().patch(`/api/v1/departments/${created.body.id}`).set(deptManager.auth).send({ code: 'NEW', version: 2 }).expect(400);
    await t.http().patch(`/api/v1/departments/${created.body.id}`).set(nobody.auth).send({ name: 'V', version: 2 }).expect(403);
    await t.http().patch(`/api/v1/departments/${randomUUID()}`).set(deptManager.auth).send({ name: 'W', version: 1 }).expect(404);
  });
});

describe('GET /api/v1/people', () => {
  it('finds active people by name or email, with names and work emails only', async () => {
    const res = await t.http().get('/api/v1/people').query({ q: 'approver' }).set(directory.auth).expect(200);

    expect(res.body.items).toContainEqual({ id: approver.id, name: 'approver User', email: approver.email, isExternal: false });
    expect(Object.keys(res.body.items[0]).sort()).toEqual(['email', 'id', 'isExternal', 'name']);
  });

  it('looks people up by id and leaves out disabled users', async () => {
    const disabled = await createActor(t.orm, [], { label: 'gone', status: 'disabled' });

    const res = await t.http().get('/api/v1/people').query({ ids: `${approver.id},${disabled.id}` }).set(directory.auth).expect(200);

    expect(res.body.items.map((p: { id: string }) => p.id)).toEqual([approver.id]);
  });

  it('needs the staff-directory permission, for vendors and staff alike (P2)', async () => {
    await t.http().get('/api/v1/people').query({ q: 'approver' }).set(nobody.auth).expect(403);
    await t.http().get('/api/v1/people').query({ q: 'approver' }).set(vendor.auth).expect(403); // the seeded Vendor role
    await t.http().get('/api/v1/people').query({ q: 'approver' }).set(vendorDirectory.auth).expect(200);
  });

  it('narrows the search to people who can act for staff (delegates, roadmap owners)', async () => {
    const all = (await t.http().get('/api/v1/people').query({ q: 'approver' }).set(directory.auth).expect(200)).body.items.map((p: { id: string }) => p.id);
    expect(all).toEqual(expect.arrayContaining([approver.id, plainApprover.id]));
    const acting = (await t.http().get('/api/v1/people').query({ q: 'approver', actsForStaff: 'true' }).set(directory.auth).expect(200)).body.items.map((p: { id: string }) => p.id);
    expect(acting).toContain(approver.id);
    expect(acting).not.toContain(plainApprover.id);
  });

  it.each([
    ['no criteria', {}],
    ['a one-letter search', { q: 'a' }],
    ['a malformed id', { ids: 'not-a-uuid' }],
  ])('rejects %s (400)', async (_label, query) => {
    await t.http().get('/api/v1/people').query(query).set(directory.auth).expect(400);
  });
});

describe("A user's API keys (administrators)", () => {
  it("lists a user's keys without secrets, for people who may revoke any key", async () => {
    const res = await t.http().get(`/api/v1/users/${approver.id}/api-keys`).set(keyAdmin.auth).expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).not.toHaveProperty('token');
    expect(res.body.items[0]).not.toHaveProperty('secretHash');
    await t.http().post(`/api/v1/api-keys/${res.body.items[0].id}/revoke`).set(keyAdmin.auth).expect(200);
  });

  it('refuses others (403) and unknown users (404)', async () => {
    await t.http().get(`/api/v1/users/${approver.id}/api-keys`).set(nobody.auth).expect(403);
    await t.http().get(`/api/v1/users/${randomUUID()}/api-keys`).set(keyAdmin.auth).expect(404);
  });
});

describe('Audit log viewer additions', () => {
  it('names who acted and filters by their email', async () => {
    await t.http().get('/api/v1/me').set(otherSubmitter.auth).expect(200);

    const res = await t.http().get('/api/v1/audit-logs').query({ actorEmail: otherSubmitter.email.toUpperCase() }).set(auditor.auth).expect(200);

    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.items.every((entry: { actorUserId: string }) => entry.actorUserId === otherSubmitter.id)).toBe(true);
    expect(res.body.items[0].actor).toEqual({ id: otherSubmitter.id, name: 'other User', email: otherSubmitter.email });
  });

  it('returns nothing for an unknown email or a conflicting user id', async () => {
    const unknown = await t.http().get('/api/v1/audit-logs').query({ actorEmail: 'nobody@nowhere.test' }).set(auditor.auth).expect(200);
    const conflict = await t.http().get('/api/v1/audit-logs').query({ actorEmail: otherSubmitter.email, actorUserId: approver.id }).set(auditor.auth).expect(200);

    expect(unknown.body).toMatchObject({ items: [], total: 0 });
    expect(conflict.body).toMatchObject({ items: [], total: 0 });
  });

  it('shows system entries without a person', async () => {
    const res = await t.http().get('/api/v1/audit-logs').query({ action: 'approval.submitted', pageSize: 1 }).set(auditor.auth).expect(200);

    expect(res.body.items[0].actor).toBeNull();
  });

  it('lists the actions and resource types in the log, for the filters', async () => {
    const res = await t.http().get('/api/v1/audit-logs/facets').set(auditor.auth).expect(200);

    expect(res.body.actions).toEqual(expect.arrayContaining(['http.request', 'approval.submitted']));
    expect(res.body.resourceTypes).toContain('department');
    await t.http().get('/api/v1/audit-logs/facets').set(nobody.auth).expect(403);
  });

});
