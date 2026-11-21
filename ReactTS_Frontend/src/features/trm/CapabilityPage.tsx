import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { DataTable } from '../../components/qi'
import { BackLink, DetailStates, Details, MissingIndicator, NameCell, RecordLink, RefLinks, Section, SourceFields, Value } from './parts'
import { useCapability } from './queries'
import type { Capability } from './schemas'
import { useText } from './text'

/** /trm/capabilities/:id */
export function CapabilityPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const capability = useCapability(id)
  return (
    <>
      <BackLink to="/trm/capabilities">{t('trm.capability.back')}</BackLink>
      <DetailStates query={capability} notFound={t('trm.capability.notFound')}>
        {(data) => <CapabilityDetail capability={data} />}
      </DetailStates>
    </>
  )
}

function CapabilityDetail({ capability }: { capability: Capability }) {
  const { t } = useTranslation()
  const { dash, named } = useText()
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">{named(capability.name)}</h1>
        <ol aria-label={t('trm.capability.path')} className="flex flex-wrap items-center gap-2 text-sm">
          {capability.path.map((step, index) => (
            <li key={step.id} className="flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">›</span>}
              <RecordLink to={`/trm/capabilities/${step.id}`} name={step.name} />
            </li>
          ))}
        </ol>
        <MissingIndicator since={capability.missingSince} />
      </div>
      <Details
        items={[
          [t('trm.capability.level'), <Value key="l" value={capability.level} />],
          [t('trm.capability.description'), <Value key="d" value={capability.description} />],
          [t('trm.application.operationalStatus'), <Value key="o" value={capability.operationalStatus} />],
          [t('trm.capability.children'), <RefLinks key="c" items={capability.children} to={(id) => `/trm/capabilities/${id}`} />],
        ]}
      />
      <Section id="trm-capability-applications" title={t('trm.capability.applications')}>
        <DataTable
          caption={t('trm.capability.applications')}
          hideCaption
          rows={capability.applications}
          getRowId={(app) => app.id}
          emptyState={t('trm.capability.noApplications')}
          columns={[
            { id: 'name', header: t('trm.applications.colName'), cell: (app) => <NameCell to={`/trm/applications/${app.id}`} name={app.name} missingSince={app.missingSince} /> },
            { id: 'capability', header: t('trm.applications.colCapability'), accessor: (app) => dash(app.capability?.name) },
            { id: 'status', header: t('trm.applications.colStatus'), accessor: (app) => dash(app.installStatus) },
            { id: 'time', header: t('trm.applications.colTime'), accessor: (app) => t(`trm.time.${app.timeRating ?? 'none'}`) },
          ]}
        />
      </Section>
      <SourceFields source={capability.source} />
    </>
  )
}
