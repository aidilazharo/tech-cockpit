import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ConfirmDialog } from '../../components/page/ConfirmDialog'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, Checkbox, DataTable, Dropdown, PageMessage, Pagination, StatusIndicator, type DataTableColumn } from '../../components/qi'
import { ApiError } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { useListParams } from './list-params'
import { PAGE_SIZE, useMissingRecords, useMissingSummary, useRemoveMissing } from './queries'
import type { MissingRecord, RecordType } from './schemas'
import { SearchField } from './parts'
import { useText } from './text'

interface TypeCount {
  recordType: RecordType
  count: number
}

/** What the last removal did, kept until the person searches or changes record type. */
interface Removal {
  deleted: number
  refused: { name: string | null; reason: string }[]
}

const NUMBERED: readonly RecordType[] = ['applications', 'services']
const WITHOUT_SERVICENOW_ID: readonly RecordType[] = ['servers']

/** Admin page: records the last complete ServiceNow export no longer contained, removed on purpose. */
export function MissingRecordsPage() {
  const { t } = useTranslation()
  const summary = useMissingSummary()
  const [removal, setRemoval] = useState<Removal | null>(null)
  const [first, ...others] = summary.data?.items.filter((item) => item.count > 0) ?? []

  return (
    <>
      <PageHeader title={t('trm.missing.title')} intro={t('trm.missing.intro')} />
      {summary.isPending ? (
        <Loading />
      ) : summary.isError ? (
        summary.error instanceof ApiError && summary.error.status === 403 ? (
          <PageMessage variant="warning">{t('trm.missing.needsGlobal')}</PageMessage>
        ) : (
          <LoadFailed onRetry={() => void summary.refetch()} />
        )
      ) : (
        <>
          <RemovalResult removal={removal} />
          {first ? <MissingList available={[first, ...others]} onRemoval={setRemoval} /> : <PageMessage variant="informative">{t('trm.missing.nothing')}</PageMessage>}
        </>
      )}
    </>
  )
}

function RemovalResult({ removal }: { removal: Removal | null }) {
  const { t } = useTranslation()
  const { named } = useText()
  if (!removal) return null
  return (
    <>
      {removal.deleted > 0 && <PageMessage variant="success">{t('trm.missing.removed', { count: removal.deleted })}</PageMessage>}
      {removal.refused.length > 0 && (
        <PageMessage variant="warning" title={t('trm.missing.refusedTitle')}>
          <ul aria-label={t('trm.missing.refusedTitle')} className="list-disc pl-5">
            {removal.refused.map((item, index) => (
              <li key={index}>{t('trm.missing.refusedItem', { name: named(item.name), reason: t(`trm.missing.reason.${item.reason}`) })}</li>
            ))}
          </ul>
        </PageMessage>
      )}
    </>
  )
}

function MissingList({ available, onRemoval }: { available: [TypeCount, ...TypeCount[]]; onRemoval: (removal: Removal | null) => void }) {
  const { t } = useTranslation()
  const { dash, named } = useText()
  const list = useListParams(['recordType', 'q'] as const)
  const current = available.find((item) => item.recordType === list.values.recordType) ?? available[0]
  const recordType = current.recordType
  const rows = useMissingRecords(recordType, list.values.q, list.page)
  const remove = useRemoveMissing()
  const [confirming, setConfirming] = useState(false)

  // Ticks belong to the list that was on screen; a new type, search or page starts empty.
  const scope = `${recordType}|${list.values.q}|${list.page}`
  const [selectedScope, setSelectedScope] = useState(scope)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  if (scope !== selectedScope) {
    setSelectedScope(scope)
    setSelected(new Set())
  }

  const items = rows.data?.items ?? []
  const removable = items.filter((row) => row.blockers.length === 0)
  const chosen = items.filter((row) => selected.has(row.id))
  const everyRemovableChosen = removable.length > 0 && removable.every((row) => selected.has(row.id))

  const toggle = (id: string, on: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const open = () => {
    remove.reset()
    setConfirming(true)
  }

  const confirm = () => {
    const names = new Map(chosen.map((row) => [row.id, row.name]))
    remove.mutate(
      { recordType, ids: chosen.map((row) => row.id) },
      {
        onSuccess: (outcome) => {
          onRemoval({ deleted: outcome.deleted.length, refused: outcome.refused.map(({ id, reason }) => ({ name: names.get(id) ?? null, reason })) })
          setSelected(new Set())
          setConfirming(false)
          if (list.page > 1 && items.every((row) => outcome.deleted.includes(row.id))) list.set({ page: String(list.page - 1) })
        },
      },
    )
  }

  const columns: DataTableColumn<MissingRecord>[] = [
    {
      id: 'name',
      header: t('trm.missing.colName'),
      cell: (row) => <Checkbox label={named(row.name)} checked={selected.has(row.id)} disabled={row.blockers.length > 0} onCheckedChange={(on) => toggle(row.id, on)} />,
    },
    ...(NUMBERED.includes(recordType) ? [{ id: 'number', header: t('trm.missing.colNumber'), cell: (row: MissingRecord) => dash(row.number) }] : []),
    ...(WITHOUT_SERVICENOW_ID.includes(recordType) ? [] : [{ id: 'snSysId', header: t('trm.missing.colSnSysId'), cell: (row: MissingRecord) => dash(row.snSysId) }]),
    { id: 'since', header: t('trm.missing.colSince'), cell: (row) => formatDate(row.missingSince) },
    {
      id: 'removable',
      header: t('trm.missing.colRemovable'),
      cell: (row) =>
        row.blockers.length === 0 ? (
          <StatusIndicator tone="positive">{t('trm.missing.removable')}</StatusIndicator>
        ) : (
          <>
            <StatusIndicator tone="attention">{t('trm.missing.blocked')}</StatusIndicator>
            <ul className="mt-1 list-disc pl-5 text-sm text-text-subdued">
              {row.blockers.map((blocker) => (
                <li key={blocker}>{t(`trm.missing.reason.${blocker}`)}</li>
              ))}
            </ul>
          </>
        ),
    },
  ]

  return (
    <>
      <form role="search" aria-label={t('trm.filters')} onSubmit={(event) => event.preventDefault()} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Dropdown<string>
          label={t('trm.missing.type')}
          value={recordType}
          onValueChange={(next) => {
            onRemoval(null)
            list.set({ recordType: next })
          }}
          options={available.map((item) => ({ value: item.recordType, label: t('trm.missing.typeOption', { type: t(`trm.sync.recordType.${item.recordType}`), count: item.count }) }))}
        />
        <SearchField
          label={t('trm.missing.search')}
          value={list.values.q}
          onSearch={(q) => {
            onRemoval(null)
            list.set({ q })
          }}
        />
        {list.values.q !== '' && (
          <div className="flex items-end">
            <Button
              variant="tertiary"
              onClick={() => {
                onRemoval(null)
                list.set({ q: '' })
              }}
            >
              {t('common.clear')}
            </Button>
          </div>
        )}
      </form>
      {rows.isPending || rows.isPlaceholderData ? (
        <Loading />
      ) : rows.isError ? (
        <LoadFailed onRetry={() => void rows.refetch()} />
      ) : (
        <>
          <p className="text-sm text-text-subdued" aria-live="polite">
            {t('trm.missing.total', { count: rows.data.total })}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Checkbox
              label={t('trm.missing.selectAll')}
              checked={everyRemovableChosen}
              disabled={removable.length === 0}
              onCheckedChange={(on) => setSelected(on ? new Set(removable.map((row) => row.id)) : new Set())}
            />
            <Button variant="secondary" disabled={chosen.length === 0} onClick={open}>
              {t('trm.missing.removeSelected', { count: chosen.length })}
            </Button>
          </div>
          <DataTable caption={t('trm.missing.caption')} hideCaption columns={columns} rows={items} getRowId={(row) => row.id} emptyState={t('trm.missing.none')} />
          <Pagination
            page={list.page}
            pageCount={Math.ceil(rows.data.total / PAGE_SIZE)}
            onPageChange={(next) => list.set({ page: String(next) })}
            labels={{ label: t('trm.missing.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('trm.missing.confirmTitle', { count: chosen.length })}
        description={t('trm.missing.confirmBody')}
        confirmLabel={t('trm.missing.confirm')}
        onConfirm={confirm}
        pending={remove.isPending}
        error={remove.error}
      />
    </>
  )
}
