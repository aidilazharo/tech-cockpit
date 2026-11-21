import type { ApprovalEventAction } from '../../approvals/domain/engine.js';

/** What the template's Version Control table lists. */
export const SAD_HISTORY_ACTIONS = ['started', 'submitted', 'resubmitted', 'withdrawn', 'info_requested', 'answered', 'approved', 'returned', 'version_approved'] as const;
export type SadHistoryAction = (typeof SAD_HISTORY_ACTIONS)[number];

export interface SadHistoryRow<Person> {
  action: SadHistoryAction;
  user: Person | null;
  /** The approval step a decision, question or answer was at. */
  step: string | null;
  comment: string | null;
  at: Date;
}

/** One event of one of the version's approvals (cancelled ones too). */
export interface SadApprovalEvent<Person> {
  action: ApprovalEventAction;
  actor: Person;
  step: string;
  comment: string | null;
  at: Date;
}

const ACTIONS: Record<ApprovalEventAction, SadHistoryAction> = {
  submitted: 'submitted',
  resubmitted: 'resubmitted',
  cancelled: 'withdrawn',
  info_requested: 'info_requested',
  answered: 'answered',
  approved: 'approved',
  returned: 'returned',
};
const AT_A_STEP = new Set<ApprovalEventAction>(['info_requested', 'answered', 'approved', 'returned']);

/** What happened to a version, in date order: started, every event of its approvals, then approved. */
export function versionHistory<Person>(started: { by: Person; at: Date }, events: SadApprovalEvent<Person>[], approvedAt: Date | null): SadHistoryRow<Person>[] {
  const rows: SadHistoryRow<Person>[] = [
    { action: 'started', user: started.by, step: null, comment: null, at: started.at },
    ...events.map((event) => ({ action: ACTIONS[event.action], user: event.actor, step: AT_A_STEP.has(event.action) ? event.step : null, comment: event.comment, at: event.at })),
  ];
  if (approvedAt) rows.push({ action: 'version_approved', user: null, step: null, comment: null, at: approvedAt });
  return rows.sort((a, b) => a.at.getTime() - b.at.getTime());
}
