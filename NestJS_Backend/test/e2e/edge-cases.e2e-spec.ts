import { randomUUID } from 'node:crypto';
import { RequestContext } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Principal } from '../../src/modules/access/principal.js';
import { ApiKeyController } from '../../src/modules/api-keys/api-key.controller.js';
import { ApiKeyService } from '../../src/modules/api-keys/api-key.service.js';
import { ApprovalInstance, ApprovalRuleSet } from '../../src/modules/approvals/approval.entities.js';
import { ApprovalEscalationService } from '../../src/modules/approvals/approval-escalation.service.js';
import { ApprovalWorkflowRegistry } from '../../src/modules/approvals/approval-workflow.registry.js';
import { ApprovalService } from '../../src/modules/approvals/approval.service.js';
import { User } from '../../src/modules/identity/user.entity.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let admin: Actor;

beforeAll(async () => {
  t = await createTestApp();
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'admin' });
});

afterAll(async () => {
  await t.close();
});

function sessionPrincipal(actor: Actor): Principal {
  return new Principal(
    { id: actor.id, username: actor.username, email: actor.email, firstName: 'S', lastName: 'User', isExternal: false },
    [],
    { method: 'session' },
    false,
  );
}

describe('access control edge cases', () => {
  let manager: Actor;

  beforeAll(async () => {
    manager = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, [
            'access:role:read',
            'access:role:manage',
            'access:user:read',
            'access:user:manage',
            'access:assignment:read',
            'access:assignment:manage',
          ]),
        },
      ],
      { label: 'mgr' },
    );
  });

  it('blocks granting data access above your own (escalation)', async () => {
    await t.http().post('/api/v1/roles').set(manager.auth).send({ code: `fin-${randomUUID().slice(0, 6)}`, name: 'Fin', permissions: [], dataAccess: { financial: 'all' } }).expect(403);
  });

  it('updates a role description and clears it', async () => {
    const role = await t.http().post('/api/v1/roles').set(admin.auth).send({ code: `d-${randomUUID().slice(0, 6)}`, name: 'D', description: 'first', permissions: [], dataAccess: {} }).expect(201);
    const set = await t.http().patch(`/api/v1/roles/${role.body.id}`).set(admin.auth).send({ description: 'second', version: 1 }).expect(200);
    expect(set.body).toMatchObject({ description: 'second', name: 'D' });
    const cleared = await t.http().patch(`/api/v1/roles/${role.body.id}`).set(admin.auth).send({ description: null, version: 2 }).expect(200);
    expect(cleared.body.description).toBeNull();
  });

  it('lists users without a search term and 404s for an unknown user', async () => {
    const res = await t.http().get('/api/v1/users').set(manager.auth).expect(200);
    expect(res.body.total).toBeGreaterThan(0);
    await t.http().get(`/api/v1/users/${randomUUID()}`).set(manager.auth).expect(404);
  });

  it('creates a user in a department and edits names and department', async () => {
    const dept = await t.http().post('/api/v1/departments').set(admin.auth).send({ code: `HR${randomUUID().slice(0, 4)}`.toUpperCase(), name: 'HR' }).expect(201);
    const user = await t.http().post('/api/v1/users').set(manager.auth).send({ username: `d-${randomUUID().slice(0, 6)}`, email: 'd@aia.com', firstName: 'A', lastName: 'B', isExternal: false, departmentId: dept.body.id }).expect(201);
    expect(user.body.departmentId).toBe(dept.body.id);
    const edited = await t.http().patch(`/api/v1/users/${user.body.id}`).set(manager.auth).send({ firstName: 'Ahmad', lastName: 'Bakar', departmentId: null, version: 1 }).expect(200);
    expect(edited.body).toMatchObject({ firstName: 'Ahmad', lastName: 'Bakar', isExternal: false, departmentId: null });
    const moved = await t.http().patch(`/api/v1/users/${user.body.id}`).set(manager.auth).send({ departmentId: dept.body.id, version: 2 }).expect(200);
    expect(moved.body.departmentId).toBe(dept.body.id);
  });

  it('refuses to let users disable themselves or change their own roles', async () => {
    const me = await t.http().get(`/api/v1/users/${manager.id}`).set(manager.auth).expect(200);
    await t.http().patch(`/api/v1/users/${manager.id}`).set(manager.auth).send({ status: 'disabled', version: me.body.version }).expect(422);
    await t.http().post('/api/v1/role-assignments').set(manager.auth).send({ userId: manager.id, roleCode: 'vendor', scopeType: 'global' }).expect(403);
  });

  it('never lets anyone disable their own account, system administrators included; user managers disable and enable others', async () => {
    const manager = await createActor(t.orm, [{ code: await createRole(t.orm, ['access:user:read', 'access:user:manage']) }], { label: 'self-manager' });
    const me = await t.http().get(`/api/v1/users/${manager.id}`).set(manager.auth).expect(200);
    await t.http().patch(`/api/v1/users/${manager.id}`).set(manager.auth).send({ status: 'disabled', version: me.body.version }).expect(422);
    const self = await t.http().get(`/api/v1/users/${admin.id}`).set(admin.auth).expect(200);
    await t.http().patch(`/api/v1/users/${admin.id}`).set(admin.auth).send({ status: 'disabled', version: self.body.version }).expect(422);

    const other = await createActor(t.orm, [], { label: 'other-user' });
    const before = await t.http().get(`/api/v1/users/${other.id}`).set(manager.auth).expect(200);
    const disabled = await t.http().patch(`/api/v1/users/${other.id}`).set(manager.auth).send({ status: 'disabled', version: before.body.version }).expect(200);
    await t.http().patch(`/api/v1/users/${other.id}`).set(manager.auth).send({ status: 'active', version: disabled.body.version }).expect(200);
  });

  it('validates assignment periods and unknown roles', async () => {
    const target = await createActor(t.orm, []);
    await t.http().post('/api/v1/role-assignments').set(admin.auth).send({ userId: target.id, roleCode: 'vendor', scopeType: 'global', validFrom: '2026-02-01', validTo: '2026-01-01' }).expect(400);
    await t.http().post('/api/v1/role-assignments').set(admin.auth).send({ userId: target.id, roleCode: 'no-such-role', scopeType: 'global' }).expect(404);
    await t.http().get(`/api/v1/users/${randomUUID()}/role-assignments`).set(admin.auth).expect(404);
  });

  it('protects system-admin assignments from non-admins and is idempotent when ending twice', async () => {
    const holder = await createActor(t.orm, [{ code: 'system-admin' }]);
    const list = await t.http().get(`/api/v1/users/${holder.id}/role-assignments`).set(admin.auth).expect(200);
    const assignmentId = list.body.items[0].id;
    await t.http().post(`/api/v1/role-assignments/${assignmentId}/end`).set(manager.auth).expect(403);
    const ended = await t.http().post(`/api/v1/role-assignments/${assignmentId}/end`).set(admin.auth).expect(200);
    const again = await t.http().post(`/api/v1/role-assignments/${assignmentId}/end`).set(admin.auth).expect(200);
    expect(again.body.validTo).toBe(ended.body.validTo);
    await t.http().post(`/api/v1/role-assignments/${randomUUID()}/end`).set(admin.auth).expect(404);
  });
});

describe('API key creation (browser session only)', () => {
  it('creates a key for a session principal, enforcing the maximum lifetime and the active-key limit', async () => {
    const owner = await createActor(t.orm, [{ code: await createRole(t.orm, ['apikey:own:manage']) }]);
    const principal = sessionPrincipal(owner);
    // Service calls run inside a request context, as they do behind an HTTP request.
    await RequestContext.create(t.orm.em, async () => {
      const controller = t.app.get(ApiKeyController);
      const created = await controller.create(principal, { name: 'CLI', expiresInDays: 30 });
      expect(created.token).toMatch(/^tck_/);
      await t.http().get('/api/v1/me').set('Authorization', `Bearer ${created.token}`).expect(200);

      const keys = t.app.get(ApiKeyService);
      await expect(keys.create(principal, { name: 'too long', expiresInDays: 366 })).rejects.toThrow(/at most 90 days/);
      for (let i = 0; i < 8; i++) await keys.create(principal, { name: `k${i}`, expiresInDays: 1 });
      await expect(keys.create(principal, { name: 'eleventh', expiresInDays: 1 })).rejects.toThrow(/already have 10/);
    });
  });
});

describe('approval edge cases', () => {
  const CODE = `edge-${randomUUID().slice(0, 6)}`;
  const NO_RULES = `norules-${randomUUID().slice(0, 6)}`;
  const PORTFOLIO = randomUUID();
  let approvals: ApprovalService;
  let submitter: Actor;
  let namedApprover: Actor;
  let scopedLead: Actor;
  let otherLead: Actor;

  beforeAll(async () => {
    approvals = t.app.get(ApprovalService);
    const registry = t.app.get(ApprovalWorkflowRegistry);
    registry.register({
      code: CODE,
      name: 'Edge',
      contextSchema: z.object({ amount: z.number() }),
      contextClassification: { amount: 'financial' },
      approversSeeFinancials: true,
      onStatusChange: () => {
        throw new Error('subscriber failure must not break approvals');
      },
    });
    registry.register({ code: NO_RULES, name: 'No rules', contextSchema: z.object({}), approversSeeFinancials: false });

    const base = ['approvals:task:act', 'approvals:instance:read', 'approvals:delegation:manage'];
    submitter = await createActor(t.orm, [{ code: await createRole(t.orm, base) }], { label: 'sub' });
    namedApprover = await createActor(t.orm, [{ code: await createRole(t.orm, base) }], { label: 'named' });
    const leadRole = await createRole(t.orm, base);
    scopedLead = await createActor(t.orm, [{ code: leadRole, scopeType: 'portfolio', scopeId: PORTFOLIO }], { label: 'lead' });
    otherLead = await createActor(t.orm, [{ code: leadRole, scopeType: 'portfolio', scopeId: randomUUID() }], { label: 'lead2' });
    const nobodyRole = await createRole(t.orm, base);

    const draft = await t.http().post('/api/v1/approval-rule-sets').set(admin.auth).send({
      workflowCode: CODE,
      definition: {
        rules: [
          {
            key: 'all',
            name: 'All',
            priority: 1,
            when: null,
            steps: [
              { key: 'lead', name: 'Portfolio lead', approvers: [{ kind: 'role', roleCode: leadRole, scope: 'subject' }], quorum: 'any', reReview: 'rejecters', slaHours: 1, escalateTo: { kind: 'role', roleCode: nobodyRole } },
              { key: 'named', name: 'Named approver', approvers: [{ kind: 'user', userId: namedApprover.id }], quorum: 'any', reReview: 'rejecters' },
            ],
          },
        ],
      },
    }).expect(201);
    await t.http().get(`/api/v1/approval-rule-sets/${draft.body.id}`).set(admin.auth).expect(200);
    await t.http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(admin.auth).expect(200);
  });

  const submit = (subjectId = randomUUID()) =>
    approvals.submit({
      workflowCode: CODE,
      subjectType: 'edge',
      subjectId,
      subjectTitle: 'Edge case',
      context: { amount: 10 },
      scope: { portfolioId: PORTFOLIO, departmentId: randomUUID(), streamId: randomUUID(), applicationId: randomUUID() },
      submittedBy: submitter.id,
    });

  it('refuses submission when the workflow has no published rules', async () => {
    await expect(approvals.submit({ workflowCode: NO_RULES, subjectType: 'x', subjectId: '1', subjectTitle: 'x', context: {}, scope: {}, submittedBy: submitter.id })).rejects.toThrow(/No published approval rules/);
  });

  it('resolves subject-scoped and named-user approvers; a failing subscriber does not break approvals', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const id = await submit();
    const view = await t.http().get(`/api/v1/approval-instances/${id}`).set(submitter.auth).expect(200);
    expect(view.body.waitingOn.map((u: { id: string }) => u.id)).toEqual([scopedLead.id]);
    expect(view.body.steps.map((s: { status: string }) => s.status)).toEqual(['active', 'waiting']);
    const inbox = await t.http().get('/api/v1/approval-tasks').set(otherLead.auth).expect(200);
    expect(inbox.body.items.find((i: { instance: { id: string } }) => i.instance.id === id)).toBeUndefined();

    const lead = await t.http().get('/api/v1/approval-tasks').set(scopedLead.auth).expect(200);
    const task = lead.body.items.find((i: { instance: { id: string } }) => i.instance.id === id);
    expect(task.stepName).toBe('Portfolio lead');
    const next = await t.http().post(`/api/v1/approval-tasks/${task.taskId}/approve`).set(scopedLead.auth).send({}).expect(200);
    expect(next.body.waitingOn.map((u: { id: string }) => u.id)).toEqual([namedApprover.id]);
    log.mockRestore();
  });

  it('marks later steps cancelled when cancelled early and filters the instance list', async () => {
    const id = await submit();
    const cancelled = await t.http().post(`/api/v1/approval-instances/${id}/cancel`).set(submitter.auth).expect(200);
    expect(cancelled.body.steps.map((s: { status: string }) => s.status)).toEqual(['cancelled', 'cancelled']);
    const list = await t.http().get('/api/v1/approval-instances').query({ status: 'cancelled', workflowCode: CODE }).set(admin.auth).expect(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toContain(id);
    expect(list.body.items.every((i: { status: string; currentStepKey: string }) => i.status === 'cancelled')).toBe(true);
  });

  it('answers 404 / 409 for unknown or invalid approval operations', async () => {
    await t.http().get(`/api/v1/approval-instances/${randomUUID()}`).set(admin.auth).expect(404);
    await t.http().post(`/api/v1/approval-instances/${randomUUID()}/resubmit`).set(submitter.auth).expect(404);
    const id = await submit();
    await t.http().post(`/api/v1/approval-instances/${id}/resubmit`).set(submitter.auth).expect(409);
    await t.http().post(`/api/v1/approval-tasks/${randomUUID()}/reassign`).set(admin.auth).send({ toUserId: namedApprover.id, reason: 'none' }).expect(404);
    const lead = await t.http().get('/api/v1/approval-tasks').set(scopedLead.auth).expect(200);
    const task = lead.body.items.find((i: { instance: { id: string } }) => i.instance.id === id);
    await t.http().post(`/api/v1/approval-tasks/${task.taskId}/reassign`).set(admin.auth).send({ toUserId: randomUUID(), reason: 'nobody' }).expect(422);
    await t.http().get(`/api/v1/approval-rule-sets/${randomUUID()}`).set(admin.auth).expect(404);
  });

  it('does not escalate when no escalation approver exists, and the scheduled run is safe', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await submit();
    const escalation = t.app.get(ApprovalEscalationService);
    await expect(escalation.escalateOverdue(new Date(Date.now() + 2 * 3600_000))).resolves.toBe(0);
    await expect(escalation.run()).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('treats every context field of an unregistered workflow as financial (fail closed)', async () => {
    const em = t.orm.em.fork();
    const ruleSet = await em.findOneOrFail(ApprovalRuleSet, { workflowCode: CODE, status: 'published' });
    const orphan = em.create(ApprovalInstance, {
      workflowCode: 'retired-type',
      subjectType: 'x',
      subjectId: randomUUID(),
      subjectTitle: 'Orphan',
      ruleSet,
      ruleKey: 'all',
      steps: ruleSet.definition.rules[0].steps,
      context: { amount: 99 },
      status: 'in_progress',
      currentStepIndex: 0,
      round: 1,
      submittedBy: em.getReference(User, submitter.id),
    });
    await em.flush();
    const asSubmitter = await t.http().get(`/api/v1/approval-instances/${orphan.id}`).set(submitter.auth).expect(200);
    expect(asSubmitter.body.context.amount).toBeNull();
    const asAdmin = await t.http().get(`/api/v1/approval-instances/${orphan.id}`).set(admin.auth).expect(200);
    expect(asAdmin.body.context.amount).toBe(99);
  });

  it('validates delegations to unknown users and cancelling unknown delegations', async () => {
    const window = { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString() };
    await t.http().post('/api/v1/me/delegations').set(submitter.auth).send({ toUserId: randomUUID(), ...window }).expect(404);
    await t.http().post(`/api/v1/me/delegations/${randomUUID()}/cancel`).set(submitter.auth).expect(404);
  });

  it('keeps an approval without a gate untouched when a sibling approval completes', async () => {
    const subjectId = randomUUID();
    const first = await submit(subjectId);
    const SIB = `sib-${randomUUID().slice(0, 6)}`;
    t.app.get(ApprovalWorkflowRegistry).register({ code: SIB, name: 'Sibling', contextSchema: z.object({}), approversSeeFinancials: false });
    const draft = await t.http().post('/api/v1/approval-rule-sets').set(admin.auth).send({
      workflowCode: SIB,
      definition: { rules: [{ key: 'one', name: 'One', priority: 1, when: null, steps: [{ key: 's', name: 'S', approvers: [{ kind: 'user', userId: namedApprover.id }], quorum: 'any', reReview: 'all' }] }] },
    }).expect(201);
    await t.http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(admin.auth).expect(200);
    const sibling = await approvals.submit({ workflowCode: SIB, subjectType: 'edge', subjectId, subjectTitle: 'Sibling', context: {}, scope: {}, submittedBy: submitter.id });
    const tasks = await t.http().get('/api/v1/approval-tasks').set(namedApprover.auth).expect(200);
    const task = tasks.body.items.find((i: { instance: { id: string } }) => i.instance.id === sibling);
    await t.http().post(`/api/v1/approval-tasks/${task.taskId}/approve`).set(namedApprover.auth).send({}).expect(200);
    const view = await t.http().get(`/api/v1/approval-instances/${first}`).set(submitter.auth).expect(200);
    expect(view.body).toMatchObject({ status: 'in_progress', currentStep: { key: 'lead' } });
  });
});
