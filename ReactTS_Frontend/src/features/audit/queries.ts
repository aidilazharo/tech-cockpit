import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { AuditFacetsSchema, AuditPageSchema } from './schemas'

export const PAGE_SIZE = 50

export interface AuditFilters {
  actorEmail?: string
  action?: string
  resourceType?: string
  resourceId?: string
  /** ISO instants */
  from?: string
  to?: string
  page: number
}

export function useAuditEntries(filters: AuditFilters) {
  return useQuery({
    queryKey: ['audit', 'entries', filters],
    queryFn: ({ signal }) => {
      const { page, ...rest } = filters
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      for (const [key, value] of Object.entries(rest)) if (value) params.set(key, value)
      return api(`/api/v1/audit-logs?${params}`, { schema: AuditPageSchema, signal })
    },
    placeholderData: keepPreviousData,
  })
}

export function useAuditFacets() {
  return useQuery({ queryKey: ['audit', 'facets'], queryFn: ({ signal }) => api('/api/v1/audit-logs/facets', { schema: AuditFacetsSchema, signal }) })
}
