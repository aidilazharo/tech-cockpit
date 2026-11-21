import { describe, expect, it } from 'vitest'
import { buildIconIndex } from '../../../../scripts/azure-icons.mjs'

describe("the Azure icon index (from Microsoft's icon set)", () => {
  it('names each icon from its file, lists every category it appears in, and keeps one file per icon', () => {
    const index = buildIconIndex([
      { category: 'compute', file: '10021-icon-service-Virtual-Machine.svg' },
      { category: 'monitor', file: '00009-icon-service-Log-Analytics-Workspaces.svg' },
      { category: 'management + governance', file: '00009-icon-service-Log-Analytics-Workspaces.svg' },
      { category: 'new icons', file: '030777508 -icon-service-Service-Group-Relationships.svg' },
      { category: 'app services', file: '10035-icon-service-App-Services.svg' },
    ])
    expect(index).toEqual([
      { id: 'app-services', name: 'App Services', categories: ['app services'], file: '10035-icon-service-App-Services.svg' },
      { id: 'log-analytics-workspaces', name: 'Log Analytics Workspaces', categories: ['management + governance', 'monitor'], file: '00009-icon-service-Log-Analytics-Workspaces.svg' },
      { id: 'service-group-relationships', name: 'Service Group Relationships', categories: ['new icons'], file: '030777508 -icon-service-Service-Group-Relationships.svg' },
      { id: 'virtual-machine', name: 'Virtual Machine', categories: ['compute'], file: '10021-icon-service-Virtual-Machine.svg' },
    ])
  })

  it('tells apart different icons with the same name by their number', () => {
    const index = buildIconIndex([
      { category: 'menu', file: '00787-icon-service-Keys.svg' },
      { category: 'security', file: '10245-icon-service-Keys.svg' },
    ])
    expect(index.map((icon) => icon.id)).toEqual(['keys', 'keys-10245'])
  })
})
