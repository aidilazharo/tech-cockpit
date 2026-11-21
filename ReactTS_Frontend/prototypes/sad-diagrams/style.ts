import { createContext } from 'react'

/** How a box or connection changed between two versions (compare view). */
export type Change = 'added' | 'removed' | 'changed'

export const CHANGE_CLASS: Record<Change, string> = {
  added: 'border-icon-success',
  removed: 'border-icon-error opacity-70',
  changed: 'border-icon-warning',
}
export const CHANGE_LABEL: Record<Change, string> = { added: 'Added', removed: 'Removed', changed: 'Changed' }

/** Line colour of a connection: its change in the compare view, else amber when facts are missing. */
export function strokeOf({ change, missing }: { change?: Change; missing?: boolean }): string {
  if (change === 'added') return 'var(--color-icon-success)'
  if (change === 'removed') return 'var(--color-icon-error)'
  if (change === 'changed' || missing) return 'var(--color-icon-warning)'
  return 'var(--color-icon-default)'
}

/** Lets a connection's label select the connection (labels are drawn outside the edge's SVG). */
export const SelectContext = createContext<(id: string) => void>(() => {})
