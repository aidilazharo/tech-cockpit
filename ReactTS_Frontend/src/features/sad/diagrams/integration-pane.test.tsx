import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi } from '../../../test/harness'
import type { Box, Diagram, DiagramApi, DiagramContent, DiagramView, Hosting, Line } from '../schemas'
import { DiagramSlotEditor } from './DiagramSlotEditor'
import type { LineLabel } from './flow'
import { emptyContent } from './model'

// The real canvas needs a browser layout; this stand-in shows what each line says in the view.
vi.mock('./DiagramCanvas', () => ({
  DiagramCanvas: ({ diagram, lineLabel }: { diagram: Diagram; lineLabel?: LineLabel }) => (
    <ul aria-label="canvas lines">
      {diagram.lines.map((line) => {
        const shown = lineLabel ? lineLabel(line) : { label: line.label, missing: false, nonCompliant: false }
        return (
          <li key={line.id}>
            {shown.label}
            {shown.missing ? ' (missing)' : ''}
            {shown.nonCompliant ? ' (not compliant)' : ''}
          </li>
        )
      })}
    </ul>
  ),
}))

const VERSION = '7b000000-0000-4000-8000-000000000001'
const CUSTOMER_API: DiagramApi = { id: '0f8e7d6c-5b4a-4392-8e1f-0a9b8c7d6e5f', name: 'Customer API' }

let latest: DiagramContent | undefined
beforeEach(() => {
  const api = mockApi()
  api.on(`GET /api/v1/sad/versions/${VERSION}/servers`, json(200, { items: [] }))
  latest = undefined
})

type Drawn = { hosting: Hosting; diagrams: Diagram[] }
function Harness({ initial, view, editable = true, apis = [CUSTOMER_API], offered }: { initial: DiagramContent; view: DiagramView; editable?: boolean; apis?: DiagramApi[]; offered?: Box[] }) {
  const [content, setContent] = useState(initial)
  const change = (next: DiagramContent) => {
    latest = next
    setContent(next)
  }
  return (
    <DiagramSlotEditor
      slot="infrastructure"
      view={view}
      content={content}
      onChange={editable ? change : undefined}
      drawnIn={view === 'integration' ? 'Physical and Network Architecture' : undefined}
      versionId={VERSION}
      apis={apis}
      offered={offered}
    />
  )
}
const show = (props: Parameters<typeof Harness>[0]) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness {...props} />
    </QueryClientProvider>,
  )

const connection: Line = {
  id: 'line-2',
  from: 'box-1',
  to: 'box-2',
  layer: 'integration',
  protocol: 'TDS',
  port: 1433,
  tls: '1.0',
  pattern: 'database',
  authentication: 'Managed identity',
  classification: 'confidential',
  purpose: 'Store customers',
  flow: 'service',
}
/** CRM's server in PDC, its database in the primary region, a 3rd party zone with the bank, and a replication line between the data centres. */
const drawn = (lines: Line[] = []): Drawn => {
  const content = emptyContent('infrastructure', 'CRM') as Drawn
  content.diagrams = content.diagrams.map((d) => ({
    ...d,
    zones: [...d.zones, { id: 'zone-1', label: '3rd party', kind: 'third-party', x: 900, y: 0, width: 250, height: 120 }],
    boxes: [
      { id: 'box-1', label: 'SRV-CRM-01', type: 'server', parentId: 'primary-dc', x: 20, y: 40 },
      { id: 'box-2', label: 'CRM DB', type: 'database', parentId: 'primary-region', x: 20, y: 40 },
      { id: 'box-3', label: 'Bank', type: 'external', parentId: 'zone-1', x: 20, y: 40 },
    ],
    lines: [{ id: 'line-1', from: 'primary-dc', to: 'dr-dc', label: 'Replication', dashed: true }, ...lines],
  }))
  return content
}
const production = () => (latest as Drawn).diagrams[0]
const table = (name: string) => screen.getByRole('table', { name })
const details = () => screen.getByRole('complementary', { name: 'Details' })
const choose = async (label: string, option: string, scope: HTMLElement = document.body) => {
  await userEvent.click(within(scope).getByRole('combobox', { name: label }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}
const options = async (label: string, scope: HTMLElement) => {
  await userEvent.click(within(scope).getByRole('combobox', { name: label }))
  const names = (await screen.findAllByRole('option')).map((option) => option.textContent)
  await userEvent.keyboard('{Escape}')
  return names
}
const type = async (label: string, text: string, scope: HTMLElement = document.body) => {
  const field = within(scope).getByLabelText(label)
  await userEvent.clear(field)
  if (text) await userEvent.type(field, text)
}

describe('integration view, in section 2', () => {
  it('adds integration connections between boxes and records their facts; the infrastructure lines stay out of it', async () => {
    show({ initial: drawn(), view: 'integration' })
    const region = screen.getByRole('region', { name: 'Infrastructure diagram: Integration view' })
    expect(region).toHaveTextContent('Drawn in “Physical and Network Architecture”. Add and describe the integration connections here')
    expect(screen.queryByRole('group', { name: 'Hosting settings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add zone' })).not.toBeInTheDocument()
    expect(screen.queryByText('Replication')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    const form = screen.getByRole('group', { name: 'Add connection' })
    expect(await options('From', form)).toEqual(['SRV-CRM-01', 'CRM DB', 'Bank'])
    await choose('From', 'SRV-CRM-01', form)
    await choose('To', 'CRM DB', form)
    await type('Protocol', 'TDS', form)
    await type('Port', '1433', form)
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(production().lines[1]).toEqual({ id: 'line-2', from: 'box-1', to: 'box-2', layer: 'integration', protocol: 'TDS', port: 1433 })
    const missing = screen.getByRole('alert', { name: 'Before submit, every integration connection needs its facts' })
    expect(missing).toHaveTextContent('SRV-CRM-01 → CRM DB: TLS version, pattern, authentication, classification, purpose, flow type')
    expect(screen.getByText('TDS 1433 (missing)')).toBeInTheDocument()

    await choose('TLS', 'TLS 1.0 (not compliant)', details())
    await choose('Pattern', 'API', details())
    expect(await options('API', details())).toEqual(['Customer API'])
    await choose('API', 'Customer API', details())
    await type('Authentication', 'OAuth 2.0', details())
    await choose('Classification', 'Confidential', details())
    await type('Purpose', 'Read customers', details())
    await choose('Flow type', 'Service-to-service', details())
    await userEvent.click(within(details()).getByRole('radio', { name: 'Two-way' }))
    expect(screen.queryByRole('alert', { name: /Before submit/ })).not.toBeInTheDocument()
    expect(screen.getByRole('alert', { name: 'TLS 1.1 and 1.0 are not compliant' })).toHaveTextContent('SRV-CRM-01 → CRM DB')
    expect(screen.getByText('TDS 1433 · TLS 1.0 (not compliant)')).toBeInTheDocument()
    expect(production().lines[1]).toEqual({
      id: 'line-2',
      from: 'box-1',
      to: 'box-2',
      layer: 'integration',
      protocol: 'TDS',
      port: 1433,
      tls: '1.0',
      pattern: 'api',
      api: { id: CUSTOMER_API.id },
      authentication: 'OAuth 2.0',
      classification: 'confidential',
      purpose: 'Read customers',
      flow: 'service',
      twoWay: true,
    })
    // Without TLS, the author says what protects it instead.
    await choose('TLS', 'Not TLS', details())
    await type('What protects it instead', 'SSH', details())
    expect(production().lines[1]).toMatchObject({ tls: 'none', protection: 'SSH' })
    expect(screen.getByText('TDS 1433 · SSH')).toBeInTheDocument()
    await choose('Pattern', 'File', details())
    expect(production().lines[1]).not.toHaveProperty('api')
    expect(within(table('Connections')).getByRole('row', { name: 'SRV-CRM-01 → CRM DB TDS 1433 Not TLS: SSH File' })).toBeInTheDocument()
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    expect(production().lines.map((line) => line.id)).toEqual(['line-1'])
  })

  it('says what a new connection still needs, takes only a whole number as its port, and edits protocol and port in its details', async () => {
    show({ initial: drawn(), view: 'integration' })
    await userEvent.click(screen.getByRole('button', { name: 'Add connection' }))
    const form = screen.getByRole('group', { name: 'Add connection' })
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(within(form).getAllByText('Choose')).toHaveLength(4)
    await choose('From', 'SRV-CRM-01', form)
    await choose('To', 'SRV-CRM-01', form)
    expect(within(form).getByText('Choose two different ends')).toBeInTheDocument()
    await choose('To', 'Bank', form)
    await type('Port', '44x', form)
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(production().lines[1]).toEqual({ id: 'line-2', from: 'box-1', to: 'box-3', layer: 'integration' })
    expect(screen.getByText('Not described yet (missing)')).toBeInTheDocument()
    expect(within(table('Connections')).getByRole('row', { name: 'SRV-CRM-01 → Bank — — —' })).toBeInTheDocument()
    await type('Protocol', 'HTTPS', details())
    await type('Port', '443', details())
    await choose('To', 'CRM DB', details())
    expect(production().lines[1]).toMatchObject({ to: 'box-2', protocol: 'HTTPS', port: 443 })
    await choose('Pattern', 'API', details())
    await choose('Pattern', 'Not set', details())
    expect(production().lines[1]).not.toHaveProperty('pattern')
  })

  it('asks a section 2 editor before removing a box it placed that has integration connections, and removes them with it', async () => {
    const toBank: Line = { id: 'line-2', from: 'box-1', to: 'box-3', layer: 'integration', protocol: 'HTTPS', port: 443 }
    show({ initial: drawn([toBank]), view: 'integration' })
    await userEvent.click(within(table('Boxes')).getByRole('button', { name: 'Bank' }))
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove integration connections too?' })
    expect(dialog).toHaveTextContent('Bank has integration connections. Remove it and its connections?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(latest).toBeUndefined()
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' }))
    expect(production().boxes.map((box) => box.label)).toEqual(['SRV-CRM-01', 'CRM DB'])
    expect(production().lines.map((line) => line.id)).toEqual(['line-1'])
  })

  it('offers the solution diagram applications first when section 2 places one', async () => {
    const policy: Box = { id: 'box-9', label: 'Policy Admin', type: 'business', application: { id: '3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b', number: 'APM-0002' }, x: 0, y: 0 }
    show({ initial: drawn(), view: 'integration', offered: [policy] })
    await userEvent.click(screen.getByRole('button', { name: 'Add box' }))
    const form = screen.getByRole('group', { name: 'Add box' })
    expect(within(form).getByRole('radio', { name: 'On the solution diagram' })).toBeChecked()
  })

  it("leaves section 3's zones and boxes as they are, and places other applications and external parties", async () => {
    show({ initial: drawn(), view: 'integration' })
    await userEvent.click(within(table('Boxes')).getByRole('button', { name: 'SRV-CRM-01' }))
    expect(within(details()).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(details()).queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    await userEvent.click(within(table('Boxes')).getByRole('button', { name: 'Bank' }))
    await type('Name', 'Bank gateway', details())
    expect(production().boxes[2].label).toBe('Bank gateway')

    await userEvent.click(screen.getByRole('button', { name: 'Add box' }))
    const form = screen.getByRole('group', { name: 'Add box' })
    expect(await options('Kind', form)).toEqual(['Business application', 'External party'])
    await userEvent.click(within(form).getByRole('radio', { name: 'Not in TRM: type the name' }))
    await type('Name', 'Old CRM', form)
    await userEvent.click(within(form).getByRole('button', { name: 'Add' }))
    expect(production().boxes[3]).toEqual(expect.objectContaining({ label: 'Old CRM', type: 'business' }))
  })

  it('names an API without a name in the inventory as a dash', async () => {
    show({ initial: drawn([{ ...connection, pattern: 'api' }]), view: 'integration', apis: [{ id: CUSTOMER_API.id, name: '' }] })
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'SRV-CRM-01 → CRM DB' }))
    expect(await options('API', details())).toEqual(['—'])
  })

  it('says when there is nothing to link an API connection to yet', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DiagramSlotEditor slot="infrastructure" view="integration" content={drawn([{ ...connection, pattern: 'api' }])} onChange={() => {}} versionId={VERSION} apis={[]} />
      </QueryClientProvider>,
    )
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'SRV-CRM-01 → CRM DB' }))
    expect(within(details()).getByText("No APIs in this SAD's API inventory yet (section 6).")).toBeInTheDocument()
  })
})

describe('infrastructure view, in section 3', () => {
  it('shows only infrastructure lines, and asks before removing a box that has integration connections', async () => {
    show({ initial: drawn([connection]), view: 'infrastructure' })
    expect(within(table('Lines')).getAllByRole('row')).toHaveLength(2)
    await userEvent.click(within(table('Boxes')).getByRole('button', { name: 'SRV-CRM-01' }))
    await userEvent.click(within(details()).getByRole('button', { name: 'Remove' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Remove integration connections too?' })
    expect(dialog).toHaveTextContent('SRV-CRM-01 has integration connections (section 2). Remove it and its connections?')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(production().boxes.map((box) => box.label)).toEqual(['CRM DB', 'Bank'])
    expect(production().lines.map((line) => line.id)).toEqual(['line-1'])
  })
})

describe('integration view, read-only', () => {
  it("shows a connection's facts, and what is not filled in yet", async () => {
    show({ initial: drawn([{ ...connection, pattern: 'api', api: { id: CUSTOMER_API.id } }, { id: 'line-3', from: 'box-2', to: 'box-3', layer: 'integration' }]), view: 'integration', editable: false })
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'SRV-CRM-01 → CRM DB' }))
    const facts = within(details()).getAllByRole('definition').map((value) => value.textContent)
    expect(facts).toEqual(['TDS', '1433', '1.0 (not compliant)', 'One-way', 'API', 'Customer API', 'Managed identity', 'Confidential', 'Store customers', 'Service-to-service'])
    await userEvent.click(within(table('Connections')).getByRole('button', { name: 'CRM DB → Bank' }))
    // Every fact but the direction (one-way unless two-way) is still to fill in.
    expect(within(details()).getAllByRole('definition').map((value) => value.textContent)).toEqual(['—', '—', '—', 'One-way', '—', '—', '—', '—', '—', '—'])
  })
})

describe('technical communication matrix', () => {
  it("lists both tabs' integration connections with their zones' full paths, API names and non-compliant TLS", () => {
    const content = drawn([
      { ...connection, pattern: 'api', api: { id: CUSTOMER_API.id }, twoWay: true },
      { id: 'line-3', from: 'box-3', to: 'box-2', layer: 'integration', tls: '1.2', pattern: 'api', api: { id: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d' } },
    ])
    content.diagrams[0].boxes.push({ id: 'box-4', label: 'Policy Admin', type: 'business', x: 0, y: 400 })
    content.diagrams[0].lines.push({ id: 'line-4', from: 'box-4', to: 'box-1', layer: 'integration' })
    content.diagrams[1] = { ...content.diagrams[1], lines: [{ ...connection, id: 'line-9', tls: 'none', protection: 'SSH', protocol: 'SFTP', port: 22, pattern: 'file', flow: 'it-admin' }] }
    show({ initial: content, view: 'integration', editable: false })
    const matrix = table('Technical communication matrix')
    expect(within(matrix).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Environment',
      'Source',
      'Source zone',
      'Destination',
      'Destination zone',
      'Protocol',
      'Port',
      'TLS',
      'Direction',
      'Pattern',
      'Authentication',
      'API',
      'Classification',
      'Purpose',
      'Flow type',
    ])
    const rows = within(matrix).getAllByRole('row').slice(1)
    expect(rows.map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent))).toEqual([
      ['Production', 'SRV-CRM-01', 'PDC', 'CRM DB', 'MY01 › Southeast Asia', 'TDS', '1433', '1.0 (not compliant)', 'Two-way', 'API', 'Managed identity', 'Customer API', 'Confidential', 'Store customers', 'Service-to-service'],
      ['Production', 'Bank', '3rd party', 'CRM DB', 'MY01 › Southeast Asia', '—', '—', '1.2', 'One-way', 'API', '—', '—', '—', '—', '—'],
      ['Production', 'Policy Admin', '—', 'SRV-CRM-01', 'PDC', '—', '—', '—', 'One-way', '—', '—', '—', '—', '—', '—'],
      ['Non-production', 'SRV-CRM-01', 'PDC', 'CRM DB', 'MY01 › Southeast Asia', 'SFTP', '22', 'Not TLS: SSH', 'One-way', 'File', 'Managed identity', '—', 'Confidential', 'Store customers', 'IT-admin-to-service'],
    ])
  })
})
