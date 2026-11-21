import { type ReactNode, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useDateLabels } from '../../components/page/useDateLabels'
import { Button, Checkbox, DatePicker, Dropdown, TextField, Textarea } from '../../components/qi'
import { TrmValue } from './AnswerView'
import { dateValue, fromInput, fromNumberInput, inputText, trmText } from './format'
import { RetentionField } from './RetentionField'
import { RichTextEditor } from './RichTextEditor'
import type { Answer, Option, Question, QuestionOf, RetentionValues, TrmData } from './schemas'
import { TableField } from './TableField'

export interface FieldContext {
  trm: TrmData | null
  /** The standard rows offered (active ones, then any the draft ticks that the list no longer offers) */
  retention: RetentionValues[]
  /** The standard list failed to load */
  retentionFailed?: { retry: () => void }
  namesHidden: boolean
  /** The TRM application search is available (dependent-application pickers) */
  canSearchApplications: boolean
}

interface EditorProps<Q extends Question> {
  id: string
  question: Q
  value: unknown
  onValue: (value: unknown) => void
  error?: string
  context: FieldContext
  /** Shown at the end of a multi-part question's fieldset ("does not apply") */
  footer?: ReactNode
}

/** Questions made of several controls: the question is a fieldset (one group, named by its legend). */
const COMPOSITE: Question['type'][] = ['multi', 'links', 'table', 'retention']

const OTHER = 'other'
/** Editors that show the API's message themselves */
const OWN_ERROR: Question['type'][] = ['text', 'short', 'number', 'choice', 'yesno', 'trm']

function ChoiceEditor({ id, question, value, onValue, error, options }: Omit<EditorProps<Question>, 'context'> & { options: Option[]; other?: boolean }) {
  const { t } = useTranslation()
  const current = value as { selected?: string; other?: string } | undefined
  return (
    <div className="flex flex-col gap-2">
      <Dropdown
        label={question.label}
        placeholder={t('sad.editor.choose')}
        value={current?.selected ?? null}
        onValueChange={(selected) => onValue({ selected, ...(selected === OTHER ? { other: inputText(current?.other) } : {}) })}
        options={options.map((option) => ({ value: option.value, label: option.label }))}
        error={error}
      />
      {current?.selected === OTHER && <TextField id={`${id}-other`} label={t('sad.editor.otherSpecify')} value={inputText(current.other)} onChange={(event) => onValue({ selected: OTHER, other: event.target.value })} />}
    </div>
  )
}

function MultiEditor({ id, question, value, onValue, footer }: EditorProps<QuestionOf<'multi'>>) {
  const { t } = useTranslation()
  const current = value as { selected: string[]; other?: string } | undefined
  const selected = current?.selected ?? []
  const options = [...question.options, ...(question.other ? [{ value: OTHER, label: t('sad.answer.other') }] : [])]
  const set = (next: string[], other = current?.other) => onValue(next.length > 0 ? { selected: next, ...(next.includes(OTHER) ? { other: other ?? '' } : {}) } : undefined)
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-sm font-semibold">{question.label}</legend>
      {options.map((option) => (
        <Checkbox
          key={option.value}
          label={option.label}
          description={option.description}
          checked={selected.includes(option.value)}
          onCheckedChange={(checked) => set(checked ? [...selected, option.value] : selected.filter((v) => v !== option.value))}
        />
      ))}
      {selected.includes(OTHER) && <TextField id={`${id}-other`} label={t('sad.editor.otherSpecify')} value={inputText(current?.other)} onChange={(event) => set(selected, event.target.value)} />}
      {footer}
    </fieldset>
  )
}

function YesNoEditor({ id, question, value, onValue, error }: EditorProps<QuestionOf<'yesno'>>) {
  const { t } = useTranslation()
  const current = value as { answer?: 'yes' | 'no'; details?: string } | undefined
  return (
    <div className="flex flex-col gap-2">
      <Dropdown<'yes' | 'no'>
        label={question.label}
        placeholder={t('sad.editor.choose')}
        value={current?.answer ?? null}
        onValueChange={(answer) => onValue({ answer, details: current?.details })}
        options={[
          { value: 'yes', label: t('sad.answer.yes') },
          { value: 'no', label: t('sad.answer.no') },
        ]}
        error={error}
      />
      {current?.answer && (
        <Textarea
          id={`${id}-details`}
          label={question.detailsLabel ?? t('sad.editor.details')}
          labelSuffix={t('sad.editor.optional')}
          value={inputText(current.details)}
          onChange={(event) => onValue({ answer: current.answer, details: fromInput(event.target.value) })}
        />
      )}
    </div>
  )
}

function LinksEditor({ id, question, value, onValue, footer }: EditorProps<QuestionOf<'links'>>) {
  const { t } = useTranslation()
  const links = (value as { label?: string; url: string }[] | undefined) ?? []
  const set = (next: typeof links) => onValue(next.length > 0 ? next : undefined)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{question.label}</legend>
      {links.map((link, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <TextField id={`${id}-label-${index}`} label={t('sad.editor.linkText', { n: index + 1 })} labelSuffix={t('sad.editor.optional')} value={inputText(link.label)} onChange={(event) => set(links.map((l, i) => (i === index ? { ...l, label: fromInput(event.target.value) } : l)))} />
          <TextField id={`${id}-url-${index}`} label={t('sad.editor.linkUrl', { n: index + 1 })} value={link.url} onChange={(event) => set(links.map((l, i) => (i === index ? { ...l, url: event.target.value } : l)))} />
          <Button variant="tertiary" onClick={() => set(links.filter((_, i) => i !== index))}>
            {t('sad.editor.removeLinkN', { n: index + 1 })}
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" onClick={() => set([...links, { url: 'https://' }])}>
          {t('sad.editor.addLink')}
        </Button>
      </div>
      {footer}
    </fieldset>
  )
}

function ValueEditor(props: EditorProps<Question>) {
  const { t } = useTranslation()
  const dateLabels = useDateLabels()
  const { id, question, value, onValue, error } = props
  switch (question.type) {
    case 'text':
      return <RichTextEditor id={id} label={question.label} value={value} onChange={(doc) => onValue(doc ?? undefined)} error={error} />
    case 'short':
      return <TextField id={id} label={question.label} value={inputText(value)} onChange={(event) => onValue(fromInput(event.target.value))} error={error} />
    case 'number':
      return (
        <TextField
          id={id}
          type="number"
          min={0}
          inputMode="decimal"
          label={question.label}
          labelSuffix={question.unit && `(${question.unit})`}
          value={value === undefined ? '' : String(value as number)}
          onChange={(event) => onValue(fromNumberInput(event.target.value))}
          error={error}
        />
      )
    case 'date':
      return <DatePicker label={question.label} value={dateValue(value)} onChange={(date) => onValue(date ?? undefined)} labels={dateLabels} />
    case 'choice':
      return <ChoiceEditor {...props} options={[...question.options, ...(question.other ? [{ value: OTHER, label: t('sad.answer.other') }] : [])]} />
    case 'multi':
      return <MultiEditor {...props} question={question} />
    case 'yesno':
      return <YesNoEditor {...props} question={question} />
    case 'links':
      return <LinksEditor {...props} question={question} />
    case 'table':
      return <TableField {...props} question={question} />
    case 'retention':
      return <RetentionField {...props} question={question} />
    case 'trm':
      return question.fallback?.type === 'choice' ? (
        <ChoiceEditor {...props} options={question.fallback.options} />
      ) : (
        <TextField id={id} label={question.label} value={inputText(value)} onChange={(event) => onValue(fromInput(event.target.value))} error={error} />
      )
  }
}

/** One question being answered: its editor, "does not apply" with a reason, and the API's message. */
export function QuestionField({ question, answer, onChange, error, context }: { question: Question; answer: Answer | undefined; onChange: (answer: Answer | undefined) => void; error?: string; context: FieldContext }) {
  const { t } = useTranslation()
  const id = useId()
  // TRM values (and names the caller may not see) are not answered here.
  if (question.type === 'trm' && (question.fallback?.type === 'none' || context.trm?.restricted.includes(question.source) || trmText(context.trm, question.source) !== null)) {
    return (
      <div role="group" aria-labelledby={`${id}-label`} className="flex flex-col gap-1">
        <span id={`${id}-label`} className="text-sm font-semibold">
          {question.label}
        </span>
        <TrmValue question={question} trm={context.trm} />
        <span className="text-xs text-text-subdued">{t('sad.editor.fromTrm')}</span>
      </div>
    )
  }
  const notApplicable = answer !== undefined && 'notApplicable' in answer
  const controls = (
    <>
      {question.hint && <p className="text-sm text-text-subdued">{question.hint}</p>}
      {question.allowNotApplicable !== false && (
        <Checkbox label={t('sad.editor.notApplicable')} checked={notApplicable} onCheckedChange={(checked) => onChange(checked ? { notApplicable: true, reason: '' } : undefined)} />
      )}
      {notApplicable && (
        <TextField
          id={`${id}-reason`}
          label={t('sad.editor.reason')}
          value={answer.reason}
          onChange={(event) => onChange({ notApplicable: true, reason: event.target.value })}
          error={error ?? (answer.reason.trim() === '' ? t('sad.editor.reasonNeeded') : undefined)}
        />
      )}
      {error && !notApplicable && !OWN_ERROR.includes(question.type) && <p className="text-sm text-text-error">{error}</p>}
    </>
  )
  const editor = (footer?: ReactNode) => (
    <ValueEditor id={id} question={question} value={answer && 'value' in answer ? answer.value : undefined} onValue={(value) => onChange(value === undefined ? undefined : { value })} error={error} context={context} footer={footer} />
  )
  if (COMPOSITE.includes(question.type)) {
    return notApplicable ? (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">{question.label}</legend>
        {controls}
      </fieldset>
    ) : (
      editor(controls)
    )
  }
  return (
    <div role="group" aria-label={question.label} className="flex flex-col gap-2">
      {question.type === 'trm' && <span className="text-xs text-text-subdued">{t('sad.editor.notInTrm')}</span>}
      {notApplicable ? <span className="text-sm font-semibold">{question.label}</span> : editor()}
      {controls}
    </div>
  )
}
