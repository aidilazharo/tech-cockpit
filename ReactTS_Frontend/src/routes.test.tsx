import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { navigation, signInUrl, useAuthStore, type Me } from './auth/auth-store'
import { api } from './lib/api'
import { renderRoute } from './test/harness'
import { useThemeStore } from './theme/theme-store'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const unauthorized = () => json(401, { title: 'Unauthorized', status: 401 })

function me(overrides: Partial<Me['user']> = {}, roles = ['pmo']): Me {
  return {
    user: { id: 'u1', username: 'test.admin', email: 'test.admin@aia.com', firstName: 'Test', lastName: 'Admin', isExternal: false, ...overrides },
    roles,
    permissions: [],
    isSystemAdmin: false,
    authMethod: 'session',
    session: { accessExpiresAt: new Date(Date.now() + 900_000).toISOString(), expiresAt: new Date(Date.now() + 14_400_000).toISOString() },
  }
}

const apiRoutes = new Map<string, () => Response | Promise<Response>>()

function signedOut() {
  apiRoutes.set('GET /api/v1/me', unauthorized)
  apiRoutes.set('POST /api/v1/auth/refresh', unauthorized)
}

const renderAt = (path: string) => renderRoute(path).router

const here = (router: ReturnType<typeof renderAt>) => `${router.state.location.pathname}${router.state.location.search}`

beforeEach(() => {
  apiRoutes.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn((path: string, init?: RequestInit) => {
      const handler = apiRoutes.get(`${init?.method ?? 'GET'} ${path}`)
      return handler ? Promise.resolve(handler()) : Promise.reject(new TypeError('Failed to fetch'))
    }),
  )
  useAuthStore.setState({ status: 'idle', me: null, notice: null, signOutFailed: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('signInUrl', () => {
  it('passes the return path to the backend', () => {
    expect(signInUrl('/trm?q=crm#top')).toBe('/api/v1/auth/saml/login?returnTo=%2Ftrm%3Fq%3Dcrm%23top')
  })
})

describe('signed out', () => {
  it('shows a loading status first', () => {
    apiRoutes.set('GET /api/v1/me', () => new Promise<Response>(() => {}))
    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent('Loading TechCockpit…')
  })

  it('sends the home page to /signin without a notice', async () => {
    signedOut()
    const router = renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument()
    expect(here(router)).toBe('/signin')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a deep link through sign-in', async () => {
    signedOut()
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => {})
    const router = renderAt('/approvals?tab=mine')

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Okta' }))

    expect(here(router)).toBe('/signin?returnTo=%2Fapprovals%3Ftab%3Dmine')
    expect(assign).toHaveBeenCalledWith('/api/v1/auth/saml/login?returnTo=%2Fapprovals%3Ftab%3Dmine')
  })

  it('never passes an off-site returnTo to the backend', async () => {
    signedOut()
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => {})
    renderAt('/signin?returnTo=%2F%2Fevil.example.com')

    await userEvent.click(await screen.findByRole('button', { name: 'Sign in with Okta' }))

    expect(assign).toHaveBeenCalledWith('/api/v1/auth/saml/login?returnTo=%2F')
  })

  it.each([
    ['account_disabled', 'Your account is disabled'],
    ['sso_unavailable', 'Sign-in is unavailable'],
    ['sign_in_failed', 'Sign-in failed'],
    ['sign_in_expired', 'Sign-in timed out'],
  ])('explains the sign-in error %s sent by the backend', async (code, title) => {
    signedOut()
    renderAt(`/signin?error=${code}`)

    expect(await screen.findByRole('alert', { name: title })).toBeInTheDocument()
  })

  it('tells someone nobody has added which Okta username they used', async () => {
    signedOut()
    apiRoutes.set('GET /api/v1/auth/refused-username', () => json(200, { username: 'new.person' }))
    renderAt('/signin?error=not_registered')

    const alert = await screen.findByRole('alert', { name: 'You have not been added to TechCockpit' })
    expect(alert).toHaveTextContent('Ask a TechCockpit administrator to add you.')
    expect(await screen.findByText('Your Okta username: new.person')).toBeInTheDocument()
  })

  it('still explains a refusal when the username is no longer known', async () => {
    signedOut()
    apiRoutes.set('GET /api/v1/auth/refused-username', () => json(200, { username: null }))
    renderAt('/signin?error=not_registered')

    expect(await screen.findByRole('alert', { name: 'You have not been added to TechCockpit' })).toBeInTheDocument()
    expect(screen.queryByText(/Your Okta username/)).not.toBeInTheDocument()
  })

  it('ignores an unknown error code', async () => {
    signedOut()
    renderAt('/signin?error=%3Cscript%3E')

    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers a retry when the service cannot be reached', async () => {
    renderAt('/')

    expect(await screen.findByRole('alert', { name: 'TechCockpit is unavailable' })).toBeInTheDocument()
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome, Test' })).toBeInTheDocument())
  })

  it('shows the outage message on /signin too', async () => {
    renderAt('/signin')

    expect(await screen.findByRole('alert', { name: 'TechCockpit is unavailable' })).toBeInTheDocument()
  })
})

describe('signed in', () => {
  it('shows the home page with an account menu', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Test' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TA account menu for Test Admin' })).toHaveTextContent('TA')
    expect(screen.getByRole('link', { name: 'AIA TechCockpit home' })).toHaveAttribute('href', '/')
  })

  it('works with an API key, which has no browser session', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, { ...me(), authMethod: 'api-key', session: null }))
    renderAt('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, Test' })).toBeInTheDocument()
  })

  it('goes from /signin to the requested page', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    const router = renderAt('/signin?returnTo=%2Ftrm')

    await screen.findByRole('heading', { name: 'Page not found' })
    expect(here(router)).toBe('/trm')
  })

  it('shows "page not found" inside the app for unknown paths', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    renderAt('/no-such-page')

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to the home page' })).toHaveAttribute('href', '/')
  })

  it('shows someone without a role in force a full "no access" page with only Sign out', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me({ firstName: '', lastName: '' }, [])))
    apiRoutes.set('POST /api/v1/auth/logout', () => new Response(null, { status: 204 }))
    renderAt('/trm/applications')

    expect(await screen.findByRole('heading', { level: 1, name: 'You do not have access to TechCockpit' })).toBeInTheDocument()
    expect(screen.getByText(/Signed in as test.admin\./)).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /account menu/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(useAuthStore.getState().status).toBe('signed-out'))
  })

  it('shows who is signed in by username when they have no name, and marks vendors', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me({ isExternal: true, firstName: '', lastName: '' }, ['vendor'])))
    renderAt('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome, test.admin' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'T account menu for test.admin' }))
    const menu = await screen.findByRole('menu')
    expect(menu).toHaveTextContent('test.admin@aia.com')
    expect(menu).toHaveTextContent('Vendor')
  })

  it('changes the theme from the account menu', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    renderAt('/')

    await userEvent.click(await screen.findByRole('button', { name: 'TA account menu for Test Admin' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    expect(useThemeStore.getState().preference).toBe('dark')
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    useThemeStore.setState({ preference: 'system' })
  })

  it('signs out from the account menu and confirms it', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    apiRoutes.set('POST /api/v1/auth/logout', () => new Response(null, { status: 204 }))
    const router = renderAt('/trm')

    await userEvent.click(await screen.findByRole('button', { name: 'TA account menu for Test Admin' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('status', { name: 'You have signed out' })).toBeInTheDocument()
    expect(here(router)).toBe('/signin')
  })

  it('stays signed in and says so when signing out fails', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    renderAt('/')

    await userEvent.click(await screen.findByRole('button', { name: 'TA account menu for Test Admin' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))

    expect(await screen.findByRole('alert', { name: 'Could not sign you out' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Welcome, Test' })).toBeInTheDocument()
  })

  it('returns to the sign-in page, keeping the page, when the session ends', async () => {
    apiRoutes.set('GET /api/v1/me', () => json(200, me()))
    const router = renderAt('/trm')
    await screen.findByRole('heading', { name: 'Page not found' })
    apiRoutes.set('GET /api/v1/roles', unauthorized)
    apiRoutes.set('POST /api/v1/auth/refresh', unauthorized)

    await api('/api/v1/roles').catch(() => undefined)

    expect(await screen.findByRole('alert', { name: 'Your session has ended' })).toBeInTheDocument()
    expect(here(router)).toBe('/signin?returnTo=%2Ftrm')
  })
})

describe('public pages', () => {
  it('serves the design system gallery without signing in', async () => {
    renderAt('/design-system')

    expect(await screen.findByRole('heading', { level: 1, name: 'Qi design system' })).toBeInTheDocument()
  })
})
