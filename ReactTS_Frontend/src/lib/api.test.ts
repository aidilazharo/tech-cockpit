import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { api, ApiContractError, ApiError, onSessionEnded, refreshSession, setAccessExpiry } from './api'

const json = (status: number, body: unknown, type = 'application/json') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': type } })
const problem = (status: number, title: string, detail?: string) =>
  json(status, { type: 'about:blank', title, status, detail, requestId: 'req-1' }, 'application/problem+json')

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  setAccessExpiry(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const calls = () => fetchMock.mock.calls.map(([path, init]) => `${(init as RequestInit).method} ${path as string}`)

describe('api', () => {
  it('sends cookies and returns JSON', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))

    await expect(api('/api/v1/me')).resolves.toEqual({ ok: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
  })

  it('sends a JSON body', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'k1' }))

    await api('/api/v1/me/api-keys', { method: 'POST', body: { name: 'cli' } })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe('{"name":"cli"}')
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', accept: 'application/json' })
  })

  it('sends a file as multipart form data, letting the browser set its boundary', async () => {
    fetchMock.mockResolvedValueOnce(json(201, { id: 'u1' }))
    const form = new FormData()
    form.append('file', new File(['%PDF-1.7'], 'design.pdf'))

    await api('/api/v1/sad/versions/v1/diagrams/solution/solution/uploads', { method: 'POST', body: form })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.body).toBe(form)
    expect(init.headers).toEqual({ accept: 'application/json' })
  })

  it('validates and types the body against a schema', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 'u1', extra: 'dropped' }))

    await expect(api('/api/v1/users/u1', { schema: z.object({ id: z.string() }) })).resolves.toEqual({ id: 'u1' })
  })

  it('rejects a body that breaks the contract', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 42 }))

    const error = await api('/api/v1/users/u1', { schema: z.object({ id: z.string() }) }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiContractError)
    expect(String(error)).toContain('/api/v1/users/u1')
  })

  it('returns undefined for 204 No Content', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(api('/api/v1/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('turns problem details into an ApiError', async () => {
    fetchMock.mockResolvedValueOnce(problem(403, 'Forbidden', 'You do not have permission to do this.'))

    const error = (await api('/api/v1/roles').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 403, title: 'Forbidden', message: 'You do not have permission to do this.', requestId: 'req-1' })
  })

  it('keeps the invalid fields of a 400, and none for other errors', async () => {
    fetchMock.mockResolvedValueOnce(json(400, { title: 'Bad Request', errors: [{ path: 'answers.url', message: 'Invalid URL' }] }, 'application/problem+json'))
    await expect(api('/api/v1/x', { method: 'PUT', body: {} })).rejects.toMatchObject({ status: 400, errors: [{ path: 'answers.url', message: 'Invalid URL' }] })
    fetchMock.mockResolvedValueOnce(problem(409, 'Conflict'))
    await expect(api('/api/v1/x')).rejects.toMatchObject({ status: 409, errors: [] })
  })

  it('copes with an error that has no problem body', async () => {
    fetchMock.mockResolvedValueOnce(new Response('upstream down', { status: 502, statusText: 'Bad Gateway' }))

    await expect(api('/api/v1/me')).rejects.toMatchObject({ status: 502, title: 'Bad Gateway' })
  })

  it('renews an expired access token once and retries the call', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'Unauthorized'))
      .mockResolvedValueOnce(json(200, { accessExpiresAt: new Date(Date.now() + 900_000).toISOString() }))
      .mockResolvedValueOnce(json(200, { ok: true }))

    await expect(api('/api/v1/me')).resolves.toEqual({ ok: true })
    expect(calls()).toEqual(['GET /api/v1/me', 'POST /api/v1/auth/refresh', 'GET /api/v1/me'])
  })

  it('reports the end of the session when renewal fails', async () => {
    const ended = vi.fn()
    const unsubscribe = onSessionEnded(ended)
    fetchMock.mockResolvedValueOnce(problem(401, 'Unauthorized')).mockResolvedValueOnce(problem(401, 'Unauthorized'))

    await expect(api('/api/v1/me')).rejects.toMatchObject({ status: 401 })
    expect(ended).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('never tries to renew for the auth endpoints themselves', async () => {
    fetchMock.mockResolvedValueOnce(problem(401, 'Unauthorized'))

    await expect(api('/api/v1/auth/logout', { method: 'POST' })).rejects.toMatchObject({ status: 401 })
    expect(calls()).toEqual(['POST /api/v1/auth/logout'])
  })

  it('renews ahead of time when the access token is about to expire', async () => {
    setAccessExpiry(new Date(Date.now() + 10_000).toISOString())
    fetchMock
      .mockResolvedValueOnce(json(200, { accessExpiresAt: new Date(Date.now() + 900_000).toISOString() }))
      .mockResolvedValueOnce(json(200, { ok: true }))

    await api('/api/v1/me')

    expect(calls()).toEqual(['POST /api/v1/auth/refresh', 'GET /api/v1/me'])
  })

  it('does not renew while the access token is still fresh', async () => {
    setAccessExpiry(new Date(Date.now() + 600_000).toISOString())
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))

    await api('/api/v1/me')

    expect(calls()).toEqual(['GET /api/v1/me'])
  })
})

describe('refreshSession', () => {
  it('shares one renewal between concurrent callers', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { accessExpiresAt: new Date(Date.now() + 900_000).toISOString() }))

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()])

    expect(results).toEqual([true, true, true])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('reports failure when the network is down', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await expect(refreshSession()).resolves.toBe(false)
  })
})
