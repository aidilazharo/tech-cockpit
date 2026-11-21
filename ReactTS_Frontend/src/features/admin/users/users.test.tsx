import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../../../auth/auth-store'
import { json, ME_ID, mockApi, problem, renderRoute, signInWith } from '../../../test/harness'
import { assignment, departments, IT, PMO, refusedSignIn, role, systemAdminRole, user } from '../fixtures'

const ALL = ['access:user:read', 'access:user:manage', 'access:assignment:read', 'access:assignment:manage', 'access:role:read']
let api: ReturnType<typeof mockApi>

const NO_REFUSALS = json(200, { items: [], page: 1, pageSize: 25, total: 0 })

beforeEach(() => {
  api = mockApi()
  api.on('GET /api/v1/departments', json(200, { items: departments }))
  api.on('GET /api/v1/refused-sign-ins', NO_REFUSALS)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const page = (items = [user()], total = items.length) => json(200, { items, page: 1, pageSize: 25, total })

describe('Users list', () => {
  it('lists users with department, status, vendor tag and last sign-in', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page([user(), user({ id: '20000000-0000-4000-8000-000000000002', email: 'v@vendor.com', firstName: 'Vee', lastName: 'Endor', isExternal: true, status: 'disabled', departmentId: null, lastLoginAt: null })]))
    renderRoute('/admin/users')

    const table = await screen.findByRole('table', { name: 'Users' })
    const rows = within(table).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Ana Lim')
    expect(await within(rows[1]).findByText('Information Technology')).toBeInTheDocument()
    expect(rows[1]).toHaveTextContent('Active')
    expect(rows[2]).toHaveTextContent('Vendor')
    expect(rows[2]).toHaveTextContent('Disabled')
    expect(rows[2]).toHaveTextContent('Not yet')
    expect(within(rows[1]).getByRole('link', { name: 'Ana Lim' })).toHaveAttribute('href', `/admin/users/${user().id}`)
    expect(screen.getByText('2 users')).toBeInTheDocument()
  })

  it('searches as you type and keeps the search in the address', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page())
    const { here } = renderRoute('/admin/users')
    await screen.findByRole('table', { name: 'Users' })

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search by name, Okta username or email' }), 'ana')

    await waitFor(() => expect(here()).toBe('/admin/users?q=ana'))
    await waitFor(() => expect(api.callsTo('GET /api/v1/users').at(-1)?.path).toBe('/api/v1/users?page=1&pageSize=25&q=ana'))
  })

  it('clears the search', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page())
    const { here } = renderRoute('/admin/users?q=ana')
    const box = await screen.findByRole('searchbox', { name: 'Search by name, Okta username or email' })
    expect(box).toHaveValue('ana')

    await userEvent.clear(box)

    await waitFor(() => expect(here()).toBe('/admin/users'))
  })

  it('keeps the search when paging', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page([user({ firstName: '', lastName: '' })], 60))
    const { here } = renderRoute('/admin/users?q=lim')

    expect(await screen.findByRole('link', { name: 'ana.lim' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))

    expect(here()).toBe('/admin/users?q=lim&page=2')
  })

  it('pages through results', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page([user()], 60))
    const { here } = renderRoute('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Page 3' }))

    expect(here()).toBe('/admin/users?page=3')
    await waitFor(() => expect(api.callsTo('GET /api/v1/users').at(-1)?.path).toBe('/api/v1/users?page=3&pageSize=25'))
  })

  it('says when nothing matches', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page([], 0))
    renderRoute('/admin/users?q=zzz')

    expect(await screen.findByText('No users match your search')).toBeInTheDocument()
  })

  it('offers a retry when the list cannot load', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', problem(500, 'Internal Server Error'))
    renderRoute('/admin/users')

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/users', page())
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Users' })).toBeInTheDocument()
  })

  it('hides "Add user" without access:user:manage', async () => {
    signInWith(['access:user:read'])
    api.on('GET /api/v1/users', page())
    renderRoute('/admin/users')

    await screen.findByRole('table', { name: 'Users' })
    expect(screen.queryByRole('button', { name: 'Add user' })).not.toBeInTheDocument()
  })

  it('refuses the page without access:user:read', async () => {
    signInWith([])
    renderRoute('/admin/users')

    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to this page' })).toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/users')).toHaveLength(0)
  })
})

describe('Add user', () => {
  it('validates, adds the person by Okta username and opens their page', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page())
    const created = user({ id: '20000000-0000-4000-8000-000000000003', username: 'new.person', email: 'new@aia.com', firstName: '', lastName: '', departmentId: PMO })
    api.on('POST /api/v1/users', json(201, created))
    api.on('GET /api/v1/users/20000000-0000-4000-8000-000000000003', json(200, created))
    api.on('GET /api/v1/users/20000000-0000-4000-8000-000000000003/role-assignments', json(200, { items: [] }))
    const { here } = renderRoute('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add user' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }))
    expect(await within(dialog).findByText('Enter their Okta username')).toBeInTheDocument()
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument()
    expect(within(dialog).getByText('Choose Employee or Vendor')).toBeInTheDocument()

    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Okta username' }), 'New Person')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }))
    expect(await within(dialog).findByText('An Okta username has no spaces')).toBeInTheDocument()
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Okta username' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Okta username' }), 'New.Person')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Email' }), 'new@aia.com')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Employee' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Department' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Project Management Office' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }))

    await waitFor(() => expect(here()).toBe('/admin/users/20000000-0000-4000-8000-000000000003'))
    expect(api.callsTo('POST /api/v1/users')[0].body).toEqual({ username: 'New.Person', email: 'new@aia.com', isExternal: false, departmentId: PMO })
    expect(await screen.findByRole('heading', { level: 1, name: 'new.person' })).toBeInTheDocument()
  })

  it('shows the API explanation when the username already exists', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page())
    api.on('POST /api/v1/users', problem(409, 'Conflict', 'A record with the same unique value already exists.'))
    renderRoute('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Add user' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add user' })
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Okta username' }), 'ana.lim')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Email' }), 'ana.lim@aia.com')
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'First name (optional)' }), 'Ana')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Vendor' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }))

    expect(await within(dialog).findByText('A record with the same unique value already exists.')).toBeInTheDocument()
    expect(api.callsTo('POST /api/v1/users')[0].body).toMatchObject({ firstName: 'Ana', isExternal: true })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Refused sign-ins', () => {
  it('lists people Okta signed in who have not been added, and adds one with the form filled in', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page())
    api.on('GET /api/v1/refused-sign-ins', json(200, { items: [refusedSignIn()], page: 1, pageSize: 25, total: 1 }))
    api.on('POST /api/v1/users', json(201, user({ id: '20000000-0000-4000-8000-000000000004', username: 'new.person' })))
    api.on('GET /api/v1/users/20000000-0000-4000-8000-000000000004', json(200, user({ id: '20000000-0000-4000-8000-000000000004', username: 'new.person' })))
    api.on('GET /api/v1/users/20000000-0000-4000-8000-000000000004/role-assignments', json(200, { items: [] }))
    renderRoute('/admin/users')

    const row = within(await screen.findByRole('table', { name: 'Refused sign-ins' })).getAllByRole('row')[1]
    expect(row).toHaveTextContent('new.person')
    expect(row).toHaveTextContent('New Person')
    expect(row).toHaveTextContent('new.person@aia.com')
    expect(row).toHaveTextContent('2')
    await userEvent.click(within(row).getByRole('button', { name: 'Add user new.person' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add user' })
    expect(within(dialog).getByRole('textbox', { name: 'Okta username' })).toHaveValue('new.person')
    expect(within(dialog).getByRole('textbox', { name: 'Email' })).toHaveValue('new.person@aia.com')
    expect(within(dialog).getByRole('textbox', { name: 'First name (optional)' })).toHaveValue('New')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Vendor' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add user' }))
    await waitFor(() =>
      expect(api.callsTo('POST /api/v1/users')[0]?.body).toEqual({ username: 'new.person', email: 'new.person@aia.com', firstName: 'New', lastName: 'Person', isExternal: true }),
    )
  })

  it('dismisses an entry after confirmation', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page())
    api.on('GET /api/v1/refused-sign-ins', json(200, { items: [refusedSignIn({ firstName: '', lastName: '', email: null })], page: 1, pageSize: 25, total: 1 }))
    api.on(`DELETE /api/v1/refused-sign-ins/${refusedSignIn().id}`, () => {
      api.on('GET /api/v1/refused-sign-ins', NO_REFUSALS)
      return new Response(null, { status: 204 })
    })
    renderRoute('/admin/users')

    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss new.person' }))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Dismiss new.person?' })).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss new.person' }))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Dismiss new.person?' })).getByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText('Nobody has been refused recently')).toBeInTheDocument()
    expect(api.callsTo(`DELETE /api/v1/refused-sign-ins/${refusedSignIn().id}`)).toHaveLength(1)
  })

  it('offers a retry when the refused sign-ins cannot load', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users', page())
    api.on('GET /api/v1/refused-sign-ins', problem(500, 'Internal Server Error'))
    renderRoute('/admin/users')
    const section = await screen.findByRole('region', { name: 'Refused sign-ins' })
    expect(await within(section).findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on('GET /api/v1/refused-sign-ins', NO_REFUSALS)
    await userEvent.click(within(section).getByRole('button', { name: 'Try again' }))
    expect(await within(section).findByText('Nobody has been refused recently')).toBeInTheDocument()
  })

  it('is not shown to people who cannot manage users', async () => {
    signInWith(['access:user:read'])
    api.on('GET /api/v1/users', page())
    renderRoute('/admin/users')

    expect(await screen.findByRole('table', { name: 'Users' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Refused sign-ins' })).not.toBeInTheDocument()
    expect(api.callsTo('GET /api/v1/refused-sign-ins')).toHaveLength(0)
  })
})

describe('User page', () => {
  const ana = user()
  const detail = (u = ana, items = [assignment()]) => {
    api.on(`GET /api/v1/users/${u.id}`, json(200, u))
    api.on(`GET /api/v1/users/${u.id}/role-assignments`, json(200, { items }))
    api.on('GET /api/v1/roles', json(200, { items: [role(), systemAdminRole] }))
  }

  it('shows the person, their Okta username, type and roles', async () => {
    signInWith(ALL)
    detail(ana, [
      assignment(),
      assignment({ id: '40000000-0000-4000-8000-000000000002', roleName: 'ARB member', scopeType: 'department', scopeId: IT, validTo: '2026-02-01T00:00:00.000Z', active: false }),
      assignment({ id: '40000000-0000-4000-8000-000000000003', roleName: 'Auditor', validFrom: '2099-01-01T00:00:00.000Z', active: false }),
    ])
    renderRoute(`/admin/users/${ana.id}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Lim' })).toBeInTheDocument()
    expect(screen.getByText('Employee')).toBeInTheDocument()
    expect(screen.getByText('ana.lim')).toBeInTheDocument()
    expect(screen.queryByText(/Set by Okta/)).not.toBeInTheDocument()
    const rows = within(await screen.findByRole('table', { name: 'Role assignments' })).getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Everywhere')
    expect(rows[1]).toHaveTextContent('Active')
    expect(rows[2]).toHaveTextContent('Department: Information Technology')
    expect(rows[2]).toHaveTextContent('Ended')
    expect(within(rows[2]).queryByRole('button')).not.toBeInTheDocument()
    expect(rows[3]).toHaveTextContent('Scheduled')
  })

  it('edits the details: Okta username, email, names and type', async () => {
    signInWith(ALL)
    detail()
    api.on(`PATCH /api/v1/users/${ana.id}`, (call) => json(200, user({ ...(call.body as Partial<typeof ana>), version: 4 })))
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit details of Ana Lim' })
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Okta username' }))
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Okta username' }), 'ana.lim2')
    await userEvent.clear(within(dialog).getByRole('textbox', { name: 'Last name (optional)' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Vendor' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PATCH /api/v1/users/${ana.id}`)[0].body).toEqual({ username: 'ana.lim2', email: 'ana.lim@aia.com', firstName: 'Ana', lastName: '', isExternal: true, version: 3 })
  })

  it('enables a disabled user, and names portfolio and application scopes by id without TRM access', async () => {
    signInWith(ALL)
    const off = user({ status: 'disabled' })
    detail(off, [
      assignment({ scopeType: 'portfolio', scopeId: '90000000-0000-4000-8000-0000000000aa' }),
      assignment({ id: '40000000-0000-4000-8000-000000000005', scopeType: 'application', scopeId: '80000000-0000-4000-8000-0000000000bb' }),
    ])
    api.on(`PATCH /api/v1/users/${off.id}`, json(200, user({ status: 'active', version: 4 })))
    renderRoute(`/admin/users/${off.id}`)
    const table = await screen.findByRole('table', { name: 'Role assignments' })
    expect(table).toHaveTextContent('Portfolio: 90000000-0000-4000-8000-0000000000aa')
    expect(table).toHaveTextContent('Application: 80000000-0000-4000-8000-0000000000bb')
    await userEvent.click(screen.getByRole('button', { name: 'Enable user' }))
    await userEvent.click(within(await screen.findByRole('alertdialog', { name: 'Enable Ana Lim?' })).getByRole('button', { name: 'Enable user' }))
    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/users/${off.id}`)[0]?.body).toEqual({ status: 'active', version: 3 }))
  })

  it('closes the details dialog without saving', async () => {
    signInWith(ALL)
    detail(user({ isExternal: true }))
    renderRoute(`/admin/users/${ana.id}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Edit details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit details of Ana Lim' })
    expect(within(dialog).getByRole('combobox', { name: 'Type' })).toHaveTextContent('Vendor')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PATCH /api/v1/users/${ana.id}`)).toHaveLength(0)
  })

  it('keeps an email that came from Okta read-only, and shows why a change was refused', async () => {
    signInWith(ALL)
    detail(user({ emailFromOkta: true }))
    api.on(`PATCH /api/v1/users/${ana.id}`, problem(422, 'Unprocessable Entity', 'End the system administrator role first'))
    renderRoute(`/admin/users/${ana.id}`)

    expect(await screen.findByText('From Okta')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Edit details' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit details of Ana Lim' })
    expect(within(dialog).getByRole('textbox', { name: 'Email' })).toBeDisabled()
    expect(within(dialog).getByText('Okta sends this email at every sign-in, so it cannot be changed here.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Vendor' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('End the system administrator role first')).toBeInTheDocument()
    expect(api.callsTo(`PATCH /api/v1/users/${ana.id}`)[0].body).not.toHaveProperty('email')
  })

  it('offers no editing to someone who may only view users', async () => {
    signInWith(['access:user:read', 'access:assignment:read'])
    detail()
    renderRoute(`/admin/users/${ana.id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Lim' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument()
  })

  it('disables a user after confirmation, sending the version', async () => {
    signInWith(ALL)
    detail()
    api.on(`PATCH /api/v1/users/${ana.id}`, () => {
      api.on(`GET /api/v1/users/${ana.id}`, json(200, user({ status: 'disabled', version: 4 })))
      return json(200, user({ status: 'disabled', version: 4 }))
    })
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Disable user' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Disable Ana Lim?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Disable user' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo(`PATCH /api/v1/users/${ana.id}`)[0].body).toEqual({ status: 'disabled', version: 3 })
    expect(await screen.findByRole('button', { name: 'Enable user' })).toBeInTheDocument()
  })

  it('keeps the dialog open with the reason when someone else changed the user', async () => {
    signInWith(ALL)
    detail()
    api.on(`PATCH /api/v1/users/${ana.id}`, problem(409, 'Conflict', 'The record was changed by someone else. Reload and try again.'))
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Disable user' }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Disable user' }))

    expect(await within(confirm).findByText('The record was changed by someone else. Reload and try again.')).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
  })

  it('never offers to disable your own account', async () => {
    signInWith(ALL)
    const me = user({ id: ME_ID })
    detail(me)
    renderRoute(`/admin/users/${ME_ID}`)

    expect(await screen.findByText('This is you. You cannot disable your own account.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disable user' })).not.toBeInTheDocument()
  })

  it('never offers a system administrator to disable their own account either', async () => {
    signInWith(ALL)
    useAuthStore.setState((state) => ({ me: { ...state.me!, isSystemAdmin: true } }))
    detail(user({ id: ME_ID }))
    renderRoute(`/admin/users/${ME_ID}`)

    expect(await screen.findByText('This is you. You cannot disable your own account.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disable user' })).not.toBeInTheDocument()
  })

  it('changes the department', async () => {
    signInWith(ALL)
    detail()
    api.on(`PATCH /api/v1/users/${ana.id}`, json(200, user({ departmentId: PMO, version: 4 })))
    renderRoute(`/admin/users/${ana.id}`)

    const save = await screen.findByRole('button', { name: 'Save department' })
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Department' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Project Management Office' }))
    await userEvent.click(save)

    await waitFor(() => expect(api.callsTo(`PATCH /api/v1/users/${ana.id}`)[0]?.body).toEqual({ departmentId: PMO, version: 3 }))
  })

  it('shows details read-only to someone who may only view users', async () => {
    signInWith(['access:user:read'])
    detail()
    renderRoute(`/admin/users/${ana.id}`)

    expect(await screen.findByText('Information Technology')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Department' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Disable user' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Roles' })).not.toBeInTheDocument()
  })

  it('assigns a department-scoped role, insisting on the department', async () => {
    signInWith(ALL)
    detail(ana, [])
    api.on('POST /api/v1/role-assignments', json(201, assignment({ scopeType: 'department', scopeId: PMO })))
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Assign role' }))
    const dialog = await screen.findByRole('dialog', { name: 'Assign role to Ana Lim' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))
    expect(await within(dialog).findByText('Select a role')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'PMO' }))
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Where it applies' }))
    await userEvent.click(await screen.findByRole('option', { name: 'One department' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))
    expect(await within(dialog).findByText('Select a department')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Department' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Project Management Office' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/role-assignments')[0].body).toEqual({ userId: ana.id, roleCode: 'pmo', scopeType: 'department', scopeId: PMO })
  })

  it('assigns a global role and shows a refusal from the API', async () => {
    signInWith(ALL)
    detail(ana, [])
    api.on('POST /api/v1/role-assignments', problem(403, 'Forbidden', 'You cannot grant permissions you do not hold: audit:log:read'))
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Assign role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    await userEvent.click(await screen.findByRole('option', { name: 'PMO' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Assign role' }))

    expect(await within(dialog).findByText('You cannot grant permissions you do not hold: audit:log:read')).toBeInTheDocument()
    expect(api.callsTo('POST /api/v1/role-assignments')[0].body).toEqual({ userId: ana.id, roleCode: 'pmo', scopeType: 'global' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('offers the administrator role only to holders of "Grant the system administrator role"', async () => {
    signInWith(ALL)
    detail(ana, [assignment({ id: '40000000-0000-4000-8000-000000000009', roleCode: 'system-admin', roleName: 'System administrator' })])
    renderRoute(`/admin/users/${ana.id}`)
    expect(await screen.findByRole('table', { name: 'Role assignments' })).toHaveTextContent('System administrator')
    expect(screen.queryByRole('button', { name: 'End the System administrator role' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('combobox', { name: 'Role' }))
    expect(await screen.findByRole('option', { name: 'PMO' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'System administrator' })).not.toBeInTheDocument()
  })

  it('lets holders of "Grant the system administrator role" grant and end it', async () => {
    signInWith([...ALL, 'access:system-admin:manage'])
    detail(ana, [assignment({ id: '40000000-0000-4000-8000-000000000009', roleCode: 'system-admin', roleName: 'System administrator' })])
    renderRoute(`/admin/users/${ana.id}`)
    expect(await screen.findByRole('button', { name: 'End the System administrator role' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Assign role' }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('combobox', { name: 'Role' }))
    expect(await screen.findByRole('option', { name: 'System administrator' })).toBeInTheDocument()
  })

  it('never offers the administrator role to a vendor', async () => {
    signInWith([...ALL, 'access:system-admin:manage'])
    const vendor = user({ isExternal: true })
    detail(vendor, [])
    renderRoute(`/admin/users/${vendor.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'Assign role' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('combobox', { name: 'Role' }))

    expect(await screen.findByRole('option', { name: 'PMO' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'System administrator' })).not.toBeInTheDocument()
  })

  it('can change its mind about ending an assignment', async () => {
    signInWith(ALL)
    detail()
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'End the PMO role' }))
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/role-assignments/40000000-0000-4000-8000-000000000001/end')).toHaveLength(0)
  })

  it('names a department scope it cannot resolve by its id, and a user without names by Okta username', async () => {
    signInWith(ALL)
    const nameless = user({ firstName: '', lastName: '', lastLoginAt: null })
    detail(nameless, [assignment({ scopeType: 'department', scopeId: '10000000-0000-4000-8000-0000000000ff' })])
    renderRoute(`/admin/users/${nameless.id}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'ana.lim' })).toBeInTheDocument()
    expect(await screen.findByText('Department: 10000000-0000-4000-8000-0000000000ff')).toBeInTheDocument()
    expect(screen.getByText('Not yet')).toBeInTheDocument()
  })

  it('offers a retry when the role list cannot load', async () => {
    signInWith(ALL)
    detail()
    api.on(`GET /api/v1/users/${ana.id}/role-assignments`, problem(500, 'Internal Server Error'))
    renderRoute(`/admin/users/${ana.id}`)

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    api.on(`GET /api/v1/users/${ana.id}/role-assignments`, json(200, { items: [assignment()] }))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Role assignments' })).toBeInTheDocument()
  })

  it('ends an assignment after confirmation', async () => {
    signInWith(ALL)
    detail()
    api.on('POST /api/v1/role-assignments/40000000-0000-4000-8000-000000000001/end', json(200, assignment({ validTo: '2026-10-21T00:00:00.000Z', active: false })))
    renderRoute(`/admin/users/${ana.id}`)

    await userEvent.click(await screen.findByRole('button', { name: 'End the PMO role' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'End the PMO role for Ana Lim?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'End' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.callsTo('POST /api/v1/role-assignments/40000000-0000-4000-8000-000000000001/end')).toHaveLength(1)
  })

  it('says when the user does not exist', async () => {
    signInWith(ALL)
    api.on('GET /api/v1/users/20000000-0000-4000-8000-000000000099', problem(404, 'Not Found', 'User not found'))
    renderRoute('/admin/users/20000000-0000-4000-8000-000000000099')

    expect(await screen.findByText('This user does not exist.')).toBeInTheDocument()
  })

  it('offers a retry when the user cannot load', async () => {
    signInWith(ALL)
    renderRoute(`/admin/users/${ana.id}`)

    expect(await screen.findByRole('alert', { name: 'Could not load this page' })).toBeInTheDocument()
    detail()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Lim' })).toBeInTheDocument()
  })
})
