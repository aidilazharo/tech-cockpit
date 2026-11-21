import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { useCan } from '../../auth/permissions'
import { Button, ButtonLink, PageMessage, Tag } from '../../components/qi'
import { toDisplayDate } from '../../lib/dates'
import { formatAmount } from '../../lib/format'
import { ApplicationCalls } from '../sad/calls/CallsViews'
import { LocalAuthFlag } from '../sad/LocalAuthFlag'
import { SAD_ANY } from '../sad/permissions'
import { useSadOverview } from '../sad/queries'
import { DomainsDialog } from './DomainsDialog'
import { EditAssessmentDialog } from './EditAssessmentDialog'
import { BackLink, DetailStates, Details, MissingIndicator, RecordLink, RefLinks, Section, SoftwareList, SourceFields, Value } from './parts'
import { PortfoliosDialog } from './PortfoliosDialog'
import { useApplication } from './queries'
import type { Application, ApplicationService } from './schemas'
import { useText } from './text'

/** /trm/applications/:id */
export function ApplicationPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const application = useApplication(id)
  return (
    <>
      <BackLink to="/trm/applications">{t('trm.application.back')}</BackLink>
      <DetailStates query={application} notFound={t('trm.application.notFound')}>
        {(app) => <ApplicationDetail app={app} />}
      </DetailStates>
    </>
  )
}

function ApplicationDetail({ app }: { app: Application }) {
  const { t } = useTranslation()
  const { dash, named } = useText()
  const [editing, setEditing] = useState(false)
  const [settingPortfolios, setSettingPortfolios] = useState(false)
  const [settingDomains, setSettingDomains] = useState(false)
  const date = (value: string | null) => (value ? toDisplayDate(value) : null)
  const fit = (value: number | null) => t(`trm.fit.${value ?? 'none'}`)
  const { fields } = app.capability
  const can = useCan()

  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">{named(app.name)}</h1>
        <p className="text-text-subdued">{[app.number, app.displayName].filter(Boolean).join(' · ')}</p>
        <MissingIndicator since={app.missingSince} />
        {app.description && <p className="max-w-3xl">{app.description}</p>}
        {SAD_ANY.some(can) && (
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink to={`/sad/${app.id}`} variant="secondary">
              {t('trm.application.sad')}
            </ButtonLink>
            <SadLocalAuth applicationId={app.id} />
          </div>
        )}
      </div>

      <Section
        id="trm-assessment"
        title={t('trm.application.assessment')}
        actions={
          app.canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {t('trm.application.editAssessment')}
            </Button>
          )
        }
      >
        <Details
          items={[
            [t('trm.application.timeRating'), t(`trm.time.${app.trm.timeRating ?? 'none'}`)],
            [t('trm.application.timeRationale'), <Value key="r" value={app.trm.timeRationale} />],
            [t('trm.application.functionalFit'), fit(app.trm.functionalFit)],
            [t('trm.application.technicalFit'), fit(app.trm.technicalFit)],
            [t('trm.application.plannedGoLive'), <Value key="g" value={date(app.trm.plannedGoLive)} />],
            [t('trm.application.plannedPhaseOut'), <Value key="p" value={date(app.trm.plannedPhaseOut)} />],
            [t('trm.application.plannedRetirement'), <Value key="t" value={date(app.trm.plannedRetirement)} />],
            [t('trm.application.vendorEndOfSupport'), <Value key="v" value={date(app.trm.vendorEndOfSupport)} />],
          ]}
        />
      </Section>

      <Section
        id="trm-portfolios"
        title={t('trm.application.portfolios')}
        actions={
          app.canSetPortfolios && (
            <Button variant="secondary" onClick={() => setSettingPortfolios(true)}>
              {t('trm.application.changePortfolios')}
            </Button>
          )
        }
      >
        {app.portfolios.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {app.portfolios.map((portfolio) => (
              <li key={portfolio.id}>
                <Tag>{portfolio.name}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-subdued">{t('trm.application.noPortfolios')}</p>
        )}
      </Section>

      <Section
        id="trm-domains"
        title={t('trm.application.domains')}
        actions={
          app.canSetDomains && (
            <Button variant="secondary" onClick={() => setSettingDomains(true)}>
              {t('trm.application.changeDomains')}
            </Button>
          )
        }
      >
        {app.subdomains.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {app.subdomains.map((sub) => (
              <li key={sub.id}>
                <Tag>{`${sub.domain.name} / ${sub.name}`}</Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-text-subdued">{t('trm.application.noDomains')}</p>
        )}
      </Section>

      <Section id="trm-capability" title={t('trm.application.capability')}>
        {app.capability.path.length > 0 ? (
          <ol className="flex flex-wrap items-center gap-2">
            {app.capability.path.map((step, index) => (
              <li key={step.id} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden="true">›</span>}
                <RecordLink to={`/trm/capabilities/${step.id}`} name={step.name} />
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-text-subdued">{t('trm.application.noCapability')}</p>
        )}
        {app.capability.mismatch && (
          <PageMessage variant="warning">
            {t('trm.application.capabilityMismatch', {
              group: dash(fields.group),
              family: dash(fields.family),
              category: dash(fields.category),
            })}
          </PageMessage>
        )}
      </Section>

      <Section id="trm-servicenow" title={t('trm.application.servicenow')}>
        <Details
          items={[
            [t('trm.application.number'), <Value key="n" value={app.number} />],
            [t('trm.application.installStatus'), <Value key="i" value={app.installStatus} />],
            [t('trm.application.operationalStatus'), <Value key="o" value={app.operationalStatus} />],
            [t('trm.application.recordStatus'), <Value key="r" value={app.recordStatus} />],
            [t('trm.application.installType'), <Value key="t" value={app.installType} />],
            [t('trm.application.groupOrLocal'), <Value key="g" value={app.groupOrLocal} />],
            [t('trm.application.businessUnit'), <Value key="b" value={app.businessUnit} />],
            [t('trm.application.ownedBusinessUnit'), <Value key="ob" value={app.ownedBusinessUnit} />],
            [t('trm.application.servingBusinessUnits'), <Value key="s" value={app.servingBusinessUnits} />],
            [t('trm.application.criticality'), <Value key="c" value={app.criticalityRating} />],
            [t('trm.application.bcmCriticality'), <Value key="bc" value={app.bcmCriticality} />],
            [t('trm.application.rto'), <Value key="rt" value={app.rto} />],
            [t('trm.application.rpo'), <Value key="rp" value={app.rpo} />],
            [t('trm.application.recoveryTimeCapability'), <Value key="rc" value={app.recoveryTimeCapability} />],
            [t('trm.application.snUpdatedOn'), <Value key="u" value={app.snUpdatedOn} />],
          ]}
        />
      </Section>

      <Section id="trm-people" title={t('trm.application.people')}>
        <Details
          items={[
            [t('trm.application.itApplicationOwner'), <Value key="o" value={app.people.itApplicationOwner} restricted={app.restricted.includes('itApplicationOwner')} />],
            [t('trm.application.applicationLead'), <Value key="l" value={app.people.applicationLead} restricted={app.restricted.includes('applicationLead')} />],
            [t('trm.application.applicationManager'), <Value key="m" value={app.people.applicationManager} restricted={app.restricted.includes('applicationManager')} />],
          ]}
        />
      </Section>

      <Section id="trm-costs" title={t('trm.application.costs')}>
        <Details
          items={(
            [
              ['licence', app.costs.licence],
              ['internalSupport', app.costs.internalSupport],
              ['externalSupport', app.costs.externalSupport],
              ['infraOnPremises', app.costs.infraOnPremises],
              ['infraCloud', app.costs.infraCloud],
            ] as const
          ).map(([key, value]) => [t(`trm.application.cost.${key}`), <Value key={key} value={formatAmount(value)} restricted={app.restricted.includes(`${key}Cost`)} />])}
        />
      </Section>

      <Section id="trm-services" title={t('trm.application.services')}>
        {app.services.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {app.services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </ul>
        ) : (
          <p className="text-text-subdued">{t('trm.application.noServices')}</p>
        )}
      </Section>

      <Section id="trm-connections" title={t('trm.application.connections')}>
        <ApplicationCalls applicationId={app.id} />
      </Section>

      <SourceFields source={app.source} />

      {editing && <EditAssessmentDialog app={app} onClose={() => setEditing(false)} />}
      {settingPortfolios && <PortfoliosDialog app={app} onClose={() => setSettingPortfolios(false)} />}
      {settingDomains && <DomainsDialog app={app} onClose={() => setSettingDomains(false)} />}
    </>
  )
}

function ServiceCard({ service }: { service: ApplicationService }) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <RecordLink to={`/trm/services/${service.id}`} name={service.name} />
        <span className="text-sm text-text-subdued">{[t(`trm.kind.${service.kind}`), service.environment, service.operationalStatus].filter(Boolean).join(' · ')}</span>
        <MissingIndicator since={service.missingSince} />
      </div>
      <Details
        items={[
          [t('trm.application.businessServices'), <RefLinks key="b" items={service.businessServices} to={(id) => `/trm/services/${id}`} />],
          [t('trm.application.servers'), <RefLinks key="s" items={service.servers} to={(id) => `/trm/servers/${id}`} />],
        ]}
      />
      {service.software.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text-subdued">{t('trm.application.software')}</h3>
          <SoftwareList items={service.software} />
        </div>
      )}
    </li>
  )
}

/** The SAD's local authentication flag, for readers of its section 5 (the API says null to others; a SAD the reader cannot open shows nothing). */
function SadLocalAuth({ applicationId }: { applicationId: string }) {
  const flag = useSadOverview(applicationId).data?.localAuthentication
  return flag ? <LocalAuthFlag from={flag} /> : null
}
