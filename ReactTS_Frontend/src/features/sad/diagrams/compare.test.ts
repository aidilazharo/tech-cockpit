import { describe, expect, it } from 'vitest'
import type { Box, Diagram, DiagramContent, Line, Upload, Zone } from '../schemas'
import { compareSlot, type DiagramComparison } from './compare'

const zone = (id: string, overrides: Partial<Zone> = {}): Zone => ({ id, label: id, x: 0, y: 0, width: 300, height: 200, ...overrides })
const box = (id: string, overrides: Partial<Box> = {}): Box => ({ id, label: id, type: 'part', x: 0, y: 0, ...overrides })
const line = (id: string, from: string, to: string, overrides: Partial<Line> = {}): Line => ({ id, from, to, ...overrides })
const diagram = (id: string, overrides: Partial<Diagram> = {}): Diagram => ({ id, title: id, sizing: 'auto', zones: [], boxes: [], lines: [], ...overrides })
const drawn = (...diagrams: Diagram[]): DiagramContent => ({ diagrams })
const file = (overrides: Partial<Upload> = {}): Upload => ({
  id: '00000000-0000-4000-8000-0000000000f1',
  slot: 'solution',
  diagramId: 'solution',
  name: 'Design.pdf',
  type: 'pdf',
  size: 100,
  scan: 'clean',
  uploadedBy: null,
  uploadedAt: '2026-10-20T01:00:00Z',
  ...overrides,
})
const none = { before: [], after: [] }
/** Each change as "kind type id: fields". */
const ids = (comparison: DiagramComparison) =>
  comparison.changes.map((change) => {
    const item = change.after ?? change.before
    return `${change.kind} ${change.type} ${typeof item === 'string' ? item : (item as { id?: string; name?: string }).id ?? (item as { name: string }).name}: ${change.fields.join(',')}`
  })

const base = diagram('solution', {
  zones: [zone('own', { label: 'CRM', kind: 'This application' }), zone('tier', { label: 'Web tier', parentId: 'own' })],
  boxes: [box('portal', { label: 'Portal', parentId: 'own' }), box('agent', { label: 'Agent', type: 'actor' }), box('pas', { label: 'Policy Admin', type: 'business' })],
  lines: [
    line('l1', 'agent', 'portal', { calls: 'Portal UI', does: 'Serves agents', data: 'Policy', classification: 'internal', frequency: 'Daily' }),
    line('l2', 'portal', 'pas', { calls: 'Policy API v1', does: 'Creates policies' }),
  ],
})

describe('comparing two versions of a diagram slot', () => {
  it('finds nothing when only places, sizes or the sides lines use changed', () => {
    const moved = {
      ...base,
      zones: base.zones.map((z) => ({ ...z, x: z.x + 50, width: z.width + 40 })),
      boxes: base.boxes.map((b) => ({ ...b, y: b.y + 30 })),
      lines: base.lines.map((l) => ({ ...l, fromSide: 'b' as const, toSide: 't' as const })),
    }
    expect(compareSlot('solution', 'solution', drawn(base), drawn(moved), none)).toEqual([])
    expect(compareSlot('solution', 'solution', drawn(base), drawn(base), none)).toEqual([])
  })

  it('lists added, removed and changed zones, boxes and connections, and marks them on each side', () => {
    const later = {
      ...base,
      zones: [{ ...base.zones[0], label: 'CRM suite' }],
      boxes: [{ ...base.boxes[0], parentId: undefined, icon: 'app-services' }, base.boxes[1], box('sms', { label: 'SMS provider', type: 'external' })],
      lines: [{ ...base.lines[0], twoWay: true }, line('l3', 'portal', 'sms', { calls: 'SMS API' })],
    }
    const [comparison] = compareSlot('solution', 'solution', drawn(base), drawn(later), none)
    expect(comparison.before).toEqual({ diagram: base })
    expect(comparison.after).toEqual({ diagram: later })
    expect(ids(comparison)).toEqual([
      'changed zone own: name',
      'removed zone tier: name,kind,inside',
      'changed box portal: kind,inside',
      'added box sms: name,kind,inside',
      'removed box pas: name,kind,inside',
      'changed line l1: direction',
      'added line l3: ends,calls,does,direction',
      'removed line l2: ends,calls,does,direction',
    ])
    expect(Object.fromEntries(comparison.marks.before)).toEqual({ own: 'changed', tier: 'removed', portal: 'changed', pas: 'removed', l1: 'changed', l2: 'removed' })
    expect(Object.fromEntries(comparison.marks.after)).toEqual({ own: 'changed', portal: 'changed', sms: 'added', l1: 'changed', l3: 'added' })
  })

  it("compares each view's own facts: the Solution view what a connection calls, the Data flow view its data", () => {
    const later = { ...base, lines: [{ ...base.lines[0], calls: 'Portal UI v2', data: 'Policy\nCustomer' }, base.lines[1]] }
    expect(ids(compareSlot('solution', 'solution', drawn(base), drawn(later), none)[0])).toEqual(['changed line l1: calls'])
    expect(ids(compareSlot('solution', 'data-flow', drawn(base), drawn(later), none)[0])).toEqual(['changed line l1: data'])
    const reclassified = { ...base, lines: [{ ...base.lines[0], classification: 'confidential' as const, frequency: undefined }, base.lines[1]] }
    expect(ids(compareSlot('solution', 'data-flow', drawn(base), drawn(reclassified), none)[0])).toEqual(['changed line l1: classification,frequency'])
  })

  it('compares integration connections in the Integration view and infrastructure lines in the Infrastructure view', () => {
    const facts = { layer: 'integration' as const, protocol: 'HTTPS', port: 443, tls: '1.2' as const, pattern: 'api' as const, api: { id: '00000000-0000-4000-8000-0000000000a1' }, authentication: 'mTLS', classification: 'internal' as const, purpose: 'Pay', flow: 'service' as const }
    const tab = (lines: Line[]) => diagram('production', { tab: 'production', boxes: [box('vm', { type: 'server' }), box('bank', { type: 'external' })], lines })
    // A connection without facts yet, the same in both versions.
    const plain = line('plain', 'bank', 'vm', { layer: 'integration' })
    const before = drawn(tab([line('wan', 'vm', 'bank', { label: 'WAN' }), line('pay', 'vm', 'bank', facts), plain]), diagram('non-production', { tab: 'non-production' }))
    const after = drawn(
      tab([line('wan', 'vm', 'bank', { label: 'WAN', dashed: true }), line('pay', 'vm', 'bank', { ...facts, port: 8443, tls: 'none', protection: 'IPsec', api: { id: '00000000-0000-4000-8000-0000000000a2' } }), plain]),
      diagram('non-production', { tab: 'non-production' }),
    )
    const integration = compareSlot('infrastructure', 'integration', before, after, none)
    expect(integration).toHaveLength(1)
    expect(ids(integration[0])).toEqual(['changed line pay: port,tls,api'])
    expect(Object.fromEntries(integration[0].marks.after)).toEqual({ pay: 'changed' })
    expect(ids(compareSlot('infrastructure', 'infrastructure', before, after, none)[0])).toEqual(['changed line wan: style'])
  })

  it('lists files added and removed under each diagram, matching files carried into the draft', () => {
    const carried = file()
    const before = [carried, file({ id: '00000000-0000-4000-8000-0000000000f2', name: 'Old.pdf' }), file({ id: '00000000-0000-4000-8000-0000000000f3', slot: 'monitoring', diagramId: 'solution', name: 'Elsewhere.pdf' })]
    const after = [file({ id: '00000000-0000-4000-8000-0000000000f9' }), file({ id: '00000000-0000-4000-8000-0000000000f8', name: 'New.pdf', uploadedAt: '2026-10-24T01:00:00Z' })]
    const [comparison] = compareSlot('solution', 'solution', drawn(base), drawn(base), { before, after })
    expect(comparison.changes.map((change) => [change.kind, change.type, ((change.after ?? change.before) as Upload).name])).toEqual([
      ['added', 'file', 'New.pdf'],
      ['removed', 'file', 'Old.pdf'],
    ])
    expect(comparison.marks.after.size).toBe(0)
  })

  it('shows a diagram only in one version as one row, with every part of it marked', () => {
    const flow = diagram('ci-cd-2', { title: 'Release', zones: [zone('lane', { kind: 'lane' })], boxes: [box('go', { type: 'start', parentId: 'lane' })], lines: [] })
    const build = diagram('ci-cd-1', { title: 'Build' })
    const added = compareSlot('ci-cd', 'process', drawn(build), drawn(build, flow), none)
    expect(added).toHaveLength(1)
    expect(added[0]).toMatchObject({ id: 'ci-cd-2', before: { missing: true }, after: { diagram: flow } })
    expect(ids(added[0])).toEqual(['added diagram ci-cd-2: '])
    expect(Object.fromEntries(added[0].marks.after)).toEqual({ lane: 'added', go: 'added' })
    const removed = compareSlot('ci-cd', 'process', drawn(build, flow), drawn(build), none)
    expect(removed[0]).toMatchObject({ before: { diagram: flow }, after: { missing: true } })
    expect(ids(removed[0])).toEqual(['removed diagram ci-cd-2: '])
    expect(Object.fromEntries(removed[0].marks.before)).toEqual({ lane: 'removed', go: 'removed' })
    expect(ids(compareSlot('ci-cd', 'process', drawn(build), drawn({ ...build, title: 'Build and test' }), none)[0])).toEqual(['changed diagram ci-cd-1: title'])
  })

  it('compares Not applicable answers with drawn diagrams and with each other', () => {
    const notApplicable = (reason: string): DiagramContent => ({ notApplicable: true, reason })
    const answered = compareSlot('monitoring', 'monitoring', notApplicable('Batch job'), drawn(diagram('monitoring-1', { boxes: [box('dt', { type: 'monitoring' })] })), none)
    expect(answered[0]).toMatchObject({ before: { notApplicable: 'Batch job' }, after: { diagram: { id: 'monitoring-1' } } })
    expect(ids(answered[0])).toEqual(['added diagram monitoring-1: '])
    const dropped = compareSlot('monitoring', 'monitoring', drawn(diagram('monitoring-1')), notApplicable('Vendor monitors it'), none)
    expect(dropped[0]).toMatchObject({ before: { diagram: { id: 'monitoring-1' } }, after: { notApplicable: 'Vendor monitors it' } })
    expect(ids(dropped[0])).toEqual(['removed diagram monitoring-1: '])
    const reworded = compareSlot('monitoring', 'monitoring', notApplicable('Batch job'), notApplicable('Batch job only'), none)
    expect(reworded).toEqual([
      { id: 'not-applicable', before: { notApplicable: 'Batch job' }, after: { notApplicable: 'Batch job only' }, marks: { before: new Map(), after: new Map() }, changes: [{ kind: 'changed', type: 'reason', before: 'Batch job', after: 'Batch job only', fields: ['reason'] }] },
    ])
    expect(compareSlot('monitoring', 'monitoring', notApplicable('Batch job'), notApplicable('Batch job'), none)).toEqual([])
  })
})
