import { describe, expect, it } from 'vitest'
import type { Diagram } from '../schemas'
import { addZone, emptyDiagram, updateBox } from './model'
import { addMonitoringBlock, MONITORING_SERVICES, serviceIcon } from './monitoring'

describe('monitoring diagram blocks', () => {
  // Far enough apart that the labels of lines meeting at one block stay 24px apart when a phone fits the diagram.
  it('go in columns: monitoring services, then other systems, then teams, each below the last of its column', () => {
    let d: Diagram = emptyDiagram('monitoring-1', 'Monitoring')
    d = addMonitoringBlock(d, { label: 'Dynatrace', type: 'monitoring' })
    d = addMonitoringBlock(d, { label: 'Support team', type: 'team' })
    d = addMonitoringBlock(d, { label: 'ServiceNow', type: 'system', application: { id: '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', number: 'APM-0300' } })
    d = addMonitoringBlock(d, { label: 'Application Insights', type: 'monitoring' })
    expect(d.boxes.map((box) => [box.label, box.x, box.y])).toEqual([
      ['Dynatrace', 0, 0],
      ['Support team', 592, 0],
      ['ServiceNow', 296, 0],
      ['Application Insights', 0, 144],
    ])
  })

  it('go into the group they are added to', () => {
    const d = addMonitoringBlock(addZone(emptyDiagram('monitoring-1', 'Monitoring'), { label: 'Azure' }), { label: 'Log Analytics', type: 'monitoring', parentId: 'zone-1' })
    expect(d.boxes[0]).toMatchObject({ parentId: 'zone-1', x: 20, y: 40 })
  })

  it('take the Azure icon of a built-in Azure service', () => {
    const d = addMonitoringBlock(emptyDiagram('monitoring-1', 'Monitoring'), { label: 'Application Insights', type: 'monitoring' })
    expect(d.boxes[0].icon).toBe('application-insights')
  })

  it('keep a TRM link only on other systems', () => {
    const linked = addMonitoringBlock(emptyDiagram('monitoring-1', 'Monitoring'), { label: 'ServiceNow', type: 'system', application: { id: '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', number: 'APM-0300' } })
    expect(updateBox(linked, 'box-1', { label: 'ITSM' }).boxes[0].application).toBeDefined()
    expect(updateBox(linked, 'box-1', { type: 'team' }).boxes[0]).not.toHaveProperty('application')
  })
})

describe('the built-in monitoring services', () => {
  it('start with Dynatrace, then the Azure ones with their icons', () => {
    expect(MONITORING_SERVICES.map((service) => [service.name, service.icon ?? null])).toEqual([
      ['Dynatrace', null],
      ['Azure Monitor', 'monitor'],
      ['Application Insights', 'application-insights'],
      ['Log Analytics', 'log-analytics-workspaces'],
      ['Microsoft Sentinel', 'azure-sentinel'],
      ['Workbooks', 'azure-workbooks'],
    ])
  })

  it('give the icon of the service a name matches, whatever its case and spaces', () => {
    expect([serviceIcon(' log analytics '), serviceIcon('Dynatrace'), serviceIcon('Splunk')]).toEqual(['log-analytics-workspaces', undefined, undefined])
  })
})
