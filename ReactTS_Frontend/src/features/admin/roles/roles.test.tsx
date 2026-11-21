import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, problem, renderRoute, signInWith } from '../../../test/harness'
import { permissionCatalogue, role, systemAdminRole } from '../fixtures'

const MANAGE = ['access:role:read', 'access:role:manage']
const custom = role({ id: '30000000-0000-4000-8000-000000000002', code: 'auditor', name: 'Auditor', isSystem: false, permissions: ['audit:log:read'], description: null })
let api: ReturnType<typeof mockApi>

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/permissions', json(200, { items: permissionCatalogue }))
  api.on('GET /api/v1/roles', json(200, { items: [role(), custom, systemAdminRole] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Roles list', () => {
  it('lists roles with their permission count and type', async () => {
    signInWith(MANAGE)
    renderRoute('/admin/roles')

    const rows = within(await screen.findByRole('table', { name: 'Roles' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('PMO')
    expect(rows[1]).toHaveTextContent('System role')
    expect(rows[2]).toHaveTextContent('Auditor')
    expect(rows[2]).toHaveTextContent('Custom')
    expect(screen.getByRole('button', { name: 'New role' })).toBeInTheDocument()
  })

  it('sorts roles by name', async () => {
    signInWith(MANAGE)
    renderRoute('/admin/roles')

    await userEvent.click(await screen.findByRole('button', { name: 'Name' }))

    const rows = within(screen.getByRole('table', { name: 'Roles' })).getAllByRole('row')
    expect(rows.slice(1).map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual(['Auditor', 'PMO', 'System administrator'])
  })

  it('only lets managers create roles', async () => {
    signInWith(['access:role:read'])
    renderRoute('/admin/roles')

    await screen.findByRole('table', { name: 'Roles' })
    expect(screen.queryByRole('button', { name: 'New role' })).not.toBeInTheDocument()
  })

  it('offers a retry when roles cannot load', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/roles', problem(503, 'Service Unavailable'))
    renderRoute('/admin/roles')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/roles', json(200, { items: [role()] }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Roles' })).toBeInTheDocument()
  })
})

describe('Role editor', () => {
  it('creates a role with permissions and data access, after validating the code', async () => {
    signInWith(MANAGE)
    const created = role({ id: '30000000-0000-4000-8000-000000000003', code: 'portfolio-lead', name: 'Portfolio lead', isSystem: false })
    api.on('POST /api/v1/roles', json(201, created))
    api.on(`GET /api/v1/roles/${created.id}`, json(200, created))
    const { here } = renderRoute('/admin/roles')

    await userEvent.click(await screen.findByRole('button', { name: 'New role' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'New role' })).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Name' }), 'Portfolio lead')
    await userEvent.type(screen.getByRole('textbox', { name: 'Code' }), 'Portfolio Lead')
    await userEvent.click(screen.getByRole('button', { name: 'Create role' }))
    expect(await screen.findByText(/Use 2–50 lowercase letters/)).toBeInTheDocument()

    await userEvent.clear(screen.getByRole('textbox', { name: 'Code' }))
    await userEvent.type(screen.getByRole('textbox', { name: 'Code' }), 'portfolio-lead')
    await userEvent.click(screen.getByRole('checkbox', { name: 'See approval progress and where it is waiting' }))
    expect(screen.getByRole('checkbox', { name: /Can act for staff/ })).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(screen.getByRole('checkbox', { name: /Can act for staff/ }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Financial data' }))
    await userEvent.click(await screen.findByRole('option', { name: "Within the role's scope" }))
    await userEvent.click(screen.getByRole('button', { name: 'Create role' }))

    await waitFor(() => expect(here()).toBe(`/admin/roles/${created.id}`))
    expect(api.callsTo('POST /api/v1/roles')[0].body).toEqual({
      code: 'portfolio-lead',
      name: 'Portfolio lead',
      permissions: ['approvals:instance:read'],
      dataAccess: { financial: 'scope', contract: 'none', personal: 'none' },
      canActForStaff: true,
    })
  })

  it('groups permissions by module', async () => {
    signInWith(MANAGE)
    renderRoute('/admin/roles/new')

    expect(await screen.findByRole('group', { name: 'Access control' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Approvals' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Audit log' })).getByRole('checkbox')).toHaveAccessibleDescription('audit:log:read')
  })

  it('sets SAD access per section, View and Edit, where Edit includes View', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, { ...custom, permissions: ['sad:application-details:read'] }))
    api.on(`PATCH /api/v1/roles/${custom.id}`, json(200, custom))
    renderRoute(`/admin/roles/${custom.id}`)

    const sad = await screen.findByRole('group', { name: 'Solution Architecture Documents (SAD)' })
    const grid = within(sad).getByRole('table', { name: 'Which SAD sections this role can view and edit' })
    expect(within(grid).getAllByRole('row')[1]).toHaveTextContent('Application Details')
    expect(within(grid).getByRole('checkbox', { name: 'View Application Details' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(grid).getByRole('checkbox', { name: 'Edit Security Architecture Design' }))
    expect(within(grid).getByRole('checkbox', { name: 'View Security Architecture Design' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(within(grid).getByRole('checkbox', { name: 'View Application Details' }))
    await userEvent.click(within(grid).getByRole('checkbox', { name: 'Edit Application Details' }))
    await userEvent.click(within(grid).getByRole('checkbox', { name: 'Edit Application Details' }))
    await userEvent.click(within(sad).getByRole('checkbox', { name: 'Maintain the standard backup retention list that SADs use' }))
    await userEvent.click(within(sad).getByRole('checkbox', { name: 'Maintain the standard backup retention list that SADs use' }))
    await userEvent.click(within(sad).getByRole('checkbox', { name: 'Maintain the standard backup retention list that SADs use' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/roles/${custom.id}`)).toHaveLength(1))
    expect([...(api.callsTo(`PATCH /api/v1/roles/${custom.id}`)[0].body as { permissions: string[] }).permissions].sort()).toEqual([
      'sad:application-details:read',
      'sad:retention:manage',
      'sad:security-design:read',
      'sad:security-design:update',
    ])
  })

  it('shows a section the role may only edit (e.g. set through the API) as viewable too', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, { ...custom, permissions: ['sad:security-design:update'] }))
    renderRoute(`/admin/roles/${custom.id}`)
    const grid = await screen.findByRole('table', { name: 'Which SAD sections this role can view and edit' })
    expect(within(grid).getByRole('checkbox', { name: 'View Security Architecture Design' })).toHaveAttribute('aria-checked', 'true')
  })

  it('saves changes with the version and confirms', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, custom))
    api.on(`PATCH /api/v1/roles/${custom.id}`, json(200, { ...custom, permissions: [], version: 3 }))
    renderRoute(`/admin/roles/${custom.id}`)

    const box = await screen.findByRole('checkbox', { name: 'Read the audit log' })
    expect(box).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('textbox', { name: 'Code' })).toBeDisabled()
    await userEvent.click(box)
    await userEvent.click(screen.getByRole('checkbox', { name: /Can act for staff/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('Role saved')).toBeInTheDocument()
    expect(api.callsTo(`PATCH /api/v1/roles/${custom.id}`)[0].body).toEqual({
      name: 'Auditor',
      description: null,
      permissions: [],
      dataAccess: custom.dataAccess,
      canActForStaff: false,
      version: 2,
    })
  })

  it('shows the reason when the API refuses (escalation)', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, custom))
    api.on(`PATCH /api/v1/roles/${custom.id}`, problem(403, 'Forbidden', 'You cannot grant permissions you do not hold: access:role:manage'))
    renderRoute(`/admin/roles/${custom.id}`)

    await userEvent.click(await screen.findByRole('checkbox', { name: 'Create, change and delete roles' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByText('You cannot grant permissions you do not hold: access:role:manage')).toBeInTheDocument()
  })

  it('deletes a custom role after confirmation', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, custom))
    api.on(`DELETE /api/v1/roles/${custom.id}`, new Response(null, { status: 204 }))
    const { here } = renderRoute(`/admin/roles/${custom.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete role' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete the Auditor role?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete role' }))

    await waitFor(() => expect(here()).toBe('/admin/roles'))
  })

  it('can change its mind about deleting', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, custom))
    renderRoute(`/admin/roles/${custom.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Delete role' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo(`DELETE /api/v1/roles/${custom.id}`)).toHaveLength(0)
  })

  it('never offers to delete a system role', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${role().id}`, json(200, role()))
    renderRoute(`/admin/roles/${role().id}`)

    await screen.findByRole('heading', { level: 1, name: 'PMO' })
    expect(screen.queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument()
  })

  it('shows the administrator role read-only', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${systemAdminRole.id}`, json(200, systemAdminRole))
    renderRoute(`/admin/roles/${systemAdminRole.id}`)

    expect(await screen.findByText(/always has every permission/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Read the audit log' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('is read-only for someone who may only view roles', async () => {
    signInWith(['access:role:read'])
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, custom))
    renderRoute(`/admin/roles/${custom.id}`)

    expect(await screen.findByText('You can view this role but not change it.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })

  it('refuses the new-role page without access:role:manage', async () => {
    signInWith(['access:role:read'])
    renderRoute('/admin/roles/new')

    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
  })

  it('says when the role does not exist', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/roles/30000000-0000-4000-8000-000000000099', problem(404, 'Not Found'))
    renderRoute('/admin/roles/30000000-0000-4000-8000-000000000099')

    expect(await screen.findByText('This role does not exist.')).toBeInTheDocument()
  })

  it('offers a retry when the role cannot load', async () => {
    signInWith(MANAGE)
    api.on(`GET /api/v1/roles/${custom.id}`, problem(500, 'Internal Server Error'))
    renderRoute(`/admin/roles/${custom.id}`)
    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on(`GET /api/v1/roles/${custom.id}`, json(200, custom))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Auditor' })).toBeInTheDocument()
  })

  it('offers a retry when the permission list cannot load', async () => {
    signInWith(MANAGE)
    api.on('GET /api/v1/permissions', problem(500, 'Internal Server Error'))
    renderRoute('/admin/roles/new')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/permissions', json(200, { items: permissionCatalogue }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'New role' })).toBeInTheDocument()
  })
})
