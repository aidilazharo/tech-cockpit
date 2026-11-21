import type { CapabilityItem } from './schemas'

export interface CapabilityNode extends CapabilityItem {
  children: CapabilityNode[]
}

/** Nests the flat capability list; capabilities whose parent is not in the list become roots. */
export function capabilityTree(items: CapabilityItem[]): CapabilityNode[] {
  const nodes = new Map(items.map((item) => [item.id, { ...item, children: [] as CapabilityNode[] }]))
  const roots: CapabilityNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  const sort = (list: CapabilityNode[]) => {
    list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    for (const node of list) sort(node.children)
  }
  sort(roots)
  return roots
}

/** Dropdown options in tree order, indented by level. */
export function capabilityOptions(items: CapabilityItem[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const walk = (nodes: CapabilityNode[], depth: number) => {
    for (const node of nodes) {
      options.push({ value: node.id, label: `${'· '.repeat(depth)}${node.name ?? ''}` })
      walk(node.children, depth + 1)
    }
  }
  walk(capabilityTree(items), 0)
  return options
}
