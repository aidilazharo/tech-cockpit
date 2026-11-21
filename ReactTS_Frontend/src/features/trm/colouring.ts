import type { LandscapeApp } from './schemas'
import { FIT_SCORES, TIME_RATINGS } from './schemas'

/** What the capability map and domain view can colour application tiles by. */
export const COLOUR_MODES = ['lifecycle', 'time', 'criticality', 'functionalFit', 'technicalFit'] as const
export type ColourMode = (typeof COLOUR_MODES)[number]

// Qi data-visualisation tokens, as full class names so Tailwind keeps them.
const CATEGORY = [
  'border-l-data-visualisation-category-1',
  'border-l-data-visualisation-category-2',
  'border-l-data-visualisation-category-3',
  'border-l-data-visualisation-category-4',
  'border-l-data-visualisation-category-5',
  'border-l-data-visualisation-category-6',
  'border-l-data-visualisation-category-7',
  'border-l-data-visualisation-category-8',
]
const LEVEL = ['border-l-data-visualisation-level-2', 'border-l-data-visualisation-level-4', 'border-l-data-visualisation-level-6', 'border-l-data-visualisation-level-8', 'border-l-data-visualisation-level-10']
export const NONE_CLASS = 'border-l-data-visualisation-others'
export const SWATCH: Record<string, string> = Object.fromEntries(
  [...CATEGORY, ...LEVEL, NONE_CLASS].map((border) => [border, border.replace('border-l-', 'bg-')]),
)

export interface LegendEntry {
  /** Value key ('' = no value) */
  key: string
  /** Shown text; null means "no value" (the caller labels it) */
  label: string | null
  border: string
}

/** The value an application has in a mode, as a key ('' when it has none). */
export function colourKey(app: LandscapeApp, mode: ColourMode): string {
  const value = { lifecycle: app.installStatus, time: app.timeRating, criticality: app.criticalityRating, functionalFit: app.functionalFit, technicalFit: app.technicalFit }[mode]
  return value === null ? '' : String(value)
}

/**
 * Legend for a mode: fixed scales for TIME and fit; ServiceNow's own values (sorted)
 * for lifecycle and criticality, the first eight getting their own colour.
 */
export function legend(apps: LandscapeApp[], mode: ColourMode): LegendEntry[] {
  let entries: LegendEntry[]
  if (mode === 'time') entries = TIME_RATINGS.map((value, i) => ({ key: value, label: value, border: CATEGORY[i] }))
  else if (mode === 'functionalFit' || mode === 'technicalFit') entries = FIT_SCORES.map((score, i) => ({ key: String(score), label: String(score), border: LEVEL[i] }))
  else {
    const values = [...new Set(apps.map((app) => colourKey(app, mode)).filter(Boolean))].sort()
    entries = values.map((value, i) => ({ key: value, label: value, border: CATEGORY[i] ?? NONE_CLASS }))
  }
  return [...entries, { key: '', label: null, border: NONE_CLASS }]
}
