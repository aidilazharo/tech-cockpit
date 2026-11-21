import { ME_ID } from '../../test/harness'
import type { Instance, MyTask, RuleSet, Workflow } from './schemas'

export const INSTANCE_ID = '70000000-0000-4000-8000-000000000001'
export const TASK_ID = '71000000-0000-4000-8000-000000000001'
export const ALI = { id: '72000000-0000-4000-8000-000000000001', name: 'Ali Approver' }
export const SAM = { id: '72000000-0000-4000-8000-000000000002', name: 'Sam Submitter' }
export const ME = { id: ME_ID, name: 'Ada Admin' }

export function instance(overrides: Partial<Instance> = {}): Instance {
  return {
    id: INSTANCE_ID,
    workflowCode: 'business-case',
    workflowName: 'Business case',
    subjectType: 'business-case',
    subjectId: 'bc-1',
    subjectTitle: 'CRM upgrade',
    status: 'in_progress',
    round: 1,
    ruleKey: 'standard',
    submittedBy: SAM,
    context: { tco: null, category: 'change' },
    canActForSubmitter: false,
    currentStep: { index: 0, key: 'review', name: 'Architecture review' },
    steps: [
      { index: 0, key: 'review', name: 'Architecture review', status: 'active' },
      { index: 1, key: 'finance', name: 'Finance sign-off', status: 'waiting' },
    ],
    tasks: [
      { id: TASK_ID, stepKey: 'review', round: 1, status: 'pending', assignee: ME, originalAssignee: null, comment: null, response: null, actedAt: null, reassignReason: null },
      { id: '71000000-0000-4000-8000-000000000002', stepKey: 'review', round: 1, status: 'pending', assignee: ALI, originalAssignee: null, comment: null, response: null, actedAt: null, reassignReason: null },
    ],
    waitingOn: [ME, ALI],
    createdAt: '2026-10-20T01:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

export function myTask(overrides: Partial<MyTask> = {}): MyTask {
  return {
    taskId: TASK_ID,
    status: 'pending',
    stepKey: 'review',
    stepName: 'Architecture review',
    round: 1,
    createdAt: '2026-10-20T01:00:00.000Z',
    instance: {
      id: INSTANCE_ID,
      workflowCode: 'business-case',
      workflowName: 'Business case',
      subjectType: 'business-case',
      subjectId: 'bc-1',
      subjectTitle: 'CRM upgrade',
      status: 'in_progress',
      submittedBy: SAM,
    },
    ...overrides,
  }
}

export const workflow: Workflow = {
  code: 'business-case',
  name: 'Business case',
  description: 'Investment approval',
  contextFields: ['tco', 'category'],
  fields: [
    { path: 'tco', type: 'number', values: null },
    { path: 'category', type: 'enum', values: ['run', 'change'] },
  ],
  approversSeeFinancials: true,
}

export const arbWorkflow: Workflow = { ...workflow, code: 'arb-review', name: 'ARB review', description: null, contextFields: [], fields: [], approversSeeFinancials: false }

export function ruleSet(overrides: Partial<RuleSet> = {}): RuleSet {
  return {
    id: '73000000-0000-4000-8000-000000000001',
    workflowCode: 'business-case',
    ruleVersion: 2,
    status: 'draft',
    definition: {
      rules: [
        {
          key: 'large',
          name: 'Large',
          priority: 10,
          when: { all: [{ field: 'tco', op: 'gte', value: 250000 }] },
          steps: [{ key: 'exco', name: 'EXCO', approvers: [{ kind: 'role', roleCode: 'tech-exco', scope: 'global' }], quorum: 'all', reReview: 'rejecters', slaHours: 24 }],
        },
      ],
    },
    publishedAt: null,
    publishedBy: null,
    version: 4,
    createdAt: '2026-10-20T01:00:00.000Z',
    ...overrides,
  }
}
