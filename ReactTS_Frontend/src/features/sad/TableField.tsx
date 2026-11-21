import { type ReactNode, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDateLabels } from '../../components/page/useDateLabels'
import { Button, Checkbox, DatePicker, Dropdown, Tag, TextField } from '../../components/qi'
import { PersonPicker } from '../people/PersonPicker'
import { ApplicationPicker } from '../trm/ApplicationPicker'
import { dateValue, fromInput, fromNumberInput, inputText } from './format'
import type { Column, DataObject, Option, QuestionOf } from './schemas'
import type { FieldContext } from './QuestionField'

interface Row {
  id?: string
  row?: string
  cells: Record<string, unknown>
}
interface Apps {
  items: { id: string; name: string }[]
  other?: string
}

type Owner = { id?: string; name: string }

/** A person picked from TechCockpit users, or typed when they are not one (both are personal data). */
function PersonCell({ id, column, value, onChange }: { id: string; column: Column; value: Owner | undefined; onChange: (value: Owner | undefined) => void }) {
  const { t } = useTranslation()
  const typed = value !== undefined && value.id === undefined
  const [typing, setTyping] = useState(typed)
  return (
    <div className="flex flex-col gap-2">
      {typing ? (
        <TextField id={`${id}-typed`} label={column.label} value={value?.name ?? ''} onChange={(event) => onChange(event.target.value.trim() ? { name: event.target.value } : undefined)} />
      ) : (
        <PersonPicker label={column.label} value={value?.id ? { id: value.id, name: value.name, email: '', isExternal: false } : null} onChange={(next) => onChange(next ? { id: next.id, name: next.name } : undefined)} />
      )}
      <Checkbox
        label={t('sad.editor.typePerson', { label: column.label })}
        checked={typing}
        onCheckedChange={(checked) => {
          // Picked and typed names are not kept across: switching starts empty.
          setTyping(checked)
          onChange(undefined)
        }}
      />
    </div>
  )
}

/** Data connected to an API: each data object with its key attributes. */
function DataObjectsCell({ id, column, value, onChange }: { id: string; column: Column; value: DataObject[] | undefined; onChange: (value: DataObject[] | undefined) => void }) {
  const { t } = useTranslation()
  const rows = value ?? []
  const set = (next: DataObject[]) => onChange(next.length > 0 ? next : undefined)
  const change = (index: number, patch: Partial<DataObject>) => set(rows.map((row, at) => (at === index ? { ...row, ...patch } : row)))
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{column.label}</legend>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-2 md:grid-cols-[1fr_2fr_auto] md:items-end">
          <TextField id={`${id}-${index}-object`} label={t('sad.editor.dataObject')} value={row.object} onChange={(event) => change(index, { object: event.target.value })} />
          <TextField id={`${id}-${index}-attributes`} label={t('sad.editor.dataAttributes')} value={row.attributes} onChange={(event) => change(index, { attributes: event.target.value })} />
          <Button variant="tertiary" onClick={() => set(rows.filter((_, at) => at !== index))}>
            {t('sad.editor.removeDataObject')}
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" onClick={() => set([...rows, { object: '', attributes: '' }])}>
          {t('sad.editor.addDataObject')}
        </Button>
      </div>
    </fieldset>
  )
}

function ApplicationsCell({ id, column, value, onChange, canSearch }: { id: string; column: Column; value: Apps | undefined; onChange: (value: Apps | undefined) => void; canSearch: boolean }) {
  const { t } = useTranslation()
  const items = value?.items ?? []
  const set = (next: Apps) => onChange(next.items.length > 0 || next.other !== undefined ? next : undefined)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-semibold">{column.label}</legend>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((app) => (
            <li key={app.id} className="flex items-center gap-1">
              <Tag>{app.name}</Tag>
              <Button variant="tertiary" onClick={() => set({ ...value, items: items.filter((i) => i.id !== app.id) })}>
                {t('sad.editor.removeApp', { name: app.name })}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {canSearch && (
        <ApplicationPicker
          label={t('sad.editor.addApp')}
          value={null}
          onChange={(app) => app && !items.some((i) => i.id === app.id) && set({ ...value, items: [...items, { id: app.id, name: app.name ?? app.id }] })}
        />
      )}
      <TextField id={`${id}-other`} label={t('sad.editor.otherSystems')} labelSuffix={t('sad.editor.optional')} value={inputText(value?.other)} onChange={(event) => set({ items, other: fromInput(event.target.value) })} />
    </fieldset>
  )
}

function Cell({ id, column, value, onChange, context }: { id: string; column: Column; value: unknown; onChange: (value: unknown) => void; context: FieldContext }) {
  const { t } = useTranslation()
  const dateLabels = useDateLabels()
  const suffix = column.optional ? t('sad.editor.optional') : undefined
  switch (column.type) {
    case 'choice':
    case 'yesno':
      return (
        <Dropdown
          label={column.label}
          placeholder={t('sad.editor.choose')}
          value={(value as string | undefined) ?? null}
          onValueChange={onChange}
          options={column.type === 'yesno' ? [{ value: 'yes', label: t('sad.answer.yes') }, { value: 'no', label: t('sad.answer.no') }] : (column.options as Option[]).map((o) => ({ value: o.value, label: o.label }))}
        />
      )
    case 'number':
      return (
        <TextField
          id={id}
          type="number"
          min={0}
          label={column.label}
          labelSuffix={suffix}
          value={value === undefined ? '' : String(value as number)}
          onChange={(event) => onChange(fromNumberInput(event.target.value))}
        />
      )
    case 'date':
      return <DatePicker label={column.label} labelSuffix={suffix} value={dateValue(value)} onChange={(date) => onChange(date ?? undefined)} labels={dateLabels} />
    case 'person': {
      if (context.namesHidden) {
        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{column.label}</span>
            <span className="text-sm text-text-subdued">{t('sad.editor.namesHidden')}</span>
          </div>
        )
      }
      return <PersonCell id={id} column={column} value={value as Owner | undefined} onChange={onChange} />
    }
    case 'dataObjects':
      return <DataObjectsCell id={id} column={column} value={value as DataObject[] | undefined} onChange={onChange} />
    case 'applications':
      return <ApplicationsCell id={id} column={column} value={value as Apps | undefined} onChange={onChange} canSearch={context.canSearchApplications} />
    default:
      return <TextField id={id} label={column.label} labelSuffix={suffix} value={inputText(value)} onChange={(event) => onChange(fromInput(event.target.value))} />
  }
}

/** A table answer: fixed rows (e.g. the control table) and/or rows the author adds. */
export function TableField({ question, value, onValue, context, footer }: { question: QuestionOf<'table'>; value: unknown; onValue: (value: unknown) => void; context: FieldContext; footer?: ReactNode }) {
  const { t } = useTranslation()
  const id = useId()
  const stored = (value as Row[] | undefined) ?? []
  const fixed = question.fixedRows ?? []
  // Fixed rows always show, answered or not; then the author's own rows.
  const rows: Row[] = [...fixed.map((label) => stored.find((row) => row.row === label) ?? { row: label, cells: {} }), ...stored.filter((row) => !row.row || !fixed.includes(row.row))]
  const save = (next: Row[]) => {
    const kept = next.filter((row) => !(row.row && fixed.includes(row.row) && Object.keys(row.cells).length === 0))
    onValue(kept.length > 0 ? kept : undefined)
  }
  const update = (index: number, change: Partial<Row>) => save(rows.map((row, i) => (i === index ? { ...row, ...change } : row)))

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 text-sm font-semibold">{question.label}</legend>
      {rows.map((row, index) => {
        const isFixed = row.row !== undefined && fixed.includes(row.row)
        return (
          <fieldset key={index} className="flex flex-col gap-2 rounded-card border border-divider-default p-3">
            <legend className="px-1 text-sm font-semibold">{isFixed ? row.row : t('sad.editor.row', { n: index + 1 - fixed.length })}</legend>
            {!isFixed && fixed.length > 0 && <TextField id={`${id}-${index}-label`} label={t('sad.editor.rowName')} value={inputText(row.row)} onChange={(event) => update(index, { row: event.target.value })} />}
            <div className="grid gap-3 md:grid-cols-2">
              {question.columns.map((column) => (
                <Cell
                  key={column.key}
                  id={`${id}-${index}-${column.key}`}
                  column={column}
                  value={row.cells[column.key]}
                  context={context}
                  onChange={(cell) => {
                    const cells = { ...row.cells }
                    if (cell === undefined) delete cells[column.key]
                    else cells[column.key] = cell
                    update(index, { cells })
                  }}
                />
              ))}
            </div>
            {!isFixed && (
              <div>
                <Button variant="tertiary" onClick={() => save(rows.filter((_, i) => i !== index))}>
                  {t('sad.editor.removeRow', { n: index + 1 - fixed.length })}
                </Button>
              </div>
            )}
          </fieldset>
        )
      })}
      {question.addRows && (
        <div>
          <Button variant="secondary" onClick={() => save([...rows, { id: crypto.randomUUID(), ...(fixed.length > 0 ? { row: '' } : {}), cells: {} }])}>
            {t('sad.editor.addRow')}
          </Button>
        </div>
      )}
      {footer}
    </fieldset>
  )
}
