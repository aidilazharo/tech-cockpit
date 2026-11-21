import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { json, mockApi, renderRoute, signInWith } from '../test/harness'

beforeEach(() => {
  const api = mockApi()
  api.on('GET /api/v1/users', json(200, { items: [], page: 1, pageSize: 25, total: 0 }))
  api.on('GET /api/v1/departments', json(200, { items: [] }))
  api.on('GET /api/v1/me/api-keys', json(200, { items: [] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const sideNav = () => screen.getAllByRole('navigation', { name: 'Main navigation' })[0]

describe('Side navigation', () => {
  it('shows only Home to a user without admin permissions', async () => {
    signInWith([])
    renderRoute('/')

    await screen.findByRole('heading', { level: 1, name: 'Welcome, Ada' })
    expect(within(sideNav()).getAllByRole('link').map((link) => link.textContent)).toEqual(['Home'])
    expect(within(sideNav()).queryByText('Administration')).not.toBeInTheDocument()
  })

  it('shows the administration pages the user may open, and marks the current one', async () => {
    signInWith(['access:user:read', 'access:role:read', 'access:department:manage'])
    renderRoute('/admin/users')

    await screen.findByRole('heading', { level: 1, name: 'Users' })
    const links = within(sideNav()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Home', 'Users', 'Roles', 'Departments'])
    expect(within(sideNav()).getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page')
    expect(within(sideNav()).getByText('Administration')).toBeInTheDocument()
  })

  it('opens the phone navigation drawer and closes it after choosing a page', async () => {
    signInWith(['access:user:read'])
    const { here } = renderRoute('/')

    await userEvent.click(await screen.findByRole('button', { name: 'Open navigation' }))
    const drawer = await screen.findByRole('dialog', { name: 'Navigation' })
    await userEvent.click(within(drawer).getByRole('link', { name: 'Users' }))

    await waitFor(() => expect(here()).toBe('/admin/users'))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).not.toBeInTheDocument())
  })

  it('links to My API keys from the account menu for those allowed to have keys', async () => {
    signInWith(['apikey:own:manage'])
    const { here } = renderRoute('/')

    await userEvent.click(await screen.findByRole('button', { name: 'AA account menu for Ada Admin' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'API keys' }))

    await waitFor(() => expect(here()).toBe('/me/api-keys'))
  })

  it('does not offer API keys without apikey:own:manage', async () => {
    signInWith([])
    renderRoute('/')

    await userEvent.click(await screen.findByRole('button', { name: 'AA account menu for Ada Admin' }))
    await screen.findByRole('menu')
    expect(screen.queryByRole('menuitem', { name: 'API keys' })).not.toBeInTheDocument()
  })
})
