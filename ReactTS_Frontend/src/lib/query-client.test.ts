import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { createQueryClient } from './query-client'

describe('createQueryClient', () => {
  const retry = createQueryClient().getDefaultOptions().queries?.retry as (count: number, error: Error) => boolean

  it('never retries a 4xx answer: it will not change', () => {
    expect(retry(0, new ApiError(403, 'Forbidden', undefined, undefined))).toBe(false)
    expect(retry(0, new ApiError(404, 'Not Found', undefined, undefined))).toBe(false)
  })

  it('retries a server or network error once', () => {
    expect(retry(0, new ApiError(503, 'Service Unavailable', undefined, undefined))).toBe(true)
    expect(retry(0, new TypeError('Failed to fetch'))).toBe(true)
    expect(retry(1, new TypeError('Failed to fetch'))).toBe(false)
  })
})
