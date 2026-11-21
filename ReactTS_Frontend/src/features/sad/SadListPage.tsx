import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, DataTable, Pagination, StatusIndicator } from '../../components/qi'
import { formatDate } from '../../lib/format'
import { useListParams } from '../trm/list-params'
import { FilterDropdown, RecordLink, SearchField } from '../trm/parts'
import { LocalAuthFlag } from './LocalAuthFlag'
import { PAGE_SIZE, useSadList } from './queries'

const STATUSES = ['none', 'draft', 'in_approval', 'current'] as const

/** /sad — the applications in the reader's scope and the state of their SADs. */
export function SadListPage() {
  const { t } = useTranslation()
  const list = useListParams(['q', 'status', 'authentication'])
  const documents = useSadList(list.values, list.page)

  return (
    <>
      <PageHeader title={t('sad.list.title')} intro={t('sad.list.intro')} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SearchField label={t('sad.list.search')} value={list.values.q} onSearch={(q) => list.set({ q })} />
        <FilterDropdown
          label={t('sad.list.status')}
          anyLabel={t('sad.list.anyStatus')}
          value={list.values.status}
          onChange={(status) => list.set({ status })}
          options={STATUSES.map((value) => ({ value, label: t(`sad.list.statuses.${value}`) }))}
        />
        <FilterDropdown
          label={t('sad.list.authentication')}
          anyLabel={t('sad.list.anyAuthentication')}
          value={list.values.authentication}
          onChange={(authentication) => list.set({ authentication })}
          options={[{ value: 'local', label: t('sad.localAuth.flag') }]}
        />
        {list.filtered && (
          <div className="flex items-end">
            <Button variant="tertiary" onClick={list.clear}>
              {t('sad.list.clear')}
            </Button>
          </div>
        )}
      </div>
      {documents.isPending ? (
        <Loading />
      ) : documents.isError ? (
        <LoadFailed onRetry={() => void documents.refetch()} />
      ) : (
        <>
          <DataTable
            caption={t('sad.list.caption')}
            hideCaption
            rows={documents.data.items}
            getRowId={(item) => item.applicationId}
            emptyState={t('sad.list.none')}
            columns={[
              {
                id: 'name',
                header: t('sad.list.application'),
                cell: (item) => (
                  <div className="flex flex-col gap-1">
                    <RecordLink to={`/sad/${item.applicationId}`} name={item.name ?? item.number} />
                    {item.localAuthentication && <LocalAuthFlag from={item.localAuthentication} />}
                  </div>
                ),
              },
              { id: 'number', header: t('sad.list.apmId'), accessor: (item) => item.number ?? '—' },
              {
                id: 'current',
                header: t('sad.list.current'),
                accessor: (item) => (item.current ? t('sad.list.version', { number: item.current.number, date: formatDate(item.current.approvedAt) }) : t('sad.list.noVersion')),
              },
              {
                id: 'open',
                header: t('sad.list.open'),
                cell: (item) =>
                  item.open ? <StatusIndicator tone={item.open.status === 'draft' ? 'informative' : 'attention'}>{t(`sad.status.${item.open.status}`)}</StatusIndicator> : '—',
              },
            ]}
          />
          <Pagination
            page={list.page}
            pageCount={Math.ceil(documents.data.total / PAGE_SIZE)}
            onPageChange={(next) => list.set({ page: String(next) } as Partial<Record<'q' | 'status' | 'authentication' | 'page', string>>)}
            labels={{ label: t('sad.list.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
    </>
  )
}
