import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render as renderAlone, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Diagram, DiagramContent, DiagramSlot, DiagramView } from '../schemas'
import { DiagramSlotEditor, type HiddenFromEditor } from './DiagramSlotEditor'
import type { CanvasEdit } from './flow'
import { emptyContent } from './model'

const render = (ui: ReactElement) => {
  const client = new QueryClient()
  return renderAlone(ui, { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> })
}

// The real canvas needs a browser layout; this stand-in selects as a click would.
vi.mock('./DiagramCanvas', () => ({
  DiagramCanvas: ({ diagram, onEdits }: { diagram: Diagram; onEdits: (edits: CanvasEdit[]) => void }) => (
    <div>
      {diagram.lines[0] && (
        <button type="button" onClick={() => onEdits([{ kind: 'select', id: diagram.lines[0].id }])}>
          select first line
        </button>
      )}
      <button type="button" onClick={() => onEdits([{ kind: 'select', id: diagram.boxes[diagram.boxes.length - 1].id }])}>
        select last box
      </button>
    </div>
  ),
}))

const TITLES: Record<DiagramView, string> = {
  solution: 'Solution & Integration Architecture',
  'data-flow': 'Data Architecture & Data Flow',
  infrastructure: 'Physical and Network Architecture',
  integration: 'Solution & Integration Architecture',
  process: 'Deployment Architecture',
  monitoring: 'Logging & Monitoring',
}

let latest: DiagramContent
function Harness({ slot, view, initial, hidden }: { slot: DiagramSlot; view?: DiagramView; initial: DiagramContent; hidden: HiddenFromEditor }) {
  const [content, setContent] = useState(initial)
  const change = (next: DiagramContent) => {
    latest = next
    setContent(next)
  }
  return <DiagramSlotEditor slot={slot} view={view} content={content} onChange={change} hidden={hidden} />
}
const hiddenWith = (diagramId: string, carriers: { id: string; view: DiagramView }[], editableViews: DiagramView[]): HiddenFromEditor => ({
  parts: [{ diagramId, takenIds: [], carriers }],
  editableViews,
  sectionOf: (view) => TITLES[view],
})

const solution = (): DiagramContent => ({
  diagrams: [
    {
      id: 'solution',
      title: 'Solution diagram',
      sizing: 'auto',
      zones: [],
      boxes: [
        { id: 'box-1', label: 'Portal', type: 'part', x: 0, y: 0 },
        { id: 'box-2', label: 'Bank', type: 'external', x: 400, y: 0 },
      ],
      lines: [{ id: 'line-1', from: 'box-1', to: 'box-2', calls: 'Pay', does: 'Pays' }],
    },
  ],
})
const infrastructure = (): DiagramContent => {
  const content = emptyContent('infrastructure', 'CRM') as { hosting: never; diagrams: Diagram[] }
  const [production, nonProduction] = content.diagrams
  return { ...content, diagrams: [{ ...production, boxes: [{ id: 'box-1', label: 'vm-01', type: 'server', parentId: 'primary-dc', x: 20, y: 40 }, { id: 'box-2', label: 'Bank', type: 'external', x: 900, y: 0 }] }, nonProduction] }
}

describe('removing what carries lines or facts the editor cannot see', () => {
  it("asks a section 2 editor first when a connection carries section 9's data flow facts, naming the section, never the facts", async () => {
    render(<Harness slot="solution" initial={solution()} hidden={hiddenWith('solution', [{ id: 'line-1', view: 'data-flow' }], ['solution'])} />)
    await userEvent.click(screen.getByRole('button', { name: 'select first line' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove what you cannot see too?' })
    expect(dialog).toHaveTextContent('“Portal → Bank” carries lines or facts from “Data Architecture & Data Flow” that you cannot see. Remove it and them?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect((latest as { diagrams: Diagram[] }).diagrams[0].lines).toEqual([])
  })

  it("asks a section 3 editor first when a box carries section 2's integration connections", async () => {
    render(<Harness slot="infrastructure" initial={infrastructure()} hidden={hiddenWith('production', [{ id: 'box-2', view: 'integration' }], ['infrastructure'])} />)
    await userEvent.click(screen.getByRole('button', { name: 'select last box' }))
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('“Bank” carries lines or facts from “Solution & Integration Architecture” that you cannot see.')
  })

  it("does not let a section 2 editor remove a box carrying section 3's infrastructure lines, and says who can", async () => {
    render(<Harness slot="infrastructure" view="integration" initial={infrastructure()} hidden={hiddenWith('production', [{ id: 'box-2', view: 'infrastructure' }], ['integration'])} />)
    await userEvent.click(screen.getByRole('button', { name: 'select last box' }))
    expect(screen.getByText('“Bank” has lines drawn in “Physical and Network Architecture”. Only that section’s editors can remove it.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
  })
})
