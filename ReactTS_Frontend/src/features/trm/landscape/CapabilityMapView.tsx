import { useTranslation } from 'react-i18next'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { capabilityTree, type CapabilityNode } from '../capability-tree'
import type { ColourMode, LegendEntry } from '../colouring'
import { RecordLink } from '../parts'
import { useCapabilities } from '../queries'
import type { LandscapeApp } from '../schemas'
import { TileGrid } from './AppTile'

/** Top-level capabilities as sections, lower levels nested, applications under their own capability. */
export function CapabilityMapView({ apps, mode, legend }: { apps: LandscapeApp[]; mode: ColourMode; legend: LegendEntry[] }) {
  const { t } = useTranslation()
  const capabilities = useCapabilities()
  if (capabilities.isPending) return <Loading />
  if (capabilities.isError) return <LoadFailed onRetry={() => void capabilities.refetch()} />
  const toCheck = apps.filter((app) => app.capabilityId === null || app.capabilityMismatch)

  const node = (cap: CapabilityNode, depth: number) => {
    const Heading = depth === 0 ? 'h2' : depth === 1 ? 'h3' : 'h4'
    const own = apps.filter((app) => app.capabilityId === cap.id)
    return (
      <section key={cap.id} aria-label={cap.name ?? undefined} className={depth === 0 ? 'flex flex-col gap-3 rounded-card border border-divider-default p-4' : 'flex flex-col gap-2 border-l-2 border-divider-default pl-3'}>
        <Heading className={depth === 0 ? 'heading-3' : 'font-semibold'}>
          <RecordLink to={`/trm/capabilities/${cap.id}`} name={cap.name} />
        </Heading>
        {(own.length > 0 || cap.children.length === 0) && <TileGrid apps={own} mode={mode} legend={legend} empty={t('trm.landscape.noApplications')} />}
        {cap.children.map((child) => node(child, depth + 1))}
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {capabilityTree(capabilities.data.items).map((cap) => node(cap, 0))}
      <section aria-labelledby="trm-to-check" className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
        <h2 id="trm-to-check" className="heading-3">
          {t('trm.landscape.toCheck')}
        </h2>
        <p className="text-sm text-text-subdued">{t('trm.landscape.toCheckIntro')}</p>
        <TileGrid apps={toCheck} mode={mode} legend={legend} empty={t('trm.landscape.nothingToCheck')} />
      </section>
    </div>
  )
}
