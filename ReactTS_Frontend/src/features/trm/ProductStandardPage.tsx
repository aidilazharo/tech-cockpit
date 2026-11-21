import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { BackLink, DetailStates, Details, MissingIndicator, RefLinks, SourceFields, StandardStatus, Value } from './parts'
import { useProductStandard } from './queries'
import type { ProductStandard } from './schemas'
import { useText } from './text'

/** /trm/product-standards/:id */
export function ProductStandardPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const standard = useProductStandard(id)
  return (
    <>
      <BackLink to="/trm/product-standards">{t('trm.standard.back')}</BackLink>
      <DetailStates query={standard} notFound={t('trm.standard.notFound')}>
        {(data) => <StandardDetail standard={data} />}
      </DetailStates>
    </>
  )
}

/** Only web addresses become links; anything else from ServiceNow is shown as text. */
function SafeLink({ href }: { href: string | null }) {
  if (!href || !/^https?:\/\//i.test(href)) return <Value value={href} />
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-text-link underline underline-offset-4">
      {href}
    </a>
  )
}

function StandardDetail({ standard }: { standard: ProductStandard }) {
  const { t } = useTranslation()
  const { named } = useText()
  const v = (value: string | null) => <Value value={value} />
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">{named(standard.name)}</h1>
        <StandardStatus status={standard.status} />
        <MissingIndicator since={standard.missingSince} />
        {standard.description && <p className="max-w-3xl">{standard.description}</p>}
      </div>
      <Details
        items={[
          [t('trm.models.colProduct'), v(standard.product)],
          [t('trm.models.colManufacturer'), v(standard.manufacturer)],
          [t('trm.standards.colCategory'), v(standard.standardCategory)],
          [t('trm.standards.colFunctional'), v(standard.functionalCategory)],
          [t('trm.model.productType'), v(standard.productType)],
          [t('trm.standard.cloudServiceType'), v(standard.cloudServiceType)],
          [t('trm.standard.vmOnPremises'), v(standard.vmOnPremises)],
          [t('trm.standard.vmCloud'), v(standard.vmCloud)],
          [t('trm.standard.containerOnPremises'), v(standard.containerOnPremises)],
          [t('trm.standard.containerCloud'), v(standard.containerCloud)],
          [t('trm.standard.allowedOnDesktop'), v(standard.allowedOnDesktop)],
          [t('trm.standard.aiControls'), v(standard.aiControls)],
          [t('trm.standard.remarks'), v(standard.remarks)],
          [t('trm.standard.lastStatusDate'), v(standard.lastStatusDate)],
          [t('trm.standard.addedDate'), v(standard.addedDate)],
          [t('trm.standard.assessmentLink'), <SafeLink key="l" href={standard.assessmentLink} />],
          [t('trm.standard.softwareModels'), <RefLinks key="m" items={standard.softwareModels} to={(id) => `/trm/software-models/${id}`} />],
        ]}
      />
      <SourceFields source={standard.source} />
    </>
  )
}
