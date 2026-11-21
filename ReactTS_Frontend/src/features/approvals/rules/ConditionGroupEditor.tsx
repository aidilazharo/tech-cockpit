import { useTranslation } from 'react-i18next'
import { Button, Dropdown, TextField } from '../../../components/qi'
import { cn } from '../../../lib/cn'
import { CONDITION_OPERATORS, type ConditionOperator, type WorkflowField } from '../schemas'
import { type EditCondition, type EditGroup, isGroup, MAX_GROUP_DEPTH, newCondition } from './rule-editing'

const OPERATORS_BY_TYPE: Record<WorkflowField['type'], ConditionOperator[]> = {
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'exists'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'exists'],
  string: ['eq', 'neq', 'in', 'notIn', 'exists'],
  enum: ['eq', 'neq', 'in', 'notIn', 'exists'],
  boolean: ['eq', 'neq', 'exists'],
  list: [...CONDITION_OPERATORS],
  unknown: [...CONDITION_OPERATORS],
}

export interface ConditionGroupEditorProps {
  group: EditGroup
  /** Location used for error messages, e.g. rules.0.when */
  path: string
  depth: number
  fields: WorkflowField[]
  onChange: (group: EditGroup) => void
  onRemove?: () => void
  error: (path: string) => string | undefined
  disabled: boolean
}

/** all / any of conditions and nested groups (up to 5 levels, like the API). */
export function ConditionGroupEditor({ group, path, depth, fields, onChange, onRemove, error, disabled }: ConditionGroupEditorProps) {
  const { t } = useTranslation()
  const set = (index: number, item: EditCondition) => onChange({ ...group, items: group.items.map((current, i) => (i === index ? item : current)) })
  const remove = (index: number) => onChange({ ...group, items: group.items.filter((_, i) => i !== index) })
  const groupError = error(path)

  return (
    <fieldset className={cn('flex flex-col gap-3 rounded-card border border-divider-default p-3', depth > 1 && 'bg-surface-alternate')}>
      <legend className="px-1 text-sm font-semibold">{depth === 1 ? t('ruleEditor.conditions') : t('ruleEditor.group')}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Dropdown<'all' | 'any'>
            label={t('ruleEditor.match')}
            value={group.match}
            onValueChange={(match) => match && onChange({ ...group, match })}
            disabled={disabled}
            options={[
              { value: 'all', label: t('ruleEditor.matchAll') },
              { value: 'any', label: t('ruleEditor.matchAny') },
            ]}
          />
        </div>
        {onRemove && !disabled && (
          <Button variant="tertiary" onClick={onRemove}>
            {depth === 1 ? t('ruleEditor.removeConditions') : t('ruleEditor.removeGroup')}
          </Button>
        )}
      </div>
      {groupError && <p className="text-sm text-text-error">{groupError}</p>}
      <ul className="flex flex-col gap-3">
        {group.items.map((item, index) => (
          <li key={index}>
            {isGroup(item) ? (
              <ConditionGroupEditor
                group={item}
                path={`${path}.items.${index}`}
                depth={depth + 1}
                fields={fields}
                onChange={(next) => set(index, next)}
                onRemove={() => remove(index)}
                error={error}
                disabled={disabled}
              />
            ) : (
              <ConditionRow
                condition={item}
                path={`${path}.items.${index}`}
                fields={fields}
                onChange={(next) => set(index, next)}
                onRemove={() => remove(index)}
                error={error}
                disabled={disabled}
              />
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onChange({ ...group, items: [...group.items, newCondition(fields)] })}>
            {t('ruleEditor.addCondition')}
          </Button>
          {depth < MAX_GROUP_DEPTH ? (
            <Button variant="tertiary" onClick={() => onChange({ ...group, items: [...group.items, { match: 'all', items: [newCondition(fields)] }] })}>
              {t('ruleEditor.addGroup')}
            </Button>
          ) : (
            <p className="self-center text-sm text-text-subdued">{t('ruleEditor.maxDepth')}</p>
          )}
        </div>
      )}
    </fieldset>
  )
}

type Leaf = Exclude<EditCondition, EditGroup>

function ConditionRow({
  condition,
  path,
  fields,
  onChange,
  onRemove,
  error,
  disabled,
}: {
  condition: Leaf
  path: string
  fields: WorkflowField[]
  onChange: (condition: Leaf) => void
  onRemove: () => void
  error: (path: string) => string | undefined
  disabled: boolean
}) {
  const { t } = useTranslation()
  const field = fields.find((candidate) => candidate.path === condition.field)
  const operators = OPERATORS_BY_TYPE[field?.type ?? 'unknown']
  const list = condition.op === 'in' || condition.op === 'notIn'
  const valueError = error(`${path}.value`)

  const value = () => {
    if (condition.op === 'exists') return null
    if (!list && field?.type === 'enum' && field.values) {
      return (
        <Dropdown<string>
          label={t('ruleEditor.value')}
          value={condition.value || null}
          onValueChange={(next) => onChange({ ...condition, value: next })}
          options={field.values.map((option) => ({ value: option, label: option }))}
          error={valueError}
          disabled={disabled}
        />
      )
    }
    if (!list && field?.type === 'boolean') {
      return (
        <Dropdown<string>
          label={t('ruleEditor.value')}
          value={condition.value || null}
          onValueChange={(next) => onChange({ ...condition, value: next })}
          options={[
            { value: 'true', label: t('ruleEditor.true') },
            { value: 'false', label: t('ruleEditor.false') },
          ]}
          error={valueError}
          disabled={disabled}
        />
      )
    }
    return (
      <TextField
        label={t('ruleEditor.value')}
        value={condition.value}
        inputMode={field?.type === 'number' && !list ? 'decimal' : undefined}
        hint={list ? t('ruleEditor.valuesHint') : undefined}
        onChange={(event) => onChange({ ...condition, value: event.target.value })}
        error={valueError}
        disabled={disabled}
      />
    )
  }

  return (
    <div className="grid items-start gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
      <Dropdown<string>
        label={t('ruleEditor.field')}
        value={condition.field || null}
        onValueChange={(next) => onChange({ field: next, op: 'eq', value: '' })}
        options={fields.map((option) => ({ value: option.path, label: option.path }))}
        error={error(`${path}.field`)}
        disabled={disabled}
      />
      <Dropdown<ConditionOperator>
        label={t('ruleEditor.operator')}
        value={condition.op}
        onValueChange={(next) => next && onChange({ ...condition, op: next, value: next === 'exists' ? '' : condition.value })}
        options={operators.map((op) => ({ value: op, label: t(`ruleEditor.ops.${op}`) }))}
        disabled={disabled}
      />
      <div>{value()}</div>
      {!disabled && (
        <Button variant="tertiary" className="md:mt-6" onClick={onRemove}>
          {t('ruleEditor.removeCondition')}
        </Button>
      )}
    </div>
  )
}
