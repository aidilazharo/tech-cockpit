import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useCan } from '../../../auth/permissions'
import { ConfirmDialog } from '../../../components/page/ConfirmDialog'
import { ActionFailed, LoadFailed, Loading } from '../../../components/page/QueryStates'
import { Button, PageMessage, TextField } from '../../../components/qi'
import { usePeopleByIds } from '../../people/queries'
import type { Person } from '../../people/schemas'
import { useCreateRuleSet, usePublishRuleSet, useRuleOptions, useRuleSet, useUpdateRuleSet, useWorkflows } from '../queries'
import { type RuleOptions, type RuleSet, RuleSetDefinitionSchema, type Step, type Workflow } from '../schemas'
import { ConditionGroupEditor } from './ConditionGroupEditor'
import { type EditDefinition, type EditRule, namedUsers, newCondition, newRule, newStep, toDefinition, toEditable, validate } from './rule-editing'
import { StepEditor } from './StepEditor'

/** /admin/approval-rules/:id, and /admin/approval-rules/new?workflow=<code>&from=<id> */
export function RuleSetEditorPage() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [params] = useSearchParams()
  const sourceId = id ?? params.get('from')
  const source = useRuleSet(sourceId)
  const workflows = useWorkflows()
  const options = useRuleOptions()
  const workflowCode = source.data?.workflowCode ?? params.get('workflow')
  const workflow = workflows.data?.items.find((item) => item.code === workflowCode)

  const loading = (Boolean(sourceId) && source.isPending) || workflows.isPending || options.isPending
  const failed = source.isError || workflows.isError || options.isError

  return (
    <>
      <Link to="/admin/approval-rules" className="w-fit text-sm font-semibold text-text-link underline underline-offset-4">
        {t('ruleEditor.back')}
      </Link>
      {loading ? (
        <Loading />
      ) : failed || !workflow || !options.data ? (
        <LoadFailed
          onRetry={() => {
            if (source.isError) void source.refetch()
            if (workflows.isError) void workflows.refetch()
            if (options.isError) void options.refetch()
          }}
        />
      ) : (
        <Editor key={source.data?.id ?? 'new'} workflow={workflow} workflows={workflows.data?.items ?? []} options={options.data} existing={id ? (source.data ?? null) : null} copyOf={id ? null : (source.data ?? null)} />
      )}
    </>
  )
}

function starter(): EditDefinition {
  return { rules: [{ ...newRule([]), name: '' }] }
}

function Editor({ workflow, workflows, options, existing, copyOf }: { workflow: Workflow; workflows: Workflow[]; options: RuleOptions; existing: RuleSet | null; copyOf: RuleSet | null }) {
  const { t } = useTranslation()
  const can = useCan()
  const navigate = useNavigate()
  const parsed = RuleSetDefinitionSchema.safeParse((existing ?? copyOf)?.definition)
  const [draft, setDraft] = useState<EditDefinition>(() => (parsed.success ? toEditable(parsed.data) : starter()))
  const [tried, setTried] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [chosen, setChosen] = useState<Map<string, Person>>(new Map())
  const named = usePeopleByIds(namedUsers(draft))
  const create = useCreateRuleSet()
  const update = useUpdateRuleSet(existing?.id ?? '')
  const publish = usePublishRuleSet()

  const status = existing?.status ?? 'draft'
  const readOnly = !can('approvals:rule-set:manage') || status !== 'draft'
  const errors = tried ? validate(draft, workflow.fields) : {}
  const error = (path: string) => (errors[path] ? t(`ruleEditor.errors.${errors[path]}`) : undefined)
  const people = new Map([...(named.data?.items ?? []).map((person) => [person.id, person] as const), ...chosen])
  const gates = workflows.filter((item) => item.code !== workflow.code)
  const save = existing ? update : create

  const edit = (change: (next: EditDefinition) => void) => {
    setSaved(false)
    setDraft((current) => {
      const next = structuredClone(current)
      change(next)
      return next
    })
  }
  const setRule = (r: number, rule: EditRule) => edit((next) => void (next.rules[r] = rule))
  const setStep = (r: number, s: number, step: Step) => edit((next) => void (next.rules[r].steps[s] = step))

  const submit = () => {
    setTried(true)
    if (Object.keys(validate(draft, workflow.fields)).length > 0) return
    const definition = toDefinition(draft, workflow.fields)
    if (existing) {
      update.mutate({ definition, version: existing.version }, { onSuccess: () => setSaved(true) })
    } else {
      create.mutate({ workflowCode: workflow.code, definition }, { onSuccess: (created) => void navigate(`/admin/approval-rules/${created.id}`, { replace: true }) })
    }
  }

  return (
    <>
      <h1 className="heading-1">{t('ruleEditor.title', { workflow: workflow.name, version: existing?.ruleVersion ?? '—' })}</h1>
      <p className="text-text-subdued">{t('ruleEditor.intro')}</p>
      {existing && status !== 'draft' && <PageMessage>{t('ruleEditor.readOnlyPublished', { status: t(`rules.status.${status}`) })}</PageMessage>}
      {status === 'draft' && !can('approvals:rule-set:manage') && <PageMessage>{t('ruleEditor.readOnlyPermission')}</PageMessage>}
      {saved && <PageMessage variant="success">{t('ruleEditor.saved')}</PageMessage>}
      {publish.isSuccess && <PageMessage variant="success">{t('ruleEditor.published')}</PageMessage>}
      {tried && Object.keys(errors).length > 0 && <PageMessage variant="error">{t('ruleEditor.invalid')}</PageMessage>}
      <ActionFailed error={save.error} />

      <section aria-labelledby="rules-heading" className="flex flex-col gap-6">
        <h2 id="rules-heading" className="heading-3">
          {t('ruleEditor.rules')}
        </h2>
        {draft.rules.map((rule, r) => (
          <fieldset key={r} disabled={readOnly} className="flex flex-col gap-4 rounded-card border border-divider-bold p-4">
            <legend className="px-1 font-semibold">{rule.name || t('ruleEditor.rule', { index: r + 1 })}</legend>
            <div className="grid gap-4 md:grid-cols-3">
              <TextField label={t('ruleEditor.ruleName')} value={rule.name} onChange={(event) => setRule(r, { ...rule, name: event.target.value })} error={error(`rules.${r}.name`)} />
              <TextField label={t('ruleEditor.ruleKey')} value={rule.key} onChange={(event) => setRule(r, { ...rule, key: event.target.value })} error={error(`rules.${r}.key`)} />
              <TextField
                label={t('ruleEditor.priority')}
                hint={t('ruleEditor.priorityHint')}
                inputMode="numeric"
                value={String(rule.priority)}
                onChange={(event) => setRule(r, { ...rule, priority: Number(event.target.value) })}
                error={error(`rules.${r}.priority`)}
              />
            </div>
            {rule.when ? (
              <ConditionGroupEditor
                group={rule.when}
                path={`rules.${r}.when`}
                depth={1}
                fields={workflow.fields}
                onChange={(when) => setRule(r, { ...rule, when })}
                onRemove={() => setRule(r, { ...rule, when: null })}
                error={error}
                disabled={readOnly}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <p>
                  <span className="font-semibold">{t('ruleEditor.conditions')}: </span>
                  {t('ruleEditor.always')}
                </p>
                {!readOnly && (
                  <Button variant="secondary" onClick={() => setRule(r, { ...rule, when: { match: 'all', items: [newCondition(workflow.fields)] } })}>
                    {t('ruleEditor.addConditions')}
                  </Button>
                )}
              </div>
            )}
            <h3 className="heading-4">{t('ruleEditor.steps')}</h3>
            {rule.steps.map((step, s) => (
              <StepEditor
                key={s}
                step={step}
                index={s}
                count={rule.steps.length}
                path={`rules.${r}.steps.${s}`}
                roles={options.roles}
                gates={gates}
                people={people}
                onPersonChosen={(person) => setChosen((current) => new Map(current).set(person.id, person))}
                onChange={(next) => setStep(r, s, next)}
                onRemove={() => edit((next) => void next.rules[r].steps.splice(s, 1))}
                onMove={(offset) =>
                  edit((next) => {
                    const steps = next.rules[r].steps
                    ;[steps[s], steps[s + offset]] = [steps[s + offset], steps[s]]
                  })
                }
                error={error}
                disabled={readOnly}
              />
            ))}
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => edit((next) => void next.rules[r].steps.push(newStep(next.rules[r].steps.map((x) => x.key))))}>
                  {t('ruleEditor.addStep')}
                </Button>
                {draft.rules.length > 1 && (
                  <Button variant="tertiary" onClick={() => edit((next) => void next.rules.splice(r, 1))}>
                    {t('ruleEditor.removeRule', { name: rule.name || t('ruleEditor.rule', { index: r + 1 }) })}
                  </Button>
                )}
              </div>
            )}
          </fieldset>
        ))}
        {!readOnly && (
          <div>
            <Button variant="secondary" onClick={() => edit((next) => void next.rules.push(newRule(next.rules)))}>
              {t('ruleEditor.addRule')}
            </Button>
          </div>
        )}
      </section>

      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-t border-divider-default pt-4">
          <Button onClick={submit} loading={save.isPending}>
            {t('ruleEditor.save')}
          </Button>
          {existing && (
            <Button variant="secondary" onClick={() => setConfirmPublish(true)}>
              {t('ruleEditor.publish')}
            </Button>
          )}
        </div>
      )}
      {existing && (
        <ConfirmDialog
          open={confirmPublish}
          onClose={() => {
            setConfirmPublish(false)
            publish.reset()
          }}
          title={t('ruleEditor.publishTitle', { version: existing.ruleVersion })}
          description={t('ruleEditor.publishBody')}
          confirmLabel={t('ruleEditor.publish')}
          onConfirm={() => publish.mutate(existing.id, { onSuccess: () => setConfirmPublish(false) })}
          pending={publish.isPending}
          error={publish.error}
        />
      )}
    </>
  )
}
