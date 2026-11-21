import { z } from 'zod';
import { PageQuerySchema, pageOf } from '../../common/http/pagination.js';
import { INSTANCE_STATUSES, TASK_STATUSES } from './domain/engine.js';
import { RuleSetSchema } from './domain/rule-set.schema.js';
import { RULE_SET_STATUSES } from './approval.entities.js';
import { CONTEXT_FIELD_TYPES } from './approval-workflow.registry.js';

const Person = z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'PersonRef' });

export const WorkflowListSchema = z.object({
  items: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      contextFields: z.array(z.string()),
      fields: z
        .array(z.object({ path: z.string(), type: z.enum(CONTEXT_FIELD_TYPES), values: z.array(z.string()).nullable() }))
        .describe('Routing fields with their types, for building conditions'),
      approversSeeFinancials: z.boolean(),
    }),
  ),
});

export const RuleOptionsSchema = z
  .object({ roles: z.array(z.object({ code: z.string(), name: z.string() })).describe('Roles that can be approvers') })
  .meta({ id: 'ApprovalRuleOptions' });

export const RuleSetDefinitionSchema = RuleSetSchema.meta({ id: 'ApprovalRuleSetDefinition' });

export const CreateRuleSetSchema = z
  .object({ workflowCode: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/), definition: RuleSetDefinitionSchema })
  .strict()
  .meta({ id: 'CreateApprovalRuleSet' });

export const UpdateRuleSetSchema = z
  .object({ definition: RuleSetDefinitionSchema, version: z.number().int().min(1) })
  .strict()
  .meta({ id: 'UpdateApprovalRuleSet' });

export const RuleSetSchemaOut = z
  .object({
    id: z.uuid(),
    workflowCode: z.string(),
    ruleVersion: z.number().int(),
    status: z.enum(RULE_SET_STATUSES),
    definition: z.unknown(),
    publishedAt: z.date().nullable(),
    publishedBy: z.uuid().nullable(),
    version: z.number().int(),
    createdAt: z.date(),
  })
  .meta({ id: 'ApprovalRuleSet' });

export const RuleSetQuerySchema = z.object({ workflowCode: z.string().max(63).optional() });

export const MyTaskListSchema = z.object({
  items: z.array(
    z.object({
      taskId: z.uuid(),
      status: z.enum(TASK_STATUSES),
      stepKey: z.string(),
      stepName: z.string(),
      round: z.number().int(),
      createdAt: z.date(),
      instance: z.object({
        id: z.uuid(),
        workflowCode: z.string(),
        workflowName: z.string(),
        subjectType: z.string(),
        subjectId: z.string(),
        subjectTitle: z.string(),
        status: z.enum(INSTANCE_STATUSES),
        submittedBy: Person,
      }),
    }),
  ),
});

export const InstanceViewSchema = z
  .object({
    id: z.uuid(),
    canActForSubmitter: z.boolean().describe('The caller may answer, resubmit or cancel (the submitter, or "Act for submitters" in scope)'),
    workflowCode: z.string(),
    workflowName: z.string(),
    subjectType: z.string(),
    subjectId: z.string(),
    subjectTitle: z.string(),
    status: z.enum(INSTANCE_STATUSES),
    round: z.number().int(),
    ruleKey: z.string(),
    submittedBy: Person,
    context: z.record(z.string(), z.unknown()).describe('Routing values; fields the caller may not see are null'),
    currentStep: z.object({ index: z.number().int(), key: z.string(), name: z.string() }).nullable(),
    steps: z.array(z.object({ index: z.number().int(), key: z.string(), name: z.string(), status: z.string() })),
    tasks: z.array(
      z.object({
        id: z.uuid(),
        stepKey: z.string(),
        round: z.number().int(),
        status: z.enum(TASK_STATUSES),
        assignee: Person,
        originalAssignee: Person.nullable(),
        comment: z.string().nullable(),
        response: z.string().nullable(),
        actedAt: z.date().nullable(),
        reassignReason: z.string().nullable(),
      }),
    ),
    waitingOn: z.array(Person).describe('Who the approval is waiting for right now'),
    createdAt: z.date(),
    completedAt: z.date().nullable(),
  })
  .meta({ id: 'ApprovalInstance' });

export const InstanceQuerySchema = PageQuerySchema.extend({
  status: z.enum(INSTANCE_STATUSES).optional(),
  workflowCode: z.string().max(63).optional(),
  mine: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true')
    .describe('Only approvals you submitted'),
});

export const InstancePageSchema = pageOf(
  z.object({
    id: z.uuid(),
    workflowCode: z.string(),
    workflowName: z.string(),
    subjectType: z.string(),
    subjectId: z.string(),
    subjectTitle: z.string(),
    status: z.enum(INSTANCE_STATUSES),
    currentStepKey: z.string().nullable(),
    submittedBy: Person,
    createdAt: z.date(),
  }),
);

export const DecisionPageSchema = pageOf(
  z.object({
    taskId: z.uuid(),
    decision: z.enum(['approved', 'rejected']),
    comment: z.string().nullable(),
    actedAt: z.date(),
    stepName: z.string(),
    round: z.number().int(),
    instance: z.object({
      id: z.uuid(),
      workflowCode: z.string(),
      workflowName: z.string(),
      subjectTitle: z.string(),
      status: z.enum(INSTANCE_STATUSES),
      submittedBy: Person,
    }),
  }),
).meta({ id: 'ApprovalDecisionPage' });

export const ApproveSchema = z.object({ comment: z.string().trim().max(2000).optional() }).strict().meta({ id: 'ApproveTask' });
export const CommentRequiredSchema = z.object({ comment: z.string().trim().min(1).max(2000) }).strict().meta({ id: 'TaskComment' });
export const RespondInfoSchema = z.object({ answer: z.string().trim().min(1).max(2000) }).strict().meta({ id: 'RespondInfo' });
export const ReassignSchema = z
  .object({ toUserId: z.uuid(), reason: z.string().trim().min(3).max(500) })
  .strict()
  .meta({ id: 'ReassignTask' });

export const CreateDelegationSchema = z
  .object({
    toUserId: z.uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => value.endsAt > value.startsAt, { path: ['endsAt'], message: 'Must be after startsAt' })
  .meta({ id: 'CreateDelegation' });

export const CreateDelegationForSchema = z
  .object({
    fromUserId: z.uuid().describe('Whose approvals are delegated'),
    toUserId: z.uuid(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((value) => value.endsAt > value.startsAt, { path: ['endsAt'], message: 'Must be after startsAt' })
  .meta({ id: 'CreateDelegationFor' });

export const DelegationQuerySchema = z.object({ userId: z.uuid().describe('Whose delegations') }).strict();

export const DelegationSchemaOut = z
  .object({
    id: z.uuid(),
    toUser: Person,
    startsAt: z.date(),
    endsAt: z.date(),
    reason: z.string().nullable(),
    cancelledAt: z.date().nullable(),
  })
  .meta({ id: 'ApprovalDelegation' });
