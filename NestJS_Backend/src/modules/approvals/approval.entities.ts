import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { User } from '../identity/user.entity.js';
import { APPROVAL_EVENT_ACTIONS, INSTANCE_STATUSES, TASK_STATUSES } from './domain/engine.js';
import type { RuleSetDefinition, StepDefinition } from './domain/rule-set.schema.js';

export const RULE_SET_STATUSES = ['draft', 'published', 'retired'] as const;
export type RuleSetStatus = (typeof RULE_SET_STATUSES)[number];

/** Versioned approval rules for one workflow type. One published version at a time. */
export const ApprovalRuleSetSchema = defineEntity({
  name: 'ApprovalRuleSet',
  tableName: 'approval_rule_set',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['workflowCode', 'ruleVersion'] }],
  properties: {
    ...baseProperties(),
    workflowCode: p.string().length(63).index(),
    ruleVersion: p.integer(),
    status: p.enum(RULE_SET_STATUSES).default('draft'),
    definition: p.json<RuleSetDefinition>(),
    publishedAt: p.datetime().nullable(),
    publishedBy: p.uuid().nullable(),
  },
});
export class ApprovalRuleSet extends ApprovalRuleSetSchema.class {}
ApprovalRuleSetSchema.setClass(ApprovalRuleSet);

/** One record going through approval. Keeps a snapshot of the steps it started with. */
export const ApprovalInstanceSchema = defineEntity({
  name: 'ApprovalInstance',
  tableName: 'approval_instance',
  schema: WILDCARD_SCHEMA,
  indexes: [{ properties: ['subjectType', 'subjectId'] }],
  properties: {
    ...baseProperties(),
    workflowCode: p.string().length(63).index(),
    subjectType: p.string().length(63),
    subjectId: p.string().length(100),
    subjectTitle: p.string().length(300),
    ruleSet: () => p.manyToOne(ApprovalRuleSet),
    ruleKey: p.string().length(63),
    steps: p.json<StepDefinition[]>(),
    /** Routing context (may contain classified values, masked on read). */
    context: p.json<Record<string, unknown>>(),
    status: p.enum(INSTANCE_STATUSES).index(),
    currentStepIndex: p.integer(),
    round: p.integer(),
    submittedBy: () => p.manyToOne(User).index(),
    departmentId: p.uuid().nullable(),
    portfolioId: p.uuid().nullable(),
    /** Every portfolio the record is in (e.g. an application in several): portfolio-scoped approvers and readers cover it through any of them */
    portfolioIds: p.array().default([]),
    streamId: p.uuid().nullable(),
    applicationId: p.uuid().nullable(),
    completedAt: p.datetime().nullable(),
  },
});
export class ApprovalInstance extends ApprovalInstanceSchema.class {}
ApprovalInstanceSchema.setClass(ApprovalInstance);

export const ApprovalTaskSchema = defineEntity({
  name: 'ApprovalTask',
  tableName: 'approval_task',
  schema: WILDCARD_SCHEMA,
  indexes: [{ properties: ['assignee', 'status'] }],
  properties: {
    ...baseProperties(),
    instance: () => p.manyToOne(ApprovalInstance).deleteRule('cascade').index(),
    stepIndex: p.integer(),
    stepKey: p.string().length(63),
    groupIndex: p.integer(),
    assignee: () => p.manyToOne(User),
    originalAssignee: () => p.manyToOne(User).nullable(),
    status: p.enum(TASK_STATUSES),
    round: p.integer(),
    comment: p.text().nullable(),
    response: p.text().nullable(),
    actedAt: p.datetime().nullable(),
    /** When the task became actionable; the SLA clock starts here (null while blocked). */
    activatedAt: p.datetime().nullable(),
    escalatedAt: p.datetime().nullable(),
    /** When the "75% of the SLA has passed" reminder was sent (cleared when the SLA restarts). */
    reminderSentAt: p.datetime().nullable(),
    reassignReason: p.string().length(500).nullable(),
  },
});
export class ApprovalTask extends ApprovalTaskSchema.class {}
ApprovalTaskSchema.setClass(ApprovalTask);

/** What happened to an approval, kept as it happened (tasks change as the approval moves on). Never updated. */
export const ApprovalEventSchema = defineEntity({
  name: 'ApprovalEvent',
  tableName: 'approval_event',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    instance: () => p.manyToOne(ApprovalInstance).deleteRule('cascade').index(),
    action: p.enum(APPROVAL_EVENT_ACTIONS),
    /** Who did it (the caller, also when acting for the submitter). */
    actor: () => p.manyToOne(User),
    /** The step the approval was at. */
    stepKey: p.string().length(63),
    round: p.integer(),
    /** The decision's comment, the question or the answer. */
    comment: p.text().nullable(),
    at: p.datetime(),
  },
});
export class ApprovalEvent extends ApprovalEventSchema.class {}
ApprovalEventSchema.setClass(ApprovalEvent);

/** Out-of-office: tasks created in the window go to the delegate. */
export const ApprovalDelegationSchema = defineEntity({
  name: 'ApprovalDelegation',
  tableName: 'approval_delegation',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    fromUser: () => p.manyToOne(User).index(),
    toUser: () => p.manyToOne(User),
    startsAt: p.datetime(),
    endsAt: p.datetime(),
    reason: p.string().length(500).nullable(),
    cancelledAt: p.datetime().nullable(),
  },
});
export class ApprovalDelegation extends ApprovalDelegationSchema.class {}
ApprovalDelegationSchema.setClass(ApprovalDelegation);

/** Settings of a workflow type that administrators change (defaults come from its registration). */
export const ApprovalWorkflowSettingSchema = defineEntity({
  name: 'ApprovalWorkflowSetting',
  tableName: 'approval_workflow_setting',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    workflowCode: p.string().length(63).unique(),
    /** May approvers see the financial data of what they approve? */
    approversSeeFinancials: p.boolean(),
  },
});
export class ApprovalWorkflowSetting extends ApprovalWorkflowSettingSchema.class {}
ApprovalWorkflowSettingSchema.setClass(ApprovalWorkflowSetting);
