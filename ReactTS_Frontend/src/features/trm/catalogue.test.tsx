import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import {
  APP_CRM,
  applicationSummary,
  CAP_CUSTOMER,
  CAP_IDENTITY,
  CAP_ONBOARDING,
  capabilities,
  facets,
  MODEL_PG,
  page,
  SERVER_1,
  service,
  STD_PG,
  SVC_PROD,
  SVC_SALES,
} from './fixtures'

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/trm/facets', json(200, facets))
  signInWith(['trm:application:read'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const lastQuery = (route: string) => new URLSearchParams(api.callsTo(route).at(-1)!.path.split('?')[1])
const choose = async (filter: string, option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: filter }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}
const standard = { id: STD_PG, name: 'PostgreSQL 15', status: 'Standard' }
const model = { id: MODEL_PG, name: 'PostgreSQL 15', product: 'PostgreSQL', productVersion: '15', manufacturer: 'PGDG', productStandard: standard, missingSince: null }

describe('Services', () => {
  it('lists and filters services', async () => {
    api.on('GET /api/v1/trm/services', json(200, page([{ id: SVC_PROD, number: 'SVC-1', name: 'CRM Prod', kind: 'application', environment: 'Production', operationalStatus: 'Operational', missingSince: null }])))
    renderRoute('/trm/services')
    const table = await screen.findByRole('table', { name: 'Services' })
    expect(within(table).getByRole('link', { name: 'CRM Prod' })).toHaveAttribute('href', `/trm/services/${SVC_PROD}`)
    expect(table).toHaveTextContent('Application service')
    await choose('Kind', 'Business service')
    await choose('Environment', 'Test')
    await choose('In ServiceNow', 'In the last export')
    await waitFor(() => {
      const query = lastQuery('GET /api/v1/trm/services')
      expect([query.get('kind'), query.get('environment'), query.get('missing')]).toEqual(['business', 'Test', 'false'])
    })
  })

  it('shows an application service with its applications, business services, servers, software and details', async () => {
    api.on(`GET /api/v1/trm/services/${SVC_PROD}`, json(200, service({ description: 'Production deployment of CRM' })))
    renderRoute(`/trm/services/${SVC_PROD}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'CRM Prod' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CRM' })).toHaveAttribute('href', `/trm/applications/${APP_CRM}`)
    expect(screen.getByRole('link', { name: 'Sales' })).toHaveAttribute('href', `/trm/services/${SVC_SALES}`)
    expect(screen.getByRole('link', { name: 'SRV-CRM-01' })).toHaveAttribute('href', `/trm/servers/${SERVER_1}`)
    expect(screen.getByRole('link', { name: 'Standard: PostgreSQL 15' })).toBeInTheDocument()
    const details = screen.getByRole('region', { name: 'ServiceNow details' })
    expect(details).toHaveTextContent('Confidential')
    expect(details).toHaveTextContent('Person Service Owner')
    expect(screen.getByText('Production deployment of CRM')).toBeInTheDocument()
  })

  it('shows a business service with the application services supporting it, and Restricted names', async () => {
    api.on(
      `GET /api/v1/trm/services/${SVC_SALES}`,
      json(200, service({ id: SVC_SALES, kind: 'business', name: 'Sales', ownedBy: null, restricted: ['ownedBy'], applications: [], businessServices: [], applicationServices: [{ id: SVC_PROD, name: 'CRM Prod' }], servers: [], software: [], source: null })),
    )
    renderRoute(`/trm/services/${SVC_SALES}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Sales' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'CRM Prod' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'ServiceNow details' })).toHaveTextContent('Restricted')
    expect(screen.queryByText(/All ServiceNow fields \(/)).not.toBeInTheDocument()
  })

  it('says when a service is not there', async () => {
    api.on(`GET /api/v1/trm/services/${SVC_PROD}`, problem(404, 'Not Found'))
    renderRoute(`/trm/services/${SVC_PROD}`)
    expect(await screen.findByText('This service does not exist, or it is not one you can see.')).toBeInTheDocument()
  })
})

describe('Capabilities', () => {
  it('shows the capability tree with application counts', async () => {
    api.on('GET /api/v1/trm/capabilities', json(200, { items: capabilities }))
    renderRoute('/trm/capabilities')
    const tree = await screen.findByRole('list', { name: 'Capability tree' })
    expect(within(tree).getByRole('link', { name: 'Customer' })).toHaveAttribute('href', `/trm/capabilities/${CAP_CUSTOMER}`)
    const onboarding = within(tree).getByRole('link', { name: 'Onboarding' }).closest('li')!
    expect(within(onboarding).getByRole('link', { name: 'Identity check' })).toBeInTheDocument()
    expect(onboarding).toHaveTextContent('2 applications')
  })

  it('says when there are no capabilities, and offers a retry on failure', async () => {
    let fail = true
    api.on('GET /api/v1/trm/capabilities', () => (fail ? problem(500, 'Server error') : json(200, { items: [] })))
    renderRoute('/trm/capabilities')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No capabilities loaded from ServiceNow yet')).toBeInTheDocument()
  })

  it('shows a capability with its path, sub-capabilities and applications', async () => {
    api.on(
      `GET /api/v1/trm/capabilities/${CAP_ONBOARDING}`,
      json(200, {
        id: CAP_ONBOARDING,
        snSysId: '00000000000000000000000000000002',
        name: 'Onboarding',
        description: 'Bringing customers on board',
        operationalStatus: 'Operational',
        parentName: 'Customer',
        level: null,
        path: [
          { id: CAP_CUSTOMER, name: 'Customer' },
          { id: CAP_ONBOARDING, name: 'Onboarding' },
        ],
        children: [{ id: CAP_IDENTITY, name: 'Identity check' }],
        applications: [applicationSummary(), applicationSummary({ id: '80000000-0000-4000-8000-0000000000cc', name: 'Unrated', timeRating: null })],
        missingSince: null,
        source: { name: 'Onboarding' },
      }),
    )
    renderRoute(`/trm/capabilities/${CAP_ONBOARDING}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Onboarding' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Customer' })).toHaveAttribute('href', `/trm/capabilities/${CAP_CUSTOMER}`)
    expect(screen.getByRole('link', { name: 'Identity check' })).toBeInTheDocument()
    const apps = screen.getByRole('table', { name: 'Applications at this capability or below' })
    expect(within(apps).getByRole('link', { name: 'CRM' })).toBeInTheDocument()
    expect(within(apps).getAllByRole('row')[2]).toHaveTextContent('Not rated')
  })
})

describe('Software models and product standards', () => {
  it('lists software models with their standard, and searches', async () => {
    api.on('GET /api/v1/trm/software-models', json(200, page([model, { ...model, id: '83000000-0000-4000-8000-000000000002', name: 'Nginx', productStandard: null }])))
    renderRoute('/trm/software-models')
    const table = await screen.findByRole('table', { name: 'Software models' })
    expect(table).toHaveTextContent('PGDG')
    expect(table).toHaveTextContent('Standard')
    expect(table).toHaveTextContent('No product standard')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name, product or manufacturer' }), 'pg')
    await waitFor(() => expect(lastQuery('GET /api/v1/trm/software-models').get('q')).toBe('pg'))
  })

  it('shows a software model and where it is used', async () => {
    api.on(
      `GET /api/v1/trm/software-models/${MODEL_PG}`,
      json(200, {
        ...model,
        snSysId: '00000000000000000000000000000028',
        productType: 'Database',
        modelCategory: 'Software',
        productStandardName: 'PostgreSQL 15',
        services: [
          { id: SVC_PROD, name: 'CRM Prod', fullVersion: '15.4', primaryModel: true },
          { id: SVC_SALES, name: 'CRM DR', fullVersion: null, primaryModel: false },
        ],
        applications: [{ id: APP_CRM, name: 'CRM' }],
        source: { name: 'PostgreSQL 15' },
      }),
    )
    renderRoute(`/trm/software-models/${MODEL_PG}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'PostgreSQL 15' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Standard: PostgreSQL 15' })).toHaveAttribute('href', `/trm/product-standards/${STD_PG}`)
    const uses = screen.getByRole('table', { name: 'Services using this model' })
    expect(uses).toHaveTextContent('15.4')
    expect(uses).toHaveTextContent('Yes')
    expect(within(uses).getAllByRole('row')[2]).toHaveTextContent('CRM DR—No')
    expect(screen.getByRole('link', { name: 'CRM' })).toBeInTheDocument()
  })

  it('names the unmatched product standard of a software model', async () => {
    api.on(
      `GET /api/v1/trm/software-models/${MODEL_PG}`,
      json(200, { ...model, productStandard: null, snSysId: 'x', productType: null, modelCategory: null, productStandardName: 'Nginx', services: [], applications: [], source: null }),
    )
    renderRoute(`/trm/software-models/${MODEL_PG}`)
    expect(await screen.findByText('No product standard matches "Nginx"')).toBeInTheDocument()
  })

  it('lists product standards by status', async () => {
    api.on(
      'GET /api/v1/trm/product-standards',
      json(200, page([
        { id: STD_PG, name: 'PostgreSQL 15', product: 'PostgreSQL', manufacturer: 'PGDG', status: 'Restricted', standardCategory: 'Database', functionalCategory: null, missingSince: null },
        { id: '84000000-0000-4000-8000-000000000002', name: 'Kafka', product: null, manufacturer: null, status: 'Under review', standardCategory: null, functionalCategory: null, missingSince: null },
        { id: '84000000-0000-4000-8000-000000000003', name: 'Legacy', product: null, manufacturer: null, status: null, standardCategory: null, functionalCategory: null, missingSince: null },
      ])),
    )
    renderRoute('/trm/product-standards')
    const table = await screen.findByRole('table', { name: 'Product standards' })
    expect(table).toHaveTextContent('Restricted')
    expect(table).toHaveTextContent('Under review')
    await choose('Status', 'Standard')
    await waitFor(() => expect(lastQuery('GET /api/v1/trm/product-standards').get('status')).toBe('Standard'))
  })

  it('shows a product standard, linking only to web assessment links', async () => {
    const detail = (assessmentLink: string | null) => ({
      id: STD_PG,
      snSysId: 'x',
      name: 'PostgreSQL 15',
      product: 'PostgreSQL',
      manufacturer: 'PGDG',
      status: 'Standard',
      standardCategory: 'Database',
      functionalCategory: 'Relational database',
      productType: null,
      description: 'Open-source database',
      cloudServiceType: 'PaaS',
      vmOnPremises: 'Y',
      vmCloud: 'Y',
      containerOnPremises: 'N',
      containerCloud: 'Y',
      allowedOnDesktop: 'NA',
      aiControls: null,
      remarks: null,
      lastStatusDate: '06-12-2024',
      addedDate: null,
      assessmentLink,
      softwareModels: [{ id: MODEL_PG, name: 'PostgreSQL 15' }],
      missingSince: null,
      source: null,
    })
    api.on(`GET /api/v1/trm/product-standards/${STD_PG}`, json(200, detail('https://example.test/assessment')))
    renderRoute(`/trm/product-standards/${STD_PG}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'PostgreSQL 15' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'https://example.test/assessment' })).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'PostgreSQL 15' })).toHaveAttribute('href', `/trm/software-models/${MODEL_PG}`)

    cleanup()
    vi.unstubAllGlobals()
    api = mockApi()
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    api.on(`GET /api/v1/trm/product-standards/${STD_PG}`, json(200, detail('javascript:alert(1)')))
    renderRoute(`/trm/product-standards/${STD_PG}`)
    expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument()

    cleanup()
    vi.unstubAllGlobals()
    api = mockApi()
    api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
    api.on(`GET /api/v1/trm/product-standards/${STD_PG}`, json(200, { ...detail(null), name: null, status: null }))
    renderRoute(`/trm/product-standards/${STD_PG}`)
    expect(await screen.findByRole('heading', { level: 1, name: '(no name)' })).toBeInTheDocument()
  })
})

describe('Servers', () => {
  it('lists servers and shows the services and applications on one', async () => {
    api.on('GET /api/v1/trm/servers', json(200, page([{ id: SERVER_1, name: 'SRV-CRM-01', missingSince: '2026-10-01T00:00:00.000Z' }])))
    api.on(`GET /api/v1/trm/servers/${SERVER_1}`, json(200, { id: SERVER_1, name: 'SRV-CRM-01', missingSince: null, services: [{ id: SVC_PROD, name: 'CRM Prod', environment: 'Production', applications: [{ id: APP_CRM, name: 'CRM' }] }] }))
    renderRoute('/trm/servers')
    const table = await screen.findByRole('table', { name: 'Servers' })
    expect(table).toHaveTextContent('Not in the ServiceNow export since 1 Oct 2026')
    await userEvent.click(within(table).getByRole('link', { name: 'SRV-CRM-01' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'SRV-CRM-01' })).toBeInTheDocument()
    const services = screen.getByRole('table', { name: 'Services on this server' })
    expect(within(services).getByRole('link', { name: 'CRM Prod' })).toBeInTheDocument()
    expect(within(services).getByRole('link', { name: 'CRM' })).toBeInTheDocument()
  })

  it.each([
    ['servers', 'Servers'],
    ['software-models', 'Software models'],
    ['product-standards', 'Product standards'],
  ])('filters %s by whether ServiceNow still has them, keeps Enter in the search on the page, and pages', async (list, caption) => {
    api.on(`GET /api/v1/trm/${list}`, json(200, { items: [], page: 1, pageSize: 25, total: 60 }))
    const { here } = renderRoute(`/trm/${list}`)
    expect(await screen.findByRole('table', { name: caption })).toBeInTheDocument()
    await choose('In ServiceNow', 'Missing from ServiceNow')
    await waitFor(() => expect(lastQuery(`GET /api/v1/trm/${list}`).get('missing')).toBe('true'))
    await userEvent.type(screen.getByRole('searchbox'), 'x{Enter}')
    expect(here()).toContain(`/trm/${list}`)
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(lastQuery(`GET /api/v1/trm/${list}`).get('page')).toBe('2'))
  })

  it('offers a retry when a list cannot be loaded', async () => {
    let fail = true
    api.on('GET /api/v1/trm/servers', () => (fail ? problem(500, 'Server error') : json(200, page([]))))
    renderRoute('/trm/servers')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No servers match')).toBeInTheDocument()
  })
})
