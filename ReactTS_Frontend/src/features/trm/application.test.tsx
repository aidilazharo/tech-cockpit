import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { calls } from '../sad/calls/fixtures'
import { overview as sadOverview } from '../sad/fixtures'
import { APP_CRM, application, CAP_CUSTOMER, MODEL_PG, PORTFOLIO_GROUP, PORTFOLIO_RETAIL, portfolios, SERVER_1, STD_PG, SVC_PROD, SVC_SALES } from './fixtures'

const VIEW = ['trm:application:read']
let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/portfolios', json(200, { items: portfolios }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const section = (name: string) => screen.getByRole('region', { name })

describe('Application page', () => {
  it('shows the TRM assessment, capability path, ServiceNow details, people, costs and services', async () => {
    signInWith([...VIEW, 'sad:application-details:read'])
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application()))
    renderRoute(`/trm/applications/${APP_CRM}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'CRM' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Solution Architecture Document' })).toHaveAttribute('href', `/sad/${APP_CRM}`)
    const assessment = section('TRM assessment')
    expect(assessment).toHaveTextContent('Invest')
    expect(assessment).toHaveTextContent('Strategic platform')
    expect(assessment).toHaveTextContent('4 Good')
    expect(assessment).toHaveTextContent('2 Poor')
    expect(assessment).toHaveTextContent('31/12/2030')

    expect(within(section('Capability')).getByRole('link', { name: 'Customer' })).toHaveAttribute('href', `/trm/capabilities/${CAP_CUSTOMER}`)
    expect(section('Portfolios')).toHaveTextContent('Retail')
    const details = section('ServiceNow details')
    expect(details).toHaveTextContent('In Production')
    expect(details).toHaveTextContent('01:30')
    expect(details).toHaveTextContent('15-01-2025 10:30:00')
    expect(section('People')).toHaveTextContent('Person Owner')
    const costs = section('Annual costs (thousands of USD)')
    expect(costs).toHaveTextContent('136.22')
    expect(costs).toHaveTextContent('62.50')

    const services = section('Services')
    expect(within(services).getByRole('link', { name: 'CRM Prod' })).toHaveAttribute('href', `/trm/services/${SVC_PROD}`)
    expect(within(services).getByRole('link', { name: 'Sales' })).toHaveAttribute('href', `/trm/services/${SVC_SALES}`)
    expect(within(services).getByRole('link', { name: 'SRV-CRM-01' })).toHaveAttribute('href', `/trm/servers/${SERVER_1}`)
    expect(within(services).getByRole('link', { name: 'PostgreSQL 15' })).toHaveAttribute('href', `/trm/software-models/${MODEL_PG}`)
    expect(within(services).getByRole('link', { name: 'Standard: PostgreSQL 15' })).toHaveAttribute('href', `/trm/product-standards/${STD_PG}`)
    expect(services).toHaveTextContent('15.4')
    expect(services).toHaveTextContent('Primary')

    await userEvent.click(screen.getByText(/All ServiceNow fields \(/))
    const fields = screen.getByRole('table', { name: 'All ServiceNow fields' })
    expect(fields).toHaveTextContent('u_annual_license_cost_k_usd')
    expect(fields).not.toHaveTextContent('u_comment')
    expect(within(fields).getByRole('row', { name: /u_application_manager/ })).toHaveTextContent('Restricted')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show empty fields' }))
    expect(fields).toHaveTextContent('u_comment')
  })

  it('shows Restricted for hidden costs, names and fields, and no edit buttons without rights', async () => {
    signInWith(VIEW)
    const hidden = application({
      people: { itApplicationOwner: null, applicationLead: null, applicationManager: null },
      costs: { licence: null, internalSupport: null, externalSupport: null, infraOnPremises: null, infraCloud: null },
      restricted: ['licenceCost', 'internalSupportCost', 'externalSupportCost', 'infraOnPremisesCost', 'infraCloudCost', 'itApplicationOwner', 'applicationLead', 'applicationManager'],
      canEdit: false,
      source: null,
      missingSince: '2026-10-20T01:00:00.000Z',
      capability: { path: [], mismatch: true, fields: { group: null, family: 'Onboarding', category: null } },
      services: [],
      portfolios: [],
    })
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, hidden))
    renderRoute(`/trm/applications/${APP_CRM}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'CRM' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Solution Architecture Document' })).not.toBeInTheDocument()
    expect(within(section('People')).getAllByText('Restricted')).toHaveLength(3)
    expect(within(section('Annual costs (thousands of USD)')).getAllByText('Restricted')).toHaveLength(5)
    expect(screen.queryByText(/All ServiceNow fields/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit TRM assessment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change portfolios' })).not.toBeInTheDocument()
    expect(screen.getByText('Not in the ServiceNow export since 20 Oct 2026')).toBeInTheDocument()
    expect(section('Capability')).toHaveTextContent('The capability fields in ServiceNow do not follow the capability tree (group: —, family: Onboarding, category: —)')
    expect(section('Portfolios')).toHaveTextContent('Not in any portfolio')
    expect(section('Services')).toHaveTextContent('No services linked')
  })

  it('shows Restricted only for the fields hidden from the reader', async () => {
    signInWith(VIEW)
    const app = application()
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application({ costs: { ...app.costs, licence: null }, people: { ...app.people, applicationLead: null }, restricted: ['licenceCost', 'applicationLead'] })))
    renderRoute(`/trm/applications/${APP_CRM}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'CRM' })).toBeInTheDocument()
    expect(within(section('People')).getAllByText('Restricted')).toHaveLength(1)
    expect(within(section('Annual costs (thousands of USD)')).getAllByText('Restricted')).toHaveLength(1)
  })

  it('edits the TRM assessment', async () => {
    signInWith([...VIEW, 'trm:application:update'])
    let current = application()
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, () => json(200, current))
    api.on(`PATCH /api/v1/trm/applications/${APP_CRM}`, (call) => {
      const trm = { ...(call.body as Record<string, unknown>) }
      delete trm.version
      current = application({ version: 4, trm: { ...current.trm, ...trm } })
      return json(200, current)
    })
    renderRoute(`/trm/applications/${APP_CRM}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit TRM assessment' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit TRM assessment' })
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'TIME rating' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Migrate' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Technical fit' }))
    await userEvent.click(await screen.findByRole('option', { name: '3 Fair' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Planned phase-out' }), '01062028')
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Rationale (optional)' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PATCH /api/v1/trm/applications/${APP_CRM}`)[0].body).toEqual({
      version: 3,
      timeRating: 'migrate',
      timeRationale: null,
      functionalFit: 4,
      technicalFit: 3,
      plannedGoLive: null,
      plannedPhaseOut: '2028-06-01',
      plannedRetirement: '2030-12-31',
      vendorEndOfSupport: null,
    })
    expect(section('TRM assessment')).toHaveTextContent('Migrate')
  })

  it('keeps the dialog open with the reason when saving fails, and can be cancelled', async () => {
    signInWith([...VIEW, 'trm:application:update'])
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application({ trm: { ...application().trm, timeRating: null, timeRationale: null, functionalFit: null, technicalFit: null } })))
    api.on(`PATCH /api/v1/trm/applications/${APP_CRM}`, problem(409, 'Conflict', 'Someone else changed this application. Reload and try again.'))
    renderRoute(`/trm/applications/${APP_CRM}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit TRM assessment' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Someone else changed this application. Reload and try again.')).toBeInTheDocument()
    expect(api.callsTo(`PATCH /api/v1/trm/applications/${APP_CRM}`)[0].body).toMatchObject({ timeRating: null, timeRationale: null, functionalFit: null, technicalFit: null })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Edit TRM assessment' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('lets system admins change the portfolios', async () => {
    signInWith([...VIEW, 'trm:application-portfolio:manage'])
    let current = application({ canSetPortfolios: true })
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, () => json(200, current))
    api.on(`PUT /api/v1/trm/applications/${APP_CRM}/portfolios`, () => {
      current = application({ canSetPortfolios: true, portfolios: [{ id: PORTFOLIO_GROUP, name: 'Group' }] })
      return json(200, current)
    })
    renderRoute(`/trm/applications/${APP_CRM}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Change portfolios' }))
    const dialog = await screen.findByRole('dialog', { name: 'Portfolios of CRM' })
    expect(within(dialog).getByRole('checkbox', { name: 'Retail' })).toBeChecked()
    expect(within(dialog).queryByRole('checkbox', { name: /Old/ })).not.toBeInTheDocument() // inactive, not assigned
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Group' }))
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Retail' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PUT /api/v1/trm/applications/${APP_CRM}/portfolios`)[0].body).toEqual({ portfolioIds: [PORTFOLIO_GROUP] })
    expect(section('Portfolios')).toHaveTextContent('Group')
    expect(section('Portfolios')).not.toHaveTextContent('Retail')
  })

  it('keeps an assigned inactive portfolio on offer and shows save failures', async () => {
    signInWith([...VIEW, 'trm:application-portfolio:manage'])
    const old = portfolios[2]
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application({ canSetPortfolios: true, portfolios: [{ id: old.id, name: old.name }, { id: PORTFOLIO_RETAIL, name: 'Retail' }] })))
    api.on(`PUT /api/v1/trm/applications/${APP_CRM}/portfolios`, problem(422, 'Unprocessable', 'Inactive portfolios cannot be added'))
    renderRoute(`/trm/applications/${APP_CRM}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Change portfolios' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('checkbox', { name: 'Old (inactive)' })).toBeChecked()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Inactive portfolios cannot be added')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Change portfolios' }))
    await screen.findByRole('dialog')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it("shows the applications calling it and those it calls, from every application's approved SAD", async () => {
    signInWith(VIEW)
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application()))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}/calls`, json(200, { items: calls }))
    renderRoute(`/trm/applications/${APP_CRM}`)
    const connections = await screen.findByRole('region', { name: 'Connections with other applications' })
    expect(await within(connections).findByRole('table', { name: 'Applications calling CRM (2)' })).toHaveTextContent('Customer Portal (APM-0005)')
    expect(within(connections).getByRole('table', { name: 'Applications CRM calls (2)' })).toHaveTextContent('Billing API: create invoice')
  })

  it("flags local authentication for readers of the SAD's section 5", async () => {
    signInWith([...VIEW, 'sad:security-design:read'])
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application()))
    api.on(`GET /api/v1/sad/applications/${APP_CRM}`, json(200, sadOverview({ localAuthentication: 'draft' })))
    renderRoute(`/trm/applications/${APP_CRM}`)
    expect(await screen.findByText('Local authentication (draft)')).toBeInTheDocument()
  })

  it('shows no flag without SAD permissions, or when the SAD cannot be read', async () => {
    signInWith(VIEW)
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application()))
    renderRoute(`/trm/applications/${APP_CRM}`)
    await screen.findByRole('heading', { level: 1 })
    expect(api.callsTo(`GET /api/v1/sad/applications/${APP_CRM}`)).toHaveLength(0)
  })

  it('says when the application does not exist or cannot be loaded', async () => {
    signInWith(VIEW)
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, problem(404, 'Not Found'))
    renderRoute(`/trm/applications/${APP_CRM}`)
    expect(await screen.findByText('This application does not exist, or it is not one you can see.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'All applications' })).toHaveAttribute('href', '/trm/applications')
  })

  it('offers a retry when loading fails', async () => {
    signInWith(VIEW)
    let fail = true
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, () => (fail ? problem(500, 'Server error') : json(200, application())))
    renderRoute(`/trm/applications/${APP_CRM}`)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    fail = false
    await userEvent.click(retry)
    expect(await screen.findByRole('heading', { level: 1, name: 'CRM' })).toBeInTheDocument()
  })
})
