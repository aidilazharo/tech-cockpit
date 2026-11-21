import { createContext, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import type { Diagram, DiagramView } from '../schemas'
import { namesOf } from './helpers'
import { hiddenLost } from './model'

/** On one diagram: the items carrying lines or facts of views the editor cannot read, what the editor edits, and which section each view belongs to. */
export interface HiddenOnDiagram {
  carriers: readonly { id: string; view: DiagramView }[]
  editableViews: readonly DiagramView[]
  sectionOf: (view: DiagramView) => string
}
export const HiddenContext = createContext<HiddenOnDiagram>({ carriers: [], editableViews: [], sectionOf: () => '' })

/**
 * Removing the selected item when it carries lines or facts the editor cannot see: asked first (naming the sections,
 * never the facts), or not allowed when it would remove section 3's infrastructure lines and the editor does not draw them.
 */
export function useHiddenRemoval(diagram: Diagram, selected: string | null): { confirm?: { title: string; description: string }; blocked?: string } {
  const { t } = useTranslation()
  const { carriers, editableViews, sectionOf } = useContext(HiddenContext)
  const lost = selected ? hiddenLost(diagram, selected, carriers) : []
  if (lost.length === 0) return {}
  const name = namesOf(diagram)
  const line = diagram.lines.find((item) => item.id === selected)
  const item = line ? `${name(line.from)} → ${name(line.to)}` : name(selected!)
  const sections = [...new Set(lost.map(sectionOf))].map((title) => `“${title}”`).join(t('sad.diagram.and'))
  if (lost.includes('infrastructure') && !editableViews.includes('infrastructure')) return { blocked: t('sad.diagram.hiddenBlocked', { name: item, sections }) }
  return { confirm: { title: t('sad.diagram.hiddenLostTitle'), description: t('sad.diagram.hiddenLost', { name: item, sections }) } }
}
