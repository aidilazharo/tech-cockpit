import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toDisplayDate } from '../../lib/dates'
import { optionLabel, trmText } from './format'
import { RichText } from './RichText'
import type { Answer, Column, DataObject, Question, QuestionOf, RetentionValues, TrmData } from './schemas'

export interface AnswerContext {
  trm: TrmData | null
  retention: RetentionValues[]
  /** People's names are hidden from the reader: a name left out shows as "Restricted" */
  namesHidden?: boolean
}

interface EnvironmentService {
  name: string | null
  environment: string | null
  servers: string[]
  software: { name: string | null; version: string | null; standard: string | null; standardStatus: string | null }[]
}

const subdued = (text: string) => <span className="text-text-subdued">{text}</span>

/** A table answer. Wide tables scroll sideways; the region is focusable so keyboard users can scroll it too. */
function Grid({ label, headers, rows }: { label: string; headers: string[]; rows: ReactNode[][] }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} className="overflow-x-auto rounded-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={index} scope="col" className="border-b border-divider-default px-2 py-1 text-left font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-divider-subdued px-2 py-1 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function useCell() {
  const { t } = useTranslation()
  return (column: Column, value: unknown): string => {
    if (value === undefined || value === null || value === '') return '—'
    switch (column.type) {
      case 'choice':
        return optionLabel(column.options, String(value as string))
      case 'yesno':
        return value === 'yes' ? t('sad.answer.yes') : t('sad.answer.no')
      case 'date':
        return toDisplayDate(value as string)
      case 'person':
        // Picked or typed: both have a name.
        return (value as { name: string }).name
      case 'dataObjects':
        return (value as DataObject[]).map((row) => `${row.object}: ${row.attributes}`).join('; ') || '—'
      case 'applications': {
        const apps = value as { items: { name: string }[]; other?: string }
        return [...apps.items.map((app) => app.name), apps.other].filter(Boolean).join(', ') || '—'
      }
      default:
        return String(value as string | number)
    }
  }
}

function EnvironmentView({ label, services }: { label: string; services: EnvironmentService[] }) {
  const { t } = useTranslation()
  if (services.length === 0) return subdued(t('sad.answer.noServices'))
  return (
    <Grid
      label={label}
      headers={[t('sad.answer.service'), t('sad.answer.environment'), t('sad.answer.servers'), t('sad.answer.software')]}
      rows={services.map((service) => [
        service.name ?? '—',
        service.environment ?? '—',
        service.servers.join(', ') || '—',
        service.software.map((s) => [s.name, s.version, s.standard && `(${s.standard}${s.standardStatus ? `: ${s.standardStatus}` : ''})`].filter(Boolean).join(' ')).join('; ') || '—',
      ])}
    />
  )
}

/** What TRM holds for a question, or null when it holds nothing. */
export function TrmValue({ question, trm }: { question: QuestionOf<'trm'>; trm: TrmData | null }) {
  const { t } = useTranslation()
  if (trm?.restricted.includes(question.source)) return subdued(t('sad.answer.restricted'))
  if (question.source === 'environment') return <EnvironmentView label={question.label} services={(trm?.values.environment as EnvironmentService[] | undefined) ?? []} />
  return <span>{trmText(trm, question.source)}</span>
}

/** A question's answer, read-only. */
export function AnswerView({ question, answer, context }: { question: Question; answer: Answer | undefined; context: AnswerContext }) {
  const { t } = useTranslation()
  const cell = useCell()
  if (question.type === 'trm' && (question.source === 'environment' || context.trm?.restricted.includes(question.source) || trmText(context.trm, question.source) !== null)) {
    return <TrmValue question={question} trm={context.trm} />
  }
  if (!answer) return subdued(t('sad.answer.notAnswered'))
  if ('notApplicable' in answer) {
    return (
      <span>
        <em>{t('sad.answer.notApplicable')}</em> {answer.reason}
      </span>
    )
  }
  const value = answer.value as never
  switch (question.type) {
    case 'text':
      // Answered in one line before the template asked for rich text (version 3): approved versions keep it.
      return typeof value === 'string' ? <span>{value}</span> : <RichText doc={value} />
    case 'short':
      return <span>{value}</span>
    case 'number':
      return <span>{[value, question.unit].filter((part) => part !== undefined).join(' ')}</span>
    case 'date':
      return <span>{toDisplayDate(value)}</span>
    case 'choice':
    case 'multi': {
      const { selected, other } = value as { selected: string | string[]; other?: string }
      const picked = Array.isArray(selected) ? selected : [selected]
      return <span>{picked.map((v) => optionLabel(question.options, v, other, t('sad.answer.other'))).join(', ') || '—'}</span>
    }
    case 'yesno': {
      const { answer: yes, details } = value as { answer: string; details?: string }
      return (
        <span>
          <strong>{yes === 'yes' ? t('sad.answer.yes') : t('sad.answer.no')}</strong>
          {details ? ` — ${details}` : ''}
        </span>
      )
    }
    case 'links':
      return (
        <ul className="flex flex-col gap-1">
          {(value as { label?: string; url: string }[]).map((link, index) => (
            <li key={index}>
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-text-link underline">
                {link.label || link.url}
              </a>
            </li>
          ))}
        </ul>
      )
    case 'table': {
      const rows = value as { row?: string; cells: Record<string, unknown> }[]
      const labelled = question.fixedRows !== undefined
      return (
        <Grid
          label={question.label}
          headers={[...(labelled ? [''] : []), ...question.columns.map((column) => column.label)]}
          rows={rows.map((row) => [...(labelled ? [<strong key="row">{row.row}</strong>] : []), ...question.columns.map((column) => (column.personal && row.cells[column.key] === undefined ? (context.namesHidden ? t('common.restricted') : '—') : cell(column, row.cells[column.key])))])}
        />
      )
    }
    case 'retention': {
      const rows = (value as { rows: { standardId: string; resourceName: string; comment?: string }[] }).rows
      return (
        <Grid
          label={question.label}
          headers={[t('sad.retention.serviceType'), t('sad.retention.dataType'), t('sad.retention.resourceName'), t('sad.retention.yearly'), t('sad.retention.monthly'), t('sad.retention.weekly'), t('sad.retention.daily'), t('sad.retention.comment')]}
          rows={rows.map((row) => {
            const standard = context.retention.find((r) => r.id === row.standardId)
            return [standard?.serviceType ?? '—', standard?.dataType ?? '—', row.resourceName, standard?.yearly ?? '', standard?.monthly ?? '', standard?.weekly ?? '', standard?.daily ?? '', [standard?.comment, row.comment].filter(Boolean).join(' ')]
          })}
        />
      )
    }
    case 'trm': {
      const fallback = value as string | { selected: string }
      return <span>{typeof fallback === 'string' ? fallback : optionLabel(question.fallback?.type === 'choice' ? question.fallback.options : [], fallback.selected)}</span>
    }
  }
}
