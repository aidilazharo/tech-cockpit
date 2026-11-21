import { MarkerType, type Edge, type Node, type XYPosition } from '@xyflow/react'
import { BoxNode, FactEdge, LaneNode, StepNode, ZoneNode, type BoxData, type FactData, type StepData, type ZoneData } from './nodes'
import { strokeOf, type Change } from './style'

export const NODE_TYPES = { zone: ZoneNode, lane: LaneNode, box: BoxNode, step: StepNode }
export const EDGE_TYPES = { fact: FactEdge }

export type Side = 't' | 'r' | 'b' | 'l'

/** One titled diagram in a slot. */
export interface Diagram {
  id: string
  title: string
  nodes: Node[]
  edges: Edge<FactData>[]
  /** Zone sizes: fitted automatically (the default for new diagrams) or set by hand */
  sizing?: 'auto' | 'manual'
  /** Bumped when the content is replaced (e.g. copied from production), so the canvas starts afresh */
  revision?: number
}

type Rect = [x: number, y: number, width: number, height: number]

export function zone(id: string, label: string, [x, y, width, height]: Rect, options: Omit<ZoneData, 'label'> & { parent?: string } = {}): Node<ZoneData> {
  const { parent, ...data } = options
  return {
    id,
    type: 'zone',
    position: { x, y },
    style: { width, height },
    data: { label, tone: parent ? 'inner' : 'outer', ...data },
    ...(parent ? { parentId: parent, extent: 'parent' as const } : {}),
  }
}

export function lane(id: string, label: string, y: number, width: number, height = 150): Node<{ label: string }> {
  return { id, type: 'lane', position: { x: 0, y }, style: { width, height }, data: { label }, draggable: false, selectable: false }
}

export function box(id: string, parent: string | undefined, [x, y]: [number, number], data: BoxData): Node<BoxData> {
  return { id, type: 'box', position: { x, y }, data, ...(parent ? { parentId: parent, extent: 'parent' as const } : {}) }
}

export function step(id: string, parent: string, [x, y]: [number, number], label: string, shape: StepData['shape'] = 'step'): Node<StepData> {
  return { id, type: 'step', parentId: parent, extent: 'parent' as const, position: { x, y }, data: { label, shape } }
}

export function edge(
  id: string,
  [source, sourceHandle]: [string, Side],
  [target, targetHandle]: [string, Side],
  lines: string[],
  options: { dashed?: boolean; twoWay?: boolean; change?: Change; missing?: boolean; facts?: FactData['facts']; todo?: string[]; offset?: number; layer?: FactData['layer']; row?: FactData['row'] } = {},
): Edge<FactData> {
  const { twoWay, ...data } = options
  const marker = { type: MarkerType.ArrowClosed, color: strokeOf(options) }
  return {
    id,
    type: 'fact',
    source,
    sourceHandle,
    target,
    targetHandle,
    markerEnd: marker,
    ...(twoWay ? { markerStart: marker } : {}),
    data: { lines, ...data },
  }
}

// ----- Automatic zone sizes: a zone fits its contents; an empty zone shrinks to just its name.

const PAD = 15
const EMPTY_HEIGHT = 40

function boxSize(node: Node): [number, number] {
  if (node.measured?.width && node.measured?.height) return [node.measured.width, node.measured.height]
  if (node.type === 'step') return (node.data as StepData).shape === 'decision' ? [112, 112] : [176, 48]
  return [176, 76]
}

type Area = { x: number; y: number; w: number; h: number }
const GAP = 30
const overlaps = (a: Area, b: Area) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * Automatic layout of zones: every zone is sized from its children (deepest first), and a zone that grows pushes
 * the zones beside it to the right, or the zones under it down, so neighbours never overlap.
 */
export function fitLayout(nodes: Node[]): { sizes: Map<string, [number, number]>; positions: Map<string, XYPosition> } {
  const children = new Map<string | undefined, Node[]>()
  for (const node of nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  const sizes = new Map<string, [number, number]>()
  const positions = new Map<string, XYPosition>()
  const at = (node: Node) => positions.get(node.id) ?? node.position

  const pushApart = (siblings: Node[]) => {
    const zones = siblings.filter((n) => n.type === 'zone').sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
    const placed: Area[] = []
    for (const zone of zones) {
      const [w, h] = sizes.get(zone.id)!
      const rect = { ...zone.position, w, h }
      for (let tries = 0; tries < 20; tries++) {
        const hit = placed.find((r) => overlaps(rect, r))
        if (!hit) break
        if (rect.x >= hit.x + hit.w / 2) rect.x = hit.x + hit.w + GAP
        else rect.y = hit.y + hit.h + GAP
      }
      placed.push(rect)
      if (rect.x !== zone.position.x || rect.y !== zone.position.y) positions.set(zone.id, { x: rect.x, y: rect.y })
    }
  }

  const fit = (node: Node): [number, number] => {
    if (node.type !== 'zone') return boxSize(node)
    if (sizes.has(node.id)) return sizes.get(node.id)!
    const kids = children.get(node.id) ?? []
    const data = node.data as ZoneData
    if (kids.length === 0) {
      const empty: [number, number] = [data.label.length * 8.5 + (data.kind?.length ?? 0) * 7 + (data.icon ? 24 : 0) + 90, EMPTY_HEIGHT]
      sizes.set(node.id, empty)
      return empty
    }
    kids.forEach(fit)
    pushApart(kids)
    const size: [number, number] = [Math.max(...kids.map((k) => at(k).x + fit(k)[0])) + PAD, Math.max(...kids.map((k) => at(k).y + fit(k)[1])) + PAD]
    sizes.set(node.id, size)
    return size
  }
  const roots = children.get(undefined) ?? []
  roots.forEach(fit)
  pushApart(roots)
  return { sizes, positions }
}

/** Size of every zone, worked out from its children. */
export const fitSizes = (nodes: Node[]) => fitLayout(nodes).sizes

/** Applies fitted sizes; empty zones are marked so they show as empty. */
export function applySizes(nodes: Node[], sizes: Map<string, [number, number]>): Node[] {
  const parents = new Set(nodes.map((n) => n.parentId))
  return nodes.map((node) => {
    const size = sizes.get(node.id)
    if (!size) return node
    return { ...node, style: { ...node.style, width: size[0], height: size[1] }, data: { ...node.data, empty: !parents.has(node.id) } }
  })
}
