import type { ChangeKind } from './compare'

/** How a compared item is outlined: green when added, red when removed, amber when changed (always with its word). */
export const CHANGE_BORDER: Record<ChangeKind, string> = { added: 'border-icon-success', removed: 'border-icon-error', changed: 'border-icon-warning' }
export const CHANGE_STROKE: Record<ChangeKind, string> = { added: 'stroke-icon-success', removed: 'stroke-icon-error', changed: 'stroke-icon-warning' }
export const CHANGE_LINE: Record<ChangeKind, string> = { added: 'var(--color-icon-success)', removed: 'var(--color-icon-error)', changed: 'var(--color-icon-warning)' }
