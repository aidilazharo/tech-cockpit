import type { StepDefinition } from './rule-set.schema.js';

/**
 * Pure approval state machine. No I/O: the service resolves approvers, persists the
 * state, and calls back in (e.g. activateStep for the next step).
 */

export const TASK_STATUSES = ['pending', 'blocked', 'approved', 'rejected', 'info_requested', 'superseded'] as const;
/** What the event log keeps: actions by people, as they happened. */
export const APPROVAL_EVENT_ACTIONS = ['submitted', 'approved', 'returned', 'info_requested', 'answered', 'resubmitted', 'cancelled'] as const;
export type ApprovalEventAction = (typeof APPROVAL_EVENT_ACTIONS)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const INSTANCE_STATUSES = ['in_progress', 'returned', 'awaiting_info', 'approved', 'cancelled'] as const;
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number];

export interface TaskState {
  id: string;
  stepIndex: number;
  groupIndex: number;
  assigneeId: string;
  originalAssigneeId: string | null;
  status: TaskStatus;
  round: number;
  comment: string | null;
  response: string | null;
  actedAt: Date | null;
  /** When the task became actionable (pending). The SLA clock starts here. Null while blocked. */
  activatedAt: Date | null;
  createdAt: Date;
}

export interface InstanceState {
  status: InstanceStatus;
  currentStepIndex: number;
  round: number;
  steps: readonly StepDefinition[];
  tasks: TaskState[];
  submittedBy: string;
}

export interface Assignee {
  userId: string;
  /** Set when the task went to a delegate: the approver who is away. */
  originalUserId: string | null;
}

export interface ResolvedGroup {
  groupIndex: number;
  assignees: Assignee[];
}

export type Decision = 'approve' | 'reject' | 'request_info';
export type ActOutcome = 'pending' | 'step_completed' | 'approved' | 'returned' | 'awaiting_info';

export type EngineErrorCode =
  | 'no_approvers'
  | 'task_not_found'
  | 'task_not_pending'
  | 'not_assignee'
  | 'instance_not_active'
  | 'comment_required'
  | 'not_submitter'
  | 'invalid_state';

export class ApprovalEngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApprovalEngineError';
  }
}

const OPEN: ReadonlySet<TaskStatus> = new Set(['pending', 'blocked', 'info_requested']);

export function newInstanceState(steps: readonly StepDefinition[], submittedBy: string): InstanceState {
  return { status: 'in_progress', currentStepIndex: 0, round: 1, steps, tasks: [], submittedBy };
}

function findTask(state: InstanceState, taskId: string): TaskState {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) throw new ApprovalEngineError('task_not_found', 'Approval task not found');
  return task;
}

function requireComment(comment: string | undefined): string {
  if (!comment?.trim()) throw new ApprovalEngineError('comment_required', 'A comment is required');
  return comment.trim();
}

function requireSubmitter(state: InstanceState, actorId: string): void {
  if (actorId !== state.submittedBy) {
    throw new ApprovalEngineError('not_submitter', 'Only the submitter can do this');
  }
}

/** Creates the tasks of a step. Gate closed → tasks are created blocked. */
export function activateStep(
  state: InstanceState,
  stepIndex: number,
  groups: readonly ResolvedGroup[],
  gateOpen: boolean,
  now: Date,
  newId: () => string,
): InstanceState {
  const step = state.steps[stepIndex];
  const empty = groups.find((group) => group.assignees.length === 0);
  if (empty || groups.length === 0) {
    throw new ApprovalEngineError('no_approvers', `No approver could be found for step "${step.key}"`);
  }
  const tasks: TaskState[] = [];
  for (const group of groups) {
    const seen = new Set<string>();
    for (const assignee of group.assignees) {
      if (seen.has(assignee.userId)) continue;
      seen.add(assignee.userId);
      tasks.push({
        id: newId(),
        stepIndex,
        groupIndex: group.groupIndex,
        assigneeId: assignee.userId,
        originalAssigneeId: assignee.originalUserId,
        status: gateOpen ? 'pending' : 'blocked',
        round: state.round,
        comment: null,
        response: null,
        actedAt: null,
        activatedAt: gateOpen ? now : null,
        createdAt: now,
      });
    }
  }
  return { ...state, status: 'in_progress', currentStepIndex: stepIndex, tasks: [...state.tasks, ...tasks] };
}

function quorumMet(step: StepDefinition, tasks: readonly TaskState[]): boolean {
  const approved = tasks.filter((t) => t.status === 'approved');
  const quorum = step.quorum;
  if (quorum === 'any') return approved.length > 0;
  if (quorum === 'all') return tasks.every((t) => t.status === 'approved');
  if (quorum === 'onePerGroup') {
    const groups = new Set(tasks.map((t) => t.groupIndex));
    return [...groups].every((group) => approved.some((t) => t.groupIndex === group));
  }
  return approved.length >= quorum.count;
}

/** Tasks of the current step that still matter (not superseded). */
function stepTasks(state: InstanceState): TaskState[] {
  return state.tasks.filter((t) => t.stepIndex === state.currentStepIndex && t.status !== 'superseded');
}

/**
 * Tasks counted towards the quorum. While in progress, a rejected task always belongs
 * to an earlier round and has been replaced by a re-review task, so it is ignored.
 */
function quorumTasks(state: InstanceState): TaskState[] {
  return stepTasks(state).filter((t) => t.status !== 'rejected');
}

export function act(
  state: InstanceState,
  input: { taskId: string; actorId: string; decision: Decision; comment?: string },
  now: Date,
): { state: InstanceState; outcome: ActOutcome } {
  const task = findTask(state, input.taskId);
  if (state.status !== 'in_progress') {
    throw new ApprovalEngineError('instance_not_active', `The approval is ${state.status.replace('_', ' ')}`);
  }
  if (task.status !== 'pending') {
    throw new ApprovalEngineError('task_not_pending', `The task is ${task.status.replace('_', ' ')}`);
  }
  if (task.assigneeId !== input.actorId) {
    throw new ApprovalEngineError('not_assignee', 'Only the assigned approver can act on this task');
  }

  const update = (patch: Partial<TaskState>) =>
    state.tasks.map((t) => (t.id === task.id ? { ...t, ...patch, actedAt: now } : t));

  if (input.decision === 'reject') {
    const comment = requireComment(input.comment);
    return { state: { ...state, status: 'returned', tasks: update({ status: 'rejected', comment }) }, outcome: 'returned' };
  }
  if (input.decision === 'request_info') {
    const comment = requireComment(input.comment);
    return {
      state: { ...state, status: 'awaiting_info', tasks: update({ status: 'info_requested', comment }) },
      outcome: 'awaiting_info',
    };
  }

  let next: InstanceState = { ...state, tasks: update({ status: 'approved', comment: input.comment?.trim() || null }) };
  const step = next.steps[next.currentStepIndex];
  const approvedGroups = new Set(
    quorumTasks(next)
      .filter((t) => t.status === 'approved')
      .map((t) => t.groupIndex),
  );

  // onePerGroup: other open tasks in an already-satisfied group are no longer needed.
  if (step.quorum === 'onePerGroup') {
    next = {
      ...next,
      tasks: next.tasks.map((t) =>
        t.stepIndex === next.currentStepIndex && OPEN.has(t.status) && approvedGroups.has(t.groupIndex)
          ? { ...t, status: 'superseded' }
          : t,
      ),
    };
  }

  if (!quorumMet(step, quorumTasks(next))) {
    return { state: next, outcome: 'pending' };
  }

  next = {
    ...next,
    tasks: next.tasks.map((t) =>
      t.stepIndex === next.currentStepIndex && OPEN.has(t.status) ? { ...t, status: 'superseded' } : t,
    ),
  };
  if (next.currentStepIndex === next.steps.length - 1) {
    return { state: { ...next, status: 'approved' }, outcome: 'approved' };
  }
  return { state: next, outcome: 'step_completed' };
}

export function respondInfo(state: InstanceState, actorId: string, answer: string, now: Date): InstanceState {
  if (state.status !== 'awaiting_info') {
    throw new ApprovalEngineError('invalid_state', 'No question is waiting for an answer');
  }
  requireSubmitter(state, actorId);
  const response = requireComment(answer);
  return {
    ...state,
    status: 'in_progress',
    tasks: state.tasks.map((t) =>
      t.status === 'info_requested' ? { ...t, status: 'pending', response, actedAt: now } : t,
    ),
  };
}

/** Resumes at the rejecting step. reReview decides who reviews again. */
export function resubmit(state: InstanceState, actorId: string, now: Date, newId: () => string): InstanceState {
  if (state.status !== 'returned') {
    throw new ApprovalEngineError('invalid_state', 'Only a returned approval can be resubmitted');
  }
  requireSubmitter(state, actorId);
  const round = state.round + 1;
  const step = state.steps[state.currentStepIndex];
  const current = stepTasks(state);
  const reviewAgain = step.reReview === 'all' ? current : current.filter((t) => t.status === 'rejected');
  const redo = new Set(reviewAgain.map((t) => t.id));

  const tasks = state.tasks.map((t) =>
    step.reReview === 'all' && t.stepIndex === state.currentStepIndex && t.status !== 'superseded'
      ? { ...t, status: 'superseded' as const }
      : t,
  );
  const fresh: TaskState[] = state.tasks
    .filter((t) => redo.has(t.id))
    .map((t) => ({
      ...t,
      id: newId(),
      status: 'pending',
      round,
      comment: null,
      response: null,
      actedAt: null,
      activatedAt: now,
      createdAt: now,
    }));
  return { ...state, status: 'in_progress', round, tasks: [...tasks, ...fresh] };
}

export function cancel(state: InstanceState, actorId: string): InstanceState {
  requireSubmitter(state, actorId);
  if (state.status === 'approved' || state.status === 'cancelled') {
    throw new ApprovalEngineError('invalid_state', `The approval is already ${state.status}`);
  }
  return {
    ...state,
    status: 'cancelled',
    tasks: state.tasks.map((t) => (OPEN.has(t.status) ? { ...t, status: 'superseded' } : t)),
  };
}

/** Moves an open task to another approver, whose SLA clock starts now. */
export function reassign(state: InstanceState, taskId: string, newAssigneeId: string, now: Date): InstanceState {
  const task = findTask(state, taskId);
  if (!OPEN.has(task.status)) {
    throw new ApprovalEngineError('task_not_pending', `The task is ${task.status}`);
  }
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.id === taskId
        ? {
            ...t,
            assigneeId: newAssigneeId,
            originalAssigneeId: t.originalAssigneeId ?? t.assigneeId,
            activatedAt: t.status === 'blocked' ? null : now,
          }
        : t,
    ),
  };
}

/** The linked approval (e.g. ARB) was approved: blocked tasks become actionable now. */
export function openGate(state: InstanceState, now: Date): InstanceState {
  return {
    ...state,
    tasks: state.tasks.map((t) =>
      t.stepIndex === state.currentStepIndex && t.status === 'blocked' ? { ...t, status: 'pending', activatedAt: now } : t,
    ),
  };
}
