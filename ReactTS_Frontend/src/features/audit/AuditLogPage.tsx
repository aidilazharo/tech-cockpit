import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { useDateLabels } from '../../components/page/useDateLabels'
import { Button, DataTable, DatePicker, Dialog, Dropdown, Pagination, TextField, type DataTableColumn } from '../../components/qi'
import { endOfDayMy, startOfDayMy } from '../../lib/dates'
import { formatDateTime } from '../../lib/format'
import { type AuditFilters, PAGE_SIZE, useAuditEntries, useAuditFacets } from './queries'
import type { AuditEntry } from './schemas'

interface FormState {
  actorEmail: string
  action: string | null
  resourceType: string | null
  resourceId: string
  from: string | null
  to: string | null
}

const EMPTY: FormState = { actorEmail: '', action: null, resourceType: null, resourceId: '', from: null, to: null }

function toFilters(form: FormState, page: number): AuditFilters {
  return {
    actorEmail: form.actorEmail.trim() || undefined,
    action: form.action ?? undefined,
    resourceType: form.resourceType ?? undefined,
    resourceId: form.resourceId.trim() || undefined,
    from: form.from ? startOfDayMy(form.from) : undefined,
    to: form.to ? endOfDayMy(form.to) : undefined,
    page,
  }
}

/** /admin/audit-log — search the append-only audit trail. */
export function AuditLogPage() {
  const { t } = useTranslation()
  const dateLabels = useDateLabels()
  const facets = useAuditFacets()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [applied, setApplied] = useState<FormState>(EMPTY)
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const entries = useAuditEntries(toFilters(applied, page))

  const search = (event: FormEvent) => {
    event.preventDefault()
    setApplied(form)
    setPage(1)
  }

  // No person: a web request without valid sign-in, or the system itself (jobs, workflows).
  const who = (entry: AuditEntry) => entry.actor?.name ?? entry.actorUserId ?? (entry.httpMethod ? t('audit.unknownCaller') : t('audit.system'))

  const columns: DataTableColumn<AuditEntry>[] = [
    { id: 'when', header: t('audit.colWhen'), accessor: (entry) => formatDateTime(entry.occurredAt) },
    {
      id: 'who',
      header: t('audit.colWho'),
      cell: (entry) => (
        <span className="flex flex-col">
          <span>{who(entry)}</span>
          {entry.actor && <span className="text-sm text-text-subdued">{entry.actor.email}</span>}
        </span>
      ),
    },
    { id: 'action', header: t('audit.colAction'), cell: (entry) => <code className="text-sm">{entry.action}</code> },
    { id: 'record', header: t('audit.colRecord'), accessor: (entry) => [entry.resourceType, entry.resourceId].filter(Boolean).join(' ') || t('common.none') },
    { id: 'result', header: t('audit.colResult'), accessor: (entry) => entry.statusCode ?? t('common.none') },
    {
      id: 'details',
      header: t('audit.colDetails'),
      cell: (entry) => (
        <Button variant="tertiary" aria-label={t('audit.open', { when: formatDateTime(entry.occurredAt) })} onClick={() => setOpen(entry)}>
          {t('common.details')}
        </Button>
      ),
    },
  ]

  return (
    <>
      <PageHeader title={t('audit.title')} intro={t('audit.intro')} />
      <form noValidate onSubmit={search} className="grid gap-4 md:grid-cols-3">
        <TextField label={t('audit.person')} type="email" value={form.actorEmail} onChange={(event) => setForm({ ...form, actorEmail: event.target.value })} />
        <Dropdown<string>
          label={t('audit.action')}
          placeholder={t('audit.anyAction')}
          value={form.action}
          onValueChange={(action) => setForm({ ...form, action })}
          options={(facets.data?.actions ?? []).map((action) => ({ value: action, label: action }))}
        />
        <Dropdown<string>
          label={t('audit.resourceType')}
          placeholder={t('audit.anyResourceType')}
          value={form.resourceType}
          onValueChange={(resourceType) => setForm({ ...form, resourceType })}
          options={(facets.data?.resourceTypes ?? []).map((type) => ({ value: type, label: type }))}
        />
        <TextField label={t('audit.resourceId')} value={form.resourceId} onChange={(event) => setForm({ ...form, resourceId: event.target.value })} />
        <DatePicker label={t('audit.from')} value={form.from} onChange={(from) => setForm({ ...form, from })} max={form.to ?? undefined} labels={dateLabels} />
        <DatePicker label={t('audit.to')} value={form.to} onChange={(to) => setForm({ ...form, to })} min={form.from ?? undefined} labels={dateLabels} />
        <div className="flex flex-wrap gap-2 md:col-span-3">
          <Button type="submit">{t('audit.search')}</Button>
          <Button
            variant="tertiary"
            onClick={() => {
              setForm(EMPTY)
              setApplied(EMPTY)
              setPage(1)
            }}
          >
            {t('common.clear')}
          </Button>
        </div>
      </form>
      {entries.isPending ? (
        <Loading />
      ) : entries.isError ? (
        <LoadFailed onRetry={() => void entries.refetch()} />
      ) : (
        <>
          <DataTable caption={t('audit.caption')} hideCaption columns={columns} rows={entries.data.items} getRowId={(entry) => entry.id} emptyState={t('audit.none')} />
          <Pagination
            page={page}
            pageCount={Math.ceil(entries.data.total / PAGE_SIZE)}
            onPageChange={setPage}
            labels={{ label: t('audit.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
      {open && <AuditEntryDialog entry={open} who={who(open)} onClose={() => setOpen(null)} />}
    </>
  )
}

function show(value: unknown): string {
  if (value === undefined || value === null) return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

function AuditEntryDialog({ entry, who, onClose }: { entry: AuditEntry; who: string; onClose: () => void }) {
  const { t } = useTranslation()
  const before = entry.changes?.before ?? {}
  const after = entry.changes?.after ?? {}
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const rows: [string, string][] = [
    [t('audit.fields.occurredAt'), formatDateTime(entry.occurredAt)],
    [t('audit.fields.actor'), entry.actor ? `${who} (${entry.actor.email})` : who],
    [t('audit.fields.authMethod'), show(entry.authMethod)],
    [t('audit.fields.action'), entry.action],
    [t('audit.fields.resource'), [entry.resourceType, entry.resourceId].filter(Boolean).join(' ') || '—'],
    [t('audit.fields.request'), [entry.httpMethod, entry.path].filter(Boolean).join(' ') || '—'],
    [t('audit.fields.statusCode'), show(entry.statusCode)],
    [t('audit.fields.requestId'), show(entry.requestId)],
    [t('audit.fields.ipAddress'), show(entry.ipAddress)],
    ...(entry.metadata ? [[t('audit.fields.metadata'), JSON.stringify(entry.metadata)] as [string, string]] : []),
  ]

  return (
    <Dialog open onClose={onClose} title={t('audit.entryTitle')} closeLabel={t('common.close')} actions={<Button onClick={onClose}>{t('common.close')}</Button>}>
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="font-semibold text-text-subdued">{label}</dt>
              <dd className="break-all">{value}</dd>
            </div>
          ))}
        </dl>
        {changed.length > 0 && (
          <table className="w-full border-collapse text-left text-sm">
            <caption className="mb-2 text-left font-semibold">{t('audit.changes')}</caption>
            <thead>
              <tr>
                <th scope="col" className="border-b border-divider-bold py-2 pr-3">
                  {t('audit.field')}
                </th>
                <th scope="col" className="border-b border-divider-bold py-2 pr-3">
                  {t('audit.before')}
                </th>
                <th scope="col" className="border-b border-divider-bold py-2">
                  {t('audit.after')}
                </th>
              </tr>
            </thead>
            <tbody>
              {changed.map((field) => (
                <tr key={field} className="border-b border-divider-default">
                  <th scope="row" className="py-2 pr-3 font-semibold">
                    {field}
                  </th>
                  <td className="py-2 pr-3 break-all">{show(before[field])}</td>
                  <td className="py-2 break-all">{show(after[field])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Dialog>
  )
}
