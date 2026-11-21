import type { UseQueryResult } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import {
  Button,
  Checkbox,
  DataTable,
  Dropdown,
  PageMessage,
  Pagination,
  StatusIndicator,
  Tag,
  TextField,
  type DataTableColumn,
  type StatusTone,
} from '../../components/qi'
import { ApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { useListParams } from './list-params'
import { PAGE_SIZE } from './queries'
import type { Ref, SoftwareUse, StandardRef } from './schemas'
import { useText } from './text'

const SEARCH_DELAY_MS = 300

/** Flag for records a complete ServiceNow export no longer contained. */
export function MissingIndicator({ since }: { since: string | null }) {
  const { t } = useTranslation()
  if (!since) return null
  return <StatusIndicator tone="attention">{t('trm.missingSince', { date: formatDate(since) })}</StatusIndicator>
}

/** A field value; null shows "Restricted" when the caller may not see that class, otherwise a dash. */
export function Value({ value, restricted = false }: { value: ReactNode; restricted?: boolean }) {
  const { t } = useTranslation()
  if (value !== null && value !== undefined && value !== '') return <>{value}</>
  if (restricted) return <span className="text-text-subdued italic">{t('common.restricted')}</span>
  return <>{t('common.none')}</>
}

/** Label/value pairs. */
export function Details({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="text-sm font-semibold text-text-subdued">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Section({ id, title, actions, children }: { id: string; title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={id} className="heading-3">
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  )
}

/** Links to related records, or a dash. */
export function RefLinks({ items, to }: { items: Ref[]; to: (id: string) => string }) {
  const { t } = useTranslation()
  if (items.length === 0) return <>{t('common.none')}</>
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.id}>
          <RecordLink to={to(item.id)} name={item.name} />
        </li>
      ))}
    </ul>
  )
}

export function RecordLink({ to, name }: { to: string; name: string | null }) {
  const { named } = useText()
  return (
    <Link to={to} className="font-semibold text-text-link underline-offset-4 hover:underline">
      {named(name)}
    </Link>
  )
}

const STANDARD_TONES: Record<string, StatusTone> = { standard: 'positive', restricted: 'attention' }

/** A product standard's status (Standard, Restricted, ...), never colour alone. */
export function StandardStatus({ status }: { status: string | null }) {
  const { t } = useTranslation()
  if (!status) return <>{t('common.none')}</>
  return <StatusIndicator tone={STANDARD_TONES[status.toLowerCase()] ?? 'informative'}>{status}</StatusIndicator>
}

/** Every ServiceNow field as exported (absent for vendors). Masked fields arrive as null. */
export function SourceFields({ source }: { source: Record<string, unknown> | null }) {
  const { t } = useTranslation()
  const [showEmpty, setShowEmpty] = useState(false)
  if (!source) return null
  const rows = Object.entries(source)
    .map(([field, value]) => ({ field, value }))
    .filter(({ value }) => showEmpty || value !== '')
    .sort((a, b) => a.field.localeCompare(b.field))
  return (
    <details className="rounded-card border border-divider-default p-4">
      <summary className="cursor-pointer font-semibold">
        {t('trm.source.title')} ({t('trm.source.count', { count: Object.keys(source).length })})
      </summary>
      <div className="mt-4 flex flex-col gap-3">
        <p className="text-sm text-text-subdued">{t('trm.source.intro')}</p>
        <Checkbox label={t('trm.source.showEmpty')} checked={showEmpty} onCheckedChange={setShowEmpty} />
        <DataTable
          caption={t('trm.source.caption')}
          hideCaption
          rows={rows}
          getRowId={(row) => row.field}
          columns={[
            { id: 'field', header: t('trm.source.field'), cell: (row) => <code className="text-sm">{row.field}</code> },
            {
              id: 'value',
              header: t('trm.source.value'),
              cell: (row) => <Value value={row.value === null ? null : String(row.value)} restricted={row.value === null} />,
            },
          ]}
        />
      </div>
    </details>
  )
}

/** Search box that updates the list after a short pause in typing. */
export function SearchField({ label, value, onSearch }: { label: string; value: string; onSearch: (value: string) => void }) {
  const [text, setText] = useState(value)
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    setText(value)
  }
  useEffect(() => {
    if (text.trim() === value) return
    const timer = setTimeout(() => onSearch(text.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [text, value, onSearch])
  return <TextField label={label} type="search" value={text} onChange={(event) => setText(event.target.value)} />
}

/** Loading, not found (or not yours) and error states of a detail page. */
export function DetailStates<T>({
  query,
  notFound,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null; data: T | undefined; refetch: () => unknown }
  notFound: string
  children: (data: T) => ReactNode
}) {
  if (query.isPending) return <Loading />
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <PageMessage variant="warning">{notFound}</PageMessage>
    return <LoadFailed onRetry={() => void query.refetch()} />
  }
  return <>{children(query.data as T)}</>
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="w-fit text-sm font-semibold text-text-link underline underline-offset-4">
      {children}
    </Link>
  )
}

const ANY = 'any'

/** A list filter: "Any …" or one value; the choice lives in the URL. */
export function FilterDropdown({
  label,
  anyLabel,
  value,
  onChange,
  options,
}: {
  label: string
  anyLabel: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <Dropdown<string>
      label={label}
      value={value || ANY}
      onValueChange={(next) => onChange(next && next !== ANY ? next : '')}
      options={[{ value: ANY, label: anyLabel }, ...options]}
    />
  )
}

/** Software a service runs, with the product standard's status. */
export function SoftwareList({ items }: { items: SoftwareUse[] }) {
  const { t } = useTranslation()
  if (items.length === 0) return <>{t('common.none')}</>
  return (
    <ul className="flex flex-col gap-2">
      {items.map((software) => (
        <li key={software.id} className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <RecordLink to={`/trm/software-models/${software.id}`} name={software.name} />
          {software.fullVersion && <span className="text-sm">{t('trm.application.version', { version: software.fullVersion })}</span>}
          {software.primaryModel && <Tag>{t('trm.application.primary')}</Tag>}
          <StandardLink standard={software.productStandard} />
        </li>
      ))}
    </ul>
  )
}

/** A product standard's status, linking to the standard. */
export function StandardLink({ standard }: { standard: StandardRef | null }) {
  const { t } = useTranslation()
  if (!standard) return <span className="text-sm text-text-subdued">{t('trm.application.noStandard')}</span>
  return (
    <Link
      to={`/trm/product-standards/${standard.id}`}
      aria-label={t('trm.application.standardLink', { name: standard.name ?? '' })}
      className="rounded-button underline-offset-4 hover:underline"
    >
      <StandardStatus status={standard.status} />
    </Link>
  )
}

/** Search, filters, total, table and paging: the shape of every TRM list page. */
export function CatalogueListPage<T extends { id: string }, K extends string>({
  title,
  intro,
  searchLabel,
  filterKeys,
  useRows,
  filters,
  columns,
  caption,
  none,
  pagesLabel,
  total,
}: {
  title: string
  intro: string
  searchLabel: string
  filterKeys: readonly K[]
  useRows: (params: Record<string, string>, page: number) => UseQueryResult<{ items: T[]; total: number }>
  filters?: (list: { values: Record<K | 'q', string>; set: (changes: Partial<Record<K, string>>) => void }) => ReactNode
  columns: DataTableColumn<T>[]
  caption: string
  none: string
  pagesLabel: string
  total: (count: number) => string
}) {
  const { t } = useTranslation()
  const list = useListParams<K | 'q'>(['q', ...filterKeys])
  const rows = useRows(list.values, list.page)
  return (
    <>
      <PageHeader title={title} intro={intro} />
      <form role="search" aria-label={t('trm.filters')} onSubmit={(event) => event.preventDefault()} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SearchField label={searchLabel} value={list.values.q} onSearch={(q) => list.set({ q } as Partial<Record<K | 'q' | 'page', string>>)} />
        {filters?.({ values: list.values, set: (changes) => list.set(changes as Partial<Record<K | 'q' | 'page', string>>) })}
        {list.filtered && (
          <div className="flex items-end">
            <Button variant="tertiary" onClick={list.clear}>
              {t('common.clear')}
            </Button>
          </div>
        )}
      </form>
      {rows.isPending ? (
        <Loading />
      ) : rows.isError ? (
        <LoadFailed onRetry={() => void rows.refetch()} />
      ) : (
        <>
          <p className="text-sm text-text-subdued" aria-live="polite">
            {total(rows.data.total)}
          </p>
          <DataTable caption={caption} hideCaption columns={columns} rows={rows.data.items} getRowId={(row) => row.id} emptyState={none} />
          <Pagination
            page={list.page}
            pageCount={Math.ceil(rows.data.total / PAGE_SIZE)}
            onPageChange={(next) => list.set({ page: String(next) } as Partial<Record<K | 'q' | 'page', string>>)}
            labels={{ label: pagesLabel, previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
    </>
  )
}

/** The "In ServiceNow" filter every list has. */
export function MissingFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return (
    <FilterDropdown
      label={t('trm.missingFilter')}
      anyLabel={t('trm.missingAny')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'true', label: t('trm.missingYes') },
        { value: 'false', label: t('trm.missingNo') },
      ]}
    />
  )
}

/** Name with the "missing from ServiceNow" flag under it, for list tables. */
export function NameCell({ to, name, missingSince }: { to: string; name: string | null; missingSince: string | null }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <RecordLink to={to} name={name} />
      <MissingIndicator since={missingSince} />
    </span>
  )
}
