import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Box, Diagram, DiagramContent, DiagramRef, DiagramSlot, DiagramSlotData, DiagramView, Line, Upload, Zone } from '../schemas'
import { compareRefs, type ComparedVersion } from './compare'
import { DiagramChanges } from './DiagramChanges'

const API_1 = '00000000-0000-4000-8000-0000000000a1'
const API_2 = '00000000-0000-4000-8000-0000000000a2'
const zone = (id: string, overrides: Partial<Zone> = {}): Zone => ({ id, label: id, x: 0, y: 0, width: 300, height: 200, ...overrides })
const box = (id: string, overrides: Partial<Box> = {}): Box => ({ id, label: id, type: 'part', x: 0, y: 0, ...overrides })
const line = (id: string, from: string, to: string, overrides: Partial<Line> = {}): Line => ({ id, from, to, ...overrides })
const diagram = (id: string, overrides: Partial<Diagram> = {}): Diagram => ({ id, title: id, sizing: 'auto', zones: [], boxes: [], lines: [], ...overrides })
const slot = (name: DiagramSlot, content: DiagramContent, readableViews: DiagramView[]): DiagramSlotData => ({ slot: name, owner: 'solution-integration', readableViews, editableViews: [], rowVersion: 1, content, hidden: [] })
const version = (label: string, slots: DiagramSlotData[], uploads: Upload[] = []): ComparedVersion => ({ label, slots, apis: [{ id: API_1, name: 'Payments API' }, { id: API_2, name: 'Cards API' }], uploads })

function show(refs: DiagramRef[], before: ComparedVersion, after: ComparedVersion) {
  render(<DiagramChanges changes={compareRefs(refs, before, after)} before={before} after={after} />)
}
/** The rows of a change list, each cell's text. */
const rows = (caption: string) =>
  within(screen.getByRole('table', { name: caption }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))

describe('diagram changes between two versions', () => {
  it('shows the two pictures side by side, a legend, and what changed in words', () => {
    const before = diagram('solution', {
      zones: [zone('own', { label: 'CRM', kind: 'This application' }), zone('legacy', { kind: 'Web tier' })],
      boxes: [box('portal', { label: 'Portal', parentId: 'own' }), box('pas', { label: 'Policy Admin', type: 'business', application: { id: '00000000-0000-4000-8000-000000000001', number: 'APM-1' } })],
      lines: [line('l1', 'portal', 'pas', { calls: 'Policy API v1', does: 'Creates' }), line('l2', 'pas', 'portal', { calls: 'Quotes' })],
    })
    const after = {
      ...before,
      zones: [before.zones[0]],
      boxes: [box('portal', { label: 'Customer portal' }), box('pas', { label: 'Policy Admin', type: 'business' })],
      lines: [line('l1', 'portal', 'pas', { calls: 'Policy API v2', does: 'Creates', twoWay: true })],
    }
    show([{ slot: 'solution', view: 'solution' }], version('Version 1', [slot('solution', { diagrams: [before] }, ['solution'])]), version('Draft of version 2', [slot('solution', { diagrams: [after] }, ['solution'])]))
    expect(screen.getByRole('heading', { level: 3, name: 'Solution diagram' })).toBeInTheDocument()
    expect(screen.getByText('Legend')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Solution diagram in Version 1' })).getByRole('application', { name: 'solution: diagram canvas' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Solution diagram in Draft of version 2' })).getByText('Customer portal')).toBeInTheDocument()
    expect(rows('Changes (5)')).toEqual([
      ['Removed', 'Grouping box: legacy', 'Name: legacyKind: Web tierInside: —', '—'],
      ['Changed', 'Block: Customer portal', 'Name: PortalInside: CRM', 'Name: Customer portalInside: —'],
      ['Changed', 'Block: Policy Admin', 'Kind: Business application · TRM APM-1', 'Kind: Business application · typed, not in TRM'],
      ['Changed', 'Connection: Customer portal → Policy Admin', 'What it calls: Policy API v1Direction: One-way', 'What it calls: Policy API v2Direction: Two-way'],
      ['Removed', 'Connection: Policy Admin → Portal', 'From → To: Policy Admin → PortalWhat it calls: QuotesWhat it does: —Direction: One-way', '—'],
    ])
  })

  it('words the facts of integration connections, data flows and CI and CD steps', () => {
    const facts: Partial<Line> = { layer: 'integration', protocol: 'HTTPS', port: 443, tls: '1.2', pattern: 'api', api: { id: API_1 }, authentication: 'mTLS', classification: 'internal', purpose: 'Pay', flow: 'service' }
    const infra = (lines: Line[], label = 'MY01', more: Box[] = []): DiagramContent => ({
      diagrams: [
        diagram('production', { tab: 'production', zones: [zone('sub', { label, kind: 'subscription' })], boxes: [box('vm', { type: 'server', parentId: 'sub' }), box('bank', { type: 'external' }), ...more], lines }),
        diagram('non-production', { tab: 'non-production' }),
      ],
    })
    const changedFacts = { protocol: 'SFTP', port: 22, tls: 'none' as const, protection: 'SSH', pattern: 'file' as const, api: { id: API_2 }, authentication: 'SSH key', classification: 'confidential' as const, purpose: 'Files', flow: 'it-admin' as const }
    show(
      [
        { slot: 'infrastructure', view: 'integration' },
        { slot: 'infrastructure', view: 'infrastructure' },
      ],
      version('Version 1', [slot('infrastructure', infra([line('pay', 'vm', 'bank', facts), line('wan', 'vm', 'bank', { label: 'WAN' })]), ['infrastructure', 'integration'])]),
      version('Version 2', [
        slot(
          'infrastructure',
          infra([line('pay', 'vm', 'bank', { ...facts, ...changedFacts }), line('wan', 'vm', 'bank', { label: 'ExpressRoute', dashed: true }), line('new', 'vm', 'fw', { layer: 'integration' })], 'MY01-prod', [box('fw', { type: 'firewall', parentId: 'sub' })]),
          ['infrastructure', 'integration'],
        ),
      ]),
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Infrastructure diagram: Integration view — Production' })).toBeInTheDocument()
    const [integration, infrastructure] = screen.getAllByRole('table').map((table) => within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent)))
    const firewall = ['Added', 'Box: fw', '—', 'Name: fwKind: FirewallInside: MY01-prod']
    expect(integration).toEqual([
      ['Changed', 'Zone: MY01-prod', 'Name: MY01', 'Name: MY01-prod'],
      firewall,
      [
        'Changed',
        'Connection: vm → bank',
        'Protocol: HTTPSPort: 443TLS: 1.2Pattern: APIAuthentication: mTLSAPI: Payments APIClassification: InternalPurpose: PayFlow type: Service-to-service',
        'Protocol: SFTPPort: 22TLS: Not TLS: SSHPattern: FileAuthentication: SSH keyAPI: Cards APIClassification: ConfidentialPurpose: FilesFlow type: IT-admin-to-service',
      ],
      ['Added', 'Connection: vm → fw', '—', 'From → To: vm → fwProtocol: —Port: —TLS: —Direction: One-wayPattern: —Authentication: —API: —Classification: —Purpose: —Flow type: —'],
    ])
    expect(infrastructure).toEqual([
      ['Changed', 'Zone: MY01-prod', 'Name: MY01', 'Name: MY01-prod'],
      firewall,
      ['Changed', 'Line: vm → bank', 'Label: WANStyle: Solid · One-way', 'Label: ExpressRouteStyle: Dashed · One-way'],
    ])
  })

  it('words data flow facts, and CI and CD lanes, steps and who approves', () => {
    const solution = (data: Partial<Line>): DiagramContent => ({ diagrams: [diagram('solution', { boxes: [box('a'), box('b')], lines: [line('l1', 'a', 'b', data)] })] })
    const flow = (approver: string, title: string, lane: string, label?: string): DiagramContent => ({
      diagrams: [diagram('ci-cd-1', { title, zones: [zone('lane', { label: lane, kind: 'lane' })], boxes: [box('ok', { label: 'Release', type: 'approval', approver, parentId: 'lane' }), box('go', { label: 'Go', type: 'start' })], lines: [line('l1', 'go', 'ok', { label })] })],
    })
    show(
      [
        { slot: 'solution', view: 'data-flow' },
        { slot: 'ci-cd', view: 'process' },
      ],
      version('Version 1', [slot('solution', solution({ data: 'Policy' }), ['data-flow']), slot('ci-cd', flow('CAB', 'Build', 'Azure DevOps', 'Yes'), ['process'])]),
      version('Version 2', [slot('solution', solution({ data: 'Policy\nCustomer', classification: 'confidential', frequency: 'Daily' }), ['data-flow']), slot('ci-cd', flow('Change board', 'Build and test', 'DevOps'), ['process'])]),
    )
    expect(rows('Changes (1)')).toEqual([
      ['Changed', 'Connection: a → b', 'Data objects and key attributes: PolicyClassification: —Frequency / volume: —', 'Data objects and key attributes: Policy; CustomerClassification: ConfidentialFrequency / volume: Daily'],
    ])
    expect(screen.getByRole('heading', { level: 3, name: 'CI and CD flows — Build and test' })).toBeInTheDocument()
    expect(rows('Changes (4)')).toEqual([
      ['Changed', 'Diagram: Build and test', 'Title: Build', 'Title: Build and test'],
      ['Changed', 'Lane: DevOps', 'Name: Azure DevOps', 'Name: DevOps'],
      ['Changed', 'Step: Release', 'Kind: Approval · CAB', 'Kind: Approval · Change board'],
      ['Changed', 'Connection: Go → Release', 'Label: Yes', 'Label: —'],
    ])
  })

  it('shows a diagram in one version only, Not applicable answers and files, each as one row', () => {
    const file = (name: string): Upload => ({ id: '00000000-0000-4000-8000-0000000000f1', slot: 'monitoring', diagramId: 'monitoring-1', name, type: 'pdf', size: 2048, scan: 'clean', uploadedBy: null, uploadedAt: '2026-10-20T01:00:00Z' })
    const alerts = diagram('monitoring-1', { title: 'Alerts', boxes: [box('dt', { label: 'Dynatrace', type: 'monitoring' })] })
    const release = diagram('monitoring-2', { title: 'Release' })
    show(
      [
        { slot: 'monitoring', view: 'monitoring' },
        { slot: 'ci-cd', view: 'process' },
        { slot: 'solution', view: 'solution' },
      ],
      version(
        'Version 1',
        [slot('monitoring', { diagrams: [alerts, release] }, ['monitoring']), slot('ci-cd', { notApplicable: true, reason: 'Manual' }, ['process']), slot('solution', { notApplicable: true, reason: 'Batch job' }, ['solution'])],
        [file('Runbook.pdf')],
      ),
      version('Version 2', [slot('monitoring', { diagrams: [alerts] }, ['monitoring']), slot('ci-cd', { diagrams: [diagram('ci-cd-1', { title: 'Build' })] }, ['process']), slot('solution', { notApplicable: true, reason: 'Batch job only' }, ['solution'])], [file('Alerts.pdf')]),
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Monitoring diagram — Alerts' })).toBeInTheDocument()
    expect(rows('Changes (2)')).toEqual([
      ['Added', 'File: Alerts.pdf', '—', 'Alerts.pdf (PDF, 2 KB)'],
      ['Removed', 'File: Runbook.pdf', 'Runbook.pdf (PDF, 2 KB)', '—'],
    ])
    const removed = screen.getByRole('heading', { level: 3, name: 'Monitoring diagram — Release' }).closest('section')!
    expect(within(removed).getByText('Not in Version 2')).toBeInTheDocument()
    expect(within(removed).getAllByRole('row')[1]).toHaveTextContent('RemovedDiagram: ReleaseRelease—')
    const added = screen.getByRole('heading', { level: 3, name: 'CI and CD flows — Build' }).closest('section')!
    expect(within(added).getByText('Does not apply: Manual')).toBeInTheDocument()
    expect(within(added).getAllByRole('row')[1]).toHaveTextContent('AddedDiagram: Build—Build')
    const reason = screen.getByRole('heading', { level: 3, name: 'Solution diagram' }).closest('section')!
    expect(within(reason).getByText('Does not apply: Batch job only')).toBeInTheDocument()
    expect(within(reason).getAllByRole('row')[1]).toHaveTextContent('ChangedDoes not applyReason: Batch jobReason: Batch job only')
  })

  it('leaves out slots that one of the versions does not show the reader', () => {
    expect(compareRefs([{ slot: 'solution', view: 'solution' }], version('Version 1', []), version('Version 2', [slot('solution', { notApplicable: true, reason: 'x' }, ['solution'])]))).toEqual([])
  })
})
