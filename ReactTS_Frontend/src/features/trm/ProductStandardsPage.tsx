import { useTranslation } from 'react-i18next'
import { CatalogueListPage, FilterDropdown, MissingFilter, NameCell, StandardStatus } from './parts'
import { useFacets, useProductStandards } from './queries'
import type { ProductStandardSummary } from './schemas'
import { useText } from './text'

/** /trm/product-standards — the technology standards list (Standard, Restricted, ...). */
export function ProductStandardsPage() {
  const { t } = useTranslation()
  const { dash } = useText()
  const facets = useFacets()
  return (
    <CatalogueListPage<ProductStandardSummary, 'status' | 'missing'>
      title={t('trm.standards.title')}
      intro={t('trm.standards.intro')}
      searchLabel={t('trm.models.search')}
      filterKeys={['status', 'missing']}
      useRows={useProductStandards}
      filters={({ values, set }) => (
        <>
          <FilterDropdown
            label={t('trm.standards.status')}
            anyLabel={t('trm.standards.anyStatus')}
            value={values.status}
            onChange={(status) => set({ status })}
            options={(facets.data?.productStandardStatuses ?? []).map((value) => ({ value, label: value }))}
          />
          <MissingFilter value={values.missing} onChange={(missing) => set({ missing })} />
        </>
      )}
      columns={[
        { id: 'name', header: t('trm.standards.colName'), cell: (p) => <NameCell to={`/trm/product-standards/${p.id}`} name={p.name} missingSince={p.missingSince} /> },
        { id: 'product', header: t('trm.models.colProduct'), accessor: (p) => dash(p.product) },
        { id: 'manufacturer', header: t('trm.models.colManufacturer'), accessor: (p) => dash(p.manufacturer) },
        { id: 'status', header: t('trm.standards.status'), cell: (p) => <StandardStatus status={p.status} /> },
        { id: 'category', header: t('trm.standards.colCategory'), accessor: (p) => dash(p.standardCategory) },
        { id: 'functional', header: t('trm.standards.colFunctional'), accessor: (p) => dash(p.functionalCategory) },
      ]}
      caption={t('trm.standards.caption')}
      none={t('trm.standards.none')}
      pagesLabel={t('trm.standards.pages')}
      total={(count) => t('trm.standards.total', { count })}
    />
  )
}
