import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem } from '../../../test/harness'
import type { Diagram } from '../schemas'
import { ApplicationCalls, IncomingCalls } from './CallsViews'
import { calls, CRM, PORTAL } from './fixtures'

// The real canvas needs a browser layout; this stand-in lists what it would draw.
vi.mock('../diagrams/DiagramCanvas', () => ({
  DiagramCanvas: ({ diagram }: { diagram: Diagram }) => <p data-testid="canvas">{[...diagram.boxes.map((box) => box.label), ...diagram.lines.map((line) => line.label ?? '')].join(' | ')}</p>,
}))

const PATH = `GET /api/v1/sad/applications/${CRM.id}/calls`
let api: ReturnType<typeof mockApi>
beforeEach(() => {
  api = mockApi()
})
const show = (ui: ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>)
const rows = (caption: string) =>
  within(screen.getByRole('table', { name: caption }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))

describe('an application dependency view', () => {
  it('draws the application with its callers and callees, and lists each approved SAD statement', async () => {
    api.on(PATH, json(200, { items: calls }))
    show(<ApplicationCalls applicationId={CRM.id} />)
    expect(await screen.findByTestId('canvas')).toHaveTextContent('CRM | Billing | Customer Portal | Billing | Billing API: create invoice | CRM Customer API | Restricted | Invoice file')
    expect(rows('Applications calling CRM (2)')).toEqual([
      ['Billing (APM-0011)', 'CRM Customer API', '—', 'One-way', "CRM's SAD v2, approved 14 Aug 2026"],
      ['Customer Portal (APM-0005)', 'Restricted', 'Restricted', 'One-way', "Customer Portal's SAD v4, approved 2 Jun 2026"],
    ])
    expect(rows('Applications CRM calls (2)')).toEqual([
      ['Billing (APM-0011)', 'Billing API: create invoice', 'Bills premiums', 'Two-way', "CRM's SAD v2, approved 14 Aug 2026"],
      ['Billing (APM-0011)', 'Invoice file', 'Nightly invoices', 'One-way', "CRM's SAD v2, approved 14 Aug 2026"],
    ])
  })

  it('says when no approved SAD describes calls with it, and when they cannot load', async () => {
    api.on(PATH, json(200, { items: [] }))
    const { unmount } = show(<ApplicationCalls applicationId={CRM.id} />)
    expect(await screen.findByText('No approved SAD describes calls with this application yet.')).toBeInTheDocument()
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
    unmount()

    api.on(PATH, problem(500, 'Server error'))
    show(<ApplicationCalls applicationId={CRM.id} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(api.callsTo(PATH).length).toBeGreaterThan(2)
  })
})

describe("calls from other applications, in an application's SAD", () => {
  it("lists the calls to it that other applications' approved SADs describe", async () => {
    api.on(PATH, json(200, { items: calls }))
    show(<IncomingCalls applicationId={CRM.id} />)
    const section = await screen.findByRole('region', { name: 'Calls from other applications' })
    const table = await within(section).findByRole('table', { name: 'Applications calling CRM (1)' })
    expect(within(table).getAllByRole('row').slice(1).map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['Customer Portal (APM-0005)', 'Restricted', 'Restricted', 'One-way', "Customer Portal's SAD v4, approved 2 Jun 2026"],
    ])
  })

  it('names an application without an APM number by its name, and a source gone from TRM by its SAD only', async () => {
    api.on(PATH, json(200, { items: [{ ...calls[2], caller: { ...PORTAL, number: null }, source: { ...calls[2].source, applicationName: null } }] }))
    show(<IncomingCalls applicationId={CRM.id} />)
    expect(await screen.findByRole('cell', { name: 'SAD v4, approved 2 Jun 2026' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Customer Portal' })).toBeInTheDocument()
  })

  it('offers a retry when the calls cannot load', async () => {
    let fail = true
    api.on(PATH, () => (fail ? problem(500, 'Server error') : json(200, { items: calls })))
    show(<IncomingCalls applicationId={CRM.id} />)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('cell', { name: 'Customer Portal (APM-0005)' })).toBeInTheDocument()
  })

  it('shows nothing to a reader the API does not show the calls to (e.g. an approver without TRM or section 2 access)', async () => {
    api.on(PATH, problem(404, 'Not Found'))
    const { container } = show(<IncomingCalls applicationId={CRM.id} />)
    await waitFor(() => expect(api.callsTo(PATH)).toHaveLength(1))
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('says when there are none', async () => {
    api.on(PATH, json(200, { items: calls.slice(0, 2) }))
    show(<IncomingCalls applicationId={CRM.id} />)
    expect(await screen.findByText("No other application's approved SAD describes calls to this application.")).toBeInTheDocument()
  })
})
