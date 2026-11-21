import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Dropdown, Tag } from '../../../components/qi'
import { cn } from '../../../lib/cn'
import { COLOUR_MODES, type ColourMode, colourKey, type LegendEntry, NONE_CLASS, SWATCH } from '../colouring'
import { useValueLabel } from './value-label'
import type { LandscapeApp } from '../schemas'
import { useText } from '../text'

/** An application as a tile: name, its value as text, and a colour edge. */
export function AppTile({ app, mode, legend }: { app: LandscapeApp; mode: ColourMode; legend: LegendEntry[] }) {
  const { t } = useTranslation()
  const { named } = useText()
  const key = colourKey(app, mode)
  const value = useValueLabel(mode)(key)
  const border = legend.find((entry) => entry.key === key)?.border ?? NONE_CLASS
  return (
    <li>
      <Link
        to={`/trm/applications/${app.id}`}
        className={cn(
          'flex min-h-14 w-full flex-col justify-center gap-0.5 rounded-card border border-l-8 border-divider-default bg-surface-default px-3 py-2 text-sm',
          'hover:border-border-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus',
          border,
        )}
      >
        <span className="font-semibold text-text-default">{named(app.name)}</span>
        <span className="text-xs text-text-subdued">{value}</span>
        {app.missingSince && <span className="text-xs font-semibold text-text-error">{t('trm.landscape.missing')}</span>}
        {app.capabilityMismatch && <Tag className="mt-1 w-fit">{t('trm.applications.capabilityToCheck')}</Tag>}
      </Link>
    </li>
  )
}

export function TileGrid({ apps, mode, legend, empty }: { apps: LandscapeApp[]; mode: ColourMode; legend: LegendEntry[]; empty: string }) {
  if (apps.length === 0) return <p className="text-sm text-text-subdued">{empty}</p>
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {apps.map((app) => (
        <AppTile key={app.id} app={app} mode={mode} legend={legend} />
      ))}
    </ul>
  )
}

/** "Colour by" switch and its legend with counts. */
export function ColourControls({ mode, onMode, legend, apps }: { mode: ColourMode; onMode: (mode: ColourMode) => void; legend: LegendEntry[]; apps: LandscapeApp[] }) {
  const { t } = useTranslation()
  const label = useValueLabel(mode)
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-xs">
        <Dropdown<ColourMode>
          label={t('trm.landscape.colourBy')}
          value={mode}
          onValueChange={(next) => next && onMode(next)}
          options={COLOUR_MODES.map((value) => ({ value, label: t(`trm.landscape.colour.${value}`) }))}
        />
      </div>
      <ul aria-label={t('trm.landscape.legend')} className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {legend.map((entry) => (
          <li key={entry.key || 'none'} className="flex items-center gap-2">
            <span aria-hidden="true" className={cn('size-3 rounded-sm', SWATCH[entry.border])} />
            {label(entry.key)} ({apps.filter((app) => colourKey(app, mode) === entry.key).length})
          </li>
        ))}
      </ul>
    </div>
  )
}
