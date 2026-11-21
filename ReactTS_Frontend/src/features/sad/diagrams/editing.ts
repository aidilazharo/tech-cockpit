import type { Diagram, DiagramContent, DiagramSlotData } from '../schemas'

/**
 * What the editor keeps with a slot's content that the API never receives: on each diagram, the ids new items must not
 * take (lines the editor cannot see, and every item saved, so one removed before saving never comes back under its
 * id, carrying facts kept for it), and whether section 3 copied production (the API then copies the integration connections).
 */
type Editing = DiagramContent & { copiedFromProduction?: true }

/** A saved slot, ready to edit. */
export function forEditing(slot: DiagramSlotData): DiagramContent {
  const { content } = slot
  if ('notApplicable' in content) return content
  const taken = (d: Diagram) => [...(slot.hidden.find((hidden) => hidden.diagramId === d.id)?.takenIds ?? []), ...[...d.zones, ...d.boxes, ...d.lines].map((item) => item.id)]
  return { ...content, diagrams: content.diagrams.map((d) => ({ ...d, taken: taken(d) })) }
}

const withoutTaken = (d: Diagram): Diagram => {
  const sent = { ...d }
  delete sent.taken
  return sent
}

/** What the save sends: the content without the editor's own keeping, and Copy from production as the save's flag. */
export function forSaving(content: Editing): { content: DiagramContent; copyFromProduction?: true } {
  if ('notApplicable' in content) return { content }
  const { copiedFromProduction, diagrams, ...rest } = content
  const sent = { ...rest, diagrams: diagrams.map(withoutTaken) }
  return copiedFromProduction ? { content: sent, copyFromProduction: true } : { content: sent }
}
