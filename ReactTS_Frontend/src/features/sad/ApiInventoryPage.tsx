import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, DataTable, Pagination, SearchSelect, Tag } from '../../components/qi'
import { useListParams } from '../trm/list-params'
import { FilterDropdown, RecordLink, SearchField } from '../trm/parts'
import { optionLabel } from './format'
import { PAGE_SIZE, useSadApis, useSadList, useSadOverview, useSadTemplate } from './queries'
import type { Column, Template } from './schemas'

const FILTERS = ['classification', 'priority', 'hosting'] as const
/** An API is in each environment it has a URL for. */
const ENVIRONMENTS = [
  ['production', 'productionUrl'],
  ['uat', 'uatUrl'],
  ['dev', 'devUrl'],
] as const

/** The API inventory table's columns from the template (labels of the stored option values). */
function apiColumns(template: Template | undefined): Map<string, Column> {
  const table = template?.sections.flatMap((s) => s.groups.flatMap((g) => g.items)).find((item) => item.type === 'table' && item.key === 'apis')
  return new Map(table?.type === 'table' ? table.columns.map((column) => [column.key, column]) : [])
}

type Picked = { id: string; name: string | null; number: string | null }

/** Finds an application among the SADs the reader may view (by name or APM ID), for filtering the inventory. */
function ApplicationFilter({ value, onChange }: { value: string; onChange: (applicationId: string) => void }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const found = useSadList(query.trim() ? { q: query.trim() } : {}, 1)
  const picked = useSadOverview(value, value !== '')
  const selected: Picked | null = value && picked.data ? picked.data.application : null
  return (
    <SearchSelect<Picked>
      label={t('sad.apis.application')}
      value={selected}
      onValueChange={(application) => onChange(application?.id ?? '')}
      items={(found.data?.items ?? []).map((item) => ({ id: item.applicationId, name: item.name, number: item.number }))}
      onQueryChange={setQuery}
      itemKey={(application) => application.id}
      itemLabel={(application) => application.name ?? application.number ?? ''}
      itemDescription={(application) => application.number}
      emptyText={t('sad.apis.noApplication')}
    />
  )
}

/** /sad/apis — every API in the current SADs the reader may view. */
export function ApiInventoryPage() {
  const { t } = useTranslation()
  const list = useListParams(['q', 'applicationId', 'thirdParty', 'environment', ...FILTERS])
  const apis = useSadApis(list.values, list.page)
  const template = useSadTemplate()
  const columns = apiColumns(template.data)
  const label = (key: string, value: string | null) => (value ? optionLabel(columns.get(key)?.options, value) : '—')

  return (
    <>
      <PageHeader title={t('sad.apis.title')} intro={t('sad.apis.intro')} />
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        <SearchField label={t('sad.apis.search')} value={list.values.q} onSearch={(q) => list.set({ q })} />
        <ApplicationFilter value={list.values.applicationId} onChange={(applicationId) => list.set({ applicationId })} />
        {FILTERS.map((key) => (
          <FilterDropdown
            key={key}
            label={t(`sad.apis.${key}`)}
            anyLabel={t('sad.apis.any')}
            value={list.values[key]}
            onChange={(value) => list.set({ [key]: value })}
            options={(columns.get(key)?.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
          />
        ))}
        <FilterDropdown
          label={t('sad.apis.environment')}
          anyLabel={t('sad.apis.any')}
          value={list.values.environment}
          onChange={(environment) => list.set({ environment })}
          options={ENVIRONMENTS.map(([environment]) => ({ value: environment, label: t(`sad.apis.environments.${environment}`) }))}
        />
        <FilterDropdown
          label={t('sad.apis.thirdParty')}
          anyLabel={t('sad.apis.any')}
          value={list.values.thirdParty}
          onChange={(thirdParty) => list.set({ thirdParty })}
          options={[
            { value: 'yes', label: t('sad.answer.yes') },
            { value: 'no', label: t('sad.answer.no') },
          ]}
        />
        {list.filtered && (
          <div className="flex items-end">
            <Button variant="tertiary" onClick={list.clear}>
              {t('sad.list.clear')}
            </Button>
          </div>
        )}
      </div>
      {apis.isPending ? (
        <Loading />
      ) : apis.isError ? (
        <LoadFailed onRetry={() => void apis.refetch()} />
      ) : (
        <>
          <DataTable
            caption={t('sad.apis.caption')}
            hideCaption
            rows={apis.data.items}
            getRowId={(api) => api.id}
            emptyState={t('sad.apis.none')}
            columns={[
              {
                id: 'name',
                header: t('sad.apis.api'),
                cell: (api) => (
                  <div className="flex flex-col">
                    <span className="font-semibold">{api.name}</span>
                    {api.description && <span className="text-sm text-text-subdued">{api.description}</span>}
                    {ENVIRONMENTS.filter(([, url]) => api[url]).map(([environment, url]) => (
                      <span key={environment} className="text-sm break-all">{`${t(`sad.apis.environments.${environment}`)}: ${api[url]}`}</span>
                    ))}
                  </div>
                ),
              },
              { id: 'application', header: t('sad.apis.application'), cell: (api) => <RecordLink to={`/sad/${api.application.id}`} name={api.application.name} /> },
              {
                id: 'environment',
                header: t('sad.apis.environment'),
                accessor: (api) =>
                  ENVIRONMENTS.filter(([, url]) => api[url])
                    .map(([environment]) => t(`sad.apis.environments.${environment}`))
                    .join(', ') || '—',
              },
              { id: 'classification', header: t('sad.apis.classification'), accessor: (api) => label('classification', api.classification) },
              { id: 'priority', header: t('sad.apis.priority'), cell: (api) => (api.priority ? <Tag emphasis={api.priority === 'critical' ? 'high' : 'default'}>{label('priority', api.priority)}</Tag> : '—') },
              { id: 'thirdParty', header: t('sad.apis.thirdParty'), accessor: (api) => (api.thirdParty === null ? '—' : api.thirdParty ? t('sad.answer.yes') : t('sad.answer.no')) },
              { id: 'owner', header: t('sad.apis.owner'), accessor: (api) => api.apiOwner?.name ?? (api.namesHidden ? t('common.restricted') : '—') },
            ]}
          />
          <Pagination
            page={list.page}
            pageCount={Math.ceil(apis.data.total / PAGE_SIZE)}
            onPageChange={(next) => list.set({ page: String(next) } as Partial<Record<'q' | 'page', string>>)}
            labels={{ label: t('sad.apis.pages'), previous: t('pagination.previous'), next: t('pagination.next'), page: (n) => t('pagination.page', { page: n }) }}
          />
        </>
      )}
    </>
  )
}
