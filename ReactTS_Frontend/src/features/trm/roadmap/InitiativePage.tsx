import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { ButtonLink, StatusIndicator, Tag } from '../../../components/qi'
import { toDisplayDate } from '../../../lib/dates'
import { formatMyr } from '../../../lib/format'
import { BackLink, DetailStates, Details, RecordLink, RefLinks, Section, Value } from '../parts'
import { useInitiative } from '../queries'
import { type Initiative, type InitiativeAction, type PlannedRef, ROADMAP_ACTIONS, type Ref } from '../schemas'
import { INITIATIVE_TONES } from './status'

/** /trm/roadmap/:id */
export function InitiativePage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const initiative = useInitiative(id)
  return (
    <>
      <BackLink to="/trm/roadmap">{t('trm.roadmap.back')}</BackLink>
      <DetailStates query={initiative} notFound={t('trm.roadmap.notFound')}>
        {(data) => <InitiativeDetail initiative={data} />}
      </DetailStates>
    </>
  )
}

function Subject({ application, planned }: { application: Ref | null; planned: PlannedRef | null }) {
  const { t } = useTranslation()
  if (application) return <RecordLink to={`/trm/applications/${application.id}`} name={application.name} />
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-semibold">{planned!.name}</span>
      <Tag>{t('trm.roadmap.plannedTag')}</Tag>
      {planned!.linkedApplication && (
        <span className="text-sm">
          {t('trm.roadmap.nowIs')} <RecordLink to={`/trm/applications/${planned!.linkedApplication.id}`} name={planned!.linkedApplication.name} />
        </span>
      )}
    </span>
  )
}

function InitiativeDetail({ initiative }: { initiative: Initiative }) {
  const { t } = useTranslation()
  const byAction = (action: string) => initiative.actions.filter((a: InitiativeAction) => a.action === action)
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="heading-1">{initiative.name}</h1>
          <StatusIndicator tone={INITIATIVE_TONES[initiative.status]}>{t(`trm.roadmap.statuses.${initiative.status}`)}</StatusIndicator>
          <p className="text-text-subdued">{t('trm.roadmap.dates', { start: toDisplayDate(initiative.startDate), end: toDisplayDate(initiative.endDate) })}</p>
        </div>
        {initiative.canEdit && (
          <ButtonLink to={`/trm/roadmap/${initiative.id}/edit`} variant="secondary">
            {t('trm.roadmap.edit')}
          </ButtonLink>
        )}
      </div>
      <Details
        items={[
          [t('trm.roadmap.owner'), <Value key="o" value={initiative.owner?.name ?? null} restricted={initiative.restricted.includes('owner')} />],
          [t('trm.roadmap.cost'), <Value key="c" value={formatMyr(initiative.estimatedCost)} restricted={initiative.restricted.includes('estimatedCost')} />],
          [t('trm.roadmap.description'), <Value key="d" value={initiative.description} />],
          [t('trm.roadmap.rationale'), <Value key="r" value={initiative.rationale} />],
          [t('trm.roadmap.capabilities'), <RefLinks key="cap" items={initiative.capabilities} to={(id) => `/trm/capabilities/${id}`} />],
        ]}
      />
      <Section id="trm-initiative-actions" title={t('trm.roadmap.applications')}>
        {initiative.actions.length === 0 && <p className="text-text-subdued">{t('trm.roadmap.noActions')}</p>}
        {ROADMAP_ACTIONS.filter((action) => byAction(action).length > 0).map((action) => (
          <section key={action} aria-label={t(`trm.roadmap.actions.${action}`)} className="flex flex-col gap-2">
            <h3 className="font-semibold">{t(`trm.roadmap.actions.${action}`)}</h3>
            <ul className="flex flex-col gap-2">
              {byAction(action).map((item) => (
                <li key={item.id} className="flex flex-wrap items-center gap-2">
                  <Subject application={item.application} planned={item.plannedApplication} />
                  {item.action === 'replace' && (
                    <>
                      <span aria-hidden="true">→</span>
                      <span className="sr-only">{t('trm.roadmap.replacedBy')}</span>
                      <Subject application={item.replacementApplication} planned={item.replacementPlanned} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Section>
    </>
  )
}
