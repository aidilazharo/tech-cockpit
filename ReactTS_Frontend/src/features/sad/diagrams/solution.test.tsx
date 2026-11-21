import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem } from '../../../test/harness'
import type { Diagram, DiagramContent, DiagramView, Line } from '../schemas'
import { DiagramSlotEditor } from './DiagramSlotEditor'
import type { LineLabel } from './flow'
import { emptyContent } from './model'

// The real canvas needs a browser layout; this stand-in shows what each line says in the view.
vi.mock('./DiagramCanvas', () => ({
  DiagramCanvas: ({ diagram, lineLabel, onSelect }: { diagram: Diagram; lineLabel: LineLabel; onSelect: (id: string | null) => void }) => (
    <ul aria-label="canvas lines">
      {diagram.lines.map((line) => {
        const { label, missing } = lineLabel(line)
        return (
          <li key={line.id}>
            <button type="button" onClick={() => onSelect(line.id)}>
              {label}
              {missing ? ' (missing)' : ''}
            </button>
          </li>
        )
      })}
    </ul>
  ),
}))

const VERSION = '7b000000-0000-4000-8000-000000000001'
const BILLING = { id: 'ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1', number: 'APM-Billing', name: 'Billing' }

let api: ReturnType<typeof mockApi>
beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/sad/versions/7b000000-0000-4000-8000-000000000001/business-applications', json(200, { items: [BILLING] }))
  api.on('GET /api/v1/sad/versions/7b000000-0000-4000-8000-000000000001/uploads', json(200, { items: [] }))
})

let latest: DiagramContent | undefined
beforeEach(() => {
  latest = undefined
})
function Harness({ initial, view = 'solution', editable = true, readableViews }: { initial: DiagramContent; view?: DiagramView; editable?: boolean; readableViews?: DiagramView[] }) {
  const [content, setContent] = useState(initial)
  const change = (next: DiagramContent) => {
    latest = next
    setContent(next)
  }
  return (
    <DiagramSlotEditor
      slot="solution"
      view={view}
      content={content}
      onChange={editable ? change : undefined}
      drawnIn={view === 'solution' ? undefined : 'Solution & Integration Architecture'}
      readableViews={readableViews}
      versionId={VERSION}
      application="CRM"
    />
  )
}
const show = (props: Parameters<typeof Harness>[0]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness {...props} />
    </QueryClientProvider>,
  )

const blocks = (lines: Line[] = []): DiagramContent => {
  const [diagram] = emptyContent('solution', 'CRM').diagrams
  return {
    diagrams: [
      {
        ...diagram,
        boxes: [
          { id: 'box-1', label: 'Customer', type: 'actor', x: 0, y: 100 },
          { id: 'box-2', label: 'Core services', type: 'part', parentId: 'zone-1', x: 20, y: 40 },
          { id: 'box-3', label: 'Billing', type: 'business', application: { id: BILLING.id, number: BILLING.number }, x: 400, y: 0 },
          { id: 'box-4', label: 'Bank', type: 'external', x: 400, y: 200 },
        ],
        lines,
      },
    ],
  }
}
const described: Line = { id: 'line-1', from: 'box-1', to: 'box-2', calls: 'Agent portal (web)', does: 'Manage leads', twoWay: true }
const withData: Line = { id: 'line-2', from: 'box-2', to: 'box-3', calls: 'Billing API', does: 'Bills premiums', data: 'Invoice: policy no., amount\nCustomer: name', classification: 'confidential', frequency: 'Daily batch' }
const first = () => (latest as { diagrams: Diagram[] } | undefined)?.diagrams[0] as Diagram
const table = (name: string) => screen.getByRole('table', { name })
const details = () => screen.getByRole('complementary', { name: 'Details' })
const choose = async (label: string, option: string, scope: HTMLElement = document.body) => {
  await userEvent.click(within(scope).getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}
const type = async (label: string, text: string, scope: HTMLElement = document.body) => {
  const field = within(scope).getByLabelText(label)
  await userEvent.clear(field)
  if (text) await userEvent.type(field, text)
}

describe('solution diagram, drawn in section 2', () => {
  it('adds blocks: parts inside the application box, business applications from TRM or typed, actors and external parties', async () => {
    show({ initial: emptyContent('solution', 'CRM') })
    expect(screen.getByRole('button', { name: 'Add connection' })).toBeDisabled()
    expect(within(table('Grouping boxes')).getByRole('row', { name: /CRM This application/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    let form = screen.getByRole('group', { name: 'Add block' })
    expect(within(form).getByRole('combobox', { name: 'Inside' })).toHaveTextContent('CRM')
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(within(form).getByText('Enter a name')).toBeInTheDocument()
    await type('Name', 'Core services', form)
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(first().boxes[0]).toMatchObject({ label: 'Core services', type: 'part', parentId: 'zone-1' })

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    form = screen.getByRole('group', { name: 'Add block' })
    await choose('Type', 'Business application', form)
    expect(within(form).getByRole('combobox', { name: 'Inside' })).toHaveTextContent('Not inside a grouping box')
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(within(form).getByText('Choose an application from TRM')).toBeInTheDocument()
    await userEvent.type(within(form).getByRole('combobox', { name: 'Business application in TRM' }), 'bill')
    await userEvent.click(await screen.findByRole('option', { name: /Billing/ }))
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(first().boxes[1]).toMatchObject({ label: 'Billing', type: 'business', application: { id: BILLING.id, number: 'APM-Billing' } })
    expect(first().boxes[1]).not.toHaveProperty('parentId')
    expect(api.callsTo(`GET /api/v1/sad/versions/${VERSION}/business-applications`).map((call) => call.path)).toContainEqual(expect.stringContaining('q=bill'))

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    form = screen.getByRole('group', { name: 'Add block' })
    await choose('Type', 'Business application', form)
    await userEvent.click(within(form).getByRole('radio', { name: 'Not in TRM: type the name' }))
    await type('Name', 'Old CRM', form)
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(first().boxes[2]).toEqual(expect.objectContaining({ label: 'Old CRM', type: 'business' }))
    expect(first().boxes[2]).not.toHaveProperty('application')

    for (const [kind, name] of [
      ['Actor', 'Customer'],
      ['External party', 'Bank'],
    ]) {
      await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
      form = screen.getByRole('group', { name: 'Add block' })
      await choose('Type', kind, form)
      await type('Name', name, form)
      await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    }
    expect(first().boxes.map((box) => [box.label, box.type])).toEqual([
      ['Core services', 'part'],
      ['Billing', 'business'],
      ['Old CRM', 'business'],
      ['Customer', 'actor'],
      ['Bank', 'external'],
    ])
    const rows = within(table('Blocks')).getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      'Core servicesPart of this applicationCRM',
      'BillingBusiness application · TRM APM-Billing—',
      'Old CRMBusiness application · typed, not in TRM—',
      'CustomerActor—',
      'BankExternal party—',
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Add block' })).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Add block' })).not.toBeInTheDocument()
  })

  it('says when the TRM search fails, rather than that nothing matches', async () => {
    api.on(`GET /api/v1/sad/versions/${VERSION}/business-applications`, problem(403, 'Forbidden'))
    show({ initial: emptyContent('solution', 'CRM') })
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    const form = screen.getByRole('group', { name: 'Add block' })
    await choose('Type', 'Business application', form)
    await userEvent.type(within(form).getByRole('combobox', { name: 'Business application in TRM' }), 'bill')
    expect(await screen.findByText('The TRM search failed. Type the name instead, or try again later.')).toBeInTheDocument()
  })

  it('adds grouping boxes like zones, named for the solution diagram', async () => {
    show({ initial: emptyContent('solution', 'CRM') })
    await userEvent.click(screen.getByRole('button', { name: 'Add grouping box' }))
    const form = screen.getByRole('group', { name: 'Add grouping box' })
    await type('Name', 'Partner systems', form)
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(first().zones.map((zone) => zone.label)).toEqual(['CRM', 'Partner systems'])
  })

  it('connects blocks saying what each connection calls and does, and lists those still to describe', async () => {
    show({ initial: blocks() })
    expect(within(table('Connections')).getByText('No connections yet.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    const form = screen.getByRole('group', { name: 'Add connection' })
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(first()).toBeUndefined()
    await choose('From', 'Customer', form)
    await choose('To', 'Core services', form)
    await type('What it calls', 'Agent portal (web)', form)
    // Arrow keys move between the choices, as in any radio group.
    await userEvent.click(within(form).getByRole('radio', { name: 'One-way' }))
    await userEvent.keyboard('{ArrowRight}')
    expect(within(form).getByRole('radio', { name: 'Two-way' })).toBeChecked()
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(first().lines).toEqual([{ id: 'line-1', from: 'box-1', to: 'box-2', calls: 'Agent portal (web)', twoWay: true }])

    const note = screen.getByRole('alert', { name: 'Before submit, every connection needs what it calls and what it does' })
    expect(within(note).getByText('Customer → Core services: what it does')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agent portal (web) (missing)' })).toBeInTheDocument()
    await type('What it does', 'Manage leads', details())
    expect(screen.queryByRole('alert', { name: /Before submit/ })).not.toBeInTheDocument()
    expect(within(table('Connections')).getByRole('row', { name: 'Customer → Core services Agent portal (web) Manage leads Two-way' })).toBeInTheDocument()

    await type('What it calls', '', details())
    expect(screen.getByRole('button', { name: 'Not described yet (missing)' })).toBeInTheDocument()
    await userEvent.click(within(details()).getByRole('radio', { name: 'One-way' }))
    await choose('To', 'Bank', details())
    expect(first().lines[0]).toEqual({ id: 'line-1', from: 'box-1', to: 'box-4', does: 'Manage leads' })
  })

  it('puts a part back into the application box when chosen again, needs two different ends for a connection, and moves blocks out of boxes', async () => {
    show({ initial: blocks() })
    await userEvent.click(screen.getByRole('button', { name: 'Add block' }))
    const blockForm = screen.getByRole('group', { name: 'Add block' })
    await choose('Type', 'Actor', blockForm)
    expect(within(blockForm).getByRole('combobox', { name: 'Inside' })).toHaveTextContent('Not inside a grouping box')
    await choose('Type', 'Part of this application', blockForm)
    expect(within(blockForm).getByRole('combobox', { name: 'Inside' })).toHaveTextContent('CRM')
    await userEvent.click(within(blockForm).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    const form = screen.getByRole('group', { name: 'Add connection' })
    await choose('From', 'Customer', form)
    await choose('To', 'Customer', form)
    await type('What it does', 'Loops', form)
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(within(form).getByText('Choose two different ends')).toBeInTheDocument()
    expect(first()).toBeUndefined()
    await userEvent.click(within(form).getByRole('button', { name: 'Cancel' }))

    await userEvent.click(within(table('Blocks')).getByRole('button', { name: 'Core services' }))
    await choose('Inside', 'Not inside a grouping box', details())
    expect(first().boxes[1]).not.toHaveProperty('parentId')
  })

  it('edits a block in the details panel: its type, its TRM link, its name and where it sits', async () => {
    show({ initial: blocks() })
    await userEvent.click(within(table('Blocks')).getByRole('button', { name: 'Billing' }))
    expect(within(details()).getByText('From TRM: Billing (APM-Billing)')).toBeInTheDocument()
    expect(within(details()).queryByLabelText('Name')).not.toBeInTheDocument()
    await userEvent.click(within(details()).getByRole('button', { name: 'Not in TRM: type the name instead' }))
    expect(first().boxes[2]).not.toHaveProperty('application')
    await type('Name', 'Billing (old)', details())
    expect(first().boxes[2].label).toBe('Billing (old)')
    await userEvent.type(within(details()).getByRole('combobox', { name: 'Link to TRM' }), 'bill')
    await userEvent.click(await screen.findByRole('option', { name: /Billing/ }))
    expect(first().boxes[2]).toMatchObject({ label: 'Billing', application: { id: BILLING.id, number: 'APM-Billing' } })
    await choose('Type', 'External party', details())
    expect(first().boxes[2]).not.toHaveProperty('application')
    await choose('Inside', 'CRM', details())
    expect(first().boxes[2].parentId).toBe('zone-1')

    await userEvent.click(within(table('Grouping boxes')).getByRole('button', { name: 'CRM' }))
    await type('Name', 'CRM platform', details())
    expect(first().zones[0].label).toBe('CRM platform')
  })

  it('asks before removing a connection, or a block with connections, that has data flow facts', async () => {
    show({ initial: blocks([described, withData]) })
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'Core services → Billing' }))
    expect(within(details()).getByText('Invoice: policy no., amount; Customer: name')).toBeInTheDocument()
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    let dialog = screen.getByRole('alertdialog', { name: 'Remove data flow facts too?' })
    expect(dialog).toHaveTextContent('This connection has data flow facts (section 9). Remove it and its facts?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(first()).toBeUndefined()
    expect(within(table('Connections')).getAllByRole('row')).toHaveLength(3)

    await userEvent.click(within(table('Blocks')).getByRole('button', { name: 'Billing' }))
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    dialog = screen.getByRole('alertdialog', { name: 'Remove data flow facts too?' })
    expect(dialog).toHaveTextContent('Billing has connections with data flow facts (section 9). Remove it, its connections and their facts?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(first().boxes.map((box) => box.label)).toEqual(['Customer', 'Core services', 'Bank'])
    expect(first().lines.map((line) => line.id)).toEqual(['line-1'])

    // Without data flow facts, it goes straight away.
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'Customer → Core services' }))
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(first().lines).toEqual([])
  })
})

describe('solution diagram, read-only', () => {
  it('shows what was left blank: connections not yet described, grouping boxes without a kind, TRM applications without a number', async () => {
    const content = blocks([{ id: 'line-1', from: 'box-1', to: 'box-2', twoWay: true }]) as { diagrams: Diagram[] }
    const [diagram] = content.diagrams
    const partners: Diagram['zones'][number] = { id: 'zone-2', label: 'Partners', x: 400, y: 300, width: 200, height: 40 }
    const noNumber = { ...diagram.boxes[2], application: { id: BILLING.id, number: null } }
    show({ initial: { diagrams: [{ ...diagram, zones: [...diagram.zones, partners], boxes: [diagram.boxes[0], diagram.boxes[1], noNumber, diagram.boxes[3]] }] }, editable: false })
    expect(screen.queryByRole('button', { name: 'Add block' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(within(table('Blocks')).getByRole('row', { name: /Billing Business application · TRM/ })).toBeInTheDocument()
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'Customer → Core services' }))
    expect(within(details()).getByText('What it calls').nextSibling).toHaveTextContent('—')
    expect(within(details()).getByText('What it does').nextSibling).toHaveTextContent('—')
    expect(within(details()).getByText('Direction').nextSibling).toHaveTextContent('Two-way')
    await userEvent.click(within(table('Grouping boxes')).getByRole('button', { name: 'Partners' }))
    expect(within(details()).getByText('Kind').nextSibling).toHaveTextContent('—')
    await userEvent.click(within(table('Blocks')).getByRole('button', { name: 'Core services' }))
    expect(within(details()).getByText('Inside').nextSibling).toHaveTextContent('CRM')
  })
})

describe('logical communication matrix', () => {
  it('lists every connection, with the data columns only for readers of section 9', () => {
    const { unmount } = show({ initial: blocks([described, withData]), editable: false })
    const matrix = table('Logical communication matrix')
    expect(within(matrix).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Source',
      'Destination',
      'What it calls',
      'What it does',
      'Direction',
      'Data objects and key attributes',
      'Classification',
      'Frequency / volume',
    ])
    expect(within(matrix).getByRole('row', { name: 'Core services Billing Billing API Bills premiums One-way Invoice: policy no., amount; Customer: name Confidential Daily batch' })).toBeInTheDocument()
    expect(within(matrix).getByRole('row', { name: 'Customer Core services Agent portal (web) Manage leads Two-way — — —' })).toBeInTheDocument()
    unmount()

    show({ initial: blocks([described]), editable: false, readableViews: ['solution'] })
    expect(within(table('Logical communication matrix')).getAllByRole('columnheader')).toHaveLength(5)
  })
})

describe('data flow view, in section 9', () => {
  it('records only the data flow facts, asking for classification and frequency once a connection has data objects', async () => {
    show({ initial: blocks([described, { ...withData, data: undefined, classification: undefined, frequency: undefined }]), view: 'data-flow' })
    expect(screen.getByRole('region', { name: 'Solution diagram: Data flow view' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Solution diagram: Data flow view' })).toBeInTheDocument()
    expect(screen.getByText('Drawn in “Solution & Integration Architecture”. Record the data flow facts of its connections here.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add / })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Does not apply' })).not.toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'Logical communication matrix' })).not.toBeInTheDocument()
    const none = screen.getByRole('status', { name: 'Connections without data objects' })
    expect(none).toHaveTextContent('Data objects are optional. These connections have none: Customer → Core services; Core services → Billing.')
    expect(screen.getAllByRole('button', { name: 'No data objects' })).toHaveLength(2)

    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'Core services → Billing' }))
    expect(within(details()).getByText('Billing API')).toBeInTheDocument()
    expect(within(details()).queryByLabelText('What it calls')).not.toBeInTheDocument()
    await type('Data objects and key attributes', 'Invoice: amount', details())
    expect(within(details()).getByText('Choose the classification')).toBeInTheDocument()
    const note = screen.getByRole('alert', { name: 'Before submit, connections with data objects need their classification and frequency / volume' })
    expect(within(note).getByText('Core services → Billing: classification, frequency / volume')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invoice: amount (missing)' })).toBeInTheDocument()
    await choose('Classification', 'Confidential', details())
    await type('Frequency / volume', 'Daily batch', details())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invoice: amount · Confidential · Daily batch' })).toBeInTheDocument()
    expect(first().lines[1]).toEqual({ ...withData, data: 'Invoice: amount' })
    expect(first().boxes).toEqual((blocks() as { diagrams: Diagram[] }).diagrams[0].boxes)
    await choose('Classification', 'Not set', details())
    expect(first().lines[1]).not.toHaveProperty('classification')

    expect(within(table('Connections')).getByRole('row', { name: 'Core services → Billing Billing API Invoice: amount — Daily batch' })).toBeInTheDocument()
    await userEvent.click(within(table('Blocks')).getByRole('button', { name: 'Billing' }))
    expect(within(details()).getByText('Business application · TRM APM-Billing')).toBeInTheDocument()
  })

  it('leaves out what connections call and do for readers of section 9 only', async () => {
    show({ initial: blocks([withData]), view: 'data-flow', editable: false, readableViews: ['data-flow'] })
    expect(within(table('Connections')).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['From → To', 'Data objects and key attributes', 'Classification', 'Frequency / volume'])
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'Core services → Billing' }))
    expect(within(details()).queryByText('What it calls')).not.toBeInTheDocument()
    expect(within(details()).getByText('Daily batch')).toBeInTheDocument()
  })

  it('shows a solution diagram that does not apply', () => {
    show({ initial: { notApplicable: true, reason: 'Batch job, no other systems' }, view: 'data-flow' })
    expect(screen.getByText('Does not apply: Batch job, no other systems')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
