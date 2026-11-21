import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../lib/api'

export const RefusedUsernameSchema = z.object({ username: z.string().nullable() })

/** The Okta username of the sign-in the backend just refused in this browser (null once forgotten). */
export function useRefusedUsername(enabled: boolean) {
  return useQuery({
    queryKey: ['auth', 'refused-username'],
    queryFn: ({ signal }) => api('/api/v1/auth/refused-username', { schema: RefusedUsernameSchema, signal }),
    enabled,
    staleTime: Infinity,
  })
}
