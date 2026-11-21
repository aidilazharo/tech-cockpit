import { describe, expect, it } from 'vitest'
import { dependencyDiagram } from './dependency'
import { BILLING, calls, CRM, PORTAL } from './fixtures'

describe('the dependency view of one application', () => {
  it('puts the application in the middle, the applications calling it on the left and those it calls on the right, one line per call', () => {
    const d = dependencyDiagram(CRM.id, calls, 'Restricted')
    // Columns and rows far enough apart that line labels, even spread ones, stay 24px apart when a phone fits the view.
    expect(d.boxes.map((box) => [box.id, box.label, box.type, box.x, box.y, box.application ?? null])).toEqual([
      ['centre', 'CRM', 'part', 480, 100, null],
      ['in-ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1', 'Billing', 'business', 0, 0, { id: BILLING.id, number: BILLING.number }],
      ['in-9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d', 'Customer Portal', 'business', 0, 200, { id: PORTAL.id, number: PORTAL.number }],
      ['out-ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1', 'Billing', 'business', 960, 0, { id: BILLING.id, number: BILLING.number }],
    ])
    expect(d.lines).toEqual([
      { id: 'call-1', from: 'centre', to: `out-${BILLING.id}`, label: 'Billing API: create invoice', twoWay: true },
      { id: 'call-2', from: `in-${BILLING.id}`, to: 'centre', label: 'CRM Customer API' },
      { id: 'call-3', from: `in-${PORTAL.id}`, to: 'centre', label: 'Restricted' },
      { id: 'call-4', from: 'centre', to: `out-${BILLING.id}`, label: 'Invoice file' },
    ])
    expect(d).toMatchObject({ sizing: 'manual', zones: [] })
  })

  it('names an application without a name by its APM number, and a call not described yet without a label', () => {
    const d = dependencyDiagram(CRM.id, [{ ...calls[0], calls: null, callee: { ...BILLING, name: null } }], 'Restricted')
    expect(d.boxes[1].label).toBe('APM-0011')
    expect(d.lines[0]).not.toHaveProperty('label')
    expect(dependencyDiagram(CRM.id, [{ ...calls[0], callee: { ...BILLING, name: null, number: null } }], 'Restricted').boxes[1].label).toBe('—')
  })
})
