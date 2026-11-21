export const CONDITION_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'exists'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface Condition {
  field: string;
  op: ConditionOperator;
  value?: unknown;
}

export type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };
export type ConditionNode = Condition | ConditionGroup;

function isGroup(node: ConditionNode): node is ConditionGroup {
  return 'all' in node || 'any' in node;
}

/** Reads a dotted path using own properties only (no prototype walking). */
function read(context: Record<string, unknown>, path: string): unknown {
  let current: unknown = context;
  for (const part of path.split('.')) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function compare(op: ConditionOperator, actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    case 'notIn':
      return Array.isArray(expected) && !expected.includes(actual);
    default: {
      if (typeof actual !== 'number' || typeof expected !== 'number') return false;
      if (op === 'gt') return actual > expected;
      if (op === 'gte') return actual >= expected;
      if (op === 'lt') return actual < expected;
      return actual <= expected;
    }
  }
}

export function evaluateCondition(node: ConditionNode, context: Record<string, unknown>): boolean {
  if (isGroup(node)) {
    return 'all' in node
      ? node.all.every((child) => evaluateCondition(child, context))
      : node.any.some((child) => evaluateCondition(child, context));
  }
  return compare(node.op, read(context, node.field), node.value);
}

export function collectFields(node: ConditionNode): string[] {
  if (!isGroup(node)) {
    return [node.field];
  }
  const children = 'all' in node ? node.all : node.any;
  return [...new Set(children.flatMap(collectFields))];
}
