import { randomUUID } from 'node:crypto';
import { EntityManager } from '@mikro-orm/postgresql';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiKey } from '../../src/modules/api-keys/api-key.entity.js';
import { ApprovalInstance, ApprovalTask } from '../../src/modules/approvals/approval.entities.js';
import { ApprovalEscalationService } from '../../src/modules/approvals/approval-escalation.service.js';
import { ApprovalWorkflowRegistry } from '../../src/modules/approvals/approval-workflow.registry.js';
import { ApprovalService } from '../../src/modules/approvals/approval.service.js';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { AuthSession } from '../../src/modules/auth/auth.entities.js';
import { SamlRequestStore } from '../../src/modules/auth/saml-request.store.js';
import { SessionService } from '../../src/modules/auth/session.service.js';
import { RefusedSignIn } from '../../src/modules/identity/refused-sign-in.entity.js';
import { Notification } from '../../src/modules/notifications/notification.entity.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let admin: Actor;
const CODE = `edges-${randomUUID().slice(0, 6)}`;
const http = () => t.http();

beforeAll(async () => {
  t = await createTestApp();
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'edges-admin' });
  t.app.get(ApprovalWorkflowRegistry).register({ code: CODE, name: 'Edges', contextSchema: z.object({}), approversSeeFinancials: false });
});

afterAll(async () => {
  await t.close();
});

async function publish(steps: unknown[]) {
  const draft = await http().post('/api/v1/approval-rule-sets').set(admin.auth).send({ workflowCode: CODE, definition: { rules: [{ key: 'all', name: 'All', priority: 1, when: null, steps }] } }).expect(201);
  await http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(admin.auth).expect(200);
}

describe('platform edges', () => {
  it('revokes an API key once: a second revoke changes nothing', async () => {
    const owner = await createActor(t.orm, [], { label: 'key-owner' });
    const key = await t.orm.em.fork().findOneOrFail(ApiKey, { user: owner.id });
    const first = await http().post(`/api/v1/api-keys/${key.id}/revoke`).set(admin.auth).expect(200);
    const again = await http().post(`/api/v1/api-keys/${key.id}/revoke`).set(admin.auth).expect(200);
    expect(again.body.revokedAt).toBe(first.body.revokedAt);
    expect(await t.orm.em.fork().count(AuditLog, { action: 'api-key.revoked', resourceId: key.id })).toBe(1);
  });

  it('cancels a delegation once, lists every rule set without a filter, and records decisions without a comment', async () => {
    const base = ['approvals:task:act', 'approvals:instance:read', 'approvals:delegation:manage'];
    const approver = await createActor(t.orm, [{ code: await createRole(t.orm, base, {}, { canActForStaff: true }) }], { label: 'edges-approver' });
    const submitter = await createActor(t.orm, [{ code: await createRole(t.orm, base) }], { label: 'edges-submitter' });
    const window = { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString() };
    const delegation = await http().post('/api/v1/me/delegations').set(submitter.auth).send({ toUserId: approver.id, ...window }).expect(201);
    const cancelled = await http().post(`/api/v1/me/delegations/${delegation.body.id}/cancel`).set(submitter.auth).expect(200);
    expect((await http().post(`/api/v1/me/delegations/${delegation.body.id}/cancel`).set(submitter.auth).expect(200)).body.cancelledAt).toBe(cancelled.body.cancelledAt);

    expect((await http().get('/api/v1/approval-rule-sets').set(admin.auth).expect(200)).body.items.length).toBeGreaterThan(0);

    await publish([{ key: 's', name: 'Sign-off', approvers: [{ kind: 'user', userId: approver.id }], quorum: 'any', reReview: 'all' }]);
    const id = await t.app.get(ApprovalService).submit({ workflowCode: CODE, subjectType: 'edge', subjectId: randomUUID(), subjectTitle: 'Edge', context: {}, scope: {}, submittedBy: submitter.id });
    const task = (await http().get('/api/v1/approval-tasks').set(approver.auth).expect(200)).body.items.find((i: { instance: { id: string } }) => i.instance.id === id);
    await http().post(`/api/v1/approval-tasks/${task.taskId}/approve`).set(approver.auth).send({}).expect(200);
    const decisions = await http().get('/api/v1/me/approval-decisions').set(approver.auth).expect(200);
    expect(decisions.body.items[0]).toMatchObject({ decision: 'approved', comment: null });
  });

  it('names a step nobody could approve before submitting: a disabled named approver, or no rules at all', async () => {
    const approvals = t.app.get(ApprovalService);
    const gone = await createActor(t.orm, [], { status: 'disabled', label: 'edges-gone' });
    const NONE = `none-${randomUUID().slice(0, 6)}`;
    t.app.get(ApprovalWorkflowRegistry).register({ code: NONE, name: 'None', contextSchema: z.object({}), approversSeeFinancials: false });
    expect(await approvals.missingApproverStep({ workflowCode: NONE, context: {}, scope: {}, submittedBy: admin.id })).toBeNull();
    await publish([{ key: 'g', name: 'Gone approver', approvers: [{ kind: 'user', userId: gone.id }], quorum: 'any', reReview: 'all' }]);
    expect(await approvals.missingApproverStep({ workflowCode: CODE, context: {}, scope: {}, submittedBy: admin.id })).toEqual({ step: 'Gone approver', onlySubmitter: false });
  });

  it('finds subject-scoped approvers with a role everywhere', async () => {
    const SCOPED = `scoped-${randomUUID().slice(0, 6)}`;
    t.app.get(ApprovalWorkflowRegistry).register({ code: SCOPED, name: 'Scoped', contextSchema: z.object({}), approversSeeFinancials: false });
    const role = await createRole(t.orm, ['approvals:task:act']);
    await createActor(t.orm, [{ code: role }], { label: 'edges-everywhere' });
    const draft = await http().post('/api/v1/approval-rule-sets').set(admin.auth).send({ workflowCode: SCOPED, definition: { rules: [{ key: 'a', name: 'A', priority: 1, when: null, steps: [{ key: 's', name: 'Lead', approvers: [{ kind: 'role', roleCode: role, scope: 'subject' }], quorum: 'any', reReview: 'all' }] }] } }).expect(201);
    await http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(admin.auth).expect(200);
    expect(await t.app.get(ApprovalService).missingApproverStep({ workflowCode: SCOPED, context: {}, scope: { portfolioId: randomUUID() }, submittedBy: admin.id })).toBeNull();
  });

  it('reminds approvers of an unregistered approval type by its code, and logs what the run did', async () => {
    const approver = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:task:act']) }], { label: 'edges-sla' });
    const OLD = `old-${randomUUID().slice(0, 6)}`;
    t.app.get(ApprovalWorkflowRegistry).register({ code: OLD, name: 'Old', contextSchema: z.object({}), approversSeeFinancials: false });
    const draft = await http().post('/api/v1/approval-rule-sets').set(admin.auth).send({ workflowCode: OLD, definition: { rules: [{ key: 'a', name: 'A', priority: 1, when: null, steps: [{ key: 's', name: 'Quick', approvers: [{ kind: 'user', userId: approver.id }], quorum: 'any', reReview: 'all', slaHours: 1 }] }] } }).expect(201);
    await http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(admin.auth).expect(200);
    const id = await t.app.get(ApprovalService).submit({ workflowCode: OLD, subjectType: 'edge', subjectId: randomUUID(), subjectTitle: 'Old type', context: {}, scope: {}, submittedBy: admin.id });
    // The type is no longer registered (e.g. a module was removed): reminders still go out, named by code.
    const em = t.orm.em.fork();
    await em.nativeUpdate(ApprovalInstance, { id }, { workflowCode: 'retired-type' });
    await em.nativeUpdate(ApprovalTask, { instance: id }, { activatedAt: new Date(Date.now() - 2 * 3600_000) });
    await t.app.get(ApprovalEscalationService).run();
    const reminder = await t.orm.em.fork().findOneOrFail(Notification, { recipient: approver.id, type: 'approval.task.sla-reminder' });
    expect(reminder.params).toMatchObject({ workflow: 'retired-type', step: 'Quick' });
    // Deciding it still tells the requester, again by code.
    const task = (await http().get('/api/v1/approval-tasks').set(approver.auth).expect(200)).body.items.find((i: { instance: { id: string } }) => i.instance.id === id);
    await http().post(`/api/v1/approval-tasks/${task.taskId}/approve`).set(approver.auth).send({}).expect(200);
    const outcome = await t.orm.em.fork().findOneOrFail(Notification, { recipient: admin.id, type: 'approval.request.approved' }, { orderBy: { createdAt: 'desc' } });
    expect(outcome.params).toMatchObject({ workflow: 'retired-type' });
  });

  it('shows a notification without a link, and deletes notifications after 90 days', async () => {
    const reader = await createActor(t.orm, [], { label: 'edges-reader' });
    await t.app.get(NotificationService).send([{ recipientId: reader.id, type: 'approval.request.cancelled', params: { subjectTitle: 'X' }, link: null }]);
    const list = await http().get('/api/v1/me/notifications').set(reader.auth).expect(200);
    expect(list.body.items[0]).toMatchObject({ link: null });
    await t.orm.em.fork().nativeUpdate(Notification, { recipient: reader.id }, { createdAt: new Date(Date.now() - 91 * 24 * 3600_000) });
    expect(await t.app.get(NotificationService).purgeOld()).toBeGreaterThanOrEqual(1);
    expect(await t.app.get(NotificationService).purgeOld()).toBe(0);
  });

  it('lists a refused sign-in without an email, and finds people who can act for staff among given ids', async () => {
    const em = t.orm.em.fork();
    em.create(RefusedSignIn, { username: `no-mail-${randomUUID().slice(0, 6)}`, firstAttemptAt: new Date(), lastAttemptAt: new Date(Date.now() + 60_000) });
    await em.flush();
    expect((await http().get('/api/v1/refused-sign-ins').set(admin.auth).expect(200)).body.items[0]).toMatchObject({ email: null });

    const acting = await createActor(t.orm, [{ code: await createRole(t.orm, [], {}, { canActForStaff: true }) }], { label: 'edges-acting' });
    const plain = await createActor(t.orm, [], { label: 'edges-plain' });
    const people = await http().get('/api/v1/people').query({ ids: `${acting.id},${plain.id}`, actsForStaff: 'true' }).set(admin.auth).expect(200);
    expect(people.body.items.map((p: { id: string }) => p.id)).toEqual([acting.id]);
  });

  it('signs out by the refresh token when the access token is unreadable, and ignores an unknown one', async () => {
    const user = await createActor(t.orm, [], { label: 'edges-session' });
    const tokens = await t.app.get(SessionService).start(user.id, { ipAddress: null, userAgent: null });
    const row = await t.orm.em.fork().findOneOrFail(AuthSession, { id: tokens.sessionId });
    expect([row.ipAddress, row.userAgent]).toEqual([null, null]);
    const logout = (cookie: string) => http().post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', 'http://localhost:5173').expect(204);

    await logout(`tc_refresh=${'x'.repeat(43)}`);
    expect((await t.orm.em.fork().findOneOrFail(AuthSession, { id: tokens.sessionId })).revokedAt).toBeNull();
    await logout(`tc_access=not-a-token; tc_refresh=${tokens.refreshToken!}`);
    expect((await t.orm.em.fork().findOneOrFail(AuthSession, { id: tokens.sessionId })).revokeReason).toBe('logout');
  });

  it('refreshes within the grace period when a concurrent refresh rotated the token first', async () => {
    const user = await createActor(t.orm, [], { label: 'edges-race' });
    const sessions = t.app.get(SessionService);
    const tokens = await sessions.start(user.id, { ipAddress: '127.0.0.1', userAgent: 'test' });
    const race = vi.spyOn(EntityManager.prototype, 'nativeUpdate').mockResolvedValueOnce(0);
    const result = await sessions.refresh(tokens.refreshToken!);
    race.mockRestore();
    expect(result).toMatchObject({ outcome: 'refreshed', tokens: { sessionId: tokens.sessionId } });
    expect((result as { tokens: { refreshToken?: string } }).tokens.refreshToken).toBeUndefined();
  });

  it('answers a SAML request only once', async () => {
    const store = t.app.get(SamlRequestStore);
    const id = `_edge-${randomUUID()}`;
    await store.saveAsync(id, new Date().toISOString());
    await store.setReturnTo(id, '/trm');
    expect(await store.consume(id)).toBe('/trm');
    expect(await store.consume(id)).toBeNull();
  });
});
