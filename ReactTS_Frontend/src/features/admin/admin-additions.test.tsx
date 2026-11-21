import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../test/harness'
import { apiKey, assignment, departments, role, user } from './fixtures'

let api: ReturnType<typeof mockApi>
const ana = user()

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/me/notifications/unread-count', json(200, { unread: 0 }))
  api.on('GET /api/v1/departments', json(200, { items: departments }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Edit a department', () => {
  it('renames and deactivates a department, sending its version', async () => {
    signInWith(['access:department:manage'])
    api.on(`PATCH /api/v1/departments/${departments[0].id}`, json(200, { ...departments[0], name: 'IT Services', active: false, version: 2 }))
    renderRoute('/admin/departments')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Information Technology' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Information Technology' })
    expect(dialog).toHaveTextContent('Code: IT')
    const name = within(dialog).getByRole('textbox', { name: 'Name' })
    await userEvent.clear(name)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(within(dialog).getByText('Enter a name')).toBeInTheDocument()
    await userEvent.type(name, 'IT Services')
    await userEvent.click(within(dialog).getByRole('checkbox', { name: /Active/ }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PATCH /api/v1/departments/${departments[0].id}`)[0].body).toEqual({ name: 'IT Services', active: false, version: 1 })
  })

  it('keeps the dialog open with the reason when someone else changed it', async () => {
    signInWith(['access:department:manage'])
    api.on(`PATCH /api/v1/departments/${departments[0].id}`, problem(409, 'Conflict', 'The record was changed by someone else. Reload and try again.'))
    renderRoute('/admin/departments')

    await userEvent.click(await screen.findByRole('button', { name: 'Edit Information Technology' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    expect(await within(dialog).findByText('The record was changed by someone else. Reload and try again.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  })
})

describe("A user's API keys on their page", () => {
  const detail = () => {
    api.on(`GET /api/v1/users/${ana.id}`, json(200, ana))
    api.on(`GET /api/v1/users/${ana.id}/role-assignments`, json(200, { items: [] }))
  }

  it('lists the keys of the user and revokes one, for administrators who may', async () => {
    signInWith(['access:user:read', 'apikey:any:revoke'])
    detail()
    api.on(
      `GET /api/v1/users/${ana.id}/api-keys`,
      json(200, { items: [apiKey(), apiKey({ id: '50000000-0000-4000-8000-000000000002', name: 'Old', revokedAt: '2026-10-01T00:00:00.000Z' }), apiKey({ id: '50000000-0000-4000-8000-000000000003', name: 'Expired', expiresAt: '2026-01-01T00:00:00.000Z' })] }),
    )
    api.on('POST /api/v1/api-keys/50000000-0000-4000-8000-000000000001/revoke', json(200, apiKey({ revokedAt: '2026-10-21T00:00:00.000Z' })))
    renderRoute(`/admin/users/${ana.id}`)

    const rows = within(await screen.findByRole('table', { name: 'API keys of Ana Lim' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Active')
    expect(rows[2]).toHaveTextContent('Revoked')
    expect(rows[3]).toHaveTextContent('Expired')
    await userEvent.click(screen.getByRole('button', { name: 'Revoke ServiceNow sync' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Revoke ServiceNow sync' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Revoke' }))

    await waitFor(() => expect(api.callsTo('POST /api/v1/api-keys/50000000-0000-4000-8000-000000000001/revoke')).toHaveLength(1))
  })

  it('is hidden without apikey:any:revoke, and offers a retry on failure', async () => {
    signInWith(['access:user:read', 'apikey:any:revoke'])
    detail()
    api.on(`GET /api/v1/users/${ana.id}/api-keys`, problem(500, 'Internal Server Error'))
    renderRoute(`/admin/users/${ana.id}`)

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on(`GET /api/v1/users/${ana.id}/api-keys`, json(200, { items: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('This person has no API keys')).toBeInTheDocument()
  })
})

describe('Role assignment dates', () => {
  it('sends a future first day and an inclusive last day in Malaysia time, and checks their order', async () => {
    signInWith(['access:user:read', 'access:assignment:read', 'access:assignment:manage', 'access:role:read'])
    api.on(`GET /api/v1/users/${ana.id}`, json(200, ana))
    api.on(`GET /api/v1/users/${ana.id}/role-assignments`, json(200, { items: [assignment({ validTo: '2099-12-31T16:00:00.000Z' })] }))
    api.on('GET /api/v1/roles', json(200, { items: [role()] }))
    api.on('POST /api/v1/role-assignments', json(201, assignment()))
    renderRoute(`/admin/users/${ana.id}`)

    expect(within(await screen.findByRole('table', { name: 'Role assignments' })).getAllByRole('row')[1]).toHaveTextContent('31 Dec 2099')
    await userEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'PMO' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'First day' }), '01012099')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Last day' }), '31122099')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))

    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/role-assignments')[0]?.body).toEqual({
        userId: ana.id,
        roleCode: 'pmo',
        scopeType: 'global',
        validFrom: '2098-12-31T16:00:00.000Z',
        validTo: '2099-12-31T16:00:00.000Z',
      }),
    )
  })
})
