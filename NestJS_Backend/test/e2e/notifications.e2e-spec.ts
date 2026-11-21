import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApprovalTask } from '../../src/modules/approvals/approval.entities.js';
import { ApprovalEscalationService } from '../../src/modules/approvals/approval-escalation.service.js';
import { ApprovalWorkflowRegistry } from '../../src/modules/approvals/approval-workflow.registry.js';
import { ApprovalService } from '../../src/modules/approvals/approval.service.js';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { Notification } from '../../src/modules/notifications/notification.entity.js';
import { NotificationService } from '../../src/modules/notifications/notification.service.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let approvals: ApprovalService;
let admin: Actor;
let submitter: Actor;
let approverA: Actor;
let approverB: Actor;
let backup: Actor;
let financeHead: Actor;

const WF = `nt-${randomUUID().slice(0, 6)}`;
const HOUR = 3_600_000;

interface NotificationView {
  id: string;
  type: string;
  params: Record<string, unknown>;
  link: string | null;
  readAt: string | null;
}

async function inbox(actor: Actor, unread = false): Promise<{ items: NotificationView[]; unread: number; total: number }> {
  const res = await t.http().get('/api/v1/me/notifications').query({ unread, pageSize: 100 }).set(actor.auth).expect(200);
  return res.body;
}

async function latest(actor: Actor, instanceId: string): Promise<NotificationView | undefined> {
  return (await inbox(actor)).items.find((n) => n.link === `/approvals/${instanceId}`);
}

async function pendingTask(actor: Actor, instanceId: string): Promise<string> {
  const res = await t.http().get('/api/v1/approval-tasks').set(actor.auth).expect(200);
  return res.body.items.find((item: { instance: { id: string }; status: string }) => item.instance.id === instanceId && item.status === 'pending').taskId;
}

function submit(subjectTitle = 'CRM upgrade'): Promise<string> {
  return approvals.submit({
    workflowCode: WF,
    subjectType: 'business-case',
    subjectId: randomUUID(),
    subjectTitle,
    context: { tco: 100 },
    scope: {},
    submittedBy: submitter.id,
  });
}

beforeAll(async () => {
  t = await createTestApp();
  approvals = t.app.get(ApprovalService);
  t.app.get(ApprovalWorkflowRegistry).register({
    code: WF,
    name: 'Business case (notifications test)',
    contextSchema: z.object({ tco: z.number() }),
    approversSeeFinancials: false,
  });
  // Approver roles can act for staff, so they can be out-of-office delegates.
  const actRole = await createRole(t.orm, ['approvals:task:act', 'approvals:instance:read', 'approvals:delegation:manage'], {}, { canActForStaff: true });
  const reviewRole = await createRole(t.orm, ['approvals:task:act', 'approvals:instance:read', 'approvals:delegation:manage'], {}, { canActForStaff: true });
  const financeRole = await createRole(t.orm, ['approvals:task:act', 'approvals:instance:read'], {}, { canActForStaff: true });
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'admin' });
  submitter = await createActor(t.orm, [{ code: actRole }], { label: 'submitter' });
  approverA = await createActor(t.orm, [{ code: reviewRole }], { label: 'approver-a' });
  approverB = await createActor(t.orm, [{ code: reviewRole }], { label: 'approver-b' });
  backup = await createActor(t.orm, [{ code: actRole }], { label: 'backup' });
  financeHead = await createActor(t.orm, [{ code: financeRole }], { label: 'finance' });

  const definition = {
    rules: [
      {
        key: 'standard',
        name: 'Standard',
        priority: 1,
        when: null,
        steps: [
          { key: 'review', name: 'Architecture review', approvers: [{ kind: 'role', roleCode: reviewRole, scope: 'global' }], quorum: 'all', reReview: 'rejecters', slaHours: 8, escalateTo: { kind: 'user', userId: backup.id } },
          { key: 'finance', name: 'Finance sign-off', approvers: [{ kind: 'role', roleCode: financeRole, scope: 'global' }], quorum: 'any', reReview: 'rejecters' },
        ],
      },
    ],
  };
  const draft = await t.http().post('/api/v1/approval-rule-sets').set(admin.auth).send({ workflowCode: WF, definition }).expect(201);
  await t.http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(admin.auth).expect(200);
});

afterAll(async () => {
  await t.close();
});

describe('approval notifications', () => {
  it('follows a request from submission to approval', async () => {
    const id = await submit('CRM upgrade');

    expect(await latest(approverA, id)).toMatchObject({
      type: 'approval.task.assigned',
      params: { subjectTitle: 'CRM upgrade', workflow: 'Business case (notifications test)', step: 'Architecture review', onBehalfOf: null },
      readAt: null,
    });
    expect(await latest(approverB, id)).toMatchObject({ type: 'approval.task.assigned' });
    expect(await latest(financeHead, id)).toBeUndefined();

    // A asks a question; the submitter is told, then answers; A is told.
    await t.http().post(`/api/v1/approval-tasks/${await pendingTask(approverA, id)}/request-info`).set(approverA.auth).send({ comment: 'Which vendor?' }).expect(200);
    expect(await latest(submitter, id)).toMatchObject({
      type: 'approval.request.info-requested',
      params: { question: 'Which vendor?', step: 'Architecture review', by: 'approver-a User' },
    });
    await t.http().post(`/api/v1/approval-instances/${id}/respond-info`).set(submitter.auth).send({ answer: 'Vendor A' }).expect(200);
    expect(await latest(approverA, id)).toMatchObject({ type: 'approval.task.info-answered', params: { answer: 'Vendor A' } });

    // B rejects; the request returns to the submitter with the reason.
    await t.http().post(`/api/v1/approval-tasks/${await pendingTask(approverB, id)}/reject`).set(approverB.auth).send({ comment: 'TCO misses licences' }).expect(200);
    expect(await latest(submitter, id)).toMatchObject({ type: 'approval.request.returned', params: { reason: 'TCO misses licences', by: 'approver-b User' } });

    // Resubmitted: only the rejecter reviews again.
    const beforeResubmit = (await inbox(approverA)).total;
    await t.http().post(`/api/v1/approval-instances/${id}/resubmit`).set(submitter.auth).expect(200);
    expect(await latest(approverB, id)).toMatchObject({ type: 'approval.task.review-again', params: { round: 2 } });
    expect((await inbox(approverA)).total).toBe(beforeResubmit);

    // Both approve: finance is told; then finance approves and the submitter hears.
    await t.http().post(`/api/v1/approval-tasks/${await pendingTask(approverA, id)}/approve`).set(approverA.auth).send({}).expect(200);
    await t.http().post(`/api/v1/approval-tasks/${await pendingTask(approverB, id)}/approve`).set(approverB.auth).send({}).expect(200);
    expect(await latest(financeHead, id)).toMatchObject({ type: 'approval.task.assigned', params: { step: 'Finance sign-off' } });
    await t.http().post(`/api/v1/approval-tasks/${await pendingTask(financeHead, id)}/approve`).set(financeHead.auth).send({}).expect(200);
    expect(await latest(submitter, id)).toMatchObject({ type: 'approval.request.approved' });
  });

  it('never notifies people about their own actions', async () => {
    const id = await submit('Own actions');
    const before = (await inbox(submitter)).total;

    await t.http().post(`/api/v1/approval-instances/${id}/cancel`).set(submitter.auth).expect(200);

    expect((await inbox(submitter)).total).toBe(before);
  });

  it('tells a delegate on whose behalf they approve', async () => {
    const start = new Date(Date.now() - 60_000).toISOString();
    const end = new Date(Date.now() + 24 * HOUR).toISOString();
    const delegation = await t.http().post('/api/v1/me/delegations').set(approverA.auth).send({ toUserId: backup.id, startsAt: start, endsAt: end }).expect(201);

    const id = await submit('Delegated');

    expect(await latest(backup, id)).toMatchObject({ type: 'approval.task.assigned', params: { onBehalfOf: 'approver-a User' } });
    await t.http().post(`/api/v1/me/delegations/${delegation.body.id}/cancel`).set(approverA.auth).expect(200);
  });

  it('tells the new approver about a reassignment, with the reason', async () => {
    const id = await submit('Reassigned');
    const taskId = await pendingTask(approverA, id);

    await t.http().post(`/api/v1/approval-tasks/${taskId}/reassign`).set(admin.auth).send({ toUserId: backup.id, reason: 'A is on medical leave' }).expect(200);

    expect(await latest(backup, id)).toMatchObject({ type: 'approval.task.reassigned', params: { reason: 'A is on medical leave' } });
  });

  it('reminds an approver once at 75% of the SLA, then escalates when it passes', async () => {
    const id = await submit('SLA');
    const escalation = t.app.get(ApprovalEscalationService);
    const taskId = await pendingTask(approverB, id);
    const sixHoursAgo = new Date(Date.now() - 6 * HOUR - 60_000);
    await t.orm.em.fork().nativeUpdate(ApprovalTask, { instance: id }, { activatedAt: sixHoursAgo });

    expect(await escalation.remindDueSoon(new Date(Date.now() - 2 * HOUR))).toBe(0);
    expect(await escalation.remindDueSoon(new Date())).toBeGreaterThanOrEqual(2);
    expect(await escalation.remindDueSoon(new Date())).toBe(0);
    const reminder = await latest(approverB, id);
    expect(reminder).toMatchObject({ type: 'approval.task.sla-reminder', params: { step: 'Architecture review' } });
    expect(Date.parse(String(reminder?.params.dueAt))).toBe(sixHoursAgo.getTime() + 8 * HOUR);

    await escalation.escalateOverdue(new Date(Date.now() + 3 * HOUR));
    expect(await latest(backup, id)).toMatchObject({ type: 'approval.task.escalated' });
    const escalated = await t.orm.em.fork().findOneOrFail(ApprovalTask, taskId);
    expect(escalated.reminderSentAt).toBeNull();

    // Escalated tasks are never escalated again, so they get no further reminder.
    await escalation.remindDueSoon(new Date(Date.now() + 100 * HOUR));
    expect(await latest(backup, id)).toMatchObject({ type: 'approval.task.escalated' });
  });

  it('sends no reminder for a step without an SLA', async () => {
    const id = await submit('No SLA on finance');
    await t.http().post(`/api/v1/approval-tasks/${await pendingTask(approverA, id)}/approve`).set(approverA.auth).send({}).expect(200);
    await t.http().post(`/api/v1/approval-tasks/${await pendingTask(approverB, id)}/approve`).set(approverB.auth).send({}).expect(200);

    await t.app.get(ApprovalEscalationService).remindDueSoon(new Date(Date.now() + 1000 * HOUR));

    expect(await latest(financeHead, id)).toMatchObject({ type: 'approval.task.assigned' });
  });
});

describe('GET /api/v1/me/notifications', () => {
  it('lists only your own notifications, newest first, with the unread count', async () => {
    const id = await submit('Inbox order');
    const mine = await inbox(approverA, true);

    expect(mine.unread).toBeGreaterThan(0);
    expect(mine.items.every((n) => n.readAt === null)).toBe(true);
    expect(mine.items[0].link).toBe(`/approvals/${id}`);
    const count = await t.http().get('/api/v1/me/notifications/unread-count').set(approverA.auth).expect(200);
    expect(count.body).toEqual({ unread: mine.unread });
  });

  it('marks one read, then all read', async () => {
    await submit('Mark read');
    const [first] = (await inbox(approverB, true)).items;

    const read = await t.http().post(`/api/v1/me/notifications/${first.id}/read`).set(approverB.auth).expect(200);
    expect(read.body.readAt).not.toBeNull();
    const again = await t.http().post(`/api/v1/me/notifications/${first.id}/read`).set(approverB.auth).expect(200);
    expect(again.body.readAt).toBe(read.body.readAt);

    const all = await t.http().post('/api/v1/me/notifications/read-all').set(approverB.auth).expect(200);
    expect(all.body.updated).toBeGreaterThanOrEqual(0);
    expect((await inbox(approverB, true)).items).toEqual([]);
    expect((await inbox(approverB)).unread).toBe(0);
  });

  it("cannot read or mark someone else's notification (404)", async () => {
    const [theirs] = (await inbox(approverA)).items;

    await t.http().post(`/api/v1/me/notifications/${theirs.id}/read`).set(approverB.auth).expect(404);
  });

  it('does not fill the audit log with badge polling, but records the list views', async () => {
    const em = t.orm.em.fork();
    const count = () => em.count(AuditLog, { actorUserId: financeHead.id, resourceType: 'notification' });
    const before = await count();

    await t.http().get('/api/v1/me/notifications/unread-count').set(financeHead.auth).expect(200);
    expect(await count()).toBe(before);
    await t.http().get('/api/v1/me/notifications').set(financeHead.auth).expect(200);
    expect(await count()).toBe(before + 1);
  });

  it('requires sign-in', async () => {
    await t.http().get('/api/v1/me/notifications/unread-count').expect(401);
  });

  it('deletes notifications after 90 days', async () => {
    const em = t.orm.em.fork();
    const old = em.create(Notification, {
      recipient: em.getReference((await import('../../src/modules/identity/user.entity.js')).User, approverA.id),
      type: 'approval.request.approved',
      params: {},
      link: null,
      createdAt: new Date(Date.now() - 91 * 24 * HOUR),
    });
    await em.flush();

    expect(await t.app.get(NotificationService).purgeOld()).toBeGreaterThanOrEqual(1);
    expect(await t.orm.em.fork().findOne(Notification, old.id)).toBeNull();
  });
});
