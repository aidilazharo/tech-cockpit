import type { Box, Diagram, DiagramApi, DiagramContent, DiagramRef, DiagramSlot, DiagramSlotData, DiagramView, Line, Upload, Zone } from '../schemas'

/**
 * What changed in a diagram slot between two versions, in one view (docs/modules/sad.md, Version compare): zones,
 * boxes and the view's own connections matched by id, their content only (not where they are drawn or how big), and
 * the files under each diagram. A diagram in only one version is one change.
 */

export type ChangeKind = 'added' | 'removed' | 'changed'
export type Field =
  | 'name'
  | 'kind'
  | 'inside'
  | 'title'
  | 'reason'
  | 'ends'
  | 'calls'
  | 'does'
  | 'direction'
  | 'data'
  | 'classification'
  | 'frequency'
  | 'protocol'
  | 'port'
  | 'tls'
  | 'pattern'
  | 'authentication'
  | 'api'
  | 'purpose'
  | 'flow'
  | 'label'
  | 'style'

/** One changed item: the fields that changed (all of them when it was added or removed). */
export type ItemChange = { kind: ChangeKind; fields: Field[] } & (
  | { type: 'zone'; before?: Zone; after?: Zone }
  | { type: 'box'; before?: Box; after?: Box }
  | { type: 'line'; before?: Line; after?: Line }
  | { type: 'file'; before?: Upload; after?: Upload }
  | { type: 'diagram'; before?: Diagram; after?: Diagram }
  | { type: 'reason'; before: string; after: string }
)

/** One side of a compared diagram: drawn, answered Not applicable, or not in that version. */
export type Side = { diagram: Diagram } | { notApplicable: string } | { missing: true }

export interface DiagramComparison {
  /** The diagram's id ("not-applicable" when both versions answer Not applicable) */
  id: string
  before: Side
  after: Side
  /** What each side's picture marks: removed and changed items on the earlier one, added and changed on the later one */
  marks: { before: Map<string, ChangeKind>; after: Map<string, ChangeKind> }
  changes: ItemChange[]
}

const PLACED: Field[] = ['name', 'kind', 'inside']
/** The facts each view shows of a connection (each view compares its own). */
const LINE_FIELDS: Record<DiagramView, Field[]> = {
  solution: ['ends', 'calls', 'does', 'direction'],
  'data-flow': ['ends', 'data', 'classification', 'frequency'],
  integration: ['ends', 'protocol', 'port', 'tls', 'direction', 'pattern', 'authentication', 'api', 'classification', 'purpose', 'flow'],
  infrastructure: ['ends', 'label', 'style'],
  process: ['ends', 'label', 'style'],
  monitoring: ['ends', 'label', 'style'],
}

/** A field's value, as compared (the words are the page's). */
function valueOf(field: Field, item: Zone | Box | Line): unknown {
  switch (field) {
    case 'name':
      return (item as Zone | Box).label
    case 'kind':
      // A box is what it is drawn as: its type, TRM link, icon and who approves it.
      return 'type' in item ? [item.type, item.application ?? null, item.server ?? null, item.icon ?? null, item.approver ?? null] : ((item as Zone).kind ?? null)
    case 'inside':
      return (item as Zone | Box).parentId ?? null
    case 'ends':
      return [(item as Line).from, (item as Line).to]
    case 'direction':
      return (item as Line).twoWay ?? false
    case 'tls':
      return [(item as Line).tls ?? null, (item as Line).protection ?? null]
    case 'api':
      return (item as Line).api?.id ?? null
    case 'style':
      return [(item as Line).dashed ?? false, (item as Line).twoWay ?? false]
    default:
      return (item as Line)[field as keyof Line] ?? null
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Items matched by id: added and changed in the later version's order, then removed. */
function diff<T extends Zone | Box | Line>(type: 'zone' | 'box' | 'line', before: T[], after: T[], fields: Field[]): ItemChange[] {
  const earlier = new Map(before.map((item) => [item.id, item]))
  const later = new Set(after.map((item) => item.id))
  const changes: ItemChange[] = []
  for (const item of after) {
    const was = earlier.get(item.id)
    if (!was) changes.push({ type, kind: 'added', after: item, fields } as ItemChange)
    else {
      const changed = fields.filter((field) => !same(valueOf(field, was), valueOf(field, item)))
      if (changed.length > 0) changes.push({ type, kind: 'changed', before: was, after: item, fields: changed } as ItemChange)
    }
  }
  for (const item of before) if (!later.has(item.id)) changes.push({ type, kind: 'removed', before: item, fields } as ItemChange)
  return changes
}

/** The same stored file is carried into each new draft under a new id: files are matched by name, size and when they were uploaded. */
const fileKey = (file: Upload) => `${file.name}\n${file.size}\n${file.uploadedAt}`
function fileChanges(before: Upload[], after: Upload[]): ItemChange[] {
  const earlier = new Set(before.map(fileKey))
  const later = new Set(after.map(fileKey))
  return [
    ...after.filter((file) => !earlier.has(fileKey(file))).map((file): ItemChange => ({ type: 'file', kind: 'added', after: file, fields: [] })),
    ...before.filter((file) => !later.has(fileKey(file))).map((file): ItemChange => ({ type: 'file', kind: 'removed', before: file, fields: [] })),
  ]
}

/** A view shows its own lines: the infrastructure diagram's Integration view its integration connections, its Infrastructure view the rest. */
const linesIn = (slot: DiagramSlot, view: DiagramView, diagram: Diagram) =>
  slot === 'infrastructure' ? diagram.lines.filter((line) => (line.layer === 'integration') === (view === 'integration')) : diagram.lines

/** Every part of a diagram in one version only, marked as such. */
const allMarked = (slot: DiagramSlot, view: DiagramView, diagram: Diagram, kind: ChangeKind) => new Map([...diagram.zones, ...diagram.boxes, ...linesIn(slot, view, diagram)].map((item) => [item.id, kind]))

const noMarks = () => ({ before: new Map<string, ChangeKind>(), after: new Map<string, ChangeKind>() })

/** A diagram drawn in only one version: one change, every part of it marked; the other side as it is there. */
function lone(slot: DiagramSlot, view: DiagramView, diagram: Diagram, kind: 'added' | 'removed', other: Side): DiagramComparison {
  const marks = noMarks()
  if (kind === 'added') {
    marks.after = allMarked(slot, view, diagram, kind)
    return { id: diagram.id, before: other, after: { diagram }, marks, changes: [{ type: 'diagram', kind, after: diagram, fields: [] }] }
  }
  marks.before = allMarked(slot, view, diagram, kind)
  return { id: diagram.id, before: { diagram }, after: other, marks, changes: [{ type: 'diagram', kind, before: diagram, fields: [] }] }
}

/** The diagrams of a slot that changed between two versions, in one view, with their files. */
export function compareSlot(slot: DiagramSlot, view: DiagramView, before: DiagramContent, after: DiagramContent, files: { before: Upload[]; after: Upload[] }): DiagramComparison[] {
  if ('notApplicable' in before && 'notApplicable' in after) {
    if (before.reason === after.reason) return []
    return [{ id: 'not-applicable', before: { notApplicable: before.reason }, after: { notApplicable: after.reason }, marks: noMarks(), changes: [{ kind: 'changed', type: 'reason', before: before.reason, after: after.reason, fields: ['reason'] }] }]
  }
  if ('notApplicable' in before) return (after as { diagrams: Diagram[] }).diagrams.map((diagram) => lone(slot, view, diagram, 'added', { notApplicable: before.reason }))
  if ('notApplicable' in after) return before.diagrams.map((diagram) => lone(slot, view, diagram, 'removed', { notApplicable: after.reason }))
  const filesOf = (list: Upload[], diagram: Diagram) => list.filter((file) => file.slot === slot && file.diagramId === diagram.id)
  const earlier = new Map(before.diagrams.map((diagram) => [diagram.id, diagram]))
  const compared = after.diagrams.map((diagram): DiagramComparison | null => {
    const was = earlier.get(diagram.id)
    if (!was) return lone(slot, view, diagram, 'added', { missing: true })
    const changes: ItemChange[] = [
      ...(was.title === diagram.title ? [] : [{ type: 'diagram' as const, kind: 'changed' as const, before: was, after: diagram, fields: ['title' as const] }]),
      ...diff('zone', was.zones, diagram.zones, PLACED),
      ...diff('box', was.boxes, diagram.boxes, PLACED),
      ...diff('line', linesIn(slot, view, was), linesIn(slot, view, diagram), LINE_FIELDS[view]),
      ...fileChanges(filesOf(files.before, was), filesOf(files.after, diagram)),
    ]
    if (changes.length === 0) return null
    const marks = noMarks()
    for (const change of changes) {
      if (change.type !== 'zone' && change.type !== 'box' && change.type !== 'line') continue
      if (change.before) marks.before.set(change.before.id, change.kind)
      if (change.after) marks.after.set(change.after.id, change.kind)
    }
    return { id: diagram.id, before: { diagram: was }, after: { diagram }, marks, changes }
  })
  const kept = new Set(after.diagrams.map((diagram) => diagram.id))
  const removed = before.diagrams.filter((diagram) => !kept.has(diagram.id)).map((diagram) => lone(slot, view, diagram, 'removed', { missing: true }))
  return [...compared.filter((comparison): comparison is DiagramComparison => comparison !== null), ...removed]
}

/** One version as the compare page has it: its label, the diagram slots and API names the reader sees, and its files. */
export interface ComparedVersion {
  label: string
  slots: DiagramSlotData[]
  apis: DiagramApi[]
  uploads: Upload[]
}

/** What changed in the diagrams a section shows, in its views; slots one of the versions does not show the reader are left out. */
export function compareRefs(refs: DiagramRef[], before: ComparedVersion, after: ComparedVersion): { ref: DiagramRef; comparison: DiagramComparison }[] {
  return refs.flatMap((ref) => {
    const earlier = before.slots.find((slot) => slot.slot === ref.slot)
    const later = after.slots.find((slot) => slot.slot === ref.slot)
    if (!earlier || !later) return []
    return compareSlot(ref.slot, ref.view, earlier.content, later.content, { before: before.uploads, after: after.uploads }).map((comparison) => ({ ref, comparison }))
  })
}
