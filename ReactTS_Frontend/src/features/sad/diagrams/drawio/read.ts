import { AZURE_ICONS } from '../azure-icons'

/** What a draw.io shape's style says it is (anything else is a rectangle). */
export type DrawioShape = 'swimlane' | 'group' | 'rectangle' | 'rhombus' | 'terminator' | 'person' | 'image'

/** A shape or container on a page, where draw.io drew it (relative to its container). */
export interface DrawioItem {
  id: string
  label: string
  container: boolean
  parentId?: string
  x: number
  y: number
  width: number
  height: number
  shape: DrawioShape
  /** The Azure icon from Microsoft's set its picture matches */
  icon?: string
}
export interface DrawioArrow {
  id: string
  label: string
  from: string
  to: string
  dashed: boolean
  twoWay: boolean
}
/** What the file holds that cannot become part of a diagram: free text, and arrows without two ends. */
export interface DrawioSkip {
  label: string
  reason: 'text' | 'loose-arrow'
}
export interface DrawioPage {
  name: string
  items: DrawioItem[]
  arrows: DrawioArrow[]
  skipped: DrawioSkip[]
}

export type DrawioProblem = 'not-drawio' | 'unreadable' | 'too-big'
export class DrawioError extends Error {
  readonly reason: DrawioProblem
  constructor(reason: DrawioProblem) {
    super(reason)
    this.reason = reason
  }
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024
/** A compressed page may not unpack to more than this (a small file can hold a huge page). */
const MAX_PAGE_BYTES = 50 * 1024 * 1024

/** draw.io's own files only (.drawio and .xml), up to 5 MB. */
export function checkFile({ name, size }: { name: string; size: number }): DrawioProblem | null {
  if (!/\.(drawio|xml)$/i.test(name)) return 'not-drawio'
  return size > MAX_FILE_BYTES ? 'too-big' : null
}

/** Parses XML with the browser's parser; a document type is refused, so no entity can be expanded. */
function parseXml(text: string, problem: DrawioProblem): Element {
  if (/<!DOCTYPE/i.test(text)) throw new DrawioError(problem)
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length > 0) throw new DrawioError(problem)
  return doc.documentElement
}

/** A compressed page: base64 of the raw-deflated, URI-encoded model. */
async function unpack(packed: string): Promise<Element> {
  try {
    const bytes = Uint8Array.from(atob(packed), (char) => char.charCodeAt(0))
    const source = new ReadableStream<BufferSource>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    })
    const reader = source.pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (let read = await reader.read(); !read.done; read = await reader.read()) {
      size += read.value.length
      if (size > MAX_PAGE_BYTES) throw new DrawioError('unreadable')
      chunks.push(read.value)
    }
    const all = new Uint8Array(size)
    chunks.reduce((at, chunk) => (all.set(chunk, at), at + chunk.length), 0)
    const model = parseXml(decodeURIComponent(new TextDecoder().decode(all)), 'unreadable')
    if (model.nodeName !== 'mxGraphModel') throw new DrawioError('unreadable')
    return model
  } catch {
    throw new DrawioError('unreadable')
  }
}

type Style = { tokens: Set<string>; values: Map<string, string> }
function styleOf(text: string | null): Style {
  const parts = (text ?? '').split(';').filter(Boolean)
  return {
    tokens: new Set(parts.filter((part) => !part.includes('='))),
    values: new Map(parts.filter((part) => part.includes('=')).map((part) => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)])),
  }
}

/** A label as plain text: draw.io keeps HTML in labels (bold, line breaks); our names are one line of up to 200 characters. */
function textOf(value: string | null): string {
  if (!value) return ''
  const text = /<[a-z/!]/i.test(value) ? new DOMParser().parseFromString(value.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(div|p|li)>/gi, ' '), 'text/html').body.textContent! : value
  return text.replace(/\s+/g, ' ').trim().slice(0, 200)
}

const normal = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const ICON_IDS = new Set(AZURE_ICONS.map((icon) => icon.id))

/** The Azure icon a draw.io Azure shape shows: its picture's file name (azure2 library) or its shape name (older library). */
function azureIcon({ values }: Style): string | undefined {
  const image = values.get('image') ?? ''
  const shape = values.get('shape') ?? ''
  const name = /azure/i.test(image) ? image.slice(image.lastIndexOf('/') + 1).replace(/\.\w+$/, '') : shape.startsWith('mxgraph.azure.') ? shape.slice('mxgraph.azure.'.length) : ''
  if (!name) return undefined
  const id = normal(name)
  return ICON_IDS.has(id) ? id : undefined
}

function shapeOf(style: Style, icon: string | undefined): DrawioShape {
  const { tokens, values } = style
  const shape = values.get('shape') ?? ''
  if (tokens.has('swimlane') || shape === 'swimlane') return 'swimlane'
  if (tokens.has('group') || values.get('container') === '1') return 'group'
  if (tokens.has('rhombus') || shape === 'rhombus' || shape === 'mxgraph.flowchart.decision') return 'rhombus'
  if (tokens.has('ellipse') || shape === 'ellipse' || /^mxgraph\.flowchart\.(terminator|start_1|start_2)$/.test(shape)) return 'terminator'
  if (shape === 'umlActor' || shape === 'mxgraph.basic.person') return 'person'
  if (icon || tokens.has('image') || shape === 'image') return 'image'
  return 'rectangle'
}

type Cell = { id: string; value: string | null; style: Style; vertex: boolean; edge: boolean; parent: string | null; source: string | null; target: string | null; geometry: Element | undefined }

/** A cell, or a cell wrapped in a UserObject or object (which then holds its id and label); one without either is left out. */
function cellOf(node: Element): Cell | null {
  const cell = node.nodeName === 'mxCell' ? node : [...node.children].find((child) => child.nodeName === 'mxCell')
  const id = node.getAttribute('id')
  if (!cell || !id) return null
  return {
    id,
    value: node === cell ? cell.getAttribute('value') : node.getAttribute('label'),
    style: styleOf(cell.getAttribute('style')),
    vertex: cell.getAttribute('vertex') === '1',
    edge: cell.getAttribute('edge') === '1',
    parent: cell.getAttribute('parent'),
    source: cell.getAttribute('source'),
    target: cell.getAttribute('target'),
    geometry: [...cell.children].find((child) => child.nodeName === 'mxGeometry'),
  }
}

function readModel(name: string, model: Element): DrawioPage {
  const root = [...model.children].find((child) => child.nodeName === 'root')
  const cells = [...(root?.children ?? [])].map(cellOf).filter((cell): cell is Cell => cell !== null)
  const roots = new Set(cells.filter((cell) => !cell.parent).map((cell) => cell.id))
  // Layers sit in the root; what sits in a layer is at the top of the page.
  const layers = new Set(cells.filter((cell) => cell.parent !== null && roots.has(cell.parent) && !cell.vertex && !cell.edge).map((cell) => cell.id))
  const edges = new Set(cells.filter((cell) => cell.edge).map((cell) => cell.id))
  const holders = new Set(cells.filter((cell) => cell.vertex).map((cell) => cell.parent))
  // draw.io leaves out a geometry's x and y when they are 0.
  const number = (geometry: Element | undefined, key: string) => Number(geometry?.getAttribute(key)) || 0
  const page: DrawioPage = { name, items: [], arrows: [], skipped: [] }
  for (const cell of cells) {
    if (!cell.vertex || edges.has(cell.parent!)) continue
    if (cell.style.tokens.has('text')) {
      page.skipped.push({ label: textOf(cell.value), reason: 'text' })
      continue
    }
    const icon = azureIcon(cell.style)
    const shape = shapeOf(cell.style, icon)
    page.items.push({
      id: cell.id,
      label: textOf(cell.value),
      container: shape === 'swimlane' || shape === 'group' || holders.has(cell.id),
      ...(cell.parent && !layers.has(cell.parent) ? { parentId: cell.parent } : {}),
      x: number(cell.geometry, 'x'),
      y: number(cell.geometry, 'y'),
      width: number(cell.geometry, 'width'),
      height: number(cell.geometry, 'height'),
      shape,
      ...(icon ? { icon } : {}),
    })
  }
  // An arrow's text may also sit in labels placed along it.
  const labelsOn = (id: string) => cells.filter((cell) => cell.vertex && cell.parent === id).map((cell) => textOf(cell.value))
  for (const cell of cells.filter((item) => item.edge)) {
    const label = [textOf(cell.value), ...labelsOn(cell.id)].filter(Boolean).join(' ')
    if (!cell.source || !cell.target || cell.source === cell.target) {
      page.skipped.push({ label, reason: 'loose-arrow' })
      continue
    }
    const { values } = cell.style
    const starts = (values.get('startArrow') ?? 'none') !== 'none'
    const ends = (values.get('endArrow') ?? 'classic') !== 'none'
    const [from, to] = starts && !ends ? [cell.target, cell.source] : [cell.source, cell.target]
    page.arrows.push({ id: cell.id, label, from, to, dashed: values.get('dashed') === '1', twoWay: starts && ends })
  }
  return page
}

/** The pages of a draw.io file (.drawio, or a single page saved as .xml), compressed or not. */
export async function readDrawio(text: string): Promise<DrawioPage[]> {
  const top = parseXml(text, 'not-drawio')
  if (top.nodeName === 'mxGraphModel') return [readModel('Page-1', top)]
  if (top.nodeName !== 'mxfile') throw new DrawioError('not-drawio')
  return Promise.all(
    [...top.getElementsByTagName('diagram')].map(async (diagram, index) => {
      const name = diagram.getAttribute('name') || `Page-${index + 1}`
      const inline = [...diagram.children].find((child) => child.nodeName === 'mxGraphModel')
      if (inline) return readModel(name, inline)
      const packed = diagram.textContent!.trim()
      return packed ? readModel(name, await unpack(packed)) : { name, items: [], arrows: [], skipped: [] }
    }),
  )
}
