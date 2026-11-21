import type { Page, Route } from '@playwright/test'

export interface Call {
  method: string
  path: string
  body: unknown
}

type Handler = (call: Call) => { status: number; body?: unknown }

/**
 * Answers /api/v1/* in the browser (no backend). `me` is the signed-in user;
 * handlers are keyed "METHOD /path" (query string ignored).
 */
export async function mockApi(page: Page, permissions: string[], handlers: Record<string, Handler | { status: number; body?: unknown }>) {
  const calls: Call[] = []
  const me = {
    user: { id: '00000000-0000-4000-8000-000000000001', username: 'ada.admin', email: 'ada.admin@aia.com', firstName: 'Ada', lastName: 'Admin', isExternal: false },
    roles: ['admin'],
    permissions,
    isSystemAdmin: false,
    authMethod: 'session',
    session: { accessExpiresAt: new Date(Date.now() + 900_000).toISOString(), expiresAt: new Date(Date.now() + 14_400_000).toISOString() },
  }
  await page.route('**/api/v1/**', async (route: Route) => {
    const request = route.request()
    const url = new URL(request.url())
    // A file upload is multipart form data: kept as text; everything else is JSON.
    const multipart = (await request.headerValue('content-type'))?.startsWith('multipart/') ?? false
    const call = { method: request.method(), path: `${url.pathname}${url.search}`, body: (multipart ? request.postData() : request.postDataJSON()) as unknown }
    calls.push(call)
    const key = `${call.method} ${url.pathname}`
    const handler = key === 'GET /api/v1/me' ? { status: 200, body: me } : handlers[key]
    if (!handler) {
      return route.fulfill({ status: 404, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Not Found', status: 404 }) })
    }
    const { status, body } = typeof handler === 'function' ? handler(call) : handler
    return route.fulfill({
      status,
      contentType: status >= 400 ? 'application/problem+json' : 'application/json',
      body: body === undefined ? '' : JSON.stringify(body),
    })
  })
  return calls
}
