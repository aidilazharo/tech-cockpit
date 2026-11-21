import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { APP_CRM, application, DOMAIN_CUSTOMER, domains, LAYER_DATA, LAYER_SECURITY, layers, portfolios, SUB_SALES, SUB_SERVICE } from './fixtures'

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/trm/domains', json(200, { items: domains }))
  api.on('GET /api/v1/trm/layers', json(200, layers))
  api.on('GET /api/v1/portfolios', json(200, { items: portfolios }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const dialogDone = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

describe('Domains administration', () => {
  it('adds domains and sub-domains, renames and deactivates them', async () => {
    signInWith(['trm:domain:manage', 'trm:application:read'])
    api.on('POST /api/v1/trm/domains', json(201, { id: DOMAIN_CUSTOMER, name: 'Finance', active: true, version: 1 }))
    api.on('PATCH /api/v1/trm/domains/:id', json(200, {}))
    api.on(`PATCH /api/v1/trm/domains/${DOMAIN_CUSTOMER}`, json(200, { id: DOMAIN_CUSTOMER, name: 'Customer', active: false, version: 2 }))
    api.on(`POST /api/v1/trm/domains/${DOMAIN_CUSTOMER}/subdomains`, json(201, { id: SUB_SALES, name: 'Retention', active: true, version: 1 }))
    api.on(`PATCH /api/v1/trm/subdomains/${SUB_SALES}`, json(200, { id: SUB_SALES, name: 'Selling', active: true, version: 2 }))
    api.on(`PATCH /api/v1/trm/subdomains/${SUB_SERVICE}`, json(200, { id: SUB_SERVICE, name: 'Service', active: true, version: 3 }))
    renderRoute('/admin/domains')

    const customer = await screen.findByRole('region', { name: 'Customer' })
    expect(customer).toHaveTextContent('Sales')
    expect(customer).toHaveTextContent('1 application')
    expect(customer).toHaveTextContent('Inactive')

    await userEvent.click(screen.getByRole('button', { name: 'Add domain' }))
    let dialog = await screen.findByRole('dialog', { name: 'Add domain' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add domain' }))
    expect(within(dialog).getByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Finance')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add domain' }))
    await dialogDone()
    expect(api.callsTo('POST /api/v1/trm/domains')[0].body).toEqual({ name: 'Finance' })

    await userEvent.click(within(customer).getByRole('button', { name: 'Add a sub-domain to Customer' }))
    dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Retention')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add sub-domain' }))
    await dialogDone()
    expect(api.callsTo(`POST /api/v1/trm/domains/${DOMAIN_CUSTOMER}/subdomains`)[0].body).toEqual({ name: 'Retention' })

    await userEvent.click(within(customer).getByRole('button', { name: 'Rename Customer / Sales' }))
    dialog = await screen.findByRole('dialog')
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.type(name, 'Selling')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await dialogDone()
    expect(api.callsTo(`PATCH /api/v1/trm/subdomains/${SUB_SALES}`)[0].body).toEqual({ name: 'Selling', version: 1 })

    await userEvent.click(within(customer).getByRole('button', { name: 'Reactivate Customer / Service' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/trm/subdomains/${SUB_SERVICE}`)[0].body).toEqual({ active: true, version: 2 }))
    await userEvent.click(within(customer).getByRole('button', { name: 'Deactivate Customer' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/trm/domains/${DOMAIN_CUSTOMER}`)[0].body).toEqual({ active: false, version: 1 }))

    await userEvent.click(within(customer).getByRole('button', { name: 'Rename Customer' }))
    dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Experience')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await dialogDone()
    expect(api.callsTo(`PATCH /api/v1/trm/domains/${DOMAIN_CUSTOMER}`)[1].body).toEqual({ name: 'Customer Experience', version: 1 })
  })

  it('shows refusals, an empty list, and is for those who maintain domains', async () => {
    signInWith(['trm:domain:manage', 'trm:application:read'])
    api.on('POST /api/v1/trm/domains', problem(409, 'Conflict', 'A domain with this name already exists'))
    api.on('GET /api/v1/trm/domains', json(200, { items: [] }))
    renderRoute('/admin/domains')
    expect(await screen.findByText('No domains yet')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add domain' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Customer')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add domain' }))
    expect(await within(dialog).findByText('A domain with this name already exists')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await dialogDone()

    cleanup()
    signInWith(['trm:application:read'])
    renderRoute('/admin/domains')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })

  it('reactivates an inactive domain, which has no sub-domains yet', async () => {
    signInWith(['trm:domain:manage', 'trm:application:read'])
    const legacy = { ...domains[0], id: '8a000000-0000-4000-8000-0000000000bb', name: 'Legacy', active: false, version: 4, subdomains: [] }
    api.on('GET /api/v1/trm/domains', json(200, { items: [legacy] }))
    api.on(`PATCH /api/v1/trm/domains/${legacy.id}`, json(200, { id: legacy.id, name: 'Legacy', active: true, version: 5 }))
    renderRoute('/admin/domains')
    expect(await screen.findByText('No sub-domains')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Legacy' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/trm/domains/${legacy.id}`)[0]?.body).toEqual({ active: true, version: 4 }))
  })

  it('offers a retry when domains cannot be loaded', async () => {
    signInWith(['trm:domain:manage', 'trm:application:read'])
    let fail = true
    api.on('GET /api/v1/trm/domains', () => (fail ? problem(500, 'Server error') : json(200, { items: domains })))
    renderRoute('/admin/domains')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('region', { name: 'Customer' })).toBeInTheDocument()
  })
})

describe('Technology layers administration', () => {
  it('reorders, renames, deactivates and adds layers, and maps categories to layers', async () => {
    signInWith(['trm:layer:manage', 'trm:application:read'])
    api.on(`PATCH /api/v1/trm/layers/${LAYER_DATA}`, json(200, layers.layers[0]))
    api.on(`PATCH /api/v1/trm/layers/${LAYER_SECURITY}`, json(200, layers.layers[1]))
    api.on('POST /api/v1/trm/layers', json(201, { id: '89000000-0000-4000-8000-000000000009', name: 'Quantum', position: 3, active: true, version: 1 }))
    api.on('PUT /api/v1/trm/layer-mappings', json(200, layers))
    renderRoute('/admin/technology-layers')

    const table = await screen.findByRole('table', { name: 'Technology layers' })
    expect(within(table).getByRole('button', { name: 'Move Data & Analytics up' })).toBeDisabled()
    await userEvent.click(within(table).getByRole('button', { name: 'Move Data & Analytics down' }))
    await waitFor(() => {
      expect(api.callsTo(`PATCH /api/v1/trm/layers/${LAYER_DATA}`)[0].body).toEqual({ position: 2, version: 1 })
      expect(api.callsTo(`PATCH /api/v1/trm/layers/${LAYER_SECURITY}`)[0].body).toEqual({ position: 1, version: 3 })
    })
    await userEvent.click(within(table).getByRole('button', { name: 'Move Security & Identity up' }))
    await userEvent.click(within(table).getByRole('button', { name: 'Deactivate Security & Identity' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/trm/layers/${LAYER_SECURITY}`).at(-1)!.body).toEqual({ active: false, version: 3 }))

    await userEvent.click(within(table).getByRole('button', { name: 'Rename Data & Analytics' }))
    let dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), ' Platform')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await dialogDone()
    expect(api.callsTo(`PATCH /api/v1/trm/layers/${LAYER_DATA}`).at(-1)!.body).toEqual({ name: 'Data & Analytics Platform', version: 1 })

    await userEvent.click(screen.getByRole('button', { name: 'Add layer' }))
    dialog = await screen.findByRole('dialog', { name: 'Add layer' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'Quantum')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add layer' }))
    await dialogDone()
    expect(api.callsTo('POST /api/v1/trm/layers')[0].body).toEqual({ name: 'Quantum' })

    const mapping = screen.getByRole('table', { name: 'Standard categories' })
    expect(within(mapping).getAllByRole('row')[1]).toHaveTextContent('Database')
    await userEvent.click(within(mapping).getByRole('combobox', { name: 'Layer for Identity' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Security & Identity' }))
    await waitFor(() => expect(api.callsTo('PUT /api/v1/trm/layer-mappings')[0].body).toEqual({ standardCategory: 'Identity', layerId: LAYER_SECURITY }))
    await userEvent.click(within(mapping).getByRole('combobox', { name: 'Layer for Database' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Not mapped' }))
    await waitFor(() => expect(api.callsTo('PUT /api/v1/trm/layer-mappings')[1].body).toEqual({ standardCategory: 'Database', layerId: null }))
  })

  it('shows an inactive layer, keeps it as the choice of the category mapped to it, and reactivates it', async () => {
    signInWith(['trm:layer:manage', 'trm:application:read'])
    const retired = { ...layers.layers[1], active: false }
    api.on('GET /api/v1/trm/layers', json(200, { ...layers, layers: [layers.layers[0], retired], mappings: [{ standardCategory: 'Identity', layerId: retired.id }], unmappedCategories: [] }))
    api.on(`PATCH /api/v1/trm/layers/${retired.id}`, json(200, { ...retired, active: true, version: 4 }))
    renderRoute('/admin/technology-layers')
    expect(await screen.findByText('Inactive')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('combobox', { name: /Identity/ }))
    expect(await screen.findByRole('option', { name: 'Security & Identity' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Reactivate Security & Identity' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/trm/layers/${retired.id}`)[0]?.body).toMatchObject({ active: true }))
  })

  it('offers a retry when layers cannot be loaded, and says when there are no categories', async () => {
    signInWith(['trm:layer:manage', 'trm:application:read'])
    let fail = true
    api.on('GET /api/v1/trm/layers', () => (fail ? problem(500, 'Server error') : json(200, { ...layers, mappings: [], unmappedCategories: [] })))
    renderRoute('/admin/technology-layers')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No product-standard categories loaded from ServiceNow yet')).toBeInTheDocument()
  })
})

describe("An application's domains", () => {
  it('lets those who maintain domains place it in sub-domains', async () => {
    signInWith(['trm:application:read', 'trm:domain:manage'])
    let current = application({ canSetDomains: true, subdomains: [{ id: SUB_SERVICE, name: 'Service', domain: { id: DOMAIN_CUSTOMER, name: 'Customer' } }] })
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, () => json(200, current))
    api.on(`PUT /api/v1/trm/applications/${APP_CRM}/subdomains`, () => {
      current = application({ canSetDomains: true, subdomains: [{ id: SUB_SALES, name: 'Sales', domain: { id: DOMAIN_CUSTOMER, name: 'Customer' } }] })
      return json(200, current)
    })
    renderRoute(`/trm/applications/${APP_CRM}`)
    expect(await screen.findByRole('region', { name: 'Domains' })).toHaveTextContent('Customer / Service')
    await userEvent.click(screen.getByRole('button', { name: 'Change domains' }))
    const dialog = await screen.findByRole('dialog', { name: 'Domains of CRM' })
    const service = within(dialog).getByRole('checkbox', { name: 'Service (inactive)' }) // inactive but still assigned
    expect(service).toBeChecked()
    await userEvent.click(service)
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Sales' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await dialogDone()
    expect(api.callsTo(`PUT /api/v1/trm/applications/${APP_CRM}/subdomains`)[0].body).toEqual({ subdomainIds: [SUB_SALES] })
    expect(screen.getByRole('region', { name: 'Domains' })).toHaveTextContent('Customer / Sales')
  })

  it('says when it is in no domain, and when no domains exist yet', async () => {
    signInWith(['trm:application:read', 'trm:domain:manage'])
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application({ canSetDomains: true })))
    api.on('GET /api/v1/trm/domains', json(200, { items: [] }))
    renderRoute(`/trm/applications/${APP_CRM}`)
    expect(await screen.findByRole('region', { name: 'Domains' })).toHaveTextContent('Not in any domain')
    await userEvent.click(screen.getByRole('button', { name: 'Change domains' }))
    expect(await screen.findByText('No domains yet')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await dialogDone()
  })
})
