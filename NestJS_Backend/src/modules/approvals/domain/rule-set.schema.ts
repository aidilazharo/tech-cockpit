import { z } from 'zod';
import { collectFields, CONDITION_OPERATORS, type ConditionNode } from './conditions.js';

const key = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/, 'Use lowercase kebab-case');
const MAX_DEPTH = 5;

const ConditionSchema = z
  .object({ field: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$/), op: z.enum(CONDITION_OPERATORS), value: z.unknown().optional() })
  .strict()
  .refine((c) => c.op === 'exists' || c.value !== undefined, { message: 'A value is required for this operator' });

const ConditionNodeSchema: z.ZodType<ConditionNode> = z
  .lazy(() =>
    z.union([
      ConditionSchema,
      z.object({ all: z.array(ConditionNodeSchema) }).strict(),
      z.object({ any: z.array(ConditionNodeSchema) }).strict(),
    ]),
  )
  .meta({ id: 'ApprovalCondition', description: 'A condition, or all/any of nested conditions' }) as z.ZodType<ConditionNode>;

function depth(node: ConditionNode): number {
  if ('all' in node) return 1 + Math.max(0, ...node.all.map(depth));
  if ('any' in node) return 1 + Math.max(0, ...node.any.map(depth));
  return 0;
}

export const ApproverSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role'), roleCode: key, scope: z.enum(['global', 'subject']).default('global') }).strict(),
  z.object({ kind: z.literal('user'), userId: z.uuid() }).strict(),
]);
export type ApproverSpec = z.infer<typeof ApproverSpecSchema>;

export const QuorumSchema = z.union([
  z.enum(['any', 'all', 'onePerGroup']),
  z.object({ count: z.number().int().min(1).max(50) }).strict(),
]);
export type Quorum = z.infer<typeof QuorumSchema>;

export const StepDefinitionSchema = z
  .object({
    key,
    name: z.string().trim().min(1).max(100),
    approvers: z.array(ApproverSpecSchema).min(1, 'A step needs at least one approver'),
    quorum: QuorumSchema,
    slaHours: z.number().int().min(1).max(24 * 90).optional(),
    escalateTo: ApproverSpecSchema.optional(),
    reReview: z.enum(['rejecters', 'all']),
    gate: z.object({ requiresApproved: key }).strict().optional(),
  })
  .strict();
export type StepDefinition = z.infer<typeof StepDefinitionSchema>;

export const RuleDefinitionSchema = z
  .object({
    key,
    name: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10_000),
    when: ConditionNodeSchema.nullable(),
    steps: z.array(StepDefinitionSchema).min(1).max(20),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.when && depth(rule.when) > MAX_DEPTH) {
      ctx.addIssue({ code: 'custom', path: ['when'], message: `Conditions may be nested at most ${MAX_DEPTH} levels` });
    }
    const seen = new Set<string>();
    rule.steps.forEach((step, index) => {
      if (seen.has(step.key)) {
        ctx.addIssue({ code: 'custom', path: ['steps', index, 'key'], message: `Duplicate step key "${step.key}"` });
      }
      seen.add(step.key);
    });
  });
export type RuleDefinition = z.infer<typeof RuleDefinitionSchema>;

export const RuleSetSchema = z
  .object({ rules: z.array(RuleDefinitionSchema).min(1, 'A rule set needs at least one rule').max(100) })
  .strict()
  .superRefine((set, ctx) => {
    const keys = new Set<string>();
    const priorities = new Set<number>();
    set.rules.forEach((rule, index) => {
      if (keys.has(rule.key)) ctx.addIssue({ code: 'custom', path: ['rules', index, 'key'], message: `Duplicate rule key "${rule.key}"` });
      if (priorities.has(rule.priority)) {
        ctx.addIssue({ code: 'custom', path: ['rules', index, 'priority'], message: `Duplicate priority ${rule.priority}` });
      }
      keys.add(rule.key);
      priorities.add(rule.priority);
    });
    if (set.rules.filter((rule) => rule.when === null).length > 1) {
      ctx.addIssue({ code: 'custom', path: ['rules'], message: 'Only one fallback rule (when: null) is allowed' });
    }
  });
export type RuleSetDefinition = z.infer<typeof RuleSetSchema>;

/** Condition fields the workflow's routing context does not provide (publishing must fail). */
export function unknownContextFields(ruleSet: RuleSetDefinition, contextFields: readonly string[]): string[] {
  const allowed = new Set(contextFields);
  const used = ruleSet.rules.flatMap((rule) => (rule.when ? collectFields(rule.when) : []));
  return [...new Set(used)].filter((field) => !allowed.has(field));
}
