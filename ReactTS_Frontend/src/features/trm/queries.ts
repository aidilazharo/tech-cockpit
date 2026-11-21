import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ZodType } from 'zod'
import { api } from '../../lib/api'
import {
  ApplicationPageSchema,
  ApplicationSchema,
  CapabilityListSchema,
  CapabilitySchema,
  DeleteMissingResultSchema,
  FacetsSchema,
  MissingPageSchema,
  MissingSummarySchema,
  type DeleteMissingRequest,
  type RecordType,
  PortfolioListSchema,
  PortfolioSchema,
  ProductStandardPageSchema,
  ProductStandardSchema,
  ServerPageSchema,
  ServerSchema,
  ServicePageSchema,
  ServiceSchema,
  SoftwareModelPageSchema,
  SoftwareModelSchema,
  SyncRunPageSchema,
  SyncRunSchema,
  type UpdateApplicationRequest,
  type UpdatePortfolioRequest,
  type CreateInitiativeRequest,
  DomainListSchema,
  DomainRefSchema,
  InitiativePageSchema,
  InitiativeSchema,
  LandscapeSchema,
  LayerSchema,
  LayersSchema,
  PlannedApplicationListSchema,
  StandardUsageSchema,
  TechnologyViewSchema,
  type UpdateLayerRequest,
  type UpdateNamedRequest,
} from './schemas'

export const PAGE_SIZE = 25

export const trmKeys = {
  all: ['trm'] as const,
  list: (resource: string, params: Record<string, string>) => ['trm', resource, 'list', params] as const,
  detail: (resource: string, id: string) => ['trm', resource, id] as const,
  facets: ['trm', 'facets'] as const,
  capabilities: ['trm', 'capabilities', 'list'] as const,
  syncRuns: (page: number) => ['trm-sync-runs', page] as const,
  syncRun: (id: string) => ['trm-sync-run', id] as const,
  missingSummary: ['trm', 'missing', 'summary'] as const,
  missingList: (recordType: RecordType, q: string, page: number) => ['trm', 'missing', 'list', recordType, q, page] as const,
  portfolios: ['portfolios'] as const,
}

/** Query string with empty values left out, plus paging. */
function query(params: Record<string, string>, page: number): string {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== ''))
  search.set('page', String(page))
  search.set('pageSize', String(PAGE_SIZE))
  return search.toString()
}

const listHook =
  <T>(resource: string, schema: ZodType<T>) =>
  (params: Record<string, string>, page: number) =>
    useQuery({
      queryKey: trmKeys.list(resource, { ...params, page: String(page) }),
      queryFn: ({ signal }) => api(`/api/v1/trm/${resource}?${query(params, page)}`, { schema, signal }),
      placeholderData: keepPreviousData,
    })

const detailHook =
  <T>(resource: string, schema: ZodType<T>) =>
  (id: string) =>
    useQuery({
      queryKey: trmKeys.detail(resource, id),
      queryFn: ({ signal }) => api(`/api/v1/trm/${resource}/${id}`, { schema, signal }),
      enabled: id !== '',
    })

export const useApplications = listHook('applications', ApplicationPageSchema)
export const useApplication = detailHook('applications', ApplicationSchema)
export const useServices = listHook('services', ServicePageSchema)
export const useService = detailHook('services', ServiceSchema)
export const useSoftwareModels = listHook('software-models', SoftwareModelPageSchema)
export const useSoftwareModel = detailHook('software-models', SoftwareModelSchema)
export const useProductStandards = listHook('product-standards', ProductStandardPageSchema)
export const useProductStandard = detailHook('product-standards', ProductStandardSchema)
export const useServers = listHook('servers', ServerPageSchema)
export const useServer = detailHook('servers', ServerSchema)
export const useCapability = detailHook('capabilities', CapabilitySchema)

/** Applications matching what was typed (2 characters or more), for pickers. */
export function useApplicationSearch(text: string) {
  const q = text.trim()
  return useQuery({
    queryKey: trmKeys.list('applications', { q, page: '1' }),
    queryFn: ({ signal }) => api(`/api/v1/trm/applications?${query({ q }, 1)}`, { schema: ApplicationPageSchema, signal }),
    enabled: q.length >= 2,
  })
}

export function useCapabilities() {
  return useQuery({
    queryKey: trmKeys.capabilities,
    queryFn: ({ signal }) => api('/api/v1/trm/capabilities', { schema: CapabilityListSchema, signal }),
  })
}

export function useFacets() {
  return useQuery({ queryKey: trmKeys.facets, queryFn: ({ signal }) => api('/api/v1/trm/facets', { schema: FacetsSchema, signal }) })
}

export function useUpdateApplication(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateApplicationRequest) => api(`/api/v1/trm/applications/${id}`, { method: 'PATCH', body, schema: ApplicationSchema }),
    onSuccess: (application) => {
      client.setQueryData(trmKeys.detail('applications', id), application)
      void client.invalidateQueries({ queryKey: trmKeys.all })
    },
  })
}

export function useSetApplicationPortfolios(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (portfolioIds: string[]) =>
      api(`/api/v1/trm/applications/${id}/portfolios`, { method: 'PUT', body: { portfolioIds }, schema: ApplicationSchema }),
    onSuccess: (application) => {
      client.setQueryData(trmKeys.detail('applications', id), application)
      void client.invalidateQueries({ queryKey: trmKeys.all })
    },
  })
}

// ----- Sync runs (system admins)

export function useSyncRuns(page: number) {
  return useQuery({
    queryKey: trmKeys.syncRuns(page),
    queryFn: ({ signal }) => api(`/api/v1/trm/sync-runs?page=${page}&pageSize=${PAGE_SIZE}`, { schema: SyncRunPageSchema, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useSyncRun(id: string) {
  return useQuery({
    queryKey: trmKeys.syncRun(id),
    queryFn: ({ signal }) => api(`/api/v1/trm/sync-runs/${id}`, { schema: SyncRunSchema, signal }),
  })
}

// ----- Records missing from the ServiceNow export (removal)

export function useMissingSummary() {
  return useQuery({
    queryKey: trmKeys.missingSummary,
    queryFn: ({ signal }) => api('/api/v1/trm/missing-records/summary', { schema: MissingSummarySchema, signal }),
  })
}

export function useMissingRecords(recordType: RecordType, q: string, page: number, enabled = true) {
  return useQuery({
    queryKey: trmKeys.missingList(recordType, q, page),
    queryFn: ({ signal }) => api(`/api/v1/trm/missing-records?${query({ recordType, q }, page)}`, { schema: MissingPageSchema, signal }),
    placeholderData: keepPreviousData,
    enabled,
  })
}

export function useRemoveMissing() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: DeleteMissingRequest) => api('/api/v1/trm/missing-records/delete', { method: 'POST', body, schema: DeleteMissingResultSchema }),
    onSuccess: () => void client.invalidateQueries({ queryKey: trmKeys.all }),
  })
}

// ----- Portfolios

export function usePortfolios(enabled = true) {
  return useQuery({
    queryKey: trmKeys.portfolios,
    queryFn: ({ signal }) => api('/api/v1/portfolios', { schema: PortfolioListSchema, signal }),
    enabled,
  })
}

export function useCreatePortfolio() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api('/api/v1/portfolios', { method: 'POST', body: { name }, schema: PortfolioSchema }),
    onSuccess: () => void client.invalidateQueries({ queryKey: trmKeys.portfolios }),
  })
}

export function useUpdatePortfolio(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdatePortfolioRequest) => api(`/api/v1/portfolios/${id}`, { method: 'PATCH', body, schema: PortfolioSchema }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: trmKeys.portfolios })
      void client.invalidateQueries({ queryKey: trmKeys.all })
    },
  })
}

// ----- Part 3: domains, layers, landscape, roadmap

const landscapeKeys = {
  domains: ['trm', 'domains'] as const,
  layers: ['trm', 'layers'] as const,
  landscape: (params: Record<string, string>) => ['trm', 'landscape', params] as const,
  technology: ['trm', 'technology'] as const,
  standardUsage: (id: string) => ['trm', 'technology', id] as const,
  initiatives: (params: Record<string, string>) => ['trm-roadmap', 'list', params] as const,
  initiative: (id: string) => ['trm-roadmap', id] as const,
  planned: ['trm-roadmap', 'planned'] as const,
}

export function useDomains() {
  return useQuery({ queryKey: landscapeKeys.domains, queryFn: ({ signal }) => api('/api/v1/trm/domains', { schema: DomainListSchema, signal }) })
}

/** Create or change a domain or sub-domain, then refresh everything TRM. */
function useTrmMutation<A>(request: (args: A) => Promise<unknown>) {
  const client = useQueryClient()
  return useMutation({ mutationFn: request, onSuccess: () => void client.invalidateQueries({ queryKey: trmKeys.all }) })
}

export const useCreateDomain = () => useTrmMutation((name: string) => api('/api/v1/trm/domains', { method: 'POST', body: { name }, schema: DomainRefSchema }))
export const useUpdateDomain = () =>
  useTrmMutation(({ id, ...body }: UpdateNamedRequest & { id: string }) => api(`/api/v1/trm/domains/${id}`, { method: 'PATCH', body, schema: DomainRefSchema }))
export const useCreateSubdomain = () =>
  useTrmMutation(({ domainId, name }: { domainId: string; name: string }) => api(`/api/v1/trm/domains/${domainId}/subdomains`, { method: 'POST', body: { name }, schema: DomainRefSchema }))
export const useUpdateSubdomain = () =>
  useTrmMutation(({ id, ...body }: UpdateNamedRequest & { id: string }) => api(`/api/v1/trm/subdomains/${id}`, { method: 'PATCH', body, schema: DomainRefSchema }))

export function useSetApplicationSubdomains(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (subdomainIds: string[]) => api(`/api/v1/trm/applications/${id}/subdomains`, { method: 'PUT', body: { subdomainIds }, schema: ApplicationSchema }),
    onSuccess: (application) => {
      client.setQueryData(trmKeys.detail('applications', id), application)
      void client.invalidateQueries({ queryKey: trmKeys.all })
    },
  })
}

export function useLayers() {
  return useQuery({ queryKey: landscapeKeys.layers, queryFn: ({ signal }) => api('/api/v1/trm/layers', { schema: LayersSchema, signal }) })
}
export const useCreateLayer = () => useTrmMutation((name: string) => api('/api/v1/trm/layers', { method: 'POST', body: { name }, schema: LayerSchema }))
export const useUpdateLayer = () =>
  useTrmMutation(({ id, ...body }: UpdateLayerRequest & { id: string }) => api(`/api/v1/trm/layers/${id}`, { method: 'PATCH', body, schema: LayerSchema }))
export const useSetLayerMapping = () =>
  useTrmMutation((body: { standardCategory: string; layerId: string | null }) => api('/api/v1/trm/layer-mappings', { method: 'PUT', body, schema: LayersSchema }))

export function useLandscape(params: Record<string, string>) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== ''))
  return useQuery({
    queryKey: landscapeKeys.landscape(params),
    queryFn: ({ signal }) => api(`/api/v1/trm/landscape?${search}`, { schema: LandscapeSchema, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useTechnology() {
  return useQuery({ queryKey: landscapeKeys.technology, queryFn: ({ signal }) => api('/api/v1/trm/technology', { schema: TechnologyViewSchema, signal }) })
}

/** The software models and applications of one product standard (loaded when its tile is opened). */
export function useStandardUsage(id: string) {
  return useQuery({
    queryKey: landscapeKeys.standardUsage(id),
    queryFn: ({ signal }) => api(`/api/v1/trm/technology/standards/${id}`, { schema: StandardUsageSchema, signal }),
  })
}

export function useInitiatives(params: Record<string, string>, page: number) {
  return useQuery({
    queryKey: landscapeKeys.initiatives({ ...params, page: String(page) }),
    queryFn: ({ signal }) => api(`/api/v1/trm/initiatives?${query(params, page)}`, { schema: InitiativePageSchema, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useInitiative(id: string) {
  return useQuery({
    queryKey: landscapeKeys.initiative(id),
    queryFn: ({ signal }) => api(`/api/v1/trm/initiatives/${id}`, { schema: InitiativeSchema, signal }),
    enabled: id !== '',
  })
}

export function useSaveInitiative(id: string | null) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateInitiativeRequest & { version?: number }) =>
      id
        ? api(`/api/v1/trm/initiatives/${id}`, { method: 'PUT', body, schema: InitiativeSchema })
        : api('/api/v1/trm/initiatives', { method: 'POST', body, schema: InitiativeSchema }),
    onSuccess: (initiative) => {
      client.setQueryData(landscapeKeys.initiative(initiative.id), initiative)
      void client.invalidateQueries({ queryKey: ['trm-roadmap'] })
    },
  })
}

export function usePlannedApplications() {
  return useQuery({ queryKey: landscapeKeys.planned, queryFn: ({ signal }) => api('/api/v1/trm/planned-applications', { schema: PlannedApplicationListSchema, signal }) })
}

export function useLinkPlannedApplication() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, applicationId }: { id: string; applicationId: string | null }) =>
      api(`/api/v1/trm/planned-applications/${id}/link`, { method: 'PUT', body: { applicationId }, schema: PlannedApplicationListSchema }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['trm-roadmap'] }),
  })
}
