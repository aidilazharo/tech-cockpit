import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Diagram } from '../schemas'
import { DiagramCanvas } from './DiagramCanvas'

const diagram: Diagram = {
  id: 'd',
  title: 'Production',
  sizing: 'manual',
  zones: [
    { id: 'zone-1', label: 'MY01', kind: 'Subscription', x: 0, y: 0, width: 600, height: 300 },
    { id: 'zone-2', label: 'PDC', x: 0, y: 400, width: 300, height: 40 },
  ],
  boxes: [
    { id: 'box-1', label: 'CRM web', type: 'web', parentId: 'zone-1', x: 20, y: 40 },
    { id: 'box-2', label: 'Customer', type: 'person', x: 700, y: 0 },
    { id: 'box-3', label: 'Bank', type: 'external', x: 700, y: 200 },
  ],
  lines: [
    { id: 'line-1', from: 'box-2', to: 'box-1', label: 'HTTPS 443', twoWay: true },
    { id: 'line-2', from: 'box-1', to: 'box-3', dashed: true },
  ],
}

// React Flow draws lines only after measuring nodes, which jsdom cannot do: these stand-ins follow
// React Flow's own testing guide (a ResizeObserver that reports, element sizes from styles, DOMMatrixReadOnly).
const saved = {
  ResizeObserver: globalThis.ResizeObserver,
  DOMMatrixReadOnly: globalThis.DOMMatrixReadOnly,
  offsetHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!,
  offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')!,
}
beforeAll(() => {
  globalThis.ResizeObserver = class {
    private readonly callback: ResizeObserverCallback
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe(target: Element) {
      const box = { width: (target as HTMLElement).offsetWidth || 1000, height: (target as HTMLElement).offsetHeight || 600 }
      setTimeout(() => this.callback([{ target, contentRect: box } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver))
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  globalThis.DOMMatrixReadOnly = class {
    m22 = 1
  } as unknown as typeof DOMMatrixReadOnly
  Object.defineProperties(HTMLElement.prototype, {
    // The canvas itself is 1000 × 600; anything else is as big as its style says (a box when it says nothing).
    offsetHeight: { configurable: true, get(this: HTMLElement) { return this.classList.contains('react-flow__renderer') ? 600 : parseFloat(this.style.height) || 40 } },
    offsetWidth: { configurable: true, get(this: HTMLElement) { return this.classList.contains('react-flow__renderer') ? 1000 : parseFloat(this.style.width) || 176 } },
  })
})
afterAll(() => {
  globalThis.ResizeObserver = saved.ResizeObserver
  globalThis.DOMMatrixReadOnly = saved.DOMMatrixReadOnly
  Object.defineProperties(HTMLElement.prototype, { offsetHeight: saved.offsetHeight, offsetWidth: saved.offsetWidth })
})

describe('DiagramCanvas', () => {
  it('draws zones, boxes and labelled lines, and selects a line from its label', async () => {
    const onSelect = vi.fn()
    render(<DiagramCanvas diagram={diagram} editable selected="zone-1" onSelect={onSelect} onEdits={vi.fn()} />)
    expect(screen.getByRole('application', { name: 'Production: diagram canvas' })).toBeInTheDocument()
    expect(await screen.findByText('MY01')).toBeInTheDocument()
    expect(screen.getByText('Subscription')).toBeInTheDocument()
    expect(screen.getByText('· Nothing drawn yet.')).toBeInTheDocument()
    expect(screen.getByText('CRM web')).toBeInTheDocument()
    expect(screen.getByText('External party')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'HTTPS 443' }))
    expect(onSelect).toHaveBeenCalledWith('line-1')
  })

  it('shows solution blocks by type, with the TRM number of picked applications, and warns on lines still missing facts', async () => {
    const solution: Diagram = {
      id: 's',
      title: 'Solution diagram',
      sizing: 'auto',
      zones: [],
      boxes: [
        { id: 'customer', label: 'Customer', type: 'actor', x: 0, y: 0 },
        { id: 'core', label: 'Core', type: 'part', x: 300, y: 0 },
        { id: 'billing', label: 'Billing', type: 'business', application: { id: 'ae0bf59b-c2f2-4393-a01c-1df10cf6c2b1', number: 'APM-Billing' }, x: 600, y: 0 },
        { id: 'old', label: 'Old CRM', type: 'business', x: 600, y: 200 },
        { id: 'bank', label: 'Bank', type: 'external', x: 900, y: 0 },
        { id: 'cloud', label: 'Core API', type: 'part', icon: 'app-services', x: 300, y: 200 },
      ],
      lines: [
        { id: 'l1', from: 'core', to: 'billing', calls: 'Billing API' },
        { id: 'l2', from: 'core', to: 'bank', calls: 'Payment API', does: 'Collects premiums' },
      ],
    }
    const lineLabel = (line: Diagram['lines'][number]) => ({ label: line.calls, missing: !line.does, nonCompliant: line.id === 'l2' })
    render(<DiagramCanvas diagram={solution} editable={false} selected={null} onSelect={vi.fn()} onEdits={vi.fn()} lineLabel={lineLabel} />)
    expect(await screen.findByText('Actor')).toBeInTheDocument()
    expect(screen.getByText('Part of this application')).toBeInTheDocument()
    expect(screen.getByText('Business application · TRM APM-Billing')).toBeInTheDocument()
    expect(screen.getByText('Business application · typed, not in TRM')).toBeInTheDocument()
    expect(screen.getByText('External party')).toBeInTheDocument()
    // An Azure icon shows with its product name (Microsoft's terms).
    expect(screen.getByText('App Services · Part of this application')).toBeInTheDocument()
    expect(document.querySelector('img[src$="azure-icons/app-services.svg"]')).toHaveAttribute('alt', '')
    // Lines are drawn once React Flow has measured the blocks.
    expect(await screen.findByRole('button', { name: 'Payment API (TLS not compliant)' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Billing API (facts still missing)' })).toBeInTheDocument()
  })

  it('draws CI and CD steps by kind in their lanes, saying who approves or that it is still missing', async () => {
    const flow: Diagram = {
      id: 'ci',
      title: 'CI flow',
      sizing: 'auto',
      zones: [
        { id: 'zone-1', label: 'Developer', kind: 'lane', x: 0, y: 0, width: 1200, height: 140 },
        { id: 'zone-2', label: 'Azure DevOps', kind: 'lane', x: 0, y: 140, width: 1200, height: 140 },
      ],
      boxes: [
        { id: 'box-1', label: 'Code change', type: 'start', parentId: 'zone-1', x: 40, y: 40 },
        { id: 'box-2', label: 'Build', type: 'step', icon: 'app-services', parentId: 'zone-2', x: 40, y: 40 },
        { id: 'box-3', label: 'Within policy?', type: 'decision', parentId: 'zone-2', x: 276, y: 40 },
        { id: 'box-4', label: 'Change approved?', type: 'approval', approver: 'CAB', parentId: 'zone-2', x: 512, y: 40 },
        { id: 'box-5', label: 'Release approved?', type: 'approval', parentId: 'zone-2', x: 748, y: 40 },
        { id: 'box-6', label: 'Released', type: 'end', parentId: 'zone-2', x: 984, y: 40 },
      ],
      lines: [{ id: 'line-1', from: 'box-3', to: 'box-4', label: 'Yes' }],
    }
    render(<DiagramCanvas diagram={flow} editable={false} selected="box-1" onSelect={() => {}} onEdits={() => {}} />)
    expect(await screen.findByText('Azure DevOps')).toBeInTheDocument()
    expect(screen.getByText('Code change').closest('.outline-2')).not.toBeNull()
    expect(document.querySelector('img[src$="azure-icons/app-services.svg"]')).toHaveAttribute('alt', '')
    expect(screen.getAllByText('Lane')).toHaveLength(2)
    expect(['Start', 'App Services · Step', 'Decision', 'Approval · CAB', 'Approval · who approves still missing', 'End'].map((kind) => screen.getByText(kind).previousSibling?.textContent)).toEqual([
      'Code change',
      'Build',
      'Within policy?',
      'Change approved?',
      'Release approved?',
      'Released',
    ])
  })

  it('shows monitoring blocks by kind: services (with their Azure product), other systems from TRM or typed, teams', async () => {
    const monitoring: Diagram = {
      id: 'monitoring-1',
      title: 'Monitoring',
      sizing: 'auto',
      zones: [],
      boxes: [
        { id: 'box-1', label: 'Dynatrace', type: 'monitoring', x: 0, y: 0 },
        { id: 'box-2', label: 'Application Insights', type: 'monitoring', icon: 'application-insights', x: 0, y: 94 },
        { id: 'box-3', label: 'ServiceNow', type: 'system', application: { id: '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', number: 'APM-0300' }, x: 296, y: 0 },
        { id: 'box-4', label: 'PagerDuty', type: 'system', x: 296, y: 94 },
        { id: 'box-5', label: 'Support team', type: 'team', x: 592, y: 0 },
        { id: 'box-6', label: 'Splunk', type: 'system', application: { id: '5a27be1d-59d9-47d2-8070-6f33504dd0fb', number: null }, x: 296, y: 188 },
      ],
      lines: [],
    }
    render(<DiagramCanvas diagram={monitoring} editable={false} selected={null} onSelect={() => {}} onEdits={() => {}} />)
    expect(await screen.findByText('Monitoring service')).toBeInTheDocument()
    // A system picked from TRM without an APM number says only that it is from TRM.
    expect(['Application Insights · Monitoring service', 'Other system · TRM APM-0300', 'Other system · typed, not in TRM', 'Team / person', 'Other system · TRM'].map((kind) => screen.getByText(kind).previousSibling?.textContent)).toEqual([
      'Application Insights',
      'ServiceNow',
      'PagerDuty',
      'Support team',
      'Splunk',
    ])
  })

  it('marks what changed between two versions with a coloured chip that says how', async () => {
    const marks = new Map([
      ['zone-1', 'changed' as const],
      ['box-2', 'added' as const],
      ['box-3', 'removed' as const],
      ['line-1', 'changed' as const],
      ['line-2', 'removed' as const],
    ])
    const steps: Diagram = { ...diagram, id: 'steps', zones: [], lines: [], boxes: [{ id: 'go', label: 'Go?', type: 'decision', x: 0, y: 0 }, { id: 'run', label: 'Run tests', type: 'step', x: 300, y: 0 }] }
    render(
      <>
        <DiagramCanvas diagram={diagram} editable={false} selected={null} onSelect={vi.fn()} onEdits={vi.fn()} marks={marks} />
        <DiagramCanvas
          diagram={steps}
          editable={false}
          selected={null}
          onSelect={vi.fn()}
          onEdits={vi.fn()}
          marks={
            new Map([
              ['go', 'added' as const],
              ['run', 'changed' as const],
            ])
          }
        />
      </>,
    )
    expect((await screen.findByText('MY01')).nextSibling).toHaveTextContent('Changed')
    expect(screen.getByText('Customer').closest('.border-icon-success')).not.toBeNull()
    expect(screen.getByText('Bank').closest('.border-icon-error')).not.toBeNull()
    expect(screen.getAllByText('Added')).toHaveLength(2)
    expect(document.querySelector('polygon.stroke-icon-success')).not.toBeNull()
    expect(screen.getByText('Run tests').closest('.border-icon-warning')).toHaveClass('border-2')
    // Lines: coloured, and their label (or a chip of its own) says how they changed.
    expect(await screen.findByRole('button', { name: 'Changed HTTPS 443' }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Removed' })).toBeInTheDocument()
    expect(document.querySelector('.react-flow__edge-path[style*="--color-icon-warning"]')).not.toBeNull()
    expect(document.querySelector('.react-flow__edge-path[style*="--color-icon-error"]')).not.toBeNull()
  })

  it('names a changed line with a warning by its change, label and warning', async () => {
    const lineLabel = (line: Diagram['lines'][number]) => ({ label: line.label, missing: true })
    render(<DiagramCanvas diagram={diagram} editable={false} selected={null} onSelect={vi.fn()} onEdits={vi.fn()} lineLabel={lineLabel} marks={new Map([['line-1', 'added' as const]])} />)
    expect(await screen.findByRole('button', { name: 'Added HTTPS 443 (facts still missing)' }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('shows the change and the label of a line as separate words, so the name starts with what is seen (WCAG 2.5.3)', async () => {
    render(<DiagramCanvas diagram={diagram} editable={false} selected={null} onSelect={vi.fn()} onEdits={vi.fn()} marks={new Map([['line-1', 'changed' as const]])} />)

    const button = await screen.findByRole('button', { name: 'Changed HTTPS 443' }, { timeout: 3000 })
    expect(button.textContent).toBe('Changed HTTPS 443')
  })

  it('marks the selected box and line', async () => {
    const { rerender, container } = render(<DiagramCanvas diagram={diagram} editable selected="box-1" onSelect={vi.fn()} onEdits={vi.fn()} />)
    expect((await screen.findByText('CRM web')).closest('.outline-2')).not.toBeNull()
    rerender(<DiagramCanvas diagram={diagram} editable selected="line-1" onSelect={vi.fn()} onEdits={vi.fn()} />)
    expect((await screen.findByRole('button', { name: 'HTTPS 443' })).className).toContain('outline-2')
    expect(container.querySelector('.react-flow__edge-path[style*="2.5"]')).not.toBeNull()
  })

  // Plain clicks: the test DOM gives mouse-down events no window, which the canvas's zoom handling needs.
  it('selects a box when clicked, and nothing when the empty canvas is clicked', async () => {
    const onSelect = vi.fn()
    const onEdits = vi.fn()
    const { container } = render(<DiagramCanvas diagram={diagram} editable={false} selected={null} onSelect={onSelect} onEdits={onEdits} />)
    fireEvent.click(await screen.findByText('Customer'))
    expect(onSelect).toHaveBeenCalledWith('box-2')
    expect(onEdits).toHaveBeenCalledWith([{ kind: 'select', id: 'box-2' }])
    fireEvent.click(container.querySelector('.react-flow__pane')!)
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })

  it('fits the view again when something is added or removed, never zooming past 100%, and stays put while things are dragged', async () => {
    const transform = (container: HTMLElement) => container.querySelector<HTMLElement>('.react-flow__viewport')!.style.transform
    const scale = (container: HTMLElement) => Number(/scale\(([\d.]+)\)/.exec(transform(container))?.[1])
    const one: Diagram = { ...diagram, zones: [], lines: [], boxes: [{ id: 'box-1', label: 'Portal', type: 'web', x: 0, y: 0 }] }
    const { container, rerender } = render(<DiagramCanvas diagram={one} editable selected={null} onSelect={vi.fn()} onEdits={vi.fn()} />)
    // One small box would fill the canvas at 2×; it is centred at 100% instead.
    await vi.waitFor(() => expect(transform(container)).not.toBe('translate(0px,0px) scale(1)'))
    expect(scale(container)).toBe(1)
    const two: Diagram = { ...one, boxes: [...one.boxes, { id: 'box-2', label: 'Bank', type: 'external', x: 4000, y: 3000 }] }
    rerender(<DiagramCanvas diagram={two} editable selected={null} onSelect={vi.fn()} onEdits={vi.fn()} />)
    await vi.waitFor(() => expect(scale(container)).toBeLessThan(0.5))
    const fitted = scale(container)
    const dragged: Diagram = { ...two, boxes: [two.boxes[0], { ...two.boxes[1], x: 100, y: 100 }] }
    rerender(<DiagramCanvas diagram={dragged} editable selected={null} onSelect={vi.fn()} onEdits={vi.fn()} />)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(scale(container)).toBe(fitted)
  })
})
