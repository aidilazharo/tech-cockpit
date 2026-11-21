import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { DataTable, Pagination, StatusIndicator, Tag } from '../../components/qi'
import { formatDateTime } from '../../lib/format'
import { PAGE_SIZE, useSyncRuns } from './queries'
import { RUN_TONES } from './sync-status'

/** /admin/trm-sync — loads of the Node app's ServiceNow exports (system admins). */
export function SyncRunsPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const runs = useSyncRuns(page)

  return (
    <>
      <PageHeader title={t('trm.sync.title')} intro={t('trm.sync.intro')} />
      <div className="flex max-w-3xl flex-col gap-2 rounded-card border border-divider-default p-4">
        <h2 className="heading-4">{t('trm.sync.howTitle')}</h2>
        <p className="text-sm">{t('trm.sync.how')}</p>
        {/* Scrolls sideways on small screens, so it must be reachable by keyboard. */}
        <pre tabIndex={0} aria-label={t('trm.sync.command')} className="overflow-x-auto rounded-form bg-surface-alternate p-3 text-sm focus-visible:outline-2 focus-visible:outline-border-focus">
          <code>{'npm run trm:sync -- --dir <folder> [--dry-run] [--api https://<techcockpit>]'}</code>
        </pre>
      </div>
      {runs.isPending ? (
        <Loading />
      ) : runs.isError ? (
        <LoadFailed onRetry={() => void runs.refetch()} />
      ) : (
        <>
          <DataTable
            caption={t('trm.sync.caption')}
            hideCaption
            rows={runs.data.items}
            getRowId={(run) => run.id}
            emptyState={t('trm.sync.none')}
            columns={[
              {
                id: 'started',
                header: t('trm.sync.colStarted'),
                cell: (run) => (
                  <Link to={`/admin/trm-sync/${run.id}`} className="font-semibold text-text-link underline-offset-4 hover:underline">
                    {formatDateTime(run.createdAt)}
                  </Link>
                ),
              },
              { id: 'by', header: t('trm.sync.colBy'), accessor: (run) => run.startedBy.name },
              { id: 'status', header: t('trm.sync.colStatus'), cell: (run) => <StatusIndicator tone={RUN_TONES[run.status]}>{t(`trm.sync.status.${run.status}`)}</StatusIndicator> },
              { id: 'type', header: t('trm.sync.colType'), cell: (run) => (run.dryRun ? <Tag>{t('trm.sync.dryRun')}</Tag> : t('trm.sync.realRun')) },
              { id: 'files', header: t('trm.sync.colFiles'), accessor: (run) => t('trm.sync.files', { count: Object.keys(run.received).length }) },
              { id: 'completed', header: t('trm.sync.colCompleted'), accessor: (run) => formatDateTime(run.completedAt) ?? t('common.none') },
            ]}
          />
          <Pagination
            page={page}
            pageCount={Math.ceil(runs.data.total / PAGE_SIZE)}
            onPageChange={(next) => setParams({ page: String(next) })}
            labels={{ label: t('trm.sync.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
    </>
  )
}
