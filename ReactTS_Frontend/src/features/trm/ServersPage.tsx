import { useTranslation } from 'react-i18next'
import { CatalogueListPage, MissingFilter, NameCell } from './parts'
import { useServers } from './queries'
import type { ServerSummary } from './schemas'

/** /trm/servers — servers known by name from the application → service → server export. */
export function ServersPage() {
  const { t } = useTranslation()
  return (
    <CatalogueListPage<ServerSummary, 'missing'>
      title={t('trm.servers.title')}
      intro={t('trm.servers.intro')}
      searchLabel={t('trm.servers.search')}
      filterKeys={['missing']}
      useRows={useServers}
      filters={({ values, set }) => <MissingFilter value={values.missing} onChange={(missing) => set({ missing })} />}
      columns={[{ id: 'name', header: t('trm.servers.colName'), cell: (s) => <NameCell to={`/trm/servers/${s.id}`} name={s.name} missingSince={s.missingSince} /> }]}
      caption={t('trm.servers.caption')}
      none={t('trm.servers.none')}
      pagesLabel={t('trm.servers.pages')}
      total={(count) => t('trm.servers.total', { count })}
    />
  )
}
