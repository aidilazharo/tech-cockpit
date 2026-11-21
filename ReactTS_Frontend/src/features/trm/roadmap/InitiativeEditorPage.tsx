import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { z } from 'zod'
import { PageHeader } from '../../../components/page/PageHeader'
import { ActionFailed } from '../../../components/page/QueryStates'
import { useDateLabels } from '../../../components/page/useDateLabels'
import { Button, DatePicker, Dropdown, Textarea, TextField } from '../../../components/qi'
import { PersonPicker } from '../../people/PersonPicker'
import { ApplicationPicker } from '../ApplicationPicker'
import { capabilityOptions } from '../capability-tree'
import { BackLink, DetailStates } from '../parts'
import { useCapabilities, useInitiative, useSaveInitiative } from '../queries'
import { type CreateInitiativeRequest, INITIATIVE_STATUSES, type Initiative, type InitiativeActionRequest, ROADMAP_ACTIONS } from '../schemas'

const FORM_ID = 'trm-initiative-form'
const ref = z.object({ id: z.string(), name: z.string().nullable() }).nullable()
const KINDS = ['existing', 'planned'] as const

/** /trm/roadmap/new and /trm/roadmap/:id/edit */
export function InitiativeEditorPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const initiative = useInitiative(id)
  if (!id) return <InitiativeForm initiative={null} />
  return (
    <>
      <BackLink to={`/trm/roadmap/${id}`}>{t('trm.roadmap.backToInitiative')}</BackLink>
      <DetailStates query={initiative} notFound={t('trm.roadmap.notFound')}>
        {(data) => <InitiativeForm initiative={data} />}
      </DetailStates>
    </>
  )
}

function InitiativeForm({ initiative }: { initiative: Initiative | null }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dateLabels = useDateLabels()
  const capabilities = useCapabilities()
  const save = useSaveInitiative(initiative?.id ?? null)

  const actionSchema = z
    .object({
      action: z.enum(ROADMAP_ACTIONS),
      kind: z.enum(KINDS),
      application: ref,
      plannedName: z.string().max(300),
      replacementKind: z.enum(KINDS),
      replacement: ref,
      replacementName: z.string().max(300),
    })
    .superRefine((value, ctx) => {
      if (value.kind === 'existing' ? !value.application : !value.plannedName.trim()) {
        ctx.addIssue({ code: 'custom', path: [value.kind === 'existing' ? 'application' : 'plannedName'], message: t('trm.roadmap.errors.subject') })
      }
      if (value.action === 'replace' && (value.replacementKind === 'existing' ? !value.replacement : !value.replacementName.trim())) {
        ctx.addIssue({ code: 'custom', path: [value.replacementKind === 'existing' ? 'replacement' : 'replacementName'], message: t('trm.roadmap.errors.replacement') })
      }
    })
  const schema = z
    .object({
      name: z.string().trim().min(1, t('trm.roadmap.errors.name')).max(300),
      description: z.string().max(5000),
      rationale: z.string().max(5000),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      status: z.enum(INITIATIVE_STATUSES),
      owner: z.object({ id: z.string(), name: z.string(), email: z.string(), isExternal: z.boolean() }).nullable(),
      estimatedCost: z.string().refine((v) => !v.trim() || /^\d{1,13}(\.\d{1,2})?$/.test(v.replaceAll(',', '').trim()), t('trm.roadmap.errors.cost')),
      capabilityIds: z.array(z.string()),
      actions: z.array(actionSchema),
    })
    .refine((v) => v.startDate, { path: ['startDate'], message: t('trm.roadmap.errors.start') })
    .refine((v) => v.endDate, { path: ['endDate'], message: t('trm.roadmap.errors.end') })
    .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, { path: ['endDate'], message: t('trm.roadmap.errors.order') })

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initiative?.name ?? '',
      description: initiative?.description ?? '',
      rationale: initiative?.rationale ?? '',
      startDate: initiative?.startDate ?? null,
      endDate: initiative?.endDate ?? null,
      status: initiative?.status ?? 'proposed',
      owner: initiative?.owner ? { ...initiative.owner, email: '', isExternal: false } : null,
      estimatedCost: initiative?.estimatedCost ?? '',
      capabilityIds: initiative?.capabilities.map((c) => c.id) ?? [],
      actions: (initiative?.actions ?? []).map((a) => ({
        action: a.action,
        kind: a.application ? ('existing' as const) : ('planned' as const),
        application: a.application,
        plannedName: a.plannedApplication?.name ?? '',
        replacementKind: a.replacementPlanned ? ('planned' as const) : ('existing' as const),
        replacement: a.replacementApplication,
        replacementName: a.replacementPlanned?.name ?? '',
      })),
    },
  })
  const actions = useFieldArray({ control: form.control, name: 'actions' })
  const watched = useWatch({ control: form.control, name: 'actions' })
  const chosenCapabilities = useWatch({ control: form.control, name: 'capabilityIds' })
  const startDate = useWatch({ control: form.control, name: 'startDate' })
  const capabilityChoices = capabilityOptions(capabilities.data?.items ?? [])
  // Names the initiative already carries, so chips are labelled before the capability list loads.
  const capabilityName = new Map([...(initiative?.capabilities ?? []), ...(capabilities.data?.items ?? [])].map((c) => [c.id, c.name]))

  const submit = form.handleSubmit(async (values) => {
    const request: CreateInitiativeRequest & { version?: number } = {
      name: values.name.trim(),
      description: values.description.trim() || null,
      rationale: values.rationale.trim() || null,
      startDate: values.startDate!,
      endDate: values.endDate!,
      status: values.status,
      ownerId: values.owner?.id ?? null,
      estimatedCost: values.estimatedCost.trim() ? values.estimatedCost.replaceAll(',', '').trim() : null,
      capabilityIds: values.capabilityIds,
      actions: values.actions.map((a): InitiativeActionRequest => ({
        action: a.action,
        ...(a.kind === 'existing' ? { applicationId: a.application!.id } : { plannedApplicationName: a.plannedName.trim() }),
        ...(a.action === 'replace' && (a.replacementKind === 'existing' ? { replacementApplicationId: a.replacement!.id } : { replacementPlannedName: a.replacementName.trim() })),
      })),
      ...(initiative && { version: initiative.version }),
    }
    const saved = await save.mutateAsync(request)
    await navigate(`/trm/roadmap/${saved.id}`)
  })

  const kindOptions = KINDS.map((value) => ({ value, label: t(`trm.roadmap.kind.${value}`) }))

  return (
    <>
      <PageHeader title={initiative ? t('trm.roadmap.editTitle', { name: initiative.name }) : t('trm.roadmap.newTitle')} intro={t('trm.roadmap.editorIntro')} />
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex max-w-4xl flex-col gap-6">
        <ActionFailed error={save.error} />
        <fieldset className="grid gap-4 md:grid-cols-2">
          <legend className="heading-3 mb-2">{t('trm.roadmap.detailsTitle')}</legend>
          <Controller control={form.control} name="name" render={({ field, fieldState }) => <TextField label={t('trm.roadmap.name')} maxLength={300} {...field} error={fieldState.error?.message} />} />
          <Controller
            control={form.control}
            name="status"
            render={({ field }) => (
              <Dropdown
                label={t('trm.roadmap.status')}
                value={field.value}
                onValueChange={field.onChange}
                options={INITIATIVE_STATUSES.map((value) => ({ value, label: t(`trm.roadmap.statuses.${value}`) }))}
              />
            )}
          />
          <Controller control={form.control} name="startDate" render={({ field, fieldState }) => <DatePicker label={t('trm.roadmap.start')} value={field.value} onChange={field.onChange} labels={dateLabels} error={fieldState.error?.message} />} />
          <Controller
            control={form.control}
            name="endDate"
            render={({ field, fieldState }) => <DatePicker label={t('trm.roadmap.end')} value={field.value} onChange={field.onChange} min={startDate ?? undefined} labels={dateLabels} error={fieldState.error?.message} />}
          />
          <Controller control={form.control} name="owner" render={({ field }) => <PersonPicker label={t('trm.roadmap.owner')} value={field.value} onChange={field.onChange} actsForStaff />} />
          <Controller
            control={form.control}
            name="estimatedCost"
            render={({ field, fieldState }) => (
              <TextField label={t('trm.roadmap.cost')} labelSuffix={t('common.optional')} inputMode="decimal" {...field} error={fieldState.error?.message} />
            )}
          />
          <div className="md:col-span-2">
            <Controller control={form.control} name="description" render={({ field }) => <Textarea label={t('trm.roadmap.description')} labelSuffix={t('common.optional')} maxLength={5000} {...field} />} />
          </div>
          <div className="md:col-span-2">
            <Controller control={form.control} name="rationale" render={({ field }) => <Textarea label={t('trm.roadmap.rationale')} labelSuffix={t('common.optional')} maxLength={5000} {...field} />} />
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="heading-3 mb-2">{t('trm.roadmap.capabilities')}</legend>
          <Controller
            control={form.control}
            name="capabilityIds"
            render={({ field }) => (
              <>
                <ul className="flex flex-wrap gap-2">
                  {field.value.map((capabilityId) => (
                    <li key={capabilityId} className="flex items-center gap-1 rounded-tag border border-divider-bold px-2 py-1 text-sm">
                      {capabilityName.get(capabilityId)}
                      <Button
                        variant="tertiary"
                        aria-label={t('trm.roadmap.removeCapability', { name: capabilityName.get(capabilityId) ?? '' })}
                        onClick={() => field.onChange(field.value.filter((idValue) => idValue !== capabilityId))}
                      >
                        ×
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="max-w-md">
                  <Dropdown<string>
                    label={t('trm.roadmap.addCapability')}
                    placeholder={t('trm.roadmap.chooseCapability')}
                    value={null}
                    onValueChange={(value) => value && field.onChange([...field.value, value])}
                    options={capabilityChoices.filter((option) => !chosenCapabilities.includes(option.value))}
                  />
                </div>
              </>
            )}
          />
        </fieldset>

        <fieldset className="flex flex-col gap-4">
          <legend className="heading-3 mb-2">{t('trm.roadmap.applications')}</legend>
          <p className="text-sm text-text-subdued">{t('trm.roadmap.applicationsIntro')}</p>
          {actions.fields.map((item, index) => {
            const current = watched[index]
            return (
              <fieldset key={item.id} className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
                <legend className="px-1 font-semibold">{t('trm.roadmap.actionN', { n: index + 1 })}</legend>
                <div className="grid gap-3 md:grid-cols-2">
                  <Controller
                    control={form.control}
                    name={`actions.${index}.action`}
                    render={({ field }) => (
                      <Dropdown
                        label={t('trm.roadmap.action')}
                        value={field.value}
                        onValueChange={field.onChange}
                        options={ROADMAP_ACTIONS.map((value) => ({ value, label: t(`trm.roadmap.actions.${value}`) }))}
                      />
                    )}
                  />
                  <Controller
                    control={form.control}
                    name={`actions.${index}.kind`}
                    render={({ field }) => <Dropdown label={t('trm.roadmap.applicationKind')} value={field.value} onValueChange={field.onChange} options={kindOptions} />}
                  />
                  {current?.kind === 'existing' ? (
                    <Controller
                      control={form.control}
                      name={`actions.${index}.application`}
                      render={({ field, fieldState }) => <ApplicationPicker label={t('trm.roadmap.application')} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
                    />
                  ) : (
                    <Controller
                      control={form.control}
                      name={`actions.${index}.plannedName`}
                      render={({ field, fieldState }) => <TextField label={t('trm.roadmap.plannedName')} maxLength={300} {...field} error={fieldState.error?.message} />}
                    />
                  )}
                </div>
                {current?.action === 'replace' && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <Controller
                      control={form.control}
                      name={`actions.${index}.replacementKind`}
                      render={({ field }) => <Dropdown label={t('trm.roadmap.replacementKind')} value={field.value} onValueChange={field.onChange} options={kindOptions} />}
                    />
                    {current.replacementKind === 'existing' ? (
                      <Controller
                        control={form.control}
                        name={`actions.${index}.replacement`}
                        render={({ field, fieldState }) => <ApplicationPicker label={t('trm.roadmap.replacement')} value={field.value} onChange={field.onChange} error={fieldState.error?.message} />}
                      />
                    ) : (
                      <Controller
                        control={form.control}
                        name={`actions.${index}.replacementName`}
                        render={({ field, fieldState }) => <TextField label={t('trm.roadmap.replacementName')} maxLength={300} {...field} error={fieldState.error?.message} />}
                      />
                    )}
                  </div>
                )}
                <Button variant="tertiary" className="w-fit" onClick={() => actions.remove(index)}>
                  {t('trm.roadmap.removeAction', { n: index + 1 })}
                </Button>
              </fieldset>
            )
          })}
          <Button
            variant="secondary"
            className="w-fit"
            onClick={() => actions.append({ action: 'introduce', kind: 'planned', application: null, plannedName: '', replacementKind: 'existing', replacement: null, replacementName: '' })}
          >
            {t('trm.roadmap.addAction')}
          </Button>
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={save.isPending}>
            {t('common.save')}
          </Button>
          <Button variant="tertiary" onClick={() => void navigate(initiative ? `/trm/roadmap/${initiative.id}` : '/trm/roadmap')}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    </>
  )
}
