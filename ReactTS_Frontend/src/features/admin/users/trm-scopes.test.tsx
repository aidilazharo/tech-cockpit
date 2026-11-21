import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, renderRoute, signInWith } from '../../../test/harness'
import { APP_CRM, application, applicationSummary, PORTFOLIO_RETAIL, portfolios } from '../../trm/fixtures'
import { assignment, departments, role, user } from '../fixtures'

const ASSIGNER = ['access:user:read', 'access:assignment:read', 'access:assignment:manage', 'access:role:read']
let api: ReturnType<typeof mockApi>
const ana = user()

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/departments', json(200, { items: departments }))
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on(`GET /api/v1/users/${ana.id}`, json(200, ana))
  api.on('GET /api/v1/roles', json(200, { items: [role({ code: 'application-owner-team', name: 'Application owner team' })] }))
  api.on('GET /api/v1/portfolios', json(200, { items: portfolios }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Role assignment: portfolio and application scopes', () => {
  it('names portfolio and application scopes', async () => {
    signInWith([...ASSIGNER, 'trm:application:read'])
    api.on(
      `GET /api/v1/users/${ana.id}/role-assignments`,
      json(200, {
        items: [
          assignment({ roleName: 'Portfolio lead', scopeType: 'portfolio', scopeId: PORTFOLIO_RETAIL }),
          assignment({ id: '40000000-0000-4000-8000-000000000002', roleName: 'Application owner team', scopeType: 'application', scopeId: APP_CRM }),
        ],
      }),
    )
    api.on(`GET /api/v1/trm/applications/${APP_CRM}`, json(200, application()))
    renderRoute(`/admin/users/${ana.id}`)
    const rows = within(await screen.findByRole('table', { name: 'Role assignments' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Portfolio: Retail')
    await waitFor(() => expect(rows[2]).toHaveTextContent('Application: CRM'))
  })

  it('assigns a role for one application, found by search', async () => {
    signInWith([...ASSIGNER, 'trm:application:read'])
    api.on(`GET /api/v1/users/${ana.id}/role-assignments`, json(200, { items: [] }))
    api.on('GET /api/v1/trm/applications', json(200, { items: [applicationSummary()], page: 1, pageSize: 25, total: 1 }))
    api.on('POST /api/v1/role-assignments', json(201, assignment()))
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Assign role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Application owner team' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Where it applies' }))
    await userEvent.click(await screen.findByRole('option', { name: 'One application' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))
    expect(await within(dialog).findByText('Select an application')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByRole('combobox', { name: 'Application' }), 'CR')
    await userEvent.click(await screen.findByRole('option', { name: /CRM/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/role-assignments')[0].body).toEqual({ userId: ana.id, roleCode: 'application-owner-team', scopeType: 'application', scopeId: APP_CRM })
  })

  it('assigns a role for one portfolio', async () => {
    signInWith([...ASSIGNER, 'trm:application:read'])
    api.on(`GET /api/v1/users/${ana.id}/role-assignments`, json(200, { items: [] }))
    api.on('POST /api/v1/role-assignments', json(201, assignment()))
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Assign role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Application owner team' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Where it applies' }))
    await userEvent.click(await screen.findByRole('option', { name: 'One portfolio' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))
    expect(await within(dialog).findByText('Select a portfolio')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Portfolio' }))
    expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument() // inactive
    await userEvent.click(await screen.findByRole('option', { name: 'Retail' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/role-assignments')[0].body).toMatchObject({ scopeType: 'portfolio', scopeId: PORTFOLIO_RETAIL })
  })

  it('offers only company-wide and department scopes to people without TRM access, and shows unknown scopes by id', async () => {
    signInWith(ASSIGNER)
    api.on(`GET /api/v1/users/${ana.id}/role-assignments`, json(200, { items: [assignment({ scopeType: 'application', scopeId: APP_CRM })] }))
    renderRoute(`/admin/users/${ana.id}`)
    const rows = within(await screen.findByRole('table', { name: 'Role assignments' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent(`Application: ${APP_CRM}`)
    await userEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Where it applies' }))
    expect(await screen.findByRole('option', { name: 'One department' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'One application' })).not.toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/portfolios')).toHaveLength(0)
  })
})
