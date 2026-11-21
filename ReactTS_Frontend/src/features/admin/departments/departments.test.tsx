import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../../test/harness'
import { departments } from '../fixtures'

let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/departments', json(200, { items: [...departments, { id: '10000000-0000-4000-8000-000000000003', code: 'OLD', name: 'Old unit', active: false, version: 1 }] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Departments', () => {
  it('lists departments with their status', async () => {
    signInWith(['access:department:manage'])
    renderRoute('/admin/departments')

    const rows = within(await screen.findByRole('table', { name: 'Departments' })).getAllByRole('row')
    expect(rows).toHaveLength(4)
    expect(rows[1]).toHaveTextContent('Active')
    expect(rows[3]).toHaveTextContent('Disabled')
  })

  it('adds a department, upper-casing the code', async () => {
    signInWith(['access:department:manage'])
    api.on('POST /api/v1/departments', json(201, { id: '10000000-0000-4000-8000-000000000004', code: 'IT-OPS', name: 'IT Operations', active: true, version: 1 }))
    renderRoute('/admin/departments')

    await userEvent.click(await screen.findByRole('button', { name: 'Add department' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add department' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }))
    expect(await within(dialog).findByText('Enter a name')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Code' }), 'it-ops')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'IT Operations')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/departments')[0].body).toEqual({ code: 'IT-OPS', name: 'IT Operations' })
  })

  it('rejects an invalid code and shows a duplicate from the API', async () => {
    signInWith(['access:department:manage'])
    api.on('POST /api/v1/departments', problem(409, 'Conflict', 'A record with the same unique value already exists.'))
    renderRoute('/admin/departments')

    await userEvent.click(await screen.findByRole('button', { name: 'Add department' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Code' }), 'it ops!')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Name' }), 'IT')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }))
    expect(await within(dialog).findByText(/Use uppercase letters/)).toBeInTheDocument()

    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Code' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Code' }), 'IT')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add department' }))
    expect(await within(dialog).findByText('A record with the same unique value already exists.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('refuses the page without access:department:manage', async () => {
    signInWith(['access:user:read'])
    renderRoute('/admin/departments')

    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })

  it('offers a retry when departments cannot load', async () => {
    signInWith(['access:department:manage'])
    api.on('GET /api/v1/departments', problem(500, 'Internal Server Error'))
    renderRoute('/admin/departments')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/departments', json(200, { items: departments }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Departments' })).toBeInTheDocument()
  })
})
