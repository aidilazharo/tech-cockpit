import { describe, expect, it } from 'vitest'
import { diagramSlots } from '../fixtures'
import type { Diagram } from '../schemas'
import { forEditing, forSaving } from './editing'

describe('a slot being edited', () => {
  it('keeps with each diagram the ids new items must not take: lines the editor cannot see, and everything saved', () => {
    const slot = { ...diagramSlots()[1], hidden: [{ diagramId: 'production', takenIds: ['line-9'], carriers: [] }] }
    const editing = forEditing(slot) as { diagrams: Diagram[] }
    const production = slot.content as { diagrams: Diagram[] }
    expect(editing.diagrams[0].taken).toEqual(['line-9', ...production.diagrams[0].zones.map((z) => z.id), 'box-1'])
    expect(editing.diagrams[1].taken).toEqual(production.diagrams[1].zones.map((z) => z.id))
    const notApplicable = { ...diagramSlots()[0], content: { notApplicable: true as const, reason: 'SaaS' } }
    expect(forEditing(notApplicable)).toBe(notApplicable.content)
  })

  it("sends only what the API takes: no taken ids, and Copy from production as the save's own flag", () => {
    const editing = forEditing(diagramSlots()[1]) as { diagrams: Diagram[] }
    const saved = forSaving({ ...editing, copiedFromProduction: true } as never)
    expect(saved.copyFromProduction).toBe(true)
    expect(JSON.stringify(saved.content)).not.toContain('taken')
    expect(saved.content).not.toHaveProperty('copiedFromProduction')
    expect(forSaving(editing as never)).not.toHaveProperty('copyFromProduction')
    expect(forSaving({ notApplicable: true, reason: 'SaaS' })).toEqual({ content: { notApplicable: true, reason: 'SaaS' } })
  })
})
