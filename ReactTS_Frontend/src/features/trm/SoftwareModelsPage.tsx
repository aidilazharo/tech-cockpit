import { useTranslation } from 'react-i18next'
import { CatalogueListPage, MissingFilter, NameCell, StandardLink } from './parts'
import { useSoftwareModels } from './queries'
import type { SoftwareModelSummary } from './schemas'
import { useText } from './text'

/** /trm/software-models — products and versions that application services run. */
export function SoftwareModelsPage() {
  const { t } = useTranslation()
  const { dash } = useText()
  return (
    <CatalogueListPage<SoftwareModelSummary, 'missing'>
      title={t('trm.models.title')}
      intro={t('trm.models.intro')}
      searchLabel={t('trm.models.search')}
      filterKeys={['missing']}
      useRows={useSoftwareModels}
      filters={({ values, set }) => <MissingFilter value={values.missing} onChange={(missing) => set({ missing })} />}
      columns={[
        { id: 'name', header: t('trm.models.colName'), cell: (m) => <NameCell to={`/trm/software-models/${m.id}`} name={m.name} missingSince={m.missingSince} /> },
        { id: 'product', header: t('trm.models.colProduct'), accessor: (m) => dash(m.product) },
        { id: 'version', header: t('trm.models.colVersion'), accessor: (m) => dash(m.productVersion) },
        { id: 'manufacturer', header: t('trm.models.colManufacturer'), accessor: (m) => dash(m.manufacturer) },
        { id: 'standard', header: t('trm.models.colStandard'), cell: (m) => <StandardLink standard={m.productStandard} /> },
      ]}
      caption={t('trm.models.caption')}
      none={t('trm.models.none')}
      pagesLabel={t('trm.models.pages')}
      total={(count) => t('trm.models.total', { count })}
    />
  )
}
