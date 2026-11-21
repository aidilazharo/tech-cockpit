import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { BackLink, DetailStates, Details, MissingIndicator, RefLinks, Section, SoftwareList, SourceFields, Value } from './parts'
import { useService } from './queries'
import type { Service } from './schemas'
import { useText } from './text'

/** /trm/services/:id */
export function ServicePage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const service = useService(id)
  return (
    <>
      <BackLink to="/trm/services">{t('trm.service.back')}</BackLink>
      <DetailStates query={service} notFound={t('trm.service.notFound')}>
        {(data) => <ServiceDetail service={data} />}
      </DetailStates>
    </>
  )
}

function ServiceDetail({ service }: { service: Service }) {
  const { t } = useTranslation()
  const { named } = useText()
  const v = (value: string | null) => <Value value={value} />
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">{named(service.name)}</h1>
        <p className="text-text-subdued">{[t(`trm.kind.${service.kind}`), service.number].filter(Boolean).join(' · ')}</p>
        <MissingIndicator since={service.missingSince} />
        {service.description && <p className="max-w-3xl">{service.description}</p>}
      </div>
      <Section id="trm-service-links" title={t('trm.service.links')}>
        <Details
          items={[
            [t('trm.service.applications'), <RefLinks key="a" items={service.applications} to={(id) => `/trm/applications/${id}`} />],
            service.kind === 'application'
              ? [t('trm.service.businessServices'), <RefLinks key="b" items={service.businessServices} to={(id) => `/trm/services/${id}`} />]
              : [t('trm.service.applicationServices'), <RefLinks key="s" items={service.applicationServices} to={(id) => `/trm/services/${id}`} />],
            [t('trm.service.servers'), <RefLinks key="sv" items={service.servers} to={(id) => `/trm/servers/${id}`} />],
            [t('trm.service.software'), <SoftwareList key="sw" items={service.software} />],
          ]}
        />
      </Section>
      <Section id="trm-service-servicenow" title={t('trm.application.servicenow')}>
        <Details
          items={[
            [t('trm.service.environment'), v(service.environment)],
            [t('trm.service.usedFor'), v(service.usedFor)],
            [t('trm.application.operationalStatus'), v(service.operationalStatus)],
            [t('trm.service.classification'), v(service.serviceClassification)],
            [t('trm.service.portfolioStatus'), v(service.portfolioStatus)],
            [t('trm.service.businessCriticality'), v(service.businessCriticality)],
            [t('trm.service.dataClassification'), v(service.dataClassification)],
            [t('trm.service.customerPii'), v(service.customerPiiData)],
            [t('trm.service.creditCard'), v(service.creditCardData)],
            [t('trm.service.healthcare'), v(service.healthcareData)],
            [t('trm.service.priceSensitive'), v(service.priceSensitiveData)],
            [t('trm.service.networkFacing'), v(service.networkFacing)],
            [t('trm.application.rto'), v(service.rto)],
            [t('trm.application.rpo'), v(service.rpo)],
            [t('trm.service.securityRating'), v(service.applicationSecurityRating)],
            [t('trm.service.hostingProvider'), v(service.hostingProvider)],
            [t('trm.application.ownedBusinessUnit'), v(service.ownedBusinessUnit)],
            [t('trm.service.ownedBy'), <Value key="o" value={service.ownedBy} restricted={service.restricted.includes('ownedBy')} />],
            [t('trm.application.snUpdatedOn'), v(service.snUpdatedOn)],
          ]}
        />
      </Section>
      <SourceFields source={service.source} />
    </>
  )
}
