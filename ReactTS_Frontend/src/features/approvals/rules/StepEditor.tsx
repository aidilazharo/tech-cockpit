import { useTranslation } from 'react-i18next'
import { Button, Dropdown, TextField } from '../../../components/qi'
import { PersonPicker } from '../../people/PersonPicker'
import type { Person } from '../../people/schemas'
import type { ApproverSpec, RuleOptions, Step, Workflow } from '../schemas'
import { quorumChoice } from './rule-editing'

export interface StepEditorProps {
  step: Step
  index: number
  count: number
  /** Location used for error messages, e.g. rules.0.steps.1 */
  path: string
  roles: RuleOptions['roles']
  /** Other approval types this step may wait for (gate) */
  gates: Workflow[]
  people: Map<string, Person>
  onPersonChosen: (person: Person) => void
  onChange: (step: Step) => void
  onRemove: () => void
  onMove: (offset: -1 | 1) => void
  error: (path: string) => string | undefined
  disabled: boolean
}

type EscalationKind = 'none' | 'role' | 'user'

/** One step: who approves, how many must agree, time limit, escalation, re-review and gate. */
export function StepEditor({ step, index, count, path, roles, gates, people, onPersonChosen, onChange, onRemove, onMove, error, disabled }: StepEditorProps) {
  const { t } = useTranslation()
  const name = step.name || t('ruleEditor.step', { index: index + 1 })
  const quorum = quorumChoice(step.quorum)
  const escalation: EscalationKind = step.escalateTo?.kind ?? 'none'

  const setApprover = (i: number, spec: ApproverSpec) => onChange({ ...step, approvers: step.approvers.map((current, j) => (j === i ? spec : current)) })

  const approverEditor = (spec: ApproverSpec, label: string, onSpec: (spec: ApproverSpec) => void, specError?: string) =>
    spec.kind === 'role' ? (
      <div className="grid gap-3 md:grid-cols-2">
        <Dropdown<string>
          label={t('ruleEditor.role')}
          placeholder={label}
          value={spec.roleCode || null}
          onValueChange={(roleCode) => onSpec({ ...spec, roleCode })}
          options={roles.map((role) => ({ value: role.code, label: role.name }))}
          error={specError}
          disabled={disabled}
        />
        <Dropdown<'global' | 'subject'>
          label={t('ruleEditor.scope')}
          value={spec.scope}
          onValueChange={(scope) => onSpec({ ...spec, scope })}
          options={[
            { value: 'global', label: t('ruleEditor.scopeGlobal') },
            { value: 'subject', label: t('ruleEditor.scopeSubject') },
          ]}
          disabled={disabled}
        />
      </div>
    ) : (
      <PersonPicker
        label={t('ruleEditor.person')}
        value={people.get(spec.userId) ?? null}
        onChange={(person) => {
          if (person) onPersonChosen(person)
          onSpec({ kind: 'user', userId: person?.id ?? '' })
        }}
        error={specError}
      />
    )

  return (
    <fieldset disabled={disabled} className="flex flex-col gap-4 rounded-card border border-divider-default p-4">
      <legend className="px-1 font-semibold">{t('ruleEditor.step', { index: index + 1 })}</legend>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label={t('ruleEditor.stepName')} value={step.name} onChange={(event) => onChange({ ...step, name: event.target.value })} error={error(`${path}.name`)} />
        <TextField label={t('ruleEditor.stepKey')} value={step.key} onChange={(event) => onChange({ ...step, key: event.target.value })} error={error(`${path}.key`)} />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">{t('ruleEditor.approvers')}</legend>
        <p className="text-sm text-text-subdued">{t('ruleEditor.approversHint')}</p>
        {error(`${path}.approvers`) && <p className="text-sm text-text-error">{error(`${path}.approvers`)}</p>}
        <ol className="flex flex-col gap-3">
          {step.approvers.map((spec, i) => (
            <li key={i} className="flex flex-col gap-2 border-l-4 border-divider-bold pl-3">
              {approverEditor(spec, t('ruleEditor.role'), (next) => setApprover(i, next), error(`${path}.approvers.${i}`))}
              {!disabled && (
                <Button variant="tertiary" className="w-fit" onClick={() => onChange({ ...step, approvers: step.approvers.filter((_, j) => j !== i) })}>
                  {t('ruleEditor.removeApprover', { index: i + 1 })}
                </Button>
              )}
            </li>
          ))}
        </ol>
        {!disabled && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => onChange({ ...step, approvers: [...step.approvers, { kind: 'role', roleCode: '', scope: 'global' }] })}>
              {t('ruleEditor.addRoleApprover')}
            </Button>
            <Button variant="secondary" onClick={() => onChange({ ...step, approvers: [...step.approvers, { kind: 'user', userId: '' }] })}>
              {t('ruleEditor.addPersonApprover')}
            </Button>
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <Dropdown<'any' | 'all' | 'onePerGroup' | 'count'>
          label={t('ruleEditor.quorum')}
          value={quorum.choice}
          onValueChange={(choice) => onChange({ ...step, quorum: choice === 'count' ? { count: quorum.count } : choice })}
          options={[
            { value: 'any', label: t('ruleEditor.quorumAny') },
            { value: 'all', label: t('ruleEditor.quorumAll') },
            { value: 'onePerGroup', label: t('ruleEditor.quorumOnePerGroup') },
            { value: 'count', label: t('ruleEditor.quorumCount') },
          ]}
          disabled={disabled}
        />
        {quorum.choice === 'count' && (
          <TextField
            label={t('ruleEditor.quorumCountValue')}
            inputMode="numeric"
            value={String(quorum.count)}
            onChange={(event) => onChange({ ...step, quorum: { count: Number(event.target.value) } })}
            error={error(`${path}.quorum`)}
          />
        )}
        <TextField
          label={t('ruleEditor.sla')}
          hint={t('ruleEditor.slaHint')}
          inputMode="numeric"
          value={step.slaHours === undefined ? '' : String(step.slaHours)}
          onChange={(event) => {
            const text = event.target.value.trim()
            const next = { ...step }
            if (text) next.slaHours = Number(text)
            else delete next.slaHours
            onChange(next)
          }}
          error={error(`${path}.slaHours`)}
        />
        <Dropdown<'rejecters' | 'all'>
          label={t('ruleEditor.reReview')}
          value={step.reReview}
          onValueChange={(reReview) => reReview && onChange({ ...step, reReview })}
          options={[
            { value: 'rejecters', label: t('ruleEditor.reReviewRejecters') },
            { value: 'all', label: t('ruleEditor.reReviewAll') },
          ]}
          disabled={disabled}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Dropdown<EscalationKind>
          label={t('ruleEditor.escalateTo')}
          value={escalation}
          onValueChange={(kind) => {
            const next = { ...step }
            if (kind === 'role') next.escalateTo = { kind: 'role', roleCode: '', scope: 'global' }
            else if (kind === 'user') next.escalateTo = { kind: 'user', userId: '' }
            else delete next.escalateTo
            onChange(next)
          }}
          options={[
            { value: 'none', label: t('ruleEditor.escalateNone') },
            { value: 'role', label: t('ruleEditor.escalateRole') },
            { value: 'user', label: t('ruleEditor.escalatePerson') },
          ]}
          disabled={disabled}
        />
        <Dropdown<string>
          label={t('ruleEditor.gate')}
          hint={t('ruleEditor.gateHint')}
          value={step.gate?.requiresApproved ?? '-'}
          onValueChange={(code) => {
            const next = { ...step }
            if (code && code !== '-') next.gate = { requiresApproved: code }
            else delete next.gate
            onChange(next)
          }}
          options={[{ value: '-', label: t('ruleEditor.gateNone') }, ...gates.map((workflow) => ({ value: workflow.code, label: workflow.name }))]}
          disabled={disabled}
        />
      </div>
      {step.escalateTo && approverEditor(step.escalateTo, t('ruleEditor.escalateTo'), (escalateTo) => onChange({ ...step, escalateTo }), error(`${path}.escalateTo`))}

      {!disabled && (
        <div className="flex flex-wrap gap-2 border-t border-divider-default pt-3">
          <Button variant="tertiary" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('ruleEditor.moveUp', { name })}>
            <span aria-hidden="true">↑</span>
          </Button>
          <Button variant="tertiary" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('ruleEditor.moveDown', { name })}>
            <span aria-hidden="true">↓</span>
          </Button>
          <Button variant="tertiary" disabled={count === 1} onClick={onRemove}>
            {t('ruleEditor.removeStep', { name })}
          </Button>
        </div>
      )}
    </fieldset>
  )
}
