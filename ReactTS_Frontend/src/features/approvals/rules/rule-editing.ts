import type { ApproverSpec, Condition, ConditionOperator, Quorum, Rule, RuleSetDefinition, Step, WorkflowField } from '../schemas'

/** Nested groups allowed by the backend (all/any inside all/any...). */
export const MAX_GROUP_DEPTH = 5
const KEY = /^[a-z][a-z0-9-]{0,62}$/

// While editing, every condition value is text (what the input shows); `toDefinition`
// turns it back into numbers, yes/no and lists according to the field type.
export type EditCondition = { field: string; op: ConditionOperator; value: string } | EditGroup
export interface EditGroup {
  match: 'all' | 'any'
  items: EditCondition[]
}
export interface EditRule extends Omit<Rule, 'when'> {
  when: EditGroup | null
}
export interface EditDefinition {
  rules: EditRule[]
}

export const isGroup = (condition: EditCondition): condition is EditGroup => 'match' in condition

function valueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  return value === undefined || value === null ? '' : String(value)
}

function toEditCondition(condition: Condition): EditCondition {
  if ('all' in condition) return { match: 'all', items: condition.all.map(toEditCondition) }
  if ('any' in condition) return { match: 'any', items: condition.any.map(toEditCondition) }
  return { field: condition.field, op: condition.op, value: valueText(condition.value) }
}

/** A saved definition in editable form. A single condition at the top becomes a group of one. */
export function toEditable(definition: RuleSetDefinition): EditDefinition {
  return {
    rules: definition.rules.map((rule) => {
      const when = rule.when ? toEditCondition(rule.when) : null
      return { ...rule, when: when === null ? null : isGroup(when) ? when : { match: 'all', items: [when] } }
    }),
  }
}

function typedValue(text: string, op: ConditionOperator, type: WorkflowField['type'] | undefined): unknown {
  const one = (part: string): unknown => {
    if (type === 'number') return Number(part)
    if (type === 'boolean') return part === 'true'
    return part
  }
  if (op === 'in' || op === 'notIn') {
    return text
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map(one)
  }
  return one(text.trim())
}

function toCondition(condition: EditCondition, fields: Map<string, WorkflowField>): Condition {
  if (isGroup(condition)) {
    const items = condition.items.map((item) => toCondition(item, fields))
    return condition.match === 'all' ? { all: items } : { any: items }
  }
  if (condition.op === 'exists') return { field: condition.field, op: 'exists' }
  return { field: condition.field, op: condition.op, value: typedValue(condition.value, condition.op, fields.get(condition.field)?.type) }
}

/** The editable form back into what the API stores, with typed values. */
export function toDefinition(definition: EditDefinition, fields: WorkflowField[]): RuleSetDefinition {
  const byPath = new Map(fields.map((field) => [field.path, field]))
  return {
    rules: definition.rules.map((rule) => ({ ...rule, when: rule.when ? toCondition(rule.when, byPath) : null })),
  }
}

/** kebab-case key from a name, unique among `taken`. */
export function uniqueKey(name: string, taken: readonly string[], fallback: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 50) || fallback
  let key = slug
  for (let n = 2; taken.includes(key); n++) key = `${slug}-${n}`
  return key
}

export function newStep(taken: readonly string[]): Step {
  return { key: uniqueKey('', taken, `step-${taken.length + 1}`), name: '', approvers: [], quorum: 'any', reReview: 'rejecters' }
}

export function newRule(rules: readonly EditRule[]): EditRule {
  const priorities = rules.map((rule) => rule.priority)
  return {
    key: uniqueKey('', rules.map((rule) => rule.key), `rule-${rules.length + 1}`),
    name: '',
    priority: priorities.length ? Math.min(10_000, Math.max(...priorities) + 10) : 10,
    when: null,
    steps: [newStep([])],
  }
}

export function newCondition(fields: readonly WorkflowField[]): EditCondition {
  return { field: fields[0]?.path ?? '', op: 'eq', value: '' }
}

export type EditorErrors = Record<string, string>

/**
 * Checks what the screen can check before saving. Messages are i18n keys under
 * ruleEditor.errors; the API still validates everything.
 */
export function validate(definition: EditDefinition, fields: readonly WorkflowField[]): EditorErrors {
  const errors: EditorErrors = {}
  const byPath = new Map(fields.map((field) => [field.path, field]))
  const requireName = (path: string, value: string) => {
    if (!value.trim()) errors[path] = 'name'
  }
  const requireKey = (path: string, value: string) => {
    if (!KEY.test(value)) errors[path] = 'key'
  }
  const approver = (path: string, spec: ApproverSpec) => {
    if (spec.kind === 'role' && !spec.roleCode) errors[path] = 'role'
    if (spec.kind === 'user' && !spec.userId) errors[path] = 'person'
  }
  const condition = (path: string, item: EditCondition) => {
    if (isGroup(item)) {
      if (item.items.length === 0) errors[path] = 'conditions'
      item.items.forEach((child, index) => condition(`${path}.items.${index}`, child))
      return
    }
    const field = byPath.get(item.field)
    if (!field) errors[`${path}.field`] = 'field'
    if (item.op === 'exists') return
    const parts = item.op === 'in' || item.op === 'notIn' ? item.value.split(',').map((part) => part.trim()).filter(Boolean) : [item.value.trim()]
    if (parts.length === 0 || parts.some((part) => !part)) errors[`${path}.value`] = 'value'
    else if (field?.type === 'number' && parts.some((part) => !Number.isFinite(Number(part)))) errors[`${path}.value`] = 'number'
  }

  definition.rules.forEach((rule, r) => {
    const base = `rules.${r}`
    requireName(`${base}.name`, rule.name)
    requireKey(`${base}.key`, rule.key)
    if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 10_000) errors[`${base}.priority`] = 'priority'
    if (rule.when) condition(`${base}.when`, rule.when)
    rule.steps.forEach((step, s) => {
      const stepPath = `${base}.steps.${s}`
      requireName(`${stepPath}.name`, step.name)
      requireKey(`${stepPath}.key`, step.key)
      if (step.approvers.length === 0) errors[`${stepPath}.approvers`] = 'approvers'
      step.approvers.forEach((spec, a) => approver(`${stepPath}.approvers.${a}`, spec))
      if (typeof step.quorum === 'object' && (!Number.isInteger(step.quorum.count) || step.quorum.count < 1 || step.quorum.count > 50)) {
        errors[`${stepPath}.quorum`] = 'count'
      }
      if (step.slaHours !== undefined && (!Number.isInteger(step.slaHours) || step.slaHours < 1 || step.slaHours > 2160)) errors[`${stepPath}.slaHours`] = 'sla'
      if (step.escalateTo) approver(`${stepPath}.escalateTo`, step.escalateTo)
    })
  })
  return errors
}

/** Quorum as the dropdown value plus the count. */
export function quorumChoice(quorum: Quorum): { choice: 'any' | 'all' | 'onePerGroup' | 'count'; count: number } {
  return typeof quorum === 'object' ? { choice: 'count', count: quorum.count } : { choice: quorum, count: 2 }
}

/** Users named anywhere in the rules (to show their names). */
export function namedUsers(definition: EditDefinition): string[] {
  const ids = definition.rules.flatMap((rule) =>
    rule.steps.flatMap((step) => [...step.approvers, ...(step.escalateTo ? [step.escalateTo] : [])].flatMap((spec) => (spec.kind === 'user' && spec.userId ? [spec.userId] : []))),
  )
  return [...new Set(ids)]
}

/** Depth of the deepest group under a rule (1 = only the top group). */
export function groupDepth(group: EditGroup): number {
  return 1 + Math.max(0, ...group.items.filter(isGroup).map(groupDepth))
}
