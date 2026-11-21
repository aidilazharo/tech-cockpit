import { evaluateCondition } from './conditions.js';
import type { RuleDefinition, RuleSetDefinition } from './rule-set.schema.js';

/**
 * First conditional rule (by ascending priority) whose conditions match; otherwise the
 * fallback rule (when: null); otherwise null (submission must be refused).
 */
export function selectRule(ruleSet: RuleSetDefinition, context: Record<string, unknown>): RuleDefinition | null {
  const ordered = [...ruleSet.rules].sort((a, b) => a.priority - b.priority);
  const match = ordered.find((rule) => rule.when !== null && evaluateCondition(rule.when, context));
  return match ?? ordered.find((rule) => rule.when === null) ?? null;
}
