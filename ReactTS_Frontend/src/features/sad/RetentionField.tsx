import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, PageMessage, TextField } from '../../components/qi'
import { fromInput, inputText } from './format'
import type { QuestionOf } from './schemas'
import type { FieldContext } from './QuestionField'

interface Ticked {
  standardId: string
  resourceName: string
  comment?: string
}

/** The backup schedule: tick the standard retention rows that apply and name the resources (values cannot change). */
export function RetentionField({ question, value, onValue, context, footer }: { question: QuestionOf<'retention'>; value: unknown; onValue: (value: unknown) => void; context: FieldContext; footer?: ReactNode }) {
  const { t } = useTranslation()
  const id = useId()
  const rows = (value as { rows: Ticked[] } | undefined)?.rows ?? []
  const save = (next: Ticked[]) => onValue(next.length > 0 ? { rows: next } : undefined)
  const change = (standardId: string, patch: Partial<Ticked>) => save(rows.map((row) => (row.standardId === standardId ? { ...row, ...patch } : row)))

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">{question.label}</legend>
      {context.retentionFailed && (
        <PageMessage variant="error" action={<Button onClick={context.retentionFailed.retry}>{t('common.retry')}</Button>}>
          {t('sad.retention.loadFailed')}
        </PageMessage>
      )}
      {context.retention.map((standard) => {
        const ticked = rows.find((row) => row.standardId === standard.id)
        return (
          <div key={standard.id} className="flex flex-col gap-2 border-b border-divider-subdued pb-3">
            <Checkbox
              label={`${standard.serviceType} — ${standard.dataType}`}
              description={[
                t('sad.retention.summary', { yearly: standard.yearly, monthly: standard.monthly, weekly: standard.weekly, daily: standard.daily }),
                standard.comment,
                standard.active ? null : t('sad.retention.retiredNote'),
              ]
                .filter(Boolean)
                .join(' · ')}
              checked={ticked !== undefined}
              onCheckedChange={(checked) => save(checked ? [...rows, { standardId: standard.id, resourceName: '' }] : rows.filter((row) => row.standardId !== standard.id))}
            />
            {ticked && (
              // Each row's fields are named within it (several rows each have a resource name).
              <fieldset className="grid gap-2 pl-8 md:grid-cols-2">
                <legend className="sr-only">{`${standard.serviceType} — ${standard.dataType}`}</legend>
                <TextField id={`${id}-${standard.id}-name`} label={t('sad.retention.resourceName')} value={ticked.resourceName} onChange={(event) => change(standard.id, { resourceName: event.target.value })} />
                <TextField
                  id={`${id}-${standard.id}-comment`}
                  label={t('sad.retention.comment')}
                  labelSuffix={t('sad.editor.optional')}
                  value={inputText(ticked.comment)}
                  onChange={(event) => change(standard.id, { comment: fromInput(event.target.value) })}
                />
              </fieldset>
            )}
          </div>
        )
      })}
      {footer}
    </fieldset>
  )
}
