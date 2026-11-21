import { describe, expect, it } from 'vitest'
import { capabilityOptions, capabilityTree } from './capability-tree'
import { capability } from './fixtures'

describe('capability tree', () => {
  it('nests capabilities, sorts by name and makes orphans roots', () => {
    const roots = capabilityTree([
      capability({ id: 'b', name: 'Billing' }),
      capability({ id: 'x', name: null }),
      capability({ id: 'c', name: 'Card', parentId: 'b' }),
      capability({ id: 'o', name: 'Orphan', parentId: 'gone' }),
      capability({ id: 'a', name: 'Accounts', parentId: 'b' }),
    ])
    expect(roots.map((node) => node.name)).toEqual([null, 'Billing', 'Orphan'])
    expect(roots[1].children.map((node) => node.name)).toEqual(['Accounts', 'Card'])
  })

  it('offers the tree as indented options', () => {
    expect(capabilityOptions([capability({ id: 'b', name: 'Billing' }), capability({ id: 'c', name: 'Card', parentId: 'b' }), capability({ id: 'x', name: null })])).toEqual([
      { value: 'x', label: '' },
      { value: 'b', label: 'Billing' },
      { value: 'c', label: '· Card' },
    ])
  })
})
