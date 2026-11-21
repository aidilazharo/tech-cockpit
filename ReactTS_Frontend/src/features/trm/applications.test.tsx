import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { APP_BILLING, APP_CRM, applicationSummary, CAP_IDENTITY, capabilities, facets, page, PORTFOLIO_GROUP, portfolios } from './fixtures'

const VIEW = ['trm:application:read']
let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/trm/facets', json(200, facets))
  api.on('GET /api/v1/trm/capabilities', json(200, { items: capabilities }))
  api.on('GET /api/v1/portfolios', json(200, { items: portfolios }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const lastQuery = () => new URLSearchParams(api.callsTo('GET /api/v1/trm/applications').at(-1)!.path.split('?')[1])

describe('Applications list', () => {
  it('lists applications with their status, capability, TIME rating and portfolios', async () => {
    signInWith(VIEW)
    api.on(
      'GET /api/v1/trm/applications',
      json(200, page([applicationSummary(), applicationSummary({ id: APP_BILLING, name: 'Billing', timeRating: null, capability: null, capabilityMismatch: true, portfolios: [], missingSince: '2026-10-20T01:00:00.000Z' })], 2)),
    )
    renderRoute('/trm/applications')

    const rows = within(await screen.findByRole('table', { name: 'Applications' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('CRM')
    expect(rows[1]).toHaveTextContent('APM-1')
    expect(rows[1]).toHaveTextContent('In Production')
    expect(rows[1]).toHaveTextContent('Identity check')
    expect(rows[1]).toHaveTextContent('Invest')
    expect(rows[1]).toHaveTextContent('Retail')
    expect(within(rows[1]).getByRole('link', { name: 'CRM' })).toHaveAttribute('href', `/trm/applications/${APP_CRM}`)
    expect(rows[2]).toHaveTextContent('Not rated')
    expect(rows[2]).toHaveTextContent('Capability to check')
    expect(rows[2]).toHaveTextContent('Not in the ServiceNow export since 20 Oct 2026')
    expect(screen.getByText('2 applications')).toBeInTheDocument()
  })

  it('filters by search, install status, capability, TIME rating, portfolio and ServiceNow presence, and clears them', async () => {
    signInWith(VIEW)
    api.on('GET /api/v1/trm/applications', json(200, page([])))
    const { here } = renderRoute('/trm/applications')
    expect(await screen.findByText('No applications match')).toBeInTheDocument()

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name or number' }), 'crm')
    await waitFor(() => expect(lastQuery().get('q')).toBe('crm'))

    const choose = async (filter: string, option: string) => {
      await userEvent.click(screen.getByRole('combobox', { name: filter }))
      await userEvent.click(await screen.findByRole('option', { name: option }))
    }
    await choose('Install status', 'Retired')
    await choose('Capability', '· · Identity check')
    await choose('TIME rating', 'Not rated')
    await choose('Portfolio', 'Group')
    await choose('In ServiceNow', 'Missing from ServiceNow')
    await waitFor(() => {
      const query = lastQuery()
      expect([query.get('installStatus'), query.get('capabilityId'), query.get('timeRating'), query.get('portfolioId'), query.get('missing')]).toEqual([
        'Retired',
        CAP_IDENTITY,
        'none',
        PORTFOLIO_GROUP,
        'true',
      ])
    })
    expect(here()).toContain('installStatus=Retired')

    await choose('Install status', 'Any install status')
    await waitFor(() => expect(lastQuery().has('installStatus')).toBe(false))
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(here()).toBe('/trm/applications'))
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('pages through the list, and keeps Enter in the search on the page', async () => {
    signInWith(VIEW)
    api.on('GET /api/v1/trm/applications', json(200, page([applicationSummary()], 60)))
    const { here } = renderRoute('/trm/applications')
    await userEvent.click(await screen.findByRole('button', { name: 'Page 3' }))
    await waitFor(() => expect(lastQuery().get('page')).toBe('3'))
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name or number' }), 'crm{Enter}')
    expect(here()).toContain('/trm/applications')
  })

  it('offers a retry when the list cannot be loaded', async () => {
    signInWith(VIEW)
    let fail = true
    api.on('GET /api/v1/trm/applications', () => (fail ? problem(500, 'Server error') : json(200, page([applicationSummary()]))))
    renderRoute('/trm/applications')
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('link', { name: 'CRM' })).toBeInTheDocument()
  })

  it('is not shown to people without TRM access', async () => {
    signInWith([])
    renderRoute('/trm/applications')
    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/trm/applications')).toHaveLength(0)
  })
})
