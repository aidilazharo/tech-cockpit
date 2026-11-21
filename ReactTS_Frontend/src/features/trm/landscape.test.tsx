import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { calls } from '../sad/calls/fixtures'
import { APP_BILLING, APP_CRM, applicationSummary, capabilities, DOMAIN_CUSTOMER, domains, landscapeApp, MODEL_PG, portfolios, PORTFOLIO_GROUP, STD_PG, page, technology } from './fixtures'

let api: ReturnType<typeof mockApi>
const apps = [
  landscapeApp(),
  landscapeApp({ id: APP_BILLING, name: 'Billing', installStatus: 'Implementing', timeRating: null, capabilityId: null, subdomainIds: [], plannedGoLive: null, plannedPhaseOut: null, plannedRetirement: null, missingSince: '2026-10-01T00:00:00.000Z' }),
  landscapeApp({ id: '80000000-0000-4000-8000-000000000003', name: 'HR Portal', installStatus: null, capabilityMismatch: true, subdomainIds: [], plannedGoLive: null, plannedPhaseOut: null, plannedRetirement: null, vendorEndOfSupport: '2028-01-01' }),
]

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/trm/landscape', json(200, { applications: apps }))
  api.on('GET /api/v1/trm/capabilities', json(200, { items: capabilities }))
  api.on('GET /api/v1/trm/domains', json(200, { items: domains }))
  api.on('GET /api/v1/portfolios', json(200, { items: portfolios }))
  api.on('GET /api/v1/trm/technology', json(200, technology))
  signInWith(['trm:application:read'])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const choose = async (filter: string, option: string) => {
  await userEvent.click(screen.getByRole('combobox', { name: filter }))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('Landscape', () => {
  it('shows the capability map with tiles under each capability, coloured by lifecycle with the value as text', async () => {
    renderRoute('/trm/landscape')
    const customer = await screen.findByRole('region', { name: 'Customer' })
    const identity = within(customer).getByRole('region', { name: 'Identity check' })
    const crm = within(identity).getByRole('link', { name: /^CRM/ })
    expect(crm).toHaveAttribute('href', `/trm/applications/${APP_CRM}`)
    expect(crm).toHaveTextContent('In Production')
    expect(crm.className).toContain('border-l-data-visualisation-category')

    const toCheck = screen.getByRole('region', { name: 'To check' })
    expect(within(toCheck).getByRole('link', { name: /Billing/ })).toHaveTextContent('Missing from ServiceNow')
    expect(within(toCheck).getByRole('link', { name: /HR Portal/ })).toHaveTextContent('No lifecycle status')
    expect(within(toCheck).getByRole('link', { name: /HR Portal/ })).toHaveTextContent('Capability to check')
    expect(screen.getByRole('list', { name: 'Colour legend' })).toHaveTextContent('Implementing (1)')

    await choose('Colour by', 'TIME rating')
    expect(within(identity).getByRole('link', { name: /^CRM/ })).toHaveTextContent('Invest')
    expect(screen.getByRole('list', { name: 'Colour legend' })).toHaveTextContent('Invest (2)Migrate (0)Eliminate (0)Not rated (1)')
    await choose('Colour by', 'Technical fit')
    expect(within(identity).getByRole('link', { name: /^CRM/ })).toHaveTextContent('2 Poor')
  })

  it('filters by portfolio, domain and search', async () => {
    const { here } = renderRoute('/trm/landscape')
    await screen.findByRole('region', { name: 'Customer' })
    await choose('Portfolio', 'Group')
    await choose('Domain', 'Customer')
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name or number' }), 'crm')
    await waitFor(() => {
      const query = new URLSearchParams(api.callsTo('GET /api/v1/trm/landscape').at(-1)!.path.split('?')[1])
      expect([query.get('portfolioId'), query.get('domainId'), query.get('q')]).toEqual([PORTFOLIO_GROUP, DOMAIN_CUSTOMER, 'crm'])
    })
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(here()).toBe('/trm/landscape'))
  })

  it('groups applications by domain and sub-domain, with the rest under "Not in any domain"', async () => {
    renderRoute('/trm/landscape')
    await userEvent.click(await screen.findByRole('tab', { name: 'Domains' }))
    const customer = await screen.findByRole('region', { name: 'Customer' })
    expect(within(within(customer).getByRole('region', { name: 'Sales' })).getByRole('link', { name: /^CRM/ })).toBeInTheDocument()
    expect(within(customer).queryByRole('region', { name: 'Service' })).not.toBeInTheDocument() // inactive and empty
    const nowhere = screen.getByRole('region', { name: 'Not in any domain' })
    expect(within(nowhere).getAllByRole('link')).toHaveLength(2)
  })

  it('counts applications per install status and draws the plan-date timeline', async () => {
    renderRoute('/trm/landscape?view=lifecycle')
    const counts = await screen.findByRole('region', { name: 'Applications by install status' })
    expect(within(counts).getByRole('link', { name: /In Production/ })).toHaveAttribute('href', '/trm/applications?installStatus=In%20Production')
    expect(counts).toHaveTextContent('1No lifecycle status')
    const timeline = screen.getByRole('list', { name: 'Lifecycle timeline' })
    const rows = within(timeline).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Go-live 01/01/2027 · Phase-out 30/06/2029 · Retirement 31/12/2030 · Vendor end of support —')
    const [inUse, phasingOut] = rows[0].querySelectorAll<HTMLElement>('[data-bar]')
    expect(inUse).toHaveClass('bg-data-visualisation-positive')
    expect(phasingOut).toHaveClass('bg-data-visualisation-category-3')
    expect(Number.parseFloat(inUse.style.left) + Number.parseFloat(inUse.style.width)).toBeCloseTo(Number.parseFloat(phasingOut.style.left), 5) // in use until the phase-out date
    // HR Portal has only a vendor end of support: a mark, no bar.
    expect(rows[1].querySelectorAll('[data-bar]')).toHaveLength(0)
    expect(rows[1].querySelector('[title="Vendor end of support"]')).not.toBeNull()
    expect(screen.getByRole('list', { name: 'Timeline legend' })).toHaveTextContent('In usePhasing outVendor end of support')
  })

  it('says when no application has plan dates', async () => {
    api.on('GET /api/v1/trm/landscape', json(200, { applications: [landscapeApp({ plannedGoLive: null, plannedPhaseOut: null, plannedRetirement: null })] }))
    renderRoute('/trm/landscape?view=lifecycle')
    expect(await screen.findByText('No application has lifecycle plan dates yet')).toBeInTheDocument()
  })

  it('shows the dependencies of the application picked: who calls it and what it calls, from approved SADs', async () => {
    api.on('GET /api/v1/trm/applications', json(200, page([applicationSummary()])))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}/calls`, json(200, { items: calls }))
    renderRoute('/trm/landscape?view=dependencies')
    expect(await screen.findByRole('tab', { name: 'Dependencies', selected: true })).toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
    expect(screen.getByText('Pick an application to see the applications calling it and those it calls.')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('combobox', { name: 'Application' }), 'CR')
    await userEvent.click(await screen.findByRole('option', { name: /^CRM/ }))
    expect(await screen.findByRole('table', { name: 'Applications calling CRM (2)' })).toHaveTextContent('CRM Customer API')
    expect(screen.getByRole('table', { name: 'Applications CRM calls (2)' })).toHaveTextContent('Invoice file')
  })

  it('shows product standards per technology layer and opens one to see its models and applications', async () => {
    api.on(`GET /api/v1/trm/technology/standards/${STD_PG}`, json(200, { models: [{ id: MODEL_PG, name: 'PostgreSQL 15', productVersion: '15', applications: [{ id: APP_CRM, name: 'CRM' }] }] }))
    renderRoute('/trm/landscape?view=technology')
    const data = await screen.findByRole('region', { name: 'Data & Analytics' })
    const tile = within(data).getByRole('button', { name: /PostgreSQL 15/ })
    expect(tile).toHaveTextContent('Standard')
    expect(tile).toHaveTextContent('2 applications · 1 software models')
    expect(within(screen.getByRole('region', { name: 'Security & Identity' })).getByText('No product standards')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Not mapped' })).getByRole('button', { name: /Okta/ })).toHaveTextContent('Restricted')

    await userEvent.click(tile)
    expect(tile).toHaveAttribute('aria-expanded', 'true')
    expect(await within(data).findByRole('link', { name: 'CRM' })).toHaveAttribute('href', `/trm/applications/${APP_CRM}`)
    await userEvent.click(tile)
    expect(tile).toHaveAttribute('aria-expanded', 'false')
  })

  it('explains a standard used by no model, and offers retries when views cannot load', async () => {
    api.on('GET /api/v1/trm/technology/standards/84000000-0000-4000-8000-000000000009', json(200, { models: [] }))
    renderRoute('/trm/landscape?view=technology')
    await userEvent.click(await screen.findByRole('button', { name: /Okta/ }))
    expect(await screen.findByText('No software models use this standard')).toBeInTheDocument()
  })

  it.each([
    ['capability map', '', 'GET /api/v1/trm/capabilities', { items: capabilities }],
    ['domains', '?view=domains', 'GET /api/v1/trm/domains', { items: domains }],
    ['technology view', '?view=technology', 'GET /api/v1/trm/technology', technology],
  ])('offers a retry when the %s cannot be loaded', async (_name, query, route, body) => {
    let fail = true
    api.on(route, () => (fail ? problem(500, 'Server error') : json(200, body)))
    renderRoute(`/trm/landscape${query}`)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument())
  })

  it("offers a retry when a standard's use cannot be loaded", async () => {
    let fail = true
    api.on(`GET /api/v1/trm/technology/standards/${STD_PG}`, () => (fail ? problem(500, 'Server error') : json(200, { models: [] })))
    renderRoute('/trm/landscape?view=technology')
    await userEvent.click(await screen.findByRole('button', { name: /PostgreSQL 15/ }))
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByText('No software models use this standard')).toBeInTheDocument()
  })

  it('says when there are no domains yet', async () => {
    api.on('GET /api/v1/trm/domains', json(200, { items: [] }))
    renderRoute('/trm/landscape?view=domains')
    expect(await screen.findByText(/No domains/)).toBeInTheDocument()
  })

  it('shows an active domain that has no sub-domains yet, and keeps Enter in the search on the page', async () => {
    api.on('GET /api/v1/trm/domains', json(200, { items: [{ ...domains[0], subdomains: [] }, { ...domains[0], id: '8a000000-0000-4000-8000-0000000000aa', name: 'Old', active: false, subdomains: [] }] }))
    const { here } = renderRoute('/trm/landscape?view=domains')
    const customer = await screen.findByRole('region', { name: 'Customer' })
    expect(customer).toHaveTextContent(/No sub-domains/)
    expect(screen.queryByRole('region', { name: 'Old' })).not.toBeInTheDocument()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name or number' }), 'crm{Enter}')
    expect(here()).toContain('/trm/landscape')
  })

  it('offers a retry when the landscape cannot be loaded', async () => {
    let fail = true
    api.on('GET /api/v1/trm/landscape', () => (fail ? problem(500, 'Server error') : json(200, { applications: apps })))
    renderRoute('/trm/landscape')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('region', { name: 'Customer' })).toBeInTheDocument()
  })
})
