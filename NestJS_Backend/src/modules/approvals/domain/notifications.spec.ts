import { describe, expect, it } from 'vitest';
import { approvalNotifications, type InstanceSnapshot, type TaskSnapshot } from './notifications.js';

const SUBMITTER = 'u-submitter';
const ALI = 'u-ali';
const BEA = 'u-bea';
const CHE = 'u-che';

function task(overrides: Partial<TaskSnapshot> & { id: string }): TaskSnapshot {
  return { stepIndex: 0, status: 'pending', assigneeId: ALI, originalAssigneeId: null, round: 1, comment: null, response: null, ...overrides };
}

function snapshot(overrides: Partial<InstanceSnapshot> = {}): InstanceSnapshot {
  return {
    id: 'i-1',
    status: 'in_progress',
    submittedBy: SUBMITTER,
    subjectTitle: 'CRM upgrade',
    workflowName: 'Business case',
    stepNames: ['Tech EXCO', 'Finance EXCO'],
    tasks: [],
    names: { [SUBMITTER]: 'Sam Submitter', [ALI]: 'Ali Approver', [BEA]: 'Bea Backup', [CHE]: 'Che Chair' },
    ...overrides,
  };
}

const common = { subjectTitle: 'CRM upgrade', workflow: 'Business case' };
const link = '/approvals/i-1';

describe('approvalNotifications', () => {
  it('tells every approver of a new submission that a task is waiting', () => {
    const after = snapshot({ tasks: [task({ id: 't1' }), task({ id: 't2', assigneeId: BEA })] });

    expect(approvalNotifications(null, after, { actorId: SUBMITTER })).toEqual([
      { recipientId: ALI, type: 'approval.task.assigned', params: { ...common, step: 'Tech EXCO', onBehalfOf: null }, link },
      { recipientId: BEA, type: 'approval.task.assigned', params: { ...common, step: 'Tech EXCO', onBehalfOf: null }, link },
    ]);
  });

  it('says on whose behalf a delegate receives a task', () => {
    const after = snapshot({ tasks: [task({ id: 't1', assigneeId: BEA, originalAssigneeId: ALI })] });

    expect(approvalNotifications(null, after, { actorId: SUBMITTER })[0]).toMatchObject({
      recipientId: BEA,
      type: 'approval.task.assigned',
      params: { onBehalfOf: 'Ali Approver' },
    });
  });

  it('does not notify approvers whose task is only blocked behind a gate', () => {
    const after = snapshot({ tasks: [task({ id: 't1', status: 'blocked' })] });

    expect(approvalNotifications(null, after, { actorId: SUBMITTER })).toEqual([]);
  });

  it('notifies when a gate opens and a blocked task becomes actionable', () => {
    const before = snapshot({ tasks: [task({ id: 't1', status: 'blocked' })] });
    const after = snapshot({ tasks: [task({ id: 't1' })] });

    expect(approvalNotifications(before, after, { actorId: null })).toEqual([
      { recipientId: ALI, type: 'approval.task.assigned', params: { ...common, step: 'Tech EXCO', onBehalfOf: null }, link },
    ]);
  });

  it('notifies the next step when a step completes, and nobody about tasks already pending', () => {
    const before = snapshot({ tasks: [task({ id: 't1' }), task({ id: 't2', assigneeId: BEA })] });
    const after = snapshot({
      tasks: [task({ id: 't1', status: 'approved' }), task({ id: 't2', assigneeId: BEA }), task({ id: 't3', stepIndex: 1, assigneeId: CHE })],
    });

    expect(approvalNotifications(before, after, { actorId: ALI })).toEqual([
      { recipientId: CHE, type: 'approval.task.assigned', params: { ...common, step: 'Finance EXCO', onBehalfOf: null }, link },
    ]);
  });

  it('tells the requester the request is approved, but not the approver who just approved it', () => {
    const before = snapshot({ tasks: [task({ id: 't1' })] });
    const after = snapshot({ status: 'approved', tasks: [task({ id: 't1', status: 'approved' })] });

    expect(approvalNotifications(before, after, { actorId: ALI })).toEqual([
      { recipientId: SUBMITTER, type: 'approval.request.approved', params: common, link },
    ]);
  });

  it('returns the request with who rejected it and why', () => {
    const before = snapshot({ tasks: [task({ id: 't1' }), task({ id: 't2', assigneeId: BEA })] });
    const after = snapshot({ status: 'returned', tasks: [task({ id: 't1', status: 'rejected', comment: 'TCO is missing licences' }), task({ id: 't2', assigneeId: BEA })] });

    expect(approvalNotifications(before, after, { actorId: ALI })).toEqual([
      {
        recipientId: SUBMITTER,
        type: 'approval.request.returned',
        params: { ...common, step: 'Tech EXCO', by: 'Ali Approver', reason: 'TCO is missing licences' },
        link,
      },
    ]);
  });

  it('asks the requester the approver question, and tells the approver when it is answered', () => {
    const pending = snapshot({ tasks: [task({ id: 't1' })] });
    const asked = snapshot({ status: 'awaiting_info', tasks: [task({ id: 't1', status: 'info_requested', comment: 'Which vendor?' })] });
    const answered = snapshot({ tasks: [task({ id: 't1', status: 'pending', comment: 'Which vendor?', response: 'Vendor A' })] });

    expect(approvalNotifications(pending, asked, { actorId: ALI })).toEqual([
      {
        recipientId: SUBMITTER,
        type: 'approval.request.info-requested',
        params: { ...common, step: 'Tech EXCO', by: 'Ali Approver', question: 'Which vendor?' },
        link,
      },
    ]);
    expect(approvalNotifications(asked, answered, { actorId: SUBMITTER })).toEqual([
      { recipientId: ALI, type: 'approval.task.info-answered', params: { ...common, step: 'Tech EXCO', answer: 'Vendor A' }, link },
    ]);
  });

  it('asks only the rejecting reviewers to review again after a resubmission', () => {
    const returned = snapshot({ status: 'returned', tasks: [task({ id: 't1', status: 'rejected', comment: 'No' }), task({ id: 't2', assigneeId: BEA, status: 'approved' })] });
    const resubmitted = snapshot({
      tasks: [...returned.tasks, task({ id: 't3', round: 2 })],
    });

    expect(approvalNotifications(returned, resubmitted, { actorId: SUBMITTER })).toEqual([
      { recipientId: ALI, type: 'approval.task.review-again', params: { ...common, step: 'Tech EXCO', round: 2 }, link },
    ]);
  });

  it('treats a later step reached in round 2 as a first look, not a review again', () => {
    const before = snapshot({ tasks: [task({ id: 't1', round: 2 })] });
    const after = snapshot({ tasks: [task({ id: 't1', round: 2, status: 'approved' }), task({ id: 't2', stepIndex: 1, assigneeId: CHE, round: 2 })] });

    expect(approvalNotifications(before, after, { actorId: ALI })).toEqual([
      { recipientId: CHE, type: 'approval.task.assigned', params: { ...common, step: 'Finance EXCO', onBehalfOf: null }, link },
    ]);
  });

  it('tells the new approver about a reassignment or an escalation, with the reason', () => {
    const before = snapshot({ tasks: [task({ id: 't1' })] });
    const after = snapshot({ tasks: [task({ id: 't1', assigneeId: BEA, originalAssigneeId: ALI })] });

    expect(approvalNotifications(before, after, { actorId: CHE, reassignment: { kind: 'reassigned', reason: 'Ali on leave' } })[0]).toEqual({
      recipientId: BEA,
      type: 'approval.task.reassigned',
      params: { ...common, step: 'Tech EXCO', reason: 'Ali on leave' },
      link,
    });
    expect(approvalNotifications(before, after, { actorId: null, reassignment: { kind: 'escalated', reason: 'sla-escalation' } })[0]).toMatchObject({
      recipientId: BEA,
      type: 'approval.task.escalated',
    });
    expect(approvalNotifications(before, after, { actorId: CHE })[0]).toMatchObject({ type: 'approval.task.reassigned', params: { reason: null } });
  });

  it('tells the requester about a cancellation made by someone else, not their own', () => {
    const before = snapshot({ tasks: [task({ id: 't1' })] });
    const after = snapshot({ status: 'cancelled', tasks: [task({ id: 't1', status: 'superseded' })] });

    expect(approvalNotifications(before, after, { actorId: SUBMITTER })).toEqual([]);
    expect(approvalNotifications(before, after, { actorId: null })).toEqual([
      { recipientId: SUBMITTER, type: 'approval.request.cancelled', params: common, link },
    ]);
  });

  it('copes with missing names and steps', () => {
    const before = snapshot({ tasks: [task({ id: 't1', assigneeId: 'u-gone' })] });
    const returned = snapshot({ status: 'returned', names: {}, tasks: [task({ id: 't1', assigneeId: 'u-gone', status: 'rejected', comment: null })] });
    const asked = snapshot({ status: 'awaiting_info', tasks: [] });
    const delegated = snapshot({ names: {}, tasks: [task({ id: 't9', originalAssigneeId: 'u-gone' })] });

    expect(approvalNotifications(before, returned, { actorId: null })[0].params).toMatchObject({ by: null, reason: null });
    expect(approvalNotifications(before, asked, { actorId: null })[0].params).toMatchObject({ step: null, by: null, question: null });
    expect(approvalNotifications(null, delegated, { actorId: null })[0].params).toMatchObject({ onBehalfOf: null });
    expect(approvalNotifications(snapshot(), snapshot({ status: 'returned' }), { actorId: null })[0].params).toMatchObject({ step: null });
  });
});
