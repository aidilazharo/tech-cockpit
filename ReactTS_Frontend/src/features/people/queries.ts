import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { PeopleSchema } from './schemas'

/** Active people whose name or email contains the text (at least 2 characters); optionally only those who can act for staff. */
export function usePeopleSearch(text: string, { actsForStaff = false }: { actsForStaff?: boolean } = {}) {
  const q = text.trim()
  return useQuery({
    queryKey: ['people', 'search', q, actsForStaff],
    queryFn: ({ signal }) => api(`/api/v1/people?q=${encodeURIComponent(q)}${actsForStaff ? '&actsForStaff=true' : ''}`, { schema: PeopleSchema, signal }),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  })
}

/** Names for known user ids (e.g. approvers named in a rule). */
export function usePeopleByIds(ids: string[]) {
  const sorted = [...new Set(ids)].sort()
  return useQuery({
    queryKey: ['people', 'ids', sorted],
    queryFn: ({ signal }) => api(`/api/v1/people?ids=${sorted.join(',')}`, { schema: PeopleSchema, signal }),
    enabled: sorted.length > 0,
    staleTime: 300_000,
  })
}
