import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as renderAlone, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Diagram, DiagramContent } from '../schemas'
import { DiagramSlotEditor } from './DiagramSlotEditor'

// The slot editor reads the version's files through TanStack Query (none here: no version is given).
const render = (ui: ReactElement) => {
  const client = new QueryClient()
  return renderAlone(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

// The real canvas needs a browser layout; this stand-in lists the steps, each selectable.
vi.mock('./DiagramCanvas', () => ({
  DiagramCanvas: ({ diagram, onSelect }: { diagram: Diagram; onSelect: (id: string | null) => void }) => (
    <ul aria-label="canvas steps">
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
  return <DiagramSlotEditor slot="ci-cd" content={content} onChange={editable ? change : undefined} drawnIn={editable ? undefined : 'Deployment Architecture'} />
}

/** A CI flow: Developer and Azure DevOps lanes, a start, a build step and an approval naming who approves, one connection. */
const flow = (): DiagramContent => ({
  diagrams: [
    {
      id: 'ci-cd-1',
      title: 'CI flow',
      sizing: 'auto',
      zones: [
        { id: 'zone-1', label: 'Developer', kind: 'lane', x: 0, y: 0, width: 640, height: 140 },
        { id: 'zone-2', label: 'Azure DevOps', kind: 'lane', x: 0, y: 140, width: 640, height: 140 },
      ],
      boxes: [
        { id: 'box-1', label: 'Code change', type: 'start', parentId: 'zone-1', x: 40, y: 40 },
        { id: 'box-2', label: 'Build', type: 'step', parentId: 'zone-2', x: 40, y: 40 },
        { id: 'box-3', label: 'Change approved?', type: 'approval', approver: 'CAB', parentId: 'zone-2', x: 276, y: 40 },
      ],
      lines: [{ id: 'line-1', from: 'box-1', to: 'box-2', label: 'Pushed' }],
    },
  ],
})
const first = () => (latest as { diagrams: Diagram[] }).diagrams[0]
const details = () => screen.getByRole('complementary', { name: 'Details' })
const rows = (name: string) =>
  within(screen.getByRole('table', { name }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))
const choose = async (label: string, option: string, scope: HTMLElement = document.body) => {
  await userEvent.click(within(scope).getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}
const form = (name: string) => screen.getByRole('group', { name })
const onCanvas = (name: string) => within(screen.getByRole('list', { name: 'canvas steps' })).getByRole('button', { name })

describe('CI and CD flows, drawn in section 10', () => {
  it('adds lanes, then steps of every kind into a lane, an approval saying who approves', async () => {
    render(<Harness initial={{ diagrams: [{ id: 'ci-cd-1', title: 'CI and CD flow', sizing: 'auto', zones: [], boxes: [], lines: [] }] }} />)
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled()
    expect(screen.getByText('No lanes yet. Add one per team or tool, e.g. Azure DevOps or ServiceNow change.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add lane' }))
    await userEvent.click(within(form('Add lane')).getByRole('button', { name: 'Add' }))
    expect(within(form('Add lane')).getByText('Enter a name')).toBeInTheDocument()
    expect(latest).toBeUndefined()
    for (const lane of ['Developer', 'Azure DevOps']) {
      await userEvent.click(screen.getByRole('button', { name: 'Add lane' }))
      await userEvent.type(within(form('Add lane')).getByLabelText('Name'), lane)
      await userEvent.click(within(form('Add lane')).getByRole('button', { name: 'Add' }))
    }
    expect(first().zones.map((zone) => [zone.label, zone.kind, zone.y])).toEqual([
      ['Developer', 'lane', 0],
      ['Azure DevOps', 'lane', 140],
    ])

    await userEvent.click(screen.getByRole('button', { name: 'Add step' }))
    const step = form('Add step')
    expect(within(step).queryByLabelText('Who approves')).not.toBeInTheDocument()
    await userEvent.click(within(step).getByRole('button', { name: 'Add' }))
    expect(within(step).getByText('Enter a name')).toBeInTheDocument()
    expect(within(step).getByText('Choose a lane')).toBeInTheDocument()
    await userEvent.type(within(step).getByLabelText('Name'), 'Change approved?')
    await choose('Kind', 'Approval', step)
    await choose('Lane', 'Azure DevOps', step)
    await userEvent.type(within(step).getByLabelText('Who approves'), 'CAB')
    await userEvent.click(within(step).getByRole('button', { name: 'Add' }))
    expect(first().boxes).toEqual([{ id: 'box-1', label: 'Change approved?', type: 'approval', approver: 'CAB', parentId: 'zone-2', x: 40, y: 40 }])
    expect(rows('Steps')).toEqual([['Change approved?', 'Approval', 'Azure DevOps', 'CAB']])
    // The new step is selected.
    expect(within(details()).getByLabelText('Who approves')).toHaveValue('CAB')
  })

  it('connects two steps with an optional label, offering steps only', async () => {
    render(<Harness initial={flow()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    await userEvent.click(within(form('Add connection')).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group', { name: 'Add connection' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    const connection = form('Add connection')
    await userEvent.click(within(connection).getByRole('combobox', { name: 'From' }))
    expect((await screen.findAllByRole('option')).map((option) => option.textContent)).toEqual(['Code change', 'Build', 'Change approved?'])
    await userEvent.click(screen.getByRole('option', { name: 'Build' }))
    await choose('To', 'Change approved?', connection)
    await userEvent.type(within(connection).getByLabelText('Label'), 'Built')
    await userEvent.click(within(connection).getByRole('button', { name: 'Add' }))
    expect(first().lines[1]).toEqual({ id: 'line-2', from: 'box-2', to: 'box-3', label: 'Built' })
    expect(rows('Connections')).toEqual([
      ['Code change → Build', 'Pushed', 'Solid · One-way'],
      ['Build → Change approved?', 'Built', 'Solid · One-way'],
    ])
  })

  it('edits a selected step: name, kind, lane and who approves', async () => {
    render(<Harness initial={flow()} />)
    // The steps table is the keyboard way to select one.
    await userEvent.click(within(screen.getByRole('table', { name: 'Steps' })).getByRole('button', { name: 'Change approved?' }))
    const panel = details()
    await userEvent.clear(within(panel).getByLabelText('Who approves'))
    expect(first().boxes[2]).not.toHaveProperty('approver')
    expect(screen.getByRole('alert')).toHaveTextContent('Change approved?')
    await userEvent.type(within(panel).getByLabelText('Who approves'), 'Application manager')
    expect(first().boxes[2].approver).toBe('Application manager')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await choose('Kind', 'Decision', panel)
    expect(first().boxes[2]).toMatchObject({ type: 'decision' })
    expect(first().boxes[2]).not.toHaveProperty('approver')
    expect(within(panel).queryByLabelText('Who approves')).not.toBeInTheDocument()
    await choose('Lane', 'Developer', panel)
    expect(first().boxes[2]).toMatchObject({ parentId: 'zone-1', x: 276 })
    await userEvent.clear(within(panel).getByLabelText('Name'))
    expect(within(panel).getByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(within(panel).getByLabelText('Name'), 'Within policy?')
    expect(rows('Steps')[2]).toEqual(['Within policy?', 'Decision', 'Developer', '—'])
  })

  it('lists approvals that do not yet say who approves', async () => {
    const unnamed = flow()
    if (!('notApplicable' in unnamed)) delete unnamed.diagrams[0].boxes[2].approver
    render(<Harness initial={unnamed} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Before submit, say who approves: Change approved?')
  })

  it('moves lanes up and down, and removes a lane with its steps after asking', async () => {
    render(<Harness initial={flow()} />)
    expect(screen.getByRole('button', { name: 'Move Developer up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Azure DevOps down' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Move Azure DevOps up' }))
    expect(first().zones.map((zone) => [zone.label, zone.y])).toEqual([
      ['Azure DevOps', 0],
      ['Developer', 140],
    ])
    expect(rows('Lanes')).toEqual([
      ['1', 'Azure DevOps', '2', ''],
      ['2', 'Developer', '1', ''],
    ])
    await userEvent.click(screen.getByRole('button', { name: 'Move Azure DevOps down' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move Azure DevOps up' }))
    expect(first().zones.map((zone) => zone.label)).toEqual(['Azure DevOps', 'Developer'])

    await userEvent.click(within(screen.getByRole('table', { name: 'Lanes' })).getByRole('button', { name: 'Developer' }))
    await userEvent.clear(within(details()).getByLabelText('Name'))
    expect(within(details()).getByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(within(details()).getByLabelText('Name'), 'Developer team')
    expect(first().zones[1].label).toBe('Developer team')
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Remove the lane Developer team?' })
    expect(dialog).toHaveTextContent('Its 1 step and its connections go too.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(first().zones.map((zone) => zone.label)).toEqual(['Azure DevOps'])
    expect(first().boxes.map((box) => box.label)).toEqual(['Build', 'Change approved?'])
    expect(first().lines).toEqual([])
  })

  it('sizes a lane by hand from the keyboard', async () => {
    render(<Harness initial={{ diagrams: [{ ...(flow() as { diagrams: Diagram[] }).diagrams[0], sizing: 'manual' }] }} />)
    await userEvent.click(within(screen.getByRole('table', { name: 'Lanes' })).getByRole('button', { name: 'Developer' }))
    await userEvent.clear(within(details()).getByRole('spinbutton', { name: 'Height' }))
    await userEvent.type(within(details()).getByRole('spinbutton', { name: 'Height' }), '200')
    expect(first().zones[0]).toMatchObject({ width: 640, height: 200 })
  })

  it('removes a step, or an empty lane, at once', async () => {
    const content = flow()
    render(<Harness initial={content} />)
    await userEvent.click(onCanvas('Code change'))
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    expect(first().boxes.map((box) => box.label)).toEqual(['Build', 'Change approved?'])
    expect(first().lines).toEqual([])
    await userEvent.click(within(screen.getByRole('table', { name: 'Lanes' })).getByRole('button', { name: 'Developer' }))
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    expect(first().zones.map((zone) => [zone.label, zone.y])).toEqual([['Azure DevOps', 0]])
  })
})

describe('CI and CD flows, read in other sections', () => {
  it('shows the lanes, steps and connections without ways to change them', async () => {
    render(<Harness initial={flow()} editable={false} />)
    expect(screen.getByText('Drawn in “Deployment Architecture”. Shown here read-only.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add lane' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
    expect(rows('Lanes')).toEqual([
      ['1', 'Developer', '1'],
      ['2', 'Azure DevOps', '2'],
    ])
    await userEvent.click(onCanvas('Change approved?'))
    expect(details()).toHaveTextContent('KindApproval')
    expect(details()).toHaveTextContent('LaneAzure DevOps')
    expect(details()).toHaveTextContent('Who approvesCAB')
    await userEvent.click(within(screen.getByRole('table', { name: 'Lanes' })).getByRole('button', { name: 'Developer' }))
    expect(details()).toHaveTextContent('Steps1')
    await userEvent.click(within(screen.getByRole('table', { name: 'Connections' })).getByRole('button', { name: 'Code change → Build' }))
    expect(details()).toHaveTextContent('LabelPushed')
  })

  it('shows what was drawn before lanes existed, approvals not yet saying who approves, and unlabelled connections', async () => {
    const older: DiagramContent = {
      diagrams: [
        {
          ...(flow() as { diagrams: Diagram[] }).diagrams[0],
          boxes: [
            { id: 'box-1', label: 'Web app', type: 'web', x: 700, y: 0 },
            { id: 'box-2', label: 'Change approved?', type: 'approval', parentId: 'zone-2', x: 40, y: 40 },
          ],
          lines: [{ id: 'line-1', from: 'box-1', to: 'box-2' }],
        },
      ],
    }
    const { unmount } = render(<Harness initial={older} editable={false} />)
    expect(rows('Steps')).toEqual([
      ['Web app', 'web', '—', '—'],
      ['Change approved?', 'Approval', 'Azure DevOps', '—'],
    ])
    expect(rows('Connections')).toEqual([['Web app → Change approved?', '—', 'Solid · One-way']])
    await userEvent.click(onCanvas('Web app'))
    expect(details()).toHaveTextContent('Lane—')
    await userEvent.click(onCanvas('Change approved?'))
    expect(details()).toHaveTextContent('Who approves—')
    await userEvent.click(within(screen.getByRole('table', { name: 'Connections' })).getByRole('button', { name: 'Web app → Change approved?' }))
    expect(details()).toHaveTextContent('Label—')
    unmount()

    // Its author puts it in a lane.
    render(<Harness initial={older} />)
    await userEvent.click(onCanvas('Web app'))
    await choose('Lane', 'Developer', details())
    expect(first().boxes[0]).toMatchObject({ parentId: 'zone-1', x: 40, y: 40 })
  })
})
