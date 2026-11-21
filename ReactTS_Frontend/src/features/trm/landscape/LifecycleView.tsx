import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { toDisplayDate } from '../../../lib/dates'
import { RecordLink } from '../parts'
import type { LandscapeApp } from '../schemas'
import { useText } from '../text'
import { Timeline, type TimelineSegment } from '../Timeline'

const IN_USE = 'bg-data-visualisation-positive'
const PHASING_OUT = 'bg-data-visualisation-category-3'

const dayBefore = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) - 1)).toISOString().slice(0, 10)

/** In use from go-live until phase-out (or retirement), then phasing out until retirement; a missing date leaves that end open. */
function phases({ plannedGoLive: goLive, plannedPhaseOut: phaseOut, plannedRetirement: retirement }: LandscapeApp): TimelineSegment[] {
  if (phaseOut) {
    return [
      { start: goLive, end: dayBefore(phaseOut), colour: IN_USE },
      { start: phaseOut, end: retirement, colour: PHASING_OUT },
    ]
  }
  return goLive || retirement ? [{ start: goLive, end: retirement, colour: IN_USE }] : []
}

/** Counts per ServiceNow install status, and the plan-date timeline (PMO business cases feed it later). */
export function LifecycleView({ apps }: { apps: LandscapeApp[] }) {
  const { t } = useTranslation()
  const { named } = useText()
  const counts = new Map<string, number>()
  for (const app of apps) counts.set(app.installStatus ?? '', (counts.get(app.installStatus ?? '') ?? 0) + 1)
  const statuses = [...counts.keys()].filter(Boolean).sort()
  const planned = apps.filter((app) => app.plannedGoLive || app.plannedPhaseOut || app.plannedRetirement || app.vendorEndOfSupport)
  const date = (value: string | null) => (value ? toDisplayDate(value) : t('common.none'))

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="trm-lifecycle-counts" className="flex flex-col gap-3">
        <h2 id="trm-lifecycle-counts" className="heading-3">
          {t('trm.landscape.byStatus')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {statuses.map((status) => (
            <li key={status}>
              <Link
                to={`/trm/applications?installStatus=${encodeURIComponent(status)}`}
                className="flex flex-col rounded-card border border-divider-default p-4 hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-border-focus"
              >
                <span className="heading-2">{counts.get(status)}</span>
                <span className="font-semibold text-text-link">{status}</span>
              </Link>
            </li>
          ))}
          {counts.has('') && (
            <li className="flex flex-col rounded-card border border-divider-default p-4">
              <span className="heading-2">{counts.get('')}</span>
              <span>{t('trm.landscape.noValue.lifecycle')}</span>
            </li>
          )}
        </ul>
      </section>
      <section aria-labelledby="trm-lifecycle-timeline" className="flex flex-col gap-3">
        <h2 id="trm-lifecycle-timeline" className="heading-3">
          {t('trm.landscape.timeline')}
        </h2>
        <p className="text-sm text-text-subdued">{t('trm.landscape.timelineIntro')}</p>
        {planned.length === 0 ? (
          <p className="text-text-subdued">{t('trm.landscape.noPlans')}</p>
        ) : (
          <Timeline
            label={t('trm.landscape.timeline')}
            legend={[
              { label: t('trm.landscape.phase.inUse'), colour: IN_USE },
              { label: t('trm.landscape.phase.phasingOut'), colour: PHASING_OUT },
              { label: t('trm.application.vendorEndOfSupport'), mark: true },
            ]}
            items={planned.map((app) => ({
              id: app.id,
              label: <RecordLink to={`/trm/applications/${app.id}`} name={named(app.name)} />,
              segments: phases(app),
              markers: app.vendorEndOfSupport ? [{ date: app.vendorEndOfSupport, label: t('trm.application.vendorEndOfSupport') }] : [],
              details: t('trm.landscape.planSummary', {
                goLive: date(app.plannedGoLive),
                phaseOut: date(app.plannedPhaseOut),
                retirement: date(app.plannedRetirement),
                endOfSupport: date(app.vendorEndOfSupport),
              }),
            }))}
          />
        )}
      </section>
    </div>
  )
}
