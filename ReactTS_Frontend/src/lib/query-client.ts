import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

/** Server-state cache. 4xx answers are final, so they are never retried. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => !(error instanceof ApiError && error.status < 500) && failureCount < 1,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  })
}
