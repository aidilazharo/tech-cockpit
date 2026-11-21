import { describe, expect, it } from 'vitest';
import {
  act,
  activateStep,
  ApprovalEngineError,
  cancel,
  newInstanceState,
  openGate,
  reassign,
  respondInfo,
  resubmit,
  type InstanceState,
  type ResolvedGroup,
} from './engine.js';
import type { StepDefinition } from './rule-set.schema.js';

const NOW = new Date('2026-10-21T08:00:00Z');
const SUBMITTER = 'submitter';

// One id sequence for the whole file so ids never collide across steps.
let counter = 0;
const nextId = () => `t${++counter}`;
const ids = () => nextId;

const single = (key: string, extra: Partial<StepDefinition> = {}): StepDefinition => ({
  key,
  name: key,
  approvers: [{ kind: 'role', roleCode: key, scope: 'global' }],
  quorum: 'any',
  reReview: 'rejecters',
  ...extra,
});

function groups(...userLists: string[][]): ResolvedGroup[] {
  return userLists.map((users, groupIndex) => ({
    groupIndex,
    assignees: users.map((userId) => ({ userId, originalUserId: null })),
  }));
}

function start(steps: StepDefinition[], first: ResolvedGroup[], gateOpen = true): InstanceState {
  return activateStep(newInstanceState(steps, SUBMITTER), 0, first, gateOpen, NOW, ids());
}

function pendingFor(state: InstanceState, userId: string) {
  return state.tasks.find((t) => t.assigneeId === userId && t.status === 'pending')!;
}

describe('activateStep', () => {
  it('creates one pending task per resolved approver for the current round', () => {
    const state = start([single('arb', { quorum: 'all' })], groups(['m1', 'm2', 'm3']));
    expect(state.status).toBe('in_progress');
    expect(state.tasks.map((t) => [t.assigneeId, t.status, t.round, t.stepIndex])).toEqual([
      ['m1', 'pending', 1, 0],
      ['m2', 'pending', 1, 0],
      ['m3', 'pending', 1, 0],
    ]);
  });

  it('does not duplicate a user listed twice in the same group', () => {
    const state = start([single('a')], groups(['u1', 'u1']));
    expect(state.tasks).toHaveLength(1);
  });

  it('records the original approver when a delegate receives the task', () => {
    const state = start([single('a')], [{ groupIndex: 0, assignees: [{ userId: 'delegate', originalUserId: 'away' }] }]);
    expect(state.tasks[0]).toMatchObject({ assigneeId: 'delegate', originalAssigneeId: 'away' });
  });

  it('creates blocked tasks when the step gate is closed (L12); their SLA clock has not started', () => {
    const state = start([single('final', { gate: { requiresApproved: 'arb-review' } })], groups(['exco']), false);
    expect(state.tasks[0]).toMatchObject({ status: 'blocked', activatedAt: null });
  });

  it('starts the SLA clock of pending tasks at activation', () => {
    const state = start([single('a')], groups(['u1']));
    expect(state.tasks[0].activatedAt).toEqual(NOW);
  });

  it('refuses a step whose approvers resolve to nobody, naming the step (L13)', () => {
    expect(() => start([single('finance-exco')], groups([]))).toThrow(/finance-exco/);
    try {
      start([single('finance-exco')], groups([]));
    } catch (error) {
      expect((error as ApprovalEngineError).code).toBe('no_approvers');
    }
  });
});

describe('act: approvals and quorum', () => {
  it('completes sequential steps and then the instance (L1)', () => {
    let state = start([single('lead'), single('exco')], groups(['lead1']));
    const first = act(state, { taskId: pendingFor(state, 'lead1').id, actorId: 'lead1', decision: 'approve' }, NOW);
    expect(first.outcome).toBe('step_completed');

    state = activateStep(first.state, 1, groups(['exco1']), true, NOW, ids());
    const second = act(state, { taskId: pendingFor(state, 'exco1').id, actorId: 'exco1', decision: 'approve' }, NOW);
    expect(second.outcome).toBe('approved');
    expect(second.state.status).toBe('approved');
  });

  it('"any": the first approval completes the step and supersedes the others (L2)', () => {
    const state = start([single('exco')], groups(['e1', 'e2', 'e3']));
    const result = act(state, { taskId: pendingFor(state, 'e2').id, actorId: 'e2', decision: 'approve' }, NOW);
    expect(result.outcome).toBe('approved');
    expect(result.state.tasks.map((t) => t.status)).toEqual(['superseded', 'approved', 'superseded']);
  });

  it('"all": the step completes only after every member approves (L3)', () => {
    let state = start([single('arb', { quorum: 'all' })], groups(['m1', 'm2']));
    let result = act(state, { taskId: pendingFor(state, 'm1').id, actorId: 'm1', decision: 'approve' }, NOW);
    expect(result.outcome).toBe('pending');
    state = result.state;
    result = act(state, { taskId: pendingFor(state, 'm2').id, actorId: 'm2', decision: 'approve' }, NOW);
    expect(result.outcome).toBe('approved');
  });

  it('"onePerGroup": needs one approval from each group (L4)', () => {
    let state = start(
      [single('joint', { approvers: [{ kind: 'role', roleCode: 'finance-exco', scope: 'global' }, { kind: 'role', roleCode: 'tech-exco', scope: 'global' }], quorum: 'onePerGroup' })],
      groups(['f1', 'f2'], ['t1']),
    );
    let result = act(state, { taskId: pendingFor(state, 'f1').id, actorId: 'f1', decision: 'approve' }, NOW);
    expect(result.outcome).toBe('pending');
    expect(result.state.tasks.find((t) => t.assigneeId === 'f2')!.status).toBe('superseded');
    state = result.state;
    result = act(state, { taskId: pendingFor(state, 't1').id, actorId: 't1', decision: 'approve' }, NOW);
    expect(result.outcome).toBe('approved');
  });

  it('"count": completes after n approvals', () => {
    let state = start([single('panel', { quorum: { count: 2 } })], groups(['p1', 'p2', 'p3']));
    state = act(state, { taskId: pendingFor(state, 'p1').id, actorId: 'p1', decision: 'approve' }, NOW).state;
    const result = act(state, { taskId: pendingFor(state, 'p3').id, actorId: 'p3', decision: 'approve' }, NOW);
    expect(result.outcome).toBe('approved');
    expect(result.state.tasks.find((t) => t.assigneeId === 'p2')!.status).toBe('superseded');
  });

  it('stamps the acting time and comment', () => {
    const state = start([single('a')], groups(['u1']));
    const result = act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'approve', comment: 'Fine' }, NOW);
    expect(result.state.tasks[0]).toMatchObject({ actedAt: NOW, comment: 'Fine' });
  });
});

describe('act: guards', () => {
  const state = start([single('a')], groups(['u1', 'u2']));

  it('rejects an actor who is not the assignee (L9)', () => {
    expect(() => act(state, { taskId: state.tasks[0].id, actorId: 'u2', decision: 'approve' }, NOW)).toThrow(
      expect.objectContaining({ code: 'not_assignee' }),
    );
  });

  it('rejects an unknown task', () => {
    expect(() => act(state, { taskId: 'nope', actorId: 'u1', decision: 'approve' }, NOW)).toThrow(
      expect.objectContaining({ code: 'task_not_found' }),
    );
  });

  it('rejects acting twice or on a superseded task (L10)', () => {
    const done = act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'approve' }, NOW).state;
    expect(() => act(done, { taskId: done.tasks[1].id, actorId: 'u2', decision: 'approve' }, NOW)).toThrow(
      expect.objectContaining({ code: 'instance_not_active' }),
    );
    const twoStep = start([single('a', { quorum: 'all' })], groups(['u1', 'u2']));
    const once = act(twoStep, { taskId: twoStep.tasks[0].id, actorId: 'u1', decision: 'approve' }, NOW).state;
    expect(() => act(once, { taskId: once.tasks[0].id, actorId: 'u1', decision: 'approve' }, NOW)).toThrow(
      expect.objectContaining({ code: 'task_not_pending' }),
    );
  });

  it('requires a comment to reject or request information (L5)', () => {
    expect(() => act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'reject' }, NOW)).toThrow(
      expect.objectContaining({ code: 'comment_required' }),
    );
    expect(() => act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'request_info', comment: '  ' }, NOW)).toThrow(
      expect.objectContaining({ code: 'comment_required' }),
    );
  });

  it('does not let a blocked task be acted on', () => {
    const gated = start([single('final', { gate: { requiresApproved: 'arb-review' } })], groups(['exco']), false);
    expect(() => act(gated, { taskId: gated.tasks[0].id, actorId: 'exco', decision: 'approve' }, NOW)).toThrow(
      expect.objectContaining({ code: 'task_not_pending' }),
    );
  });
});

describe('reject and resubmit', () => {
  it('returns the instance and resumes at the rejecting step, keeping earlier approvals (L6)', () => {
    let state = start([single('lead'), single('exco')], groups(['lead1']));
    state = act(state, { taskId: pendingFor(state, 'lead1').id, actorId: 'lead1', decision: 'approve' }, NOW).state;
    state = activateStep(state, 1, groups(['exco1']), true, NOW, ids());
    const rejected = act(state, { taskId: pendingFor(state, 'exco1').id, actorId: 'exco1', decision: 'reject', comment: 'Need costing' }, NOW);
    expect(rejected.outcome).toBe('returned');
    expect(rejected.state.status).toBe('returned');

    const again = resubmit(rejected.state, SUBMITTER, NOW, () => 'new-task');
    expect(again.status).toBe('in_progress');
    expect(again.currentStepIndex).toBe(1);
    expect(again.round).toBe(2);
    expect(again.tasks.find((t) => t.assigneeId === 'lead1')!.status).toBe('approved');
    expect(again.tasks.find((t) => t.id === 'new-task')).toMatchObject({ assigneeId: 'exco1', status: 'pending', round: 2 });
  });

  it('ARB: only the rejecting member re-reviews; other approvals stand (L7)', () => {
    let state = start([single('arb', { quorum: 'all', reReview: 'rejecters' })], groups(['m1', 'm2', 'm3']));
    state = act(state, { taskId: pendingFor(state, 'm1').id, actorId: 'm1', decision: 'approve' }, NOW).state;
    state = act(state, { taskId: pendingFor(state, 'm2').id, actorId: 'm2', decision: 'reject', comment: 'Add DR design' }, NOW).state;
    expect(() => act(state, { taskId: pendingFor(state, 'm3').id, actorId: 'm3', decision: 'approve' }, NOW)).toThrow(
      expect.objectContaining({ code: 'instance_not_active' }),
    );

    let n = 0;
    state = resubmit(state, SUBMITTER, NOW, () => `r${++n}`);
    expect(state.tasks.filter((t) => t.status === 'pending').map((t) => t.assigneeId).sort()).toEqual(['m2', 'm3']);
    expect(state.tasks.find((t) => t.assigneeId === 'm1')!.status).toBe('approved');

    state = act(state, { taskId: pendingFor(state, 'm2').id, actorId: 'm2', decision: 'approve' }, NOW).state;
    const done = act(state, { taskId: pendingFor(state, 'm3').id, actorId: 'm3', decision: 'approve' }, NOW);
    expect(done.outcome).toBe('approved');
  });

  it('reReview "all": every approver of the step reviews again', () => {
    let state = start([single('arb', { quorum: 'all', reReview: 'all' })], groups(['m1', 'm2']));
    state = act(state, { taskId: pendingFor(state, 'm1').id, actorId: 'm1', decision: 'approve' }, NOW).state;
    state = act(state, { taskId: pendingFor(state, 'm2').id, actorId: 'm2', decision: 'reject', comment: 'No' }, NOW).state;
    let n = 0;
    state = resubmit(state, SUBMITTER, NOW, () => `r${++n}`);
    expect(state.tasks.filter((t) => t.status === 'pending').map((t) => t.assigneeId).sort()).toEqual(['m1', 'm2']);
    expect(state.tasks.filter((t) => t.round === 1).every((t) => t.status === 'superseded')).toBe(true);
  });

  it('only the submitter can resubmit, and only a returned instance', () => {
    const state = start([single('a')], groups(['u1']));
    expect(() => resubmit(state, SUBMITTER, NOW, ids())).toThrow(expect.objectContaining({ code: 'invalid_state' }));
    const returned = act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'reject', comment: 'x' }, NOW).state;
    expect(() => resubmit(returned, 'someone-else', NOW, ids())).toThrow(expect.objectContaining({ code: 'not_submitter' }));
  });
});

describe('request information', () => {
  it('pauses the instance until the submitter responds, then the same task is pending again (L8)', () => {
    const state = start([single('a')], groups(['u1']));
    const asked = act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'request_info', comment: 'Which vendor?' }, NOW);
    expect(asked.outcome).toBe('awaiting_info');
    expect(asked.state.tasks[0].status).toBe('info_requested');

    expect(() => respondInfo(asked.state, 'u1', 'answer', NOW)).toThrow(expect.objectContaining({ code: 'not_submitter' }));
    expect(() => respondInfo(asked.state, SUBMITTER, ' ', NOW)).toThrow(expect.objectContaining({ code: 'comment_required' }));
    const answered = respondInfo(asked.state, SUBMITTER, 'Vendor X', NOW);
    expect(answered.status).toBe('in_progress');
    expect(answered.tasks[0]).toMatchObject({ status: 'pending', response: 'Vendor X' });
    expect(() => respondInfo(answered, SUBMITTER, 'again', NOW)).toThrow(expect.objectContaining({ code: 'invalid_state' }));
  });
});

describe('request information with several approvers', () => {
  it('only reopens the questioned task; approved tasks stay approved after cancel', () => {
    let state = start([single('arb', { quorum: 'all' })], groups(['m1', 'm2', 'm3']));
    state = act(state, { taskId: pendingFor(state, 'm1').id, actorId: 'm1', decision: 'approve' }, NOW).state;
    state = act(state, { taskId: pendingFor(state, 'm2').id, actorId: 'm2', decision: 'request_info', comment: 'Why?' }, NOW).state;
    state = respondInfo(state, SUBMITTER, 'Because', NOW);
    expect(state.tasks.map((t) => t.status)).toEqual(['approved', 'pending', 'pending']);
    const cancelled = cancel(state, SUBMITTER);
    expect(cancelled.tasks.map((t) => t.status)).toEqual(['approved', 'superseded', 'superseded']);
  });
});

describe('gates', () => {
  it('unblocks blocked tasks of the current step and starts their SLA clock (L12)', () => {
    const gated = start([single('final', { gate: { requiresApproved: 'arb-review' } })], groups(['exco']), false);
    const later = new Date(NOW.getTime() + 86_400_000);
    const opened = openGate(gated, later);
    expect(opened.tasks[0]).toMatchObject({ status: 'pending', activatedAt: later });
    expect(act(opened, { taskId: opened.tasks[0].id, actorId: 'exco', decision: 'approve' }, NOW).outcome).toBe('approved');
  });
});

describe('cancel', () => {
  it('lets the submitter cancel; open tasks are superseded (L11)', () => {
    const state = start([single('a', { quorum: 'all' })], groups(['u1', 'u2']));
    const cancelled = cancel(state, SUBMITTER);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.tasks.every((t) => t.status === 'superseded')).toBe(true);
  });

  it('refuses others and finished instances', () => {
    const state = start([single('a')], groups(['u1']));
    expect(() => cancel(state, 'u1')).toThrow(expect.objectContaining({ code: 'not_submitter' }));
    const approved = act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'approve' }, NOW).state;
    expect(() => cancel(approved, SUBMITTER)).toThrow(expect.objectContaining({ code: 'invalid_state' }));
  });
});

describe('reassign', () => {
  it('moves an open task to another user, keeps the original approver and restarts the SLA clock', () => {
    const state = start([single('a')], groups(['u1']));
    const later = new Date(NOW.getTime() + 3_600_000);
    const moved = reassign(state, state.tasks[0].id, 'u9', later);
    expect(moved.tasks[0]).toMatchObject({ assigneeId: 'u9', originalAssigneeId: 'u1', activatedAt: later });
    const movedAgain = reassign(moved, state.tasks[0].id, 'u10', later);
    expect(movedAgain.tasks[0]).toMatchObject({ assigneeId: 'u10', originalAssigneeId: 'u1' });
  });

  it('keeps a reassigned blocked task blocked, with no SLA clock', () => {
    const gated = start([single('final', { gate: { requiresApproved: 'arb-review' } })], groups(['exco']), false);
    expect(reassign(gated, gated.tasks[0].id, 'other', NOW).tasks[0]).toMatchObject({ status: 'blocked', activatedAt: null });
  });

  it('refuses to reassign a finished task or an unknown one', () => {
    const state = start([single('a')], groups(['u1']));
    const done = act(state, { taskId: state.tasks[0].id, actorId: 'u1', decision: 'approve' }, NOW).state;
    expect(() => reassign(done, done.tasks[0].id, 'u9', NOW)).toThrow(expect.objectContaining({ code: 'task_not_pending' }));
    expect(() => reassign(state, 'nope', 'u9', NOW)).toThrow(expect.objectContaining({ code: 'task_not_found' }));
  });
});
