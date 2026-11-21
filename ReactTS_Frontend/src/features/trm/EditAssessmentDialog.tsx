import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { ActionFailed } from '../../components/page/QueryStates'
import { useDateLabels } from '../../components/page/useDateLabels'
import { Button, DatePicker, Dialog, Dropdown, Textarea } from '../../components/qi'
import { useUpdateApplication } from './queries'
import { type Application, FIT_SCORES, TIME_RATINGS } from './schemas'

const FORM_ID = 'trm-assessment-form'
const NONE = 'none'
const DATES = ['plannedGoLive', 'plannedPhaseOut', 'plannedRetirement', 'vendorEndOfSupport'] as const

const schema = z.object({
  timeRating: z.string(),
  timeRationale: z.string().max(2000),
  functionalFit: z.string(),
  technicalFit: z.string(),
  plannedGoLive: z.string().nullable(),
  plannedPhaseOut: z.string().nullable(),
  plannedRetirement: z.string().nullable(),
  vendorEndOfSupport: z.string().nullable(),
})

/** TIME rating, fit scores and lifecycle plan dates: TRM's own fields, never changed by the sync. */
export function EditAssessmentDialog({ app, onClose }: { app: Application; onClose: () => void }) {
  const { t } = useTranslation()
  const dateLabels = useDateLabels()
  const update = useUpdateApplication(app.id)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      timeRating: app.trm.timeRating ?? NONE,
      timeRationale: app.trm.timeRationale ?? '',
      functionalFit: String(app.trm.functionalFit ?? NONE),
      technicalFit: String(app.trm.technicalFit ?? NONE),
      plannedGoLive: app.trm.plannedGoLive,
      plannedPhaseOut: app.trm.plannedPhaseOut,
      plannedRetirement: app.trm.plannedRetirement,
      vendorEndOfSupport: app.trm.vendorEndOfSupport,
    },
  })

  const submit = form.handleSubmit(async (values) => {
    const score = (value: string) => (value === NONE ? null : Number(value))
    await update.mutateAsync({
      version: app.version,
      timeRating: values.timeRating === NONE ? null : (values.timeRating as (typeof TIME_RATINGS)[number]),
      timeRationale: values.timeRationale.trim() || null,
      functionalFit: score(values.functionalFit),
      technicalFit: score(values.technicalFit),
      plannedGoLive: values.plannedGoLive,
      plannedPhaseOut: values.plannedPhaseOut,
      plannedRetirement: values.plannedRetirement,
      vendorEndOfSupport: values.vendorEndOfSupport,
    })
    onClose()
  })

  const fitOptions = [...FIT_SCORES.map((score) => ({ value: String(score), label: t(`trm.fit.${score}`) })), { value: NONE, label: t('trm.fit.none') }]

  return (
    <Dialog
      open
      onClose={onClose}
      title={t('trm.application.editAssessment')}
      description={t('trm.application.editIntro')}
      closeLabel={t('common.close')}
      actions={
        <>
          <Button variant="tertiary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form={FORM_ID} loading={update.isPending}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={(event) => void submit(event).catch(() => undefined)} className="flex flex-col gap-4">
        <ActionFailed error={update.error} />
        <Controller
          control={form.control}
          name="timeRating"
          render={({ field }) => (
            <Dropdown<string>
              label={t('trm.application.timeRating')}
              hint={t('trm.application.timeHint')}
              value={field.value}
              onValueChange={field.onChange}
              options={[...TIME_RATINGS.map((value) => ({ value, label: t(`trm.time.${value}`) })), { value: NONE, label: t('trm.time.none') }]}
            />
          )}
        />
        <Controller
          control={form.control}
          name="timeRationale"
          render={({ field }) => (
            <Textarea label={t('trm.application.timeRationale')} labelSuffix={t('common.optional')} maxLength={2000} value={field.value} onChange={field.onChange} />
          )}
        />
        <div className="grid gap-4 md:grid-cols-2">
          {(['functionalFit', 'technicalFit'] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <Dropdown<string> label={t(`trm.application.${name}`)} value={field.value} onValueChange={field.onChange} options={fitOptions} />
              )}
            />
          ))}
          {DATES.map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => <DatePicker label={t(`trm.application.${name}`)} value={field.value} onChange={field.onChange} labels={dateLabels} />}
            />
          ))}
        </div>
      </form>
    </Dialog>
  )
}
