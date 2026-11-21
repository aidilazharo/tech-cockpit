import { describe, expect, it } from 'vitest'
import type { RuleSetDefinition, WorkflowField } from '../schemas'
import { groupDepth, isGroup, namedUsers, newCondition, newRule, newStep, quorumChoice, toDefinition, toEditable, uniqueKey, validate, type EditDefinition } from './rule-editing'

const fields: WorkflowField[] = [
  { path: 'tco', type: 'number', values: null },
  { path: 'category', type: 'enum', values: ['run', 'change'] },
  { path: 'urgent', type: 'boolean', values: null },
  { path: 'departmentId', type: 'string', values: null },
]

const USER = '00000000-0000-4000-8000-0000000000aa'

const saved: RuleSetDefinition = {
  rules: [
    {
      key: 'large',
      name: 'Large',
      priority: 10,
      when: {
        all: [
          { field: 'tco', op: 'gte', value: 250000 },
          { any: [{ field: 'category', op: 'in', value: ['run', 'change'] }, { field: 'urgent', op: 'eq', value: true }] },
          { field: 'departmentId', op: 'exists' },
        ],
      },
      steps: [
        {
          key: 'exco',
          name: 'EXCO',
          approvers: [{ kind: 'role', roleCode: 'tech-exco', scope: 'global' }, { kind: 'user', userId: USER }],
          quorum: { count: 2 },
          slaHours: 24,
          escalateTo: { kind: 'user', userId: USER },
          reReview: 'rejecters',
        },
      ],
    },
    { key: 'small', name: 'Small', priority: 20, when: { field: 'tco', op: 'lt', value: 250000 }, steps: [{ key: 's', name: 'S', approvers: [{ kind: 'role', roleCode: 'pmo', scope: 'subject' }], quorum: 'any', reReview: 'all' }] },
    { key: 'fallback', name: 'Fallback', priority: 30, when: null, steps: [{ key: 'f', name: 'F', approvers: [{ kind: 'role', roleCode: 'pmo', scope: 'global' }], quorum: 'all', reReview: 'rejecters' }] },
  ],
}

describe('rule editing round trip', () => {
  it('turns values into text for editing and back into typed values', () => {
    const editable = toEditable(saved)
    const top = editable.rules[0].when!

    expect(top.match).toBe('all')
    expect(top.items[0]).toEqual({ field: 'tco', op: 'gte', value: '250000' })
    expect(top.items[1]).toEqual({ match: 'any', items: [{ field: 'category', op: 'in', value: 'run, change' }, { field: 'urgent', op: 'eq', value: 'true' }] })
    expect(top.items[2]).toEqual({ field: 'departmentId', op: 'exists', value: '' })
    expect(toDefinition(editable, fields).rules[0]).toEqual(saved.rules[0])
  })

  it('wraps a single top condition in a group, and keeps the fallback rule', () => {
    const editable = toEditable(saved)

    expect(editable.rules[1].when).toEqual({ match: 'all', items: [{ field: 'tco', op: 'lt', value: '250000' }] })
    expect(toDefinition(editable, fields).rules[1].when).toEqual({ all: [{ field: 'tco', op: 'lt', value: 250000 }] })
    expect(editable.rules[2].when).toBeNull()
  })

  it('keeps text values for string and unknown fields', () => {
    const editable: EditDefinition = { rules: [{ ...toEditable(saved).rules[2], when: { match: 'any', items: [{ field: 'departmentId', op: 'neq', value: ' abc ' }, { field: 'other', op: 'eq', value: 'x' }] } }] }

    expect(toDefinition(editable, fields).rules[0].when).toEqual({ any: [{ field: 'departmentId', op: 'neq', value: 'abc' }, { field: 'other', op: 'eq', value: 'x' }] })
  })
})

describe('new parts', () => {
  it('makes unique kebab-case keys from names', () => {
    expect(uniqueKey('Tech EXCO review!', [], 'step-1')).toBe('tech-exco-review')
    expect(uniqueKey('Tech EXCO', ['tech-exco', 'tech-exco-2'], 'x')).toBe('tech-exco-3')
    expect(uniqueKey('123', [], 'step-4')).toBe('step-4')
  })

  it('adds a rule after the last priority with one empty step', () => {
    const rule = newRule(toEditable(saved).rules)

    expect(rule).toMatchObject({ key: 'rule-4', priority: 40, when: null, steps: [{ key: 'step-1', approvers: [], quorum: 'any', reReview: 'rejecters' }] })
    expect(newRule([]).priority).toBe(10)
    expect(newStep(['a', 'b']).key).toBe('step-3')
    expect(newCondition(fields)).toEqual({ field: 'tco', op: 'eq', value: '' })
    expect(newCondition([])).toEqual({ field: '', op: 'eq', value: '' })
  })

  it('describes quorum, named users and group depth', () => {
    const editable = toEditable(saved)

    expect(quorumChoice({ count: 3 })).toEqual({ choice: 'count', count: 3 })
    expect(quorumChoice('all')).toEqual({ choice: 'all', count: 2 })
    expect(namedUsers(editable)).toEqual([USER])
    expect(groupDepth(editable.rules[0].when!)).toBe(2)
    expect(isGroup(editable.rules[0].when!.items[1])).toBe(true)
  })
})

describe('validate', () => {
  it('accepts a complete definition', () => {
    expect(validate(toEditable(saved), fields)).toEqual({})
  })

  it('reports every missing or invalid part by its location', () => {
    const broken: EditDefinition = {
      rules: [
        {
          key: 'Bad Key',
          name: ' ',
          priority: 10.5,
          when: {
            match: 'all',
            items: [
              { field: 'nope', op: 'eq', value: '1' },
              { field: 'tco', op: 'gt', value: 'abc' },
              { field: 'category', op: 'in', value: ' , ' },
              { match: 'any', items: [] },
            ],
          },
          steps: [
            { key: 's', name: '', approvers: [], quorum: { count: 0 }, slaHours: 0, reReview: 'rejecters' },
            { key: 't', name: 'T', approvers: [{ kind: 'role', roleCode: '', scope: 'global' }, { kind: 'user', userId: '' }], quorum: 'any', escalateTo: { kind: 'role', roleCode: '', scope: 'global' }, reReview: 'all' },
          ],
        },
      ],
    }

    expect(validate(broken, fields)).toEqual({
      'rules.0.name': 'name',
      'rules.0.key': 'key',
      'rules.0.priority': 'priority',
      'rules.0.when.items.0.field': 'field',
      'rules.0.when.items.1.value': 'number',
      'rules.0.when.items.2.value': 'value',
      'rules.0.when.items.3': 'conditions',
      'rules.0.steps.0.name': 'name',
      'rules.0.steps.0.approvers': 'approvers',
      'rules.0.steps.0.quorum': 'count',
      'rules.0.steps.0.slaHours': 'sla',
      'rules.0.steps.1.approvers.0': 'role',
      'rules.0.steps.1.approvers.1': 'person',
      'rules.0.steps.1.escalateTo': 'role',
    })
  })
})
