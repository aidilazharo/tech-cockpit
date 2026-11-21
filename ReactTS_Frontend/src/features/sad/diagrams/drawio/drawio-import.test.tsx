import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi } from '../../../../test/harness'
import type { Diagram, DiagramContent, DiagramSlot } from '../../schemas'
import { DiagramSlotEditor } from '../DiagramSlotEditor'
import { emptyContent } from '../model'
import { drawioFile, drawioModel, FLOWS_DRAWIO, INFRA_DRAWIO, MONITORING_DRAWIO, SOLUTION_DRAWIO, vertex } from './fixtures'

// The real canvas needs a browser layout; this stand-in names the diagram it shows.
vi.mock('../DiagramCanvas', () => ({ DiagramCanvas: ({ diagram }: { diagram: Diagram }) => <p>{`Canvas: ${diagram.title}`}</p> }))

const VERSION = '7b000000-0000-4000-8000-000000000001'
const BILLING = { id: 'ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1', number: 'APM-0011', name: 'Billing' }
const SERVICENOW = { id: '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', number: 'APM-0300', name: 'ServiceNow' }
const LEGACY = { id: '5a27be1d-59d9-47d2-8070-6f33504dd0fb', number: null, name: 'Legacy CRM' }

beforeEach(() => {
  // TRM finds applications by name or APM number.
  mockApi().on(`GET /api/v1/sad/versions/${VERSION}/business-applications`, (call) => {
    const q = new URL(call.path, 'http://localhost').searchParams.get('q')!.toLowerCase()
    return json(200, { items: [BILLING, SERVICENOW, LEGACY].filter((app) => app.name.toLowerCase().includes(q) || app.number?.toLowerCase().includes(q)) })
  })
})

let latest: { diagrams: Diagram[] } | undefined
beforeEach(() => {
  latest = undefined
})
function Harness({ slot, initial }: { slot: DiagramSlot; initial: DiagramContent }) {
  const [content, setContent] = useState(initial)
  const change = (next: DiagramContent) => {
    latest = next as { diagrams: Diagram[] }
    setContent(next)
  }
  return <DiagramSlotEditor slot={slot} content={content} onChange={change} versionId={VERSION} application="CRM" />
}
const show = (slot: DiagramSlot, initial: DiagramContent = emptyContent(slot, 'CRM')) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness slot={slot} initial={initial} />
    </QueryClientProvider>,
  )

const panel = () => screen.getByRole('group', { name: 'Import from draw.io' })
const open = async (text: string, name = 'crm.drawio') => {
  await userEvent.click(screen.getByRole('button', { name: 'Import draw.io' }))
  await userEvent.upload(within(panel()).getByLabelText('draw.io file'), new File([text], name))
}
const review = (page: string) => screen.findByRole('table', { name: `What is on “${page}”` })
const row = (table: HTMLElement, name: string) => within(table).getByRole('row', { name: new RegExp(`^${name}`) })
const choose = async (scope: HTMLElement, label: string, option: string) => {
  await userEvent.click(within(scope).getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('importing a draw.io file into the solution diagram', () => {
  it('reviews what was found, guessing what the shapes say and asking for the rest, then imports it', async () => {
    show('solution')
    await open(SOLUTION_DRAWIO)
    const table = await review('Solution')
    expect(within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').slice(0, 2).map((cell) => cell.textContent))).toEqual([
      ['CRM', 'Swimlane'],
      ['Portal', 'Azure icon: App Services'],
      ['Customer', 'Person'],
      ['Bank', 'Rectangle'],
      ['Billing', 'Rectangle'],
    ])
    expect(within(row(table, 'Portal')).getByRole('combobox', { name: 'Becomes: Portal' })).toHaveTextContent('Part of this application')
    expect(within(panel()).getByRole('status')).toHaveTextContent('Not imported: free text “Draft only”.')

    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(within(panel()).getByRole('alert')).toHaveTextContent('Choose what each row becomes (or Skip)')
    expect(within(row(table, 'Bank')).getByText('Choose what it becomes')).toBeInTheDocument()
    await choose(row(table, 'Bank'), 'Becomes: Bank', 'External party')
    await choose(row(table, 'Billing'), 'Becomes: Billing', 'Business application')
    // An exact match in TRM is offered as linked.
    expect(await within(row(table, 'Billing')).findByRole('checkbox', { name: 'Link to TRM: Billing (APM-0011)' })).toBeChecked()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))

    expect(screen.queryByRole('group', { name: 'Import from draw.io' })).not.toBeInTheDocument()
    expect(screen.getByText('Imported from “crm.drawio”.')).toBeInTheDocument()
    const solution = latest!.diagrams[0]
    // Numbered after the application's box the diagram started with (zone-1), which the import replaces.
    expect(solution.boxes.map((box) => [box.label, box.type, box.parentId ?? null, box.application ?? null])).toEqual([
      ['Portal', 'part', 'zone-2', null],
      ['Customer', 'actor', null, null],
      ['Bank', 'external', null, null],
      ['Billing', 'business', null, { id: BILLING.id, number: 'APM-0011' }],
    ])
    expect(solution.lines.map((line) => [line.from, line.to, line.calls])).toEqual([
      ['box-2', 'box-1', 'Agent portal'],
      ['box-1', 'box-3', 'Payment API'],
      ['box-1', 'box-4', 'Billing API'],
    ])
  })

  it('asks before replacing what is already drawn, and keeps it when the author says no', async () => {
    const drawn = emptyContent('solution', 'CRM') as { diagrams: Diagram[] }
    drawn.diagrams[0].boxes.push({ id: 'box-1', label: 'Core', type: 'part', parentId: 'zone-1', x: 20, y: 40 })
    show('solution', drawn)
    await open(SOLUTION_DRAWIO)
    const table = await review('Solution')
    await choose(row(table, 'Bank'), 'Becomes: Bank', 'Skip')
    await choose(row(table, 'Billing'), 'Becomes: Billing', 'External party')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Replace what is on “Solution diagram”?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(latest).toBeUndefined()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Replace' }))
    expect(latest!.diagrams[0].boxes.map((box) => box.label)).toEqual(['Portal', 'Customer', 'Billing'])
  })

  it('takes one page the author picks, and imports a TRM match the author unticked as typed', async () => {
    show('solution')
    const second = drawioModel([vertex('billing', 'Billing', 'rounded=0;', [0, 0, 176, 64])].join(''))
    await open(drawioFile(['Overview', drawioModel('')], ['Detail', second]))
    expect(await review('Overview')).toBeInTheDocument()
    await choose(panel(), 'Page', 'Detail')
    const table = await review('Detail')
    await choose(row(table, 'Billing'), 'Becomes: Billing', 'Business application')
    await userEvent.click(await within(row(table, 'Billing')).findByRole('checkbox', { name: 'Link to TRM: Billing (APM-0011)' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(latest!.diagrams[0].boxes).toEqual([{ id: 'box-1', label: 'Billing', type: 'business', x: 0, y: 0 }])
  })

  it('offers TRM applications whose APM number is the text, or that have no APM number, ticked again after unticking', async () => {
    show('solution')
    await open(drawioFile(['Apps', drawioModel([vertex('a', 'APM-0011', 'rounded=0;', [0, 0, 176, 64]), vertex('b', 'Legacy CRM', 'rounded=0;', [300, 0, 176, 64])].join(''))]))
    const table = await review('Apps')
    await choose(row(table, 'APM-0011'), 'Becomes: APM-0011', 'Business application')
    await choose(row(table, 'Legacy CRM'), 'Becomes: Legacy CRM', 'Business application')
    expect(await within(row(table, 'APM-0011')).findByRole('checkbox', { name: 'Link to TRM: Billing (APM-0011)' })).toBeChecked()
    const legacy = await within(row(table, 'Legacy CRM')).findByRole('checkbox', { name: 'Link to TRM: Legacy CRM (—)' })
    await userEvent.click(legacy)
    await userEvent.click(legacy)
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(latest!.diagrams[0].boxes.map((box) => [box.label, box.application ?? null])).toEqual([
      ['Billing', { id: BILLING.id, number: 'APM-0011' }],
      ['Legacy CRM', { id: LEGACY.id, number: null }],
    ])
  })

  it.each<[string, File, string]>([
    ['a file of another type', new File(['x'], 'crm.vsdx'), 'Choose a draw.io file (.drawio or .xml).'],
    ['a file over 5 MB', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'crm.drawio'), 'The file is larger than 5 MB.'],
    ['a file that is not draw.io', new File(['<svg/>'], 'crm.xml'), 'Choose a draw.io file (.drawio or .xml).'],
    ['a page that cannot be read', new File([drawioFile(['Broken', 'bm90IGRlZmxhdGU='])], 'crm.drawio'), 'This draw.io file could not be read.'],
  ])('refuses %s', async (_, file, message) => {
    show('solution')
    await userEvent.click(screen.getByRole('button', { name: 'Import draw.io' }))
    await userEvent.upload(within(panel()).getByLabelText('draw.io file'), file, { applyAccept: false })
    expect(await within(panel()).findByText(message)).toBeInTheDocument()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Import from draw.io' })).not.toBeInTheDocument()
  })
})

describe('importing draw.io pages as CI and CD flows', () => {
  it('imports the pages ticked, each a flow named after its page, after a lane is picked for each step outside the swimlanes', async () => {
    show('ci-cd')
    await open(FLOWS_DRAWIO, 'flows.drawio')
    const ci = await review('CI flow')
    expect(within(row(ci, 'Within policy')).getByRole('combobox', { name: 'Becomes: Within policy?' })).toHaveTextContent('Decision')
    expect(within(row(ci, 'Code change')).getByRole('combobox', { name: 'Becomes: Code change' })).toHaveTextContent('Start')
    // A step drawn outside the swimlanes needs its lane.
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(within(row(ci, 'Deploy to UAT')).getByText('Choose its lane')).toBeInTheDocument()
    await userEvent.type(within(panel()).getByLabelText('New lane'), 'Release')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Add lane' }))
    await choose(row(ci, 'Deploy to UAT'), 'Lane: Deploy to UAT', 'Release (new)')
    const cd = await review('CD flow')
    await choose(row(cd, 'Change approved'), 'Becomes: Change approved?', 'Approval')
    expect(within(panel()).getByRole('radio', { name: 'Replace “CI and CD flow”' })).toBeChecked()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))

    expect(latest!.diagrams.map((d) => [d.id, d.title, d.zones.map((zone) => zone.label), d.boxes.map((box) => `${box.label}: ${box.type}`)])).toEqual([
      ['ci-cd-1', 'CI flow', ['Developer', 'Azure DevOps', 'Release'], ['Code change: start', 'Build and scan: step', 'Within policy?: decision', 'Deploy to UAT: step']],
      ['diagram-1', 'CD flow', ['ServiceNow change'], ['Change approved?: approval']],
    ])
    // The approval still needs who approves: the CD flow's notes say so.
    await userEvent.click(screen.getByRole('tab', { name: 'CD flow' }))
    expect(screen.getByText('Before submit, say who approves: Change approved?')).toBeInTheDocument()
  })

  it('adds the pages as new flows when asked, imports only the pages ticked, and needs at least one', async () => {
    show('ci-cd')
    await open(FLOWS_DRAWIO, 'flows.drawio')
    await userEvent.click(within(panel()).getByRole('checkbox', { name: 'CI flow' }))
    await userEvent.click(within(panel()).getByRole('checkbox', { name: 'CD flow' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(within(panel()).getByRole('alert')).toHaveTextContent('Tick at least one page.')
    await userEvent.click(within(panel()).getByRole('checkbox', { name: 'CD flow' }))
    await userEvent.click(within(panel()).getByRole('radio', { name: 'Add as new diagrams' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(latest!.diagrams.map((d) => d.title)).toEqual(['CI and CD flow', 'CD flow'])
  })

  it('replaces only the flow on screen, keeping the others, and keeps the pages in file order when one is ticked again', async () => {
    const two = { diagrams: [{ ...emptyContent('ci-cd').diagrams[0], title: 'Old CI' }, { ...emptyContent('ci-cd').diagrams[0], id: 'diagram-1', title: 'Release' }] }
    show('ci-cd', two)
    await open(FLOWS_DRAWIO, 'flows.drawio')
    await userEvent.click(within(panel()).getByRole('checkbox', { name: 'CI flow' }))
    await userEvent.click(within(panel()).getByRole('checkbox', { name: 'CI flow' }))
    const tables = within(panel()).getAllByRole('table')
    expect(tables[0]).toHaveAccessibleName('What is on “CI flow”')
    expect(tables[1]).toHaveAccessibleName('What is on “CD flow”')
    await userEvent.click(within(panel()).getByRole('checkbox', { name: 'CI flow' }))
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(latest!.diagrams.map((d) => [d.id, d.title])).toEqual([
      ['ci-cd-1', 'CD flow'],
      ['diagram-1', 'Release'],
    ])
  })

  it('keeps a slot to ten diagrams', async () => {
    const nine = { diagrams: Array.from({ length: 9 }, (_, i) => ({ ...emptyContent('ci-cd').diagrams[0], id: `diagram-${i + 1}`, title: `Flow ${i + 1}` })) }
    show('ci-cd', nine)
    await open(FLOWS_DRAWIO, 'flows.drawio')
    await userEvent.click(within(panel()).getByRole('radio', { name: 'Add as new diagrams' }))
    await choose(row(await review('CD flow'), 'Change approved'), 'Becomes: Change approved?', 'Step')
    await choose(row(await review('CI flow'), 'Deploy to UAT'), 'Becomes: Deploy to UAT', 'Skip')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(within(panel()).getByRole('alert')).toHaveTextContent('A slot holds up to 10 diagrams: tick fewer pages.')
  })
})

describe('importing a draw.io page into the monitoring diagram', () => {
  it('guesses monitoring services and teams, and offers other systems found in TRM', async () => {
    show('monitoring')
    await open(MONITORING_DRAWIO)
    const table = await review('Monitoring')
    expect(within(row(table, 'Dynatrace')).getByRole('combobox', { name: 'Becomes: Dynatrace' })).toHaveTextContent('Monitoring service')
    expect(within(row(table, 'Support team')).getByRole('combobox', { name: 'Becomes: Support team' })).toHaveTextContent('Team / person')
    await choose(row(table, 'ServiceNow'), 'Becomes: ServiceNow', 'Other system')
    expect(await within(row(table, 'ServiceNow')).findByRole('checkbox', { name: 'Link to TRM: ServiceNow (APM-0300)' })).toBeChecked()
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(latest!.diagrams[0].boxes.map((box) => [box.label, box.type, box.icon ?? null, box.application?.number ?? null])).toEqual([
      ['Dynatrace', 'monitoring', null, null],
      ['App telemetry', 'monitoring', 'application-insights', null],
      ['ServiceNow', 'system', null, 'APM-0300'],
      ['Support team', 'team', null, null],
    ])
    expect(latest!.diagrams[0].lines.map((line) => line.label)).toEqual(['Incident', 'Assigned'])
  })
})

describe('importing a draw.io page into the infrastructure diagram', () => {
  it('maps containers to zone kinds or into the fixed zones, checks where everything sits, and replaces the tab on screen', async () => {
    const content = emptyContent('infrastructure') as { diagrams: Diagram[] }
    content.diagrams[0].boxes.push({ id: 'box-1', label: 'Old VM', type: 'server', parentId: 'primary-dc', x: 20, y: 40 })
    show('infrastructure', content)
    await open(INFRA_DRAWIO, 'network.drawio')
    const table = await review('Production')
    expect(within(row(table, 'Portal')).getByRole('combobox', { name: 'Becomes: Portal' })).toHaveTextContent('Azure service')
    expect(within(row(table, 'Customer')).getByRole('combobox', { name: 'Becomes: Customer' })).toHaveTextContent('Person')
    await choose(row(table, 'MY01 subscription'), 'Becomes: MY01 subscription', 'Into “MY01”')
    await choose(row(table, 'Southeast Asia'), 'Becomes: Southeast Asia', 'Into “Southeast Asia”')
    await choose(row(table, 'vnet-crm'), 'Becomes: vnet-crm', 'VNet')
    await choose(row(table, 'snet-app'), 'Becomes: snet-app', 'Subnet')
    await choose(row(table, 'CRM VM'), 'Becomes: CRM VM', 'Server / VM')
    await choose(row(table, 'PDC'), 'Becomes: PDC', 'Into “PDC”')
    await choose(row(table, 'Internet'), 'Becomes: Internet', 'Internet')
    // A person cannot sit in PDC.
    await choose(row(table, 'DB server'), 'Becomes: DB server', 'Person')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(within(row(table, 'DB server')).getByText('A person sits in the office network or the Internet zone.')).toBeInTheDocument()
    await choose(row(table, 'DB server'), 'Becomes: DB server', 'Server / VM')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Replace what is on “Production”?' })
    expect(dialog).toHaveTextContent('Integration connections (section 2) to what is replaced go too.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Replace' }))

    const [production, nonProduction] = latest!.diagrams
    expect(production.boxes.map((box) => [box.label, box.type, box.parentId])).toEqual([
      ['CRM VM', 'server', 'zone-2'],
      ['Portal', 'azure', 'zone-2'],
      ['DB server', 'server', 'primary-dc'],
      ['Customer', 'person', 'zone-3'],
    ])
    expect(production.zones.filter((zone) => !zone.hosting).map((zone) => [zone.label, zone.kind, zone.parentId ?? null])).toEqual([
      ['vnet-crm', 'vnet', 'primary-region'],
      ['snet-app', 'subnet', 'zone-1'],
      ['Internet', 'internet', null],
    ])
    expect(production.lines.map((line) => line.label)).toEqual(['HTTPS', 'SQL'])
    expect(nonProduction.boxes).toEqual([])
  })

  it('allows one Internet zone, and imports into the tab on screen', async () => {
    show('infrastructure')
    await userEvent.click(screen.getByRole('tab', { name: 'Non-production' }))
    const twoInternets = drawioFile(['Test', drawioModel([vertex('a', 'Internet', 'swimlane;', [0, 0, 300, 200]), vertex('b', 'Public', 'swimlane;', [400, 0, 300, 200])].join(''))])
    await open(twoInternets, 'test.drawio')
    const table = await review('Test')
    await choose(row(table, 'Internet'), 'Becomes: Internet', 'Internet')
    await choose(row(table, 'Public'), 'Becomes: Public', 'Internet')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(within(row(table, 'Public')).getByText('There can be only one Internet zone.')).toBeInTheDocument()
    await choose(row(table, 'Public'), 'Becomes: Public', '3rd party')
    await userEvent.click(within(panel()).getByRole('button', { name: 'Import' }))
    expect(latest!.diagrams[1].zones.filter((zone) => !zone.hosting).map((zone) => zone.kind)).toEqual(['internet', 'third-party'])
    expect(latest!.diagrams[0].zones.filter((zone) => !zone.hosting)).toEqual([])
  })
})

