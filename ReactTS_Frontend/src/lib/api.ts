import type { ZodType } from 'zod'

// Calls the TechCockpit API with the browser session cookies (httpOnly; never readable
// here). An expired access token is renewed once with POST /auth/refresh and the call
// retried; if that fails the session has ended and listeners are told.

const AUTH_PATH = '/api/v1/auth/'
// Renew this long before the access token expires, so calls rarely meet a 401.
const REFRESH_MARGIN_MS = 60_000

/** RFC 9457 problem details from the API. */
export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string | undefined
  readonly requestId: string | undefined
  /** The invalid fields of a 400 (problem+json `errors`) */
  readonly errors: { path: string; message: string }[]

  constructor(status: number, title: string, detail: string | undefined, requestId: string | undefined, errors: { path: string; message: string }[] = []) {
    super(detail ?? title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.requestId = requestId
    this.errors = errors
  }
}

let accessExpiresAt: number | null = null
let refreshing: Promise<boolean> | null = null
const sessionEndedListeners = new Set<() => void>()

/** Remembers when the access token expires (from /me or a refresh). */
export function setAccessExpiry(iso: string | null): void {
  accessExpiresAt = iso ? Date.parse(iso) : null
}

/** Called when the session can no longer be renewed. Returns an unsubscribe function. */
export function onSessionEnded(listener: () => void): () => void {
  sessionEndedListeners.add(listener)
  return () => sessionEndedListeners.delete(listener)
}

function send(path: string, init: RequestInit): Promise<Response> {
  return fetch(path, { ...init, credentials: 'include', headers: { accept: 'application/json', ...init.headers } })
}

/** Renews the access token; concurrent callers share one request. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= send(`${AUTH_PATH}refresh`, { method: 'POST' })
    .then(async (res) => {
      if (!res.ok) {
        accessExpiresAt = null
        return false
      }
      const body = (await res.json()) as { accessExpiresAt: string }
      setAccessExpiry(body.accessExpiresAt)
      return true
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

async function toApiError(res: Response): Promise<ApiError> {
  const problem = (await res.json().catch(() => ({}))) as { title?: string; detail?: string; requestId?: string; errors?: { path: string; message: string }[] }
  return new ApiError(res.status, problem.title ?? res.statusText, problem.detail, problem.requestId, problem.errors)
}

/** The API answered with a body that breaks the agreed contract (a bug on one side). */
export class ApiContractError extends Error {
  constructor(path: string, issues: string) {
    super(`Unexpected response from ${path}: ${issues}`)
    this.name = 'ApiContractError'
  }
}

export interface ApiRequest<T = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
  /** Validates (and types) the response body. */
  schema?: ZodType<T>
}

/** Request to the API (a JSON body, or a file as multipart form data). Throws ApiError for error responses. */
export async function api<T>(path: string, request: ApiRequest<T> = {}): Promise<T> {
  const init: RequestInit = {
    method: request.method ?? 'GET',
    signal: request.signal,
    // The browser sets a form's content type itself, with its boundary.
    ...(request.body instanceof FormData
      ? { body: request.body }
      : request.body !== undefined && {
          body: JSON.stringify(request.body),
          headers: { 'content-type': 'application/json' },
        }),
  }
  const isAuthCall = path.startsWith(AUTH_PATH)
  if (!isAuthCall && accessExpiresAt !== null && accessExpiresAt - Date.now() < REFRESH_MARGIN_MS) {
    await refreshSession()
  }

  let res = await send(path, init)
  if (res.status === 401 && !isAuthCall) {
    if (await refreshSession()) {
      res = await send(path, init)
    }
    if (res.status === 401) {
      sessionEndedListeners.forEach((listener) => listener())
    }
  }
  if (!res.ok) {
    throw await toApiError(res)
  }
  if (res.status === 204) {
    return undefined as T
  }
  const body: unknown = await res.json()
  if (!request.schema) {
    return body as T
  }
  const parsed = request.schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiContractError(path, parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '))
  }
  return parsed.data
}
