import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { DataTable } from '../../components/qi'
import { BackLink, DetailStates, MissingIndicator, RecordLink, RefLinks, Section } from './parts'
import { useServer } from './queries'
import type { Server } from './schemas'
import { useText } from './text'

/** /trm/servers/:id */
export function ServerPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const server = useServer(id)
  return (
    <>
      <BackLink to="/trm/servers">{t('trm.server.back')}</BackLink>
      <DetailStates query={server} notFound={t('trm.server.notFound')}>
        {(data) => <ServerDetail server={data} />}
      </DetailStates>
    </>
  )
}

function ServerDetail({ server }: { server: Server }) {
  const { t } = useTranslation()
  const { dash } = useText()
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">{server.name}</h1>
        <p className="text-text-subdued">{t('trm.server.namesOnly')}</p>
        <MissingIndicator since={server.missingSince} />
      </div>
      <Section id="trm-server-services" title={t('trm.server.services')}>
        <DataTable
          caption={t('trm.server.services')}
          hideCaption
          rows={server.services}
          getRowId={(s) => s.id}
          emptyState={t('trm.server.noServices')}
          columns={[
            { id: 'name', header: t('trm.services.colName'), cell: (s) => <RecordLink to={`/trm/services/${s.id}`} name={s.name} /> },
            { id: 'environment', header: t('trm.services.colEnvironment'), accessor: (s) => dash(s.environment) },
            { id: 'applications', header: t('trm.service.applications'), cell: (s) => <RefLinks items={s.applications} to={(id) => `/trm/applications/${id}`} /> },
          ]}
        />
      </Section>
    </>
  )
}
