import { useTranslation } from 'react-i18next'
import { CatalogueListPage, FilterDropdown, MissingFilter, NameCell } from './parts'
import { useFacets, useServices } from './queries'
import { SERVICE_KINDS, type ServiceSummary } from './schemas'
import { useText } from './text'

/** /trm/services — application services (deployments) and business services. */
export function ServicesPage() {
  const { t } = useTranslation()
  const { dash } = useText()
  const facets = useFacets()
  return (
    <CatalogueListPage<ServiceSummary, 'kind' | 'environment' | 'missing'>
      title={t('trm.services.title')}
      intro={t('trm.services.intro')}
      searchLabel={t('trm.services.search')}
      filterKeys={['kind', 'environment', 'missing']}
      useRows={useServices}
      filters={({ values, set }) => (
        <>
          <FilterDropdown
            label={t('trm.services.kind')}
            anyLabel={t('trm.services.anyKind')}
            value={values.kind}
            onChange={(kind) => set({ kind })}
            options={SERVICE_KINDS.map((kind) => ({ value: kind, label: t(`trm.kind.${kind}`) }))}
          />
          <FilterDropdown
            label={t('trm.services.environment')}
            anyLabel={t('trm.services.anyEnvironment')}
            value={values.environment}
            onChange={(environment) => set({ environment })}
            options={(facets.data?.environments ?? []).map((value) => ({ value, label: value }))}
          />
          <MissingFilter value={values.missing} onChange={(missing) => set({ missing })} />
        </>
      )}
      columns={[
        { id: 'name', header: t('trm.services.colName'), cell: (s) => <NameCell to={`/trm/services/${s.id}`} name={s.name} missingSince={s.missingSince} /> },
        { id: 'number', header: t('trm.services.colNumber'), accessor: (s) => dash(s.number) },
        { id: 'kind', header: t('trm.services.colKind'), accessor: (s) => t(`trm.kind.${s.kind}`) },
        { id: 'environment', header: t('trm.services.colEnvironment'), accessor: (s) => dash(s.environment) },
        { id: 'status', header: t('trm.services.colStatus'), accessor: (s) => dash(s.operationalStatus) },
      ]}
      caption={t('trm.services.caption')}
      none={t('trm.services.none')}
      pagesLabel={t('trm.services.pages')}
      total={(count) => t('trm.services.total', { count })}
    />
  )
}
