import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { DataTable } from '../../components/qi'
import { BackLink, DetailStates, Details, MissingIndicator, RecordLink, RefLinks, Section, SourceFields, StandardLink, Value } from './parts'
import { useSoftwareModel } from './queries'
import type { SoftwareModel } from './schemas'
import { useText } from './text'

/** /trm/software-models/:id */
export function SoftwareModelPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const model = useSoftwareModel(id)
  return (
    <>
      <BackLink to="/trm/software-models">{t('trm.model.back')}</BackLink>
      <DetailStates query={model} notFound={t('trm.model.notFound')}>
        {(data) => <ModelDetail model={data} />}
      </DetailStates>
    </>
  )
}

function ModelDetail({ model }: { model: SoftwareModel }) {
  const { t } = useTranslation()
  const { dash, named } = useText()
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="heading-1">{named(model.name)}</h1>
        <MissingIndicator since={model.missingSince} />
      </div>
      <Details
        items={[
          [t('trm.models.colProduct'), <Value key="p" value={model.product} />],
          [t('trm.models.colVersion'), <Value key="v" value={model.productVersion} />],
          [t('trm.models.colManufacturer'), <Value key="m" value={model.manufacturer} />],
          [t('trm.model.productType'), <Value key="t" value={model.productType} />],
          [t('trm.model.category'), <Value key="c" value={model.modelCategory} />],
          [
            t('trm.models.colStandard'),
            model.productStandard || !model.productStandardName ? (
              <StandardLink key="s" standard={model.productStandard} />
            ) : (
              <span key="s" className="text-text-subdued">
                {t('trm.model.unmatchedStandard', { name: model.productStandardName })}
              </span>
            ),
          ],
          [t('trm.model.applications'), <RefLinks key="a" items={model.applications} to={(id) => `/trm/applications/${id}`} />],
        ]}
      />
      <Section id="trm-model-services" title={t('trm.model.services')}>
        <DataTable
          caption={t('trm.model.services')}
          hideCaption
          rows={model.services}
          getRowId={(s) => s.id}
          emptyState={t('trm.model.noServices')}
          columns={[
            { id: 'name', header: t('trm.services.colName'), cell: (s) => <RecordLink to={`/trm/services/${s.id}`} name={s.name} /> },
            { id: 'version', header: t('trm.model.fullVersion'), accessor: (s) => dash(s.fullVersion) },
            { id: 'primary', header: t('trm.model.primary'), accessor: (s) => (s.primaryModel ? t('common.yes') : t('common.no')) },
          ]}
        />
      </Section>
      <SourceFields source={model.source} />
    </>
  )
}
