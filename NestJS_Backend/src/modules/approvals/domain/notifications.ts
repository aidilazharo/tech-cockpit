import type { NewNotification, NotificationParams, NotificationType } from '../../notifications/notification-types.js';
import type { InstanceStatus, TaskStatus } from './engine.js';

export interface TaskSnapshot {
  id: string;
  stepIndex: number;
  status: TaskStatus;
  assigneeId: string;
  originalAssigneeId: string | null;
  round: number;
  comment: string | null;
  response: string | null;
}

export interface InstanceSnapshot {
  id: string;
  status: InstanceStatus;
  submittedBy: string;
  subjectTitle: string;
  workflowName: string;
  stepNames: string[];
  tasks: TaskSnapshot[];
  /** Display names of the people involved, by user id. */
  names: Record<string, string>;
}

export interface ChangeInfo {
  /** Who caused the change (never notified about their own action); null for the system. */
  actorId: string | null;
  /** How a task moved to another approver, when it did. */
  reassignment?: { kind: 'reassigned' | 'escalated'; reason: string };
}

/**
 * The notifications an approval change causes (decided 2026-10-21): a task waiting for
 * someone, the outcome of a request, and questions and answers. Pure, so every case is
 * unit tested; `before` is null for a new submission.
 */
export function approvalNotifications(before: InstanceSnapshot | null, after: InstanceSnapshot, change: ChangeInfo): NewNotification[] {
  const link = `/approvals/${after.id}`;
  const base = { subjectTitle: after.subjectTitle, workflow: after.workflowName };
  const previous = new Map((before?.tasks ?? []).map((task) => [task.id, task]));
  const out: NewNotification[] = [];
  const add = (recipientId: string, type: NotificationType, params: NotificationParams) => {
    if (recipientId !== change.actorId) out.push({ recipientId, type, params: { ...base, ...params }, link });
  };

  // An approver has something to do.
  for (const task of after.tasks) {
    if (task.status !== 'pending') continue;
    const prev = previous.get(task.id);
    if (prev && prev.status === 'pending' && prev.assigneeId === task.assigneeId) continue;
    const step = after.stepNames[task.stepIndex];
    if (prev?.status === 'info_requested') {
      add(task.assigneeId, 'approval.task.info-answered', { step, answer: task.response });
    } else if (prev && prev.assigneeId !== task.assigneeId) {
      const kind = change.reassignment?.kind ?? 'reassigned';
      add(task.assigneeId, kind === 'escalated' ? 'approval.task.escalated' : 'approval.task.reassigned', {
        step,
        reason: change.reassignment?.reason ?? null,
      });
    } else if (!prev && after.tasks.some((t) => t.stepIndex === task.stepIndex && t.assigneeId === task.assigneeId && t.round < task.round)) {
      add(task.assigneeId, 'approval.task.review-again', { step, round: task.round });
    } else {
      const onBehalfOf = task.originalAssigneeId ? (after.names[task.originalAssigneeId] ?? null) : null;
      add(task.assigneeId, 'approval.task.assigned', { step, onBehalfOf });
    }
  }

  // The requester hears about the outcome and any questions.
  if (before?.status !== after.status) {
    const newly = (status: TaskStatus) => after.tasks.filter((task) => task.status === status && previous.get(task.id)?.status !== status);
    const by = (task: TaskSnapshot) => after.names[task.assigneeId] ?? null;
    if (after.status === 'approved') {
      add(after.submittedBy, 'approval.request.approved', {});
    } else if (after.status === 'returned') {
      const rejected = newly('rejected');
      add(after.submittedBy, 'approval.request.returned', {
        step: rejected[0] ? after.stepNames[rejected[0].stepIndex] : null,
        by: rejected.map(by).filter(Boolean).join(', ') || null,
        reason: rejected.map((task) => task.comment).filter(Boolean).join('\n') || null,
      });
    } else if (after.status === 'awaiting_info') {
      const asked = newly('info_requested')[0];
      add(after.submittedBy, 'approval.request.info-requested', {
        step: asked ? after.stepNames[asked.stepIndex] : null,
        by: asked ? by(asked) : null,
        question: asked?.comment ?? null,
      });
    } else if (after.status === 'cancelled') {
      add(after.submittedBy, 'approval.request.cancelled', {});
    }
  }
  return out;
}
