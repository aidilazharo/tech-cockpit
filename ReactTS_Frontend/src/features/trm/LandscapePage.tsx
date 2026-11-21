import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/page/PageHeader'
import { LoadFailed, Loading } from '../../components/page/QueryStates'
import { Button, Tabs } from '../../components/qi'
import { COLOUR_MODES, type ColourMode, legend } from './colouring'
import { ColourControls } from './landscape/AppTile'
import { CapabilityMapView } from './landscape/CapabilityMapView'
import { DependencyView } from './landscape/DependencyView'
import { DomainView } from './landscape/DomainView'
import { LifecycleView } from './landscape/LifecycleView'
import { TechnologyView } from './landscape/TechnologyView'
import { useListParams } from './list-params'
import { FilterDropdown, SearchField } from './parts'
import { useDomains, useLandscape, usePortfolios } from './queries'

const VIEWS = ['capabilities', 'domains', 'lifecycle', 'technology', 'dependencies'] as const
/** Views of their own, without the landscape's search and filters */
const UNFILTERED: readonly View[] = ['technology', 'dependencies']
type View = (typeof VIEWS)[number]

/** /trm/landscape — the application landscape by capability, domain, lifecycle and technology layer, and one application's dependencies. */
export function LandscapePage() {
  const { t } = useTranslation()
  const list = useListParams(['view', 'colour', 'q', 'portfolioId', 'domainId'])
  const view: View = (VIEWS as readonly string[]).includes(list.values.view) ? (list.values.view as View) : 'capabilities'
  const mode: ColourMode = (COLOUR_MODES as readonly string[]).includes(list.values.colour) ? (list.values.colour as ColourMode) : 'lifecycle'
  const filters = { q: list.values.q, portfolioId: list.values.portfolioId, domainId: list.values.domainId }
  const landscape = useLandscape(filters)
  const portfolios = usePortfolios()
  const domains = useDomains()
  const filtered = Object.values(filters).some(Boolean)
  const apps = landscape.data?.applications ?? []
  const entries = legend(apps, mode)

  const content = () => {
    if (view === 'technology') return <TechnologyView />
    if (view === 'dependencies') return <DependencyView />
    if (landscape.isPending) return <Loading />
    if (landscape.isError) return <LoadFailed onRetry={() => void landscape.refetch()} />
    if (view === 'lifecycle') return <LifecycleView apps={apps} />
    return (
      <>
        <ColourControls mode={mode} onMode={(colour) => list.set({ colour })} legend={entries} apps={apps} />
        {view === 'capabilities' ? <CapabilityMapView apps={apps} mode={mode} legend={entries} /> : <DomainView apps={apps} mode={mode} legend={entries} />}
      </>
    )
  }

  return (
    <>
      <PageHeader title={t('trm.landscape.title')} intro={t('trm.landscape.intro')} />
      <Tabs<View>
        label={t('trm.landscape.views')}
        tabs={VIEWS.map((value) => ({ value, label: t(`trm.landscape.view.${value}`) }))}
        value={view}
        onValueChange={(next) => list.set({ view: next, colour: list.values.colour, ...filters })}
      >
        <div className="flex flex-col gap-4">
          {!UNFILTERED.includes(view) && (
            <form role="search" aria-label={t('trm.filters')} onSubmit={(event) => event.preventDefault()} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <SearchField label={t('trm.applications.search')} value={list.values.q} onSearch={(q) => list.set({ ...filters, view: list.values.view, colour: list.values.colour, q })} />
              <FilterDropdown
                label={t('trm.applications.portfolio')}
                anyLabel={t('trm.applications.anyPortfolio')}
                value={list.values.portfolioId}
                onChange={(portfolioId) => list.set({ ...filters, view: list.values.view, colour: list.values.colour, portfolioId })}
                options={(portfolios.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))}
              />
              <FilterDropdown
                label={t('trm.landscape.domain')}
                anyLabel={t('trm.landscape.anyDomain')}
                value={list.values.domainId}
                onChange={(domainId) => list.set({ ...filters, view: list.values.view, colour: list.values.colour, domainId })}
                options={(domains.data?.items ?? []).map((d) => ({ value: d.id, label: d.name }))}
              />
              {filtered && (
                <div className="flex items-end">
                  <Button variant="tertiary" onClick={() => list.set({ q: '', portfolioId: '', domainId: '', view: list.values.view, colour: list.values.colour })}>
                    {t('common.clear')}
                  </Button>
                </div>
              )}
            </form>
          )}
          {content()}
        </div>
      </Tabs>
    </>
  )
}
