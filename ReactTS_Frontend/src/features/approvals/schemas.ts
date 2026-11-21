import { z } from 'zod'

// Shapes of the approval API (Approval Centre, delegation, rule maintenance).
// contract.test.ts checks them against NestJS_Backend/openapi.json.

const isoDateTime = z.iso.datetime()

export const INSTANCE_STATUSES = ['in_progress', 'returned', 'awaiting_info', 'approved', 'cancelled'] as const
export type InstanceStatus = (typeof INSTANCE_STATUSES)[number]
export const TASK_STATUSES = ['pending', 'blocked', 'approved', 'rejected', 'info_requested', 'superseded'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]
export const RULE_SET_STATUSES = ['draft', 'published', 'retired'] as const
export const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'exists'] as const
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number]
export const FIELD_TYPES = ['number', 'string', 'boolean', 'enum', 'date', 'list', 'unknown'] as const
export type FieldType = (typeof FIELD_TYPES)[number]

export const PersonRefSchema = z.object({ id: z.uuid(), name: z.string() })
export type PersonRef = z.infer<typeof PersonRefSchema>

const InstanceSummary = z.object({
  id: z.uuid(),
  workflowCode: z.string(),
  workflowName: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  subjectTitle: z.string(),
  status: z.enum(INSTANCE_STATUSES),
  submittedBy: PersonRefSchema,
})

export const MyTaskSchema = z.object({
  taskId: z.uuid(),
  status: z.enum(TASK_STATUSES),
  stepKey: z.string(),
  stepName: z.string(),
  round: z.number().int(),
  createdAt: isoDateTime,
  instance: InstanceSummary,
})
export type MyTask = z.infer<typeof MyTaskSchema>
export const MyTaskListSchema = z.object({ items: z.array(MyTaskSchema) })

export const InstanceSchema = z.object({
  id: z.uuid(),
  workflowCode: z.string(),
  workflowName: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  subjectTitle: z.string(),
  status: z.enum(INSTANCE_STATUSES),
  round: z.number().int(),
  ruleKey: z.string(),
  submittedBy: PersonRefSchema,
  context: z.record(z.string(), z.unknown()),
  /** The submitter, or someone allowed to act for submitters: answers, resubmits and cancels */
  canActForSubmitter: z.boolean(),
  currentStep: z.object({ index: z.number().int(), key: z.string(), name: z.string() }).nullable(),
  steps: z.array(z.object({ index: z.number().int(), key: z.string(), name: z.string(), status: z.string() })),
  tasks: z.array(
    z.object({
      id: z.uuid(),
      stepKey: z.string(),
      round: z.number().int(),
      status: z.enum(TASK_STATUSES),
      assignee: PersonRefSchema,
      originalAssignee: PersonRefSchema.nullable(),
      comment: z.string().nullable(),
      response: z.string().nullable(),
      actedAt: isoDateTime.nullable(),
      reassignReason: z.string().nullable(),
    }),
  ),
  waitingOn: z.array(PersonRefSchema),
  createdAt: isoDateTime,
  completedAt: isoDateTime.nullable(),
})
export type Instance = z.infer<typeof InstanceSchema>
export type InstanceTask = Instance['tasks'][number]

export const InstanceListItemSchema = z.object({
  id: z.uuid(),
  workflowCode: z.string(),
  workflowName: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  subjectTitle: z.string(),
  status: z.enum(INSTANCE_STATUSES),
  currentStepKey: z.string().nullable(),
  submittedBy: PersonRefSchema,
  createdAt: isoDateTime,
})
export type InstanceListItem = z.infer<typeof InstanceListItemSchema>
export const InstancePageSchema = z.object({
  items: z.array(InstanceListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
})

export const DecisionSchema = z.object({
  taskId: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().nullable(),
  actedAt: isoDateTime,
  stepName: z.string(),
  round: z.number().int(),
  instance: z.object({
    id: z.uuid(),
    workflowCode: z.string(),
    workflowName: z.string(),
    subjectTitle: z.string(),
    status: z.enum(INSTANCE_STATUSES),
    submittedBy: PersonRefSchema,
  }),
})
export type Decision = z.infer<typeof DecisionSchema>
export const DecisionPageSchema = z.object({
  items: z.array(DecisionSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
})

export const DelegationSchema = z.object({
  id: z.uuid(),
  toUser: PersonRefSchema,
  startsAt: isoDateTime,
  endsAt: isoDateTime,
  reason: z.string().nullable(),
  cancelledAt: isoDateTime.nullable(),
})
export type Delegation = z.infer<typeof DelegationSchema>
export const DelegationListSchema = z.object({ items: z.array(DelegationSchema) })

// ----- Rule maintenance ----------------------------------------------------------

export const WorkflowSchema = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  contextFields: z.array(z.string()),
  fields: z.array(z.object({ path: z.string(), type: z.enum(FIELD_TYPES), values: z.array(z.string()).nullable() })),
  approversSeeFinancials: z.boolean(),
})
export type Workflow = z.infer<typeof WorkflowSchema>
export type WorkflowField = Workflow['fields'][number]
export const WorkflowListSchema = z.object({ items: z.array(WorkflowSchema) })

export const RuleOptionsSchema = z.object({ roles: z.array(z.object({ code: z.string(), name: z.string() })) })
export type RuleOptions = z.infer<typeof RuleOptionsSchema>

export type Condition = { field: string; op: ConditionOperator; value?: unknown } | { all: Condition[] } | { any: Condition[] }
export const ConditionSchema: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ field: z.string(), op: z.enum(CONDITION_OPERATORS), value: z.unknown().optional() }),
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
  ]),
)

export const ApproverSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role'), roleCode: z.string(), scope: z.enum(['global', 'subject']) }),
  z.object({ kind: z.literal('user'), userId: z.uuid() }),
])
export type ApproverSpec = z.infer<typeof ApproverSpecSchema>

export const QuorumSchema = z.union([z.enum(['any', 'all', 'onePerGroup']), z.object({ count: z.number().int() })])
export type Quorum = z.infer<typeof QuorumSchema>

export const StepSchema = z.object({
  key: z.string(),
  name: z.string(),
  approvers: z.array(ApproverSpecSchema),
  quorum: QuorumSchema,
  slaHours: z.number().int().optional(),
  escalateTo: ApproverSpecSchema.optional(),
  reReview: z.enum(['rejecters', 'all']),
  gate: z.object({ requiresApproved: z.string() }).optional(),
})
export type Step = z.infer<typeof StepSchema>

export const RuleSchema = z.object({
  key: z.string(),
  name: z.string(),
  priority: z.number().int(),
  when: ConditionSchema.nullable(),
  steps: z.array(StepSchema),
})
export type Rule = z.infer<typeof RuleSchema>

export const RuleSetDefinitionSchema = z.object({ rules: z.array(RuleSchema) })
export type RuleSetDefinition = z.infer<typeof RuleSetDefinitionSchema>

export const RuleSetSchema = z.object({
  id: z.uuid(),
  workflowCode: z.string(),
  ruleVersion: z.number().int(),
  status: z.enum(RULE_SET_STATUSES),
  definition: z.unknown(),
  publishedAt: isoDateTime.nullable(),
  publishedBy: z.uuid().nullable(),
  version: z.number().int(),
  createdAt: isoDateTime,
})
export type RuleSet = z.infer<typeof RuleSetSchema>
export const RuleSetListSchema = z.object({ items: z.array(RuleSetSchema) })

// ----- Requests ------------------------------------------------------------------

export const ApproveRequest = z.object({ comment: z.string().optional() })
export const CommentRequest = z.object({ comment: z.string() })
export const RespondInfoRequest = z.object({ answer: z.string() })
export const ReassignRequest = z.object({ toUserId: z.uuid(), reason: z.string() })
export const CreateDelegationRequest = z.object({ toUserId: z.uuid(), startsAt: isoDateTime, endsAt: isoDateTime, reason: z.string().optional() })
export const CreateDelegationForRequest = CreateDelegationRequest.extend({ fromUserId: z.uuid() })
export const UpdateWorkflowRequest = z.object({ approversSeeFinancials: z.boolean() })
export const WorkflowSettingSchema = z.object({ code: z.string(), approversSeeFinancials: z.boolean() })
export const CreateRuleSetRequest = z.object({ workflowCode: z.string(), definition: RuleSetDefinitionSchema })
export const UpdateRuleSetRequest = z.object({ definition: RuleSetDefinitionSchema, version: z.number().int() })
