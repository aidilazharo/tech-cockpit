import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, DataTable, Pagination, Tag, type DataTableColumn } from '../../components/qi'
import { PAGE_SIZE, useApplications, useCapabilities, useFacets, usePortfolios } from './queries'
import { useListParams } from './list-params'
import { FilterDropdown, MissingFilter, NameCell, SearchField } from './parts'
import { type ApplicationSummary, TIME_RATINGS } from './schemas'
import { capabilityOptions } from './capability-tree'
import { useText } from './text'

const FILTERS = ['q', 'installStatus', 'criticalityRating', 'businessUnit', 'capabilityId', 'timeRating', 'portfolioId', 'missing'] as const

/** /trm/applications — business applications from ServiceNow with TRM's assessment. */
export function ApplicationsPage() {
  const { t } = useTranslation()
  const { dash } = useText()
  const list = useListParams(FILTERS)
  const applications = useApplications(list.values, list.page)
  const facets = useFacets()
  const capabilities = useCapabilities()
  const portfolios = usePortfolios()

  const filter = (key: (typeof FILTERS)[number], label: string, anyLabel: string, options: { value: string; label: string }[]) => (
    <FilterDropdown label={label} anyLabel={anyLabel} value={list.values[key]} onChange={(value) => list.set({ [key]: value })} options={options} />
  )
  const plain = (values: string[] | undefined) => (values ?? []).map((value) => ({ value, label: value }))

  const columns: DataTableColumn<ApplicationSummary>[] = [
    {
      id: 'name',
      header: t('trm.applications.colName'),
      cell: (app) => <NameCell to={`/trm/applications/${app.id}`} name={app.name} missingSince={app.missingSince} />,
    },
    { id: 'number', header: t('trm.applications.colNumber'), accessor: (app) => dash(app.number) },
    { id: 'status', header: t('trm.applications.colStatus'), accessor: (app) => dash(app.installStatus) },
    { id: 'criticality', header: t('trm.applications.colCriticality'), accessor: (app) => dash(app.criticalityRating) },
    {
      id: 'capability',
      header: t('trm.applications.colCapability'),
      cell: (app) => (
        <span className="flex flex-col items-start gap-1">
          <span>{dash(app.capability?.name)}</span>
          {app.capabilityMismatch && <Tag>{t('trm.applications.capabilityToCheck')}</Tag>}
        </span>
      ),
    },
    { id: 'time', header: t('trm.applications.colTime'), accessor: (app) => t(`trm.time.${app.timeRating ?? 'none'}`) },
    { id: 'portfolios', header: t('trm.applications.colPortfolios'), accessor: (app) => app.portfolios.map((p) => p.name).join(', ') || t('common.none') },
  ]

  return (
    <>
      <PageHeader title={t('trm.applications.title')} intro={t('trm.applications.intro')} />
      <form role="search" aria-label={t('trm.filters')} onSubmit={(event) => event.preventDefault()} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SearchField label={t('trm.applications.search')} value={list.values.q} onSearch={(q) => list.set({ q })} />
        {filter('installStatus', t('trm.applications.installStatus'), t('trm.applications.anyInstallStatus'), plain(facets.data?.installStatuses))}
        {filter('criticalityRating', t('trm.applications.criticality'), t('trm.applications.anyCriticality'), plain(facets.data?.criticalityRatings))}
        {filter('businessUnit', t('trm.applications.businessUnit'), t('trm.applications.anyBusinessUnit'), plain(facets.data?.businessUnits))}
        {filter('capabilityId', t('trm.applications.capability'), t('trm.applications.anyCapability'), capabilityOptions(capabilities.data?.items ?? []))}
        {filter('timeRating', t('trm.applications.timeRating'), t('trm.applications.anyTimeRating'), [
          ...TIME_RATINGS.map((value) => ({ value, label: t(`trm.time.${value}`) })),
          { value: 'none', label: t('trm.time.none') },
        ])}
        {filter('portfolioId', t('trm.applications.portfolio'), t('trm.applications.anyPortfolio'), (portfolios.data?.items ?? []).map((p) => ({ value: p.id, label: p.name })))}
        <MissingFilter value={list.values.missing} onChange={(missing) => list.set({ missing })} />
        {list.filtered && (
          <div className="flex items-end">
            <Button variant="tertiary" onClick={list.clear}>
              {t('common.clear')}
            </Button>
          </div>
        )}
      </form>
      {applications.isPending ? (
        <Loading />
      ) : applications.isError ? (
        <LoadFailed onRetry={() => void applications.refetch()} />
      ) : (
        <>
          <p className="text-sm text-text-subdued" aria-live="polite">
            {t('trm.applications.total', { count: applications.data.total })}
          </p>
          <DataTable
            caption={t('trm.applications.caption')}
            hideCaption
            columns={columns}
            rows={applications.data.items}
            getRowId={(app) => app.id}
            emptyState={t('trm.applications.none')}
          />
          <Pagination
            page={list.page}
            pageCount={Math.ceil(applications.data.total / PAGE_SIZE)}
            onPageChange={(next) => list.set({ page: String(next) })}
            labels={{ label: t('trm.applications.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
    </>
  )
}
