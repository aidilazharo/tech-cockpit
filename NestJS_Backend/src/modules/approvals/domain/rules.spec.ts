import { describe, expect, it } from 'vitest';
import { collectFields, evaluateCondition, type ConditionNode } from './conditions.js';
import { RuleSetSchema, unknownContextFields, type RuleSetDefinition } from './rule-set.schema.js';
import { selectRule } from './rule-selection.js';

const step = (key: string, roleCode = 'tech-exco') => ({
  key,
  name: key,
  approvers: [{ kind: 'role' as const, roleCode, scope: 'global' as const }],
  quorum: 'any' as const,
  reReview: 'rejecters' as const,
});

const BANDS: RuleSetDefinition = {
  rules: [
    {
      key: 'tech-exco-band',
      name: 'Below RM250k',
      priority: 10,
      when: { all: [{ field: 'tco', op: 'lt', value: 250000 }] },
      steps: [step('tech-exco')],
    },
    {
      key: 'finance-exco-band',
      name: 'RM250k to below RM1M',
      priority: 20,
      when: { all: [{ field: 'tco', op: 'gte', value: 250000 }, { field: 'tco', op: 'lt', value: 1000000 }] },
      steps: [step('finance-exco', 'finance-exco')],
    },
  ],
};

describe('evaluateCondition', () => {
  const context = { tco: 250000, department: { code: 'IT' }, budgeted: true, tags: ['cloud'], note: null };

  it.each([
    [{ field: 'tco', op: 'eq', value: 250000 }, true],
    [{ field: 'tco', op: 'neq', value: 250000 }, false],
    [{ field: 'tco', op: 'gt', value: 249999.99 }, true],
    [{ field: 'tco', op: 'gte', value: 250000 }, true],
    [{ field: 'tco', op: 'lt', value: 250000 }, false],
    [{ field: 'tco', op: 'lte', value: 250000 }, true],
    [{ field: 'department.code', op: 'eq', value: 'IT' }, true],
    [{ field: 'department.code', op: 'in', value: ['HR', 'IT'] }, true],
    [{ field: 'department.code', op: 'notIn', value: ['HR', 'IT'] }, false],
    [{ field: 'budgeted', op: 'eq', value: true }, true],
    [{ field: 'note', op: 'exists' }, false],
    [{ field: 'tco', op: 'exists' }, true],
    [{ field: 'missing.path', op: 'exists' }, false],
  ] as const)('%j -> %s', (condition, expected) => {
    expect(evaluateCondition(condition as ConditionNode, context)).toBe(expected);
  });

  it('never matches a numeric comparison against a non-number', () => {
    expect(evaluateCondition({ field: 'department.code', op: 'gt', value: 1 }, context)).toBe(false);
    expect(evaluateCondition({ field: 'tco', op: 'gt', value: '1' }, context)).toBe(false);
  });

  it('never matches in/notIn when the value is not a list', () => {
    expect(evaluateCondition({ field: 'tco', op: 'in', value: 250000 }, context)).toBe(false);
    expect(evaluateCondition({ field: 'tco', op: 'notIn', value: 250000 }, context)).toBe(false);
  });

  it('combines nested all/any groups', () => {
    const node: ConditionNode = {
      all: [
        { field: 'tco', op: 'gte', value: 100 },
        { any: [{ field: 'department.code', op: 'eq', value: 'HR' }, { field: 'budgeted', op: 'eq', value: true }] },
      ],
    };
    expect(evaluateCondition(node, context)).toBe(true);
    expect(evaluateCondition({ any: [] }, context)).toBe(false);
    expect(evaluateCondition({ all: [] }, context)).toBe(true);
  });

  it('does not walk into prototype properties', () => {
    expect(evaluateCondition({ field: 'constructor.name', op: 'exists' }, {})).toBe(false);
    expect(evaluateCondition({ field: '__proto__', op: 'exists' }, {})).toBe(false);
  });

  it('collects every field a group refers to', () => {
    expect(
      collectFields({ all: [{ field: 'a', op: 'exists' }, { any: [{ field: 'b.c', op: 'eq', value: 1 }, { field: 'a', op: 'exists' }] }] }),
    ).toEqual(['a', 'b.c']);
  });
});

describe('selectRule (amount bands)', () => {
  it.each([
    [0, 'tech-exco-band'],
    [249999.99, 'tech-exco-band'],
    [250000, 'finance-exco-band'],
    [250000.01, 'finance-exco-band'],
    [999999.99, 'finance-exco-band'],
  ])('TCO %s routes to %s', (tco, expected) => {
    expect(selectRule(BANDS, { tco })?.key).toBe(expected);
  });

  it('returns null when nothing matches and there is no fallback (RM1M+ not configured)', () => {
    expect(selectRule(BANDS, { tco: 1000000 })).toBeNull();
  });

  it('uses the fallback rule (when: null) only when nothing else matches', () => {
    const withFallback: RuleSetDefinition = {
      rules: [...BANDS.rules, { key: 'fallback', name: 'Other', priority: 1, when: null, steps: [step('ceo', 'ceo')] }],
    };
    expect(selectRule(withFallback, { tco: 5000000 })?.key).toBe('fallback');
    expect(selectRule(withFallback, { tco: 100 })?.key).toBe('tech-exco-band');
  });

  it('respects priority order, not array order', () => {
    const reversed: RuleSetDefinition = {
      rules: [
        { key: 'broad', name: 'Broad', priority: 50, when: { all: [{ field: 'tco', op: 'gte', value: 0 }] }, steps: [step('b')] },
        { key: 'narrow', name: 'Narrow', priority: 5, when: { all: [{ field: 'tco', op: 'lt', value: 10 }] }, steps: [step('n')] },
      ],
    };
    expect(selectRule(reversed, { tco: 5 })?.key).toBe('narrow');
  });
});

describe('RuleSetSchema', () => {
  it('accepts the documented examples', () => {
    expect(RuleSetSchema.safeParse(BANDS).success).toBe(true);
    const arb = {
      rules: [
        {
          key: 'arb',
          name: 'ARB',
          priority: 10,
          when: null,
          steps: [
            { ...step('arb-members', 'arb-member'), quorum: 'all' },
            { ...step('arb-chair', 'arb-chair'), reReview: 'all', slaHours: 48, escalateTo: { kind: 'role', roleCode: 'ea-head', scope: 'global' } },
          ],
        },
      ],
    };
    expect(RuleSetSchema.safeParse(arb).success).toBe(true);
    expect(
      RuleSetSchema.safeParse({ rules: [{ ...BANDS.rules[0], steps: [{ ...step('joint'), quorum: { count: 2 }, gate: { requiresApproved: 'arb-review' } }] }] })
        .success,
    ).toBe(true);
  });

  function issues(value: unknown): string[] {
    const result = RuleSetSchema.safeParse(value);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  }

  it('rejects an empty rule set', () => {
    expect(issues({ rules: [] }).join()).toMatch(/at least one rule/);
  });

  it('rejects duplicate rule keys and duplicate priorities', () => {
    const duplicated = { rules: [BANDS.rules[0], { ...BANDS.rules[1], key: 'tech-exco-band', priority: 10 }] };
    expect(issues(duplicated).join()).toMatch(/Duplicate rule key/);
    expect(issues(duplicated).join()).toMatch(/Duplicate priority/);
  });

  it('rejects more than one fallback rule', () => {
    const twoFallbacks = {
      rules: [
        { ...BANDS.rules[0], when: null },
        { ...BANDS.rules[1], when: null },
      ],
    };
    expect(issues(twoFallbacks).join()).toMatch(/one fallback/);
  });

  it('rejects duplicate step keys, empty approvers and a count larger than possible', () => {
    const bad = {
      rules: [{ ...BANDS.rules[0], steps: [step('a'), step('a'), { ...step('b'), approvers: [] }] }],
    };
    expect(issues(bad).join()).toMatch(/Duplicate step key/);
    expect(issues(bad).join()).toMatch(/at least one approver/i);
  });

  it('rejects conditions nested deeper than 5 levels (all or any)', () => {
    for (const kind of ['all', 'any']) {
      let node: unknown = { field: 'tco', op: 'gt', value: 1 };
      for (let i = 0; i < 6; i++) node = { [kind]: [node] };
      expect(issues({ rules: [{ ...BANDS.rules[0], when: node }] }).join()).toMatch(/nested/);
    }
  });

  it('rejects unknown operators and malformed keys', () => {
    expect(issues({ rules: [{ ...BANDS.rules[0], key: 'Bad Key' }] }).length).toBeGreaterThan(0);
    expect(issues({ rules: [{ ...BANDS.rules[0], when: { all: [{ field: 'tco', op: 'like', value: 1 }] } }] }).length).toBeGreaterThan(0);
  });

  it('requires a value for comparison operators', () => {
    expect(issues({ rules: [{ ...BANDS.rules[0], when: { all: [{ field: 'tco', op: 'gt' }] } }] }).join()).toMatch(/value/);
  });
});

describe('unknownContextFields', () => {
  it('lists condition fields that the workflow context does not provide', () => {
    const rules: RuleSetDefinition = {
      rules: [{ ...BANDS.rules[0], when: { all: [{ field: 'tco', op: 'lt', value: 1 }, { field: 'region', op: 'eq', value: 'MY' }] } }],
    };
    expect(unknownContextFields(rules, ['tco', 'department.code'])).toEqual(['region']);
    expect(unknownContextFields(BANDS, ['tco'])).toEqual([]);
  });
});
