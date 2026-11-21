import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { vi } from 'vitest'
import { useAuthStore, type Me } from '../auth/auth-store'
import { routes } from '../routes'

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

export const problem = (status: number, title: string, detail?: string) =>
  new Response(JSON.stringify({ type: 'about:blank', title, status, detail }), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  })

export interface ApiCall {
  method: string
  path: string
  body: unknown
}

type Handler = (call: ApiCall) => Response | Promise<Response>

/** Replaces fetch. Unknown endpoints fail like a network error. */
export function mockApi() {
  const handlers = new Map<string, Handler>()
  const calls: ApiCall[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost')
      // A file goes as form data; everything else as JSON.
      const body = init?.body instanceof FormData ? init.body : init?.body ? JSON.parse(String(init.body)) : undefined
      const call = { method: init?.method ?? 'GET', path: `${url.pathname}${url.search}`, body }
      calls.push(call)
      const handler = handlers.get(`${call.method} ${url.pathname}`)
      if (!handler) throw new TypeError(`Failed to fetch ${call.method} ${call.path}`)
      return handler(call)
    }),
  )
  return {
    calls,
    /** Answers `METHOD /path` (query string ignored). */
    on(route: string, handler: Handler | Response) {
      handlers.set(route, typeof handler === 'function' ? handler : () => handler.clone())
    },
    /** Calls made to `METHOD /path` (query string ignored). */
    callsTo(route: string) {
      return calls.filter((call) => `${call.method} ${call.path.split('?')[0]}` === route)
    },
  }
}

export const ME_ID = '00000000-0000-4000-8000-000000000001'

/** Signs in a test user holding exactly `permissions` (no /me request is made). */
export function signInWith(permissions: string[], user: Partial<Me['user']> = {}) {
  useAuthStore.setState({
    status: 'signed-in',
    notice: null,
    signOutFailed: false,
    me: {
      user: { id: ME_ID, username: 'ada.admin', email: 'admin@aia.com', firstName: 'Ada', lastName: 'Admin', isExternal: false, ...user },
      roles: ['test'],
      permissions,
      isSystemAdmin: false,
      authMethod: 'session',
      session: null,
    },
  })
}

/** Renders the real routes at `path` with a fresh query cache (no retries). */
export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, here: () => `${router.state.location.pathname}${router.state.location.search}` }
}
