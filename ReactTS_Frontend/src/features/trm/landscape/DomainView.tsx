import { useTranslation } from 'react-i18next'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import type { ColourMode, LegendEntry } from '../colouring'
import { useDomains } from '../queries'
import type { LandscapeApp } from '../schemas'
import { TileGrid } from './AppTile'

/** Domains, their sub-domains and the applications placed in them (several places allowed). */
export function DomainView({ apps, mode, legend }: { apps: LandscapeApp[]; mode: ColourMode; legend: LegendEntry[] }) {
  const { t } = useTranslation()
  const domains = useDomains()
  if (domains.isPending) return <Loading />
  if (domains.isError) return <LoadFailed onRetry={() => void domains.refetch()} />
  const inSub = (id: string) => apps.filter((app) => app.subdomainIds.includes(id))
  const shown = domains.data.items
    .map((domain) => ({ ...domain, subdomains: domain.subdomains.filter((sub) => (sub.active && domain.active) || inSub(sub.id).length > 0) }))
    .filter((domain) => domain.subdomains.length > 0 || domain.active)
  const nowhere = apps.filter((app) => app.subdomainIds.length === 0)

  return (
    <div className="flex flex-col gap-4">
      {shown.length === 0 && <p className="text-text-subdued">{t('trm.landscape.noDomains')}</p>}
      {shown.map((domain) => (
        <section key={domain.id} aria-label={domain.name} className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
          <h2 className="heading-3">{domain.name}</h2>
          {domain.subdomains.length === 0 && <p className="text-sm text-text-subdued">{t('trm.landscape.noSubdomains')}</p>}
          {domain.subdomains.map((sub) => (
            <section key={sub.id} aria-label={sub.name} className="flex flex-col gap-2 border-l-2 border-divider-default pl-3">
              <h3 className="font-semibold">{sub.name}</h3>
              <TileGrid apps={inSub(sub.id)} mode={mode} legend={legend} empty={t('trm.landscape.noApplications')} />
            </section>
          ))}
        </section>
      ))}
      <section aria-labelledby="trm-no-domain" className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
        <h2 id="trm-no-domain" className="heading-3">
          {t('trm.landscape.noDomain')}
        </h2>
        <TileGrid apps={nowhere} mode={mode} legend={legend} empty={t('trm.landscape.everyAppPlaced')} />
      </section>
    </div>
  )
}
