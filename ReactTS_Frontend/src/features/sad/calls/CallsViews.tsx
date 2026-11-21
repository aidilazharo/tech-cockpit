import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../lib/api'
import { DataTable, type DataTableColumn } from '../../../components/qi'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { formatDate } from '../../../lib/format'
import { DiagramCanvas } from '../diagrams/DiagramCanvas'
import { canvasEdits } from '../diagrams/helpers'
import { useKindOf } from '../diagrams/labels'
import type { BoxNodeData } from '../diagrams/flow'
import { useApplicationCalls } from '../queries'
import type { ApplicationCall, CallApplication } from '../schemas'
import { appName, dependencyDiagram } from './dependency'

const nameAndNumber = (app: CallApplication) => (app.name && app.number ? `${app.name} (${app.number})` : appName(app))
const rowId = (call: ApplicationCall, index: number) => `${call.source.versionId}/${call.caller.id}/${call.callee.id}/${index}`

/** The columns of a list of calls; `other` is the column naming the other application. */
function useCallColumns(other: 'caller' | 'callee'): DataTableColumn<ApplicationCall>[] {
  const { t } = useTranslation()
  const restrictedOr = (call: ApplicationCall, text: string | null) => (call.restricted ? t('common.restricted') : (text ?? '—'))
  return [
    { id: 'application', header: t(`sad.calls.${other}`), accessor: (call) => nameAndNumber(call[other]) },
    { id: 'calls', header: t('sad.calls.calls'), accessor: (call) => restrictedOr(call, call.calls) },
    { id: 'does', header: t('sad.calls.does'), accessor: (call) => restrictedOr(call, call.does) },
    { id: 'direction', header: t('sad.diagram.direction'), accessor: (call) => (call.twoWay ? t('sad.diagram.twoWayShort') : t('sad.diagram.oneWay')) },
    {
      id: 'source',
      header: t('sad.calls.source'),
      accessor: ({ source }) => t(source.applicationName ? 'sad.calls.sourceSad' : 'sad.calls.sourceSadUnnamed', { name: source.applicationName, number: source.number, date: formatDate(source.approvedAt) }),
    },
  ]
}

function CallTable({ caption, hideCaption, other, rows }: { caption: string; hideCaption?: boolean; other: 'caller' | 'callee'; rows: ApplicationCall[] }) {
  const { t } = useTranslation()
  const keyed = useMemo(() => rows.map((call, index) => ({ ...call, id: rowId(call, index) })), [rows])
  return (
    <DataTable<ApplicationCall & { id: string }>
      caption={caption}
      hideCaption={hideCaption}
      getRowId={(row) => row.id}
      rows={keyed}
      emptyState={<p className="p-4 text-sm text-text-subdued">{t('sad.calls.noneHere')}</p>}
      columns={useCallColumns(other)}
    />
  )
}

/**
 * One application in the middle with the applications calling it and those it calls, from every application's approved
 * SAD, then each SAD's statement in two lists. Used on the TRM application page and the TRM dependency view.
 */
export function ApplicationCalls({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation()
  const query = useApplicationCalls(applicationId)
  const [selected, setSelected] = useState<string | null>(null)
  const blockOrShape = useKindOf()
  const items = query.data?.items
  const diagram = useMemo(() => (items?.length ? dependencyDiagram(applicationId, items, t('common.restricted')) : null), [applicationId, items, t])
  const boxKind = useCallback((data: BoxNodeData) => (data.type === 'part' ? t('sad.calls.thisApplication') : blockOrShape(data)), [blockOrShape, t])
  if (query.isPending) return <Loading />
  if (query.isError) return <LoadFailed onRetry={() => void query.refetch()} />
  const calls = query.data.items
  if (!diagram) return <p className="text-sm text-text-subdued">{t('sad.calls.none')}</p>
  const name = diagram.title
  const callers = calls.filter((call) => call.callee.id === applicationId)
  const callees = calls.filter((call) => call.caller.id === applicationId)
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-4xl text-sm text-text-subdued">{t('sad.calls.intro')}</p>
      <DiagramCanvas diagram={diagram} editable={false} selected={selected} onSelect={setSelected} onEdits={canvasEdits(diagram, undefined, setSelected)} boxKind={boxKind} />
      <CallTable caption={t('sad.calls.calling', { name, count: callers.length })} other="caller" rows={callers} />
      <CallTable caption={t('sad.calls.called', { name, count: callees.length })} other="callee" rows={callees} />
    </div>
  )
}

/** In an application's SAD, under its solution diagram: the calls to it that other applications' approved SADs describe. */
export function IncomingCalls({ applicationId }: { applicationId: string }) {
  const { t } = useTranslation()
  const query = useApplicationCalls(applicationId)
  const rows = useMemo(() => (query.data?.items ?? []).filter((call) => call.callee.id === applicationId && call.source.applicationId !== applicationId), [query.data, applicationId])
  // The API shows the calls only to readers who see the application in TRM or read section 2 by their role (not an approver as such).
  if (query.error instanceof ApiError && query.error.status === 404) return null
  return (
    <section aria-labelledby="incoming-calls" className="flex flex-col gap-2">
      <h4 id="incoming-calls" className="heading-4">
        {t('sad.calls.incoming')}
      </h4>
      <p className="text-sm text-text-subdued">{t('sad.calls.incomingIntro')}</p>
      {query.isPending ? (
        <Loading />
      ) : query.isError ? (
        <LoadFailed onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-subdued">{t('sad.calls.noIncoming')}</p>
      ) : (
        <CallTable caption={t('sad.calls.calling', { name: appName(rows[0].callee), count: rows.length })} hideCaption other="caller" rows={rows} />
      )}
    </section>
  )
}
