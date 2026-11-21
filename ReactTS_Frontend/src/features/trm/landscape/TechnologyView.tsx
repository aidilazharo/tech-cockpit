import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LoadFailed, Loading } from '../../../components/page/QueryStates'
import { cn } from '../../../lib/cn'
import { RecordLink, RefLinks, StandardStatus } from '../parts'
import { useStandardUsage, useTechnology } from '../queries'
import type { TechnologyView as View } from '../schemas'
import { useText } from '../text'

type Standard = View['standards'][number]

/** Layers as rows of product standards; open a standard to see its models and the applications on each. */
export function TechnologyView() {
  const { t } = useTranslation()
  const technology = useTechnology()
  const [open, setOpen] = useState<string | null>(null)
  if (technology.isPending) return <Loading />
  if (technology.isError) return <LoadFailed onRetry={() => void technology.refetch()} />
  const rows = [
    ...technology.data.layers.map((layer) => ({ id: layer.id, name: layer.name, standards: technology.data.standards.filter((s) => s.layerId === layer.id) })),
    { id: 'unmapped', name: t('trm.landscape.notMapped'), standards: technology.data.standards.filter((s) => s.layerId === null) },
  ]
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <section key={row.id} aria-label={row.name} className="flex flex-col gap-3 rounded-card border border-divider-default p-4">
          <h2 className="heading-3">{row.name}</h2>
          {row.standards.length === 0 ? (
            <p className="text-sm text-text-subdued">{t('trm.landscape.noStandards')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {row.standards.map((standard) => (
                <StandardTile key={standard.id} standard={standard} open={open === standard.id} onToggle={() => setOpen(open === standard.id ? null : standard.id)} />
              ))}
            </ul>
          )}
          {open && row.standards.some((s) => s.id === open) && <StandardUsagePanel id={open} />}
        </section>
      ))}
    </div>
  )
}

function StandardTile({ standard, open, onToggle }: { standard: Standard; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const { named } = useText()
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          'flex min-h-14 w-full flex-col items-start gap-1 rounded-card border border-divider-default bg-surface-default px-3 py-2 text-left text-sm',
          'hover:border-border-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          open && 'border-border-selected',
        )}
      >
        <span className="font-semibold">{named(standard.name)}</span>
        <StandardStatus status={standard.status} />
        <span className="text-xs text-text-subdued">{t('trm.landscape.usage', { applications: standard.applicationCount, models: standard.modelCount })}</span>
      </button>
    </li>
  )
}

function StandardUsagePanel({ id }: { id: string }) {
  const { t } = useTranslation()
  const usage = useStandardUsage(id)
  if (usage.isPending) return <Loading />
  if (usage.isError) return <LoadFailed onRetry={() => void usage.refetch()} />
  return (
    <div className="flex flex-col gap-2 rounded-card bg-surface-alternate p-3">
      <h3 className="font-semibold">{t('trm.landscape.modelsAndApplications')}</h3>
      {usage.data.models.length === 0 ? (
        <p className="text-sm text-text-subdued">{t('trm.landscape.noModels')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {usage.data.models.map((model) => (
            <li key={model.id} className="flex flex-col gap-1">
              <span>
                <RecordLink to={`/trm/software-models/${model.id}`} name={model.name} /> {model.productVersion && <span className="text-sm text-text-subdued">{model.productVersion}</span>}
              </span>
              <RefLinks items={model.applications} to={(appId) => `/trm/applications/${appId}`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
