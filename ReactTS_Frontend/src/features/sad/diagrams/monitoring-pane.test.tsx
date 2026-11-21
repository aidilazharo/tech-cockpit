import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi } from '../../../test/harness'
import type { Diagram, DiagramContent } from '../schemas'
import { DiagramSlotEditor } from './DiagramSlotEditor'

// The real canvas needs a browser layout; this stand-in lists the blocks, each selectable.
vi.mock('./DiagramCanvas', () => ({
  DiagramCanvas: ({ diagram, onSelect }: { diagram: Diagram; onSelect: (id: string | null) => void }) => (
    <ul aria-label="canvas blocks">
      {diagram.boxes.map((box) => (
        <li key={box.id}>
          <button type="button" onClick={() => onSelect(box.id)}>
            {box.label}
          </button>
        </li>
      ))}
    </ul>
  ),
}))

const VERSION = '7b000000-0000-4000-8000-000000000001'
const SERVICENOW = { id: '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', number: 'APM-0300', name: 'ServiceNow' }

beforeEach(() => {
  mockApi().on(`GET /api/v1/sad/versions/${VERSION}/business-applications`, json(200, { items: [SERVICENOW] }))
})

let latest: DiagramContent | undefined
beforeEach(() => {
  latest = undefined
})
function Harness({ initial, editable = true }: { initial: DiagramContent; editable?: boolean }) {
  const [content, setContent] = useState(initial)
  const change = (next: DiagramContent) => {
    latest = next
    setContent(next)
  }
  return <DiagramSlotEditor slot="monitoring" content={content} onChange={editable ? change : undefined} drawnIn={editable ? undefined : 'Logging & Monitoring'} versionId={VERSION} />
}
const show = (props: Parameters<typeof Harness>[0]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness {...props} />
    </QueryClientProvider>,
  )

const empty = (): DiagramContent => ({ diagrams: [{ id: 'monitoring-1', title: 'Monitoring', sizing: 'auto', zones: [], boxes: [], lines: [] }] })
/** Dynatrace, ServiceNow from TRM, the support team; Dynatrace raises incidents in ServiceNow. */
const drawn = (): DiagramContent => ({
  diagrams: [
    {
      id: 'monitoring-1',
      title: 'Monitoring',
      sizing: 'auto',
      zones: [{ id: 'zone-1', label: 'Azure', x: 0, y: 300, width: 300, height: 160 }],
      boxes: [
        { id: 'box-1', label: 'Dynatrace', type: 'monitoring', x: 0, y: 0 },
        { id: 'box-2', label: 'ServiceNow', type: 'system', application: { id: SERVICENOW.id, number: SERVICENOW.number }, x: 296, y: 0 },
        { id: 'box-3', label: 'Support team', type: 'team', x: 592, y: 0 },
      ],
      lines: [{ id: 'line-1', from: 'box-1', to: 'box-2', label: 'Incident' }],
    },
  ],
})
const first = () => (latest as { diagrams: Diagram[] }).diagrams[0]
const details = () => screen.getByRole('complementary', { name: 'Details' })
const form = (name: string) => screen.getByRole('group', { name })
const onCanvas = (name: string) => within(screen.getByRole('list', { name: 'canvas blocks' })).getByRole('button', { name })
const rows = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))
const choose = async (label: string, option: string, scope: HTMLElement = document.body) => {
  await userEvent.click(within(scope).getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}
const addBlock = async (fill: (block: HTMLElement) => Promise<void>) => {
  await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
  await fill(form('Add block'))
  await userEvent.click(within(form('Add block')).getByRole('button', { name: 'Add' }))
}

describe('the monitoring diagram, drawn in section 12', () => {
  it('adds monitoring services from the built-in list, Dynatrace first, or typed; an Azure one takes its icon', async () => {
    show({ initial: empty() })
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    const block = form('Add block')
    const service = within(block).getByLabelText('Service')
    const offered = [...document.getElementById(service.getAttribute('list')!)!.querySelectorAll('option')].map((option) => option.value)
    expect(offered).toEqual(['Dynatrace', 'Azure Monitor', 'Application Insights', 'Log Analytics', 'Microsoft Sentinel', 'Workbooks'])
    await userEvent.click(within(block).getByRole('button', { name: 'Add' }))
    expect(within(block).getByText('Pick a service from the list, or type its name')).toBeInTheDocument()
    await userEvent.type(service, 'Application Insights')
    await userEvent.click(within(block).getByRole('button', { name: 'Add' }))
    await addBlock(async (b) => userEvent.type(within(b).getByLabelText('Service'), 'Dynatrace'))
    expect(first().boxes).toEqual([
      { id: 'box-1', label: 'Application Insights', type: 'monitoring', icon: 'application-insights', x: 0, y: 0 },
      { id: 'box-2', label: 'Dynatrace', type: 'monitoring', x: 0, y: 144 },
    ])
  })

  it('adds other systems found in TRM or typed, and teams, each in its column', async () => {
    show({ initial: empty() })
    await addBlock(async (b) => {
      await choose('Kind', 'Other system', b)
      await userEvent.click(within(b).getByRole('button', { name: 'Add' }))
      expect(within(b).getByText('Choose a system from TRM')).toBeInTheDocument()
      await userEvent.type(within(b).getByRole('combobox', { name: 'Other system in TRM' }), 'Se')
      await userEvent.click(await screen.findByRole('option', { name: /ServiceNow/ }))
    })
    await addBlock(async (b) => {
      await choose('Kind', 'Other system', b)
      await userEvent.click(within(b).getByRole('radio', { name: 'Not in TRM: type the name' }))
      await userEvent.type(within(b).getByLabelText('Name'), 'PagerDuty')
    })
    await addBlock(async (b) => {
      await choose('Kind', 'Team / person', b)
      await userEvent.click(within(b).getByRole('button', { name: 'Add' }))
      expect(within(b).getByText('Enter a name')).toBeInTheDocument()
      await userEvent.type(within(b).getByLabelText('Name'), 'Support team')
    })
    expect(first().boxes.map((box) => [box.label, box.type, box.application ?? null, box.x, box.y])).toEqual([
      ['ServiceNow', 'system', { id: SERVICENOW.id, number: 'APM-0300' }, 296, 0],
      ['PagerDuty', 'system', null, 296, 144],
      ['Support team', 'team', null, 592, 0],
    ])
    expect(rows('Blocks')).toEqual([
      ['ServiceNow', 'Other system · TRM APM-0300', '—'],
      ['PagerDuty', 'Other system · typed, not in TRM', '—'],
      ['Support team', 'Team / person', '—'],
    ])
  })

  it('adds grouping boxes with blocks inside, and connections with an optional label', async () => {
    show({ initial: drawn() })
    await userEvent.click(screen.getByRole('button', { name: 'Add grouping box' }))
    await userEvent.type(within(form('Add grouping box')).getByLabelText('Name'), 'Security')
    await userEvent.click(within(form('Add grouping box')).getByRole('button', { name: 'Add' }))
    await addBlock(async (b) => {
      await userEvent.type(within(b).getByLabelText('Service'), 'Microsoft Sentinel')
      await choose('Inside', 'Security', b)
    })
    expect(first().boxes[3]).toMatchObject({ label: 'Microsoft Sentinel', icon: 'azure-sentinel', parentId: 'zone-2' })
    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    const connection = form('Add connection')
    await choose('From', 'Microsoft Sentinel', connection)
    await choose('To', 'Support team', connection)
    await userEvent.type(within(connection).getByLabelText('Label'), 'Security incident')
    await userEvent.click(within(connection).getByRole('button', { name: 'Add' }))
    expect(rows('Connections')).toEqual([
      ['Dynatrace → ServiceNow', 'Incident', 'Solid · One-way'],
      ['Microsoft Sentinel → Support team', 'Security incident', 'Solid · One-way'],
    ])
    expect(rows('Grouping boxes')).toEqual([
      ['Azure', '—', '—'],
      ['Security', '—', '—'],
    ])
  })

  it('edits a selected block: its kind, its TRM link, its name and its group', async () => {
    show({ initial: drawn() })
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    await userEvent.click(within(form('Add block')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Add block' })).not.toBeInTheDocument()
    // The blocks table is the keyboard way to select one.
    await userEvent.click(within(screen.getByRole('table', { name: 'Blocks' })).getByRole('button', { name: 'ServiceNow' }))
    const panel = details()
    expect(panel).toHaveTextContent('From TRM: ServiceNow (APM-0300)')
    await userEvent.click(within(panel).getByRole('button', { name: 'Not in TRM: type the name instead' }))
    expect(first().boxes[1]).not.toHaveProperty('application')
    await userEvent.type(within(panel).getByRole('combobox', { name: 'Link to TRM' }), 'Se')
    await userEvent.click(await screen.findByRole('option', { name: /ServiceNow/ }))
    expect(first().boxes[1].application).toEqual({ id: SERVICENOW.id, number: 'APM-0300' })
    await choose('Kind', 'Team / person', panel)
    expect(first().boxes[1]).not.toHaveProperty('application')
    await userEvent.clear(within(panel).getByLabelText('Name'))
    expect(within(panel).getByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(within(panel).getByLabelText('Name'), 'Service desk')
    await choose('Inside', 'Azure', panel)
    expect(first().boxes[1]).toMatchObject({ label: 'Service desk', type: 'team', parentId: 'zone-1' })

    // A monitoring service is named from the list or typed.
    await userEvent.click(onCanvas('Dynatrace'))
    await userEvent.type(within(details()).getByLabelText('Service'), ' SaaS')
    expect(first().boxes[0].label).toBe('Dynatrace SaaS')
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    expect(first().boxes.map((box) => box.label)).toEqual(['Service desk', 'Support team'])
    expect(first().lines).toEqual([])
  })

  it('edits and removes a selected grouping box or connection', async () => {
    show({ initial: drawn() })
    await userEvent.click(within(screen.getByRole('table', { name: 'Connections' })).getByRole('button', { name: 'Dynatrace → ServiceNow' }))
    await userEvent.type(within(details()).getByLabelText('Label'), ' ticket')
    expect(first().lines[0].label).toBe('Incident ticket')
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    expect(first().lines).toEqual([])
    await userEvent.click(within(screen.getByRole('table', { name: 'Grouping boxes' })).getByRole('button', { name: 'Azure' }))
    await userEvent.type(within(details()).getByLabelText('Kind'), 'Cloud')
    expect(first().zones[0].kind).toBe('Cloud')
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    expect(first().zones).toEqual([])
  })
})

describe('the monitoring diagram: grouping boxes, connections and icons in detail', () => {
  it('nests grouping boxes, checks both ends of a connection, and sets its style and an Azure icon', async () => {
    show({ initial: drawn() })
    await userEvent.click(screen.getByRole('button', { name: 'Add grouping box' }))
    const group = form('Add grouping box')
    await userEvent.click(within(group).getByRole('button', { name: 'Add' }))
    expect(within(group).getByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(within(group).getByLabelText('Name'), 'Alerting')
    await userEvent.type(within(group).getByLabelText('Kind'), 'Azure Monitor')
    await choose('Inside', 'Azure', group)
    await userEvent.click(within(group).getByRole('button', { name: 'Add' }))
    expect(first().zones[1]).toMatchObject({ label: 'Alerting', kind: 'Azure Monitor', parentId: 'zone-1' })
    await choose('Inside', 'Not inside a grouping box', details())
    expect(first().zones[1]).not.toHaveProperty('parentId')
    await choose('Inside', 'Azure', details())
    expect(first().zones[1].parentId).toBe('zone-1')

    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    const connection = form('Add connection')
    await userEvent.click(within(connection).getByRole('button', { name: 'Add' }))
    expect(within(connection).getAllByText('Choose').length).toBeGreaterThanOrEqual(2)
    await choose('From', 'Support team', connection)
    await choose('To', 'Support team', connection)
    expect(within(connection).getByText('Choose two different ends')).toBeInTheDocument()
    await choose('To', 'Dynatrace', connection)
    await userEvent.click(within(connection).getByRole('checkbox', { name: 'Dashed line (e.g. replication or failover)' }))
    await userEvent.click(within(connection).getByRole('checkbox', { name: 'Arrows at both ends' }))
    await userEvent.click(within(connection).getByRole('button', { name: 'Add' }))
    expect(first().lines[1]).toEqual({ id: 'line-2', from: 'box-3', to: 'box-1', dashed: true, twoWay: true })
    const panel = details()
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Dashed line (e.g. replication or failover)' }))
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Arrows at both ends' }))
    await choose('From', 'ServiceNow', panel)
    await choose('To', 'Alerting', panel)
    expect(first().lines[1]).toEqual({ id: 'line-2', from: 'box-2', to: 'zone-2' })
    await userEvent.click(within(panel).getByRole('checkbox', { name: 'Dashed line (e.g. replication or failover)' }))
    expect(first().lines[1].dashed).toBe(true)

    await userEvent.click(onCanvas('Support team'))
    await choose('Inside', 'Azure', details())
    await choose('Inside', 'Not inside a grouping box', details())
    expect(first().boxes[2]).not.toHaveProperty('parentId')
    await userEvent.type(within(details()).getByRole('combobox', { name: 'Azure icon' }), 'log analytics')
    await userEvent.click(await screen.findByRole('option', { name: /Log Analytics Workspaces/ }))
    expect(first().boxes[2].icon).toBe('log-analytics-workspaces')
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove the icon' }))
    expect(first().boxes[2]).not.toHaveProperty('icon')
  })
})

describe('the monitoring diagram, read in other sections', () => {
  it('shows the blocks, grouping boxes and connections without ways to change them', async () => {
    const content = drawn() as { diagrams: Diagram[] }
    content.diagrams[0].lines.push({ id: 'line-2', from: 'box-2', to: 'box-3' })
    show({ initial: content, editable: false })
    expect(rows('Connections')[1]).toEqual(['ServiceNow → Support team', '—', 'Solid · One-way'])
    expect(screen.getByText('Drawn in “Logging & Monitoring”. Shown here read-only.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add block' })).not.toBeInTheDocument()
    await userEvent.click(onCanvas('ServiceNow'))
    expect(details()).toHaveTextContent('KindOther system · TRM APM-0300')
    expect(details()).toHaveTextContent('InsideNot inside a grouping box')
    await userEvent.click(within(screen.getByRole('table', { name: 'Grouping boxes' })).getByRole('button', { name: 'Azure' }))
    expect(details()).toHaveTextContent('Kind—')
    await userEvent.click(within(screen.getByRole('table', { name: 'Connections' })).getByRole('button', { name: 'Dynatrace → ServiceNow' }))
    expect(details()).toHaveTextContent('LabelIncident')
    await userEvent.click(within(screen.getByRole('table', { name: 'Connections' })).getByRole('button', { name: 'ServiceNow → Support team' }))
    expect(details()).toHaveTextContent('Label—')
  })
})
