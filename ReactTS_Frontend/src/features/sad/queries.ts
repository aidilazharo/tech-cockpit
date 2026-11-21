import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import {
  ApiPageSchema,
  ApplicationCallsSchema,
  BusinessApplicationsSchema,
  type DiagramDefaults,
  DiagramDefaultsSchema,
  type CreateRetention,
  type DiagramContent,
  DiagramsSchema,
  type DiagramSlot,
  ListPageSchema,
  OverviewSchema,
  RetentionListSchema,
  RetentionStandardSchema,
  SavedDiagramSchema,
  type SadSectionKey,
  SavedSectionSchema,
  ServersSchema,
  type SectionAnswers,
  TemplateSchema,
  type UpdateRetention,
  type Version,
  VersionRefSchema,
  UploadSchema,
  UploadsSchema,
  VersionSchema,
} from './schemas'

export const PAGE_SIZE = 25

export const sadKeys = {
  all: ['sad'] as const,
  template: ['sad', 'template'] as const,
  list: (params: Record<string, string>, page: number) => ['sad', 'list', params, page] as const,
  overview: (applicationId: string) => ['sad', 'overview', applicationId] as const,
  version: (id: string) => ['sad', 'version', id] as const,
  diagrams: (id: string) => ['sad', 'diagrams', id] as const,
  businessApplications: (id: string, q: string) => ['sad', 'business-applications', id, q] as const,
  apis: (params: Record<string, string>, page: number) => ['sad', 'apis', params, page] as const,
  retention: ['sad', 'retention'] as const,
  diagramDefaults: ['sad', 'diagram-defaults'] as const,
  servers: (id: string) => ['sad', 'servers', id] as const,
  calls: (applicationId: string) => ['sad', 'calls', applicationId] as const,
  uploads: (versionId: string) => ['sad', 'uploads', versionId] as const,
}

const search = (params: Record<string, string>, page: number) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== ''))
  query.set('page', String(page))
  query.set('pageSize', String(PAGE_SIZE))
  return query.toString()
}

/** The template changes only with a release. */
export function useSadTemplate() {
  return useQuery({ queryKey: sadKeys.template, queryFn: ({ signal }) => api('/api/v1/sad/template', { schema: TemplateSchema, signal }), staleTime: Infinity })
}

export function useSadList(params: Record<string, string>, page: number) {
  return useQuery({
    queryKey: sadKeys.list(params, page),
    queryFn: ({ signal }) => api(`/api/v1/sad/documents?${search(params, page)}`, { schema: ListPageSchema, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useSadOverview(applicationId: string, enabled = true) {
  return useQuery({ queryKey: sadKeys.overview(applicationId), queryFn: ({ signal }) => api(`/api/v1/sad/applications/${applicationId}`, { schema: OverviewSchema, signal }), enabled })
}

export function useSadVersion(id: string | null) {
  return useQuery({
    queryKey: sadKeys.version(String(id)),
    queryFn: ({ signal }) => api(`/api/v1/sad/versions/${id}`, { schema: VersionSchema, signal }),
    enabled: id !== null,
  })
}

export function useStartDraft(applicationId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => api(`/api/v1/sad/applications/${applicationId}/drafts`, { method: 'POST', schema: VersionRefSchema }),
    onSuccess: () => void client.invalidateQueries({ queryKey: sadKeys.all }),
  })
}

/** Saves one section; the cached version takes the new answers, row version and completion. */
export function useSaveSection(versionId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ section, answers, version }: { section: SadSectionKey; answers: SectionAnswers; version: number }) =>
      api(`/api/v1/sad/versions/${versionId}/sections/${section}`, { method: 'PUT', body: { answers, version }, schema: SavedSectionSchema }),
    onSuccess: (saved) => {
      client.setQueryData<Version>(sadKeys.version(versionId), (current) =>
        current && {
          ...current,
          sections: current.sections.map((section) => (section.key === saved.section ? { ...section, answers: saved.answers, rowVersion: saved.rowVersion } : section)),
          completion: saved.completion,
          hidden: saved.hidden,
        },
      )
      // Integration connections link to the API inventory's APIs, listed with the diagrams.
      if (saved.section === 'api-inventory') void client.invalidateQueries({ queryKey: sadKeys.diagrams(versionId) })
    },
  })
}

/** The diagram slots a version's readable sections show. */
export function useSadDiagrams(versionId: string, enabled = true) {
  return useQuery({
    queryKey: sadKeys.diagrams(versionId),
    queryFn: ({ signal }) => api(`/api/v1/sad/versions/${versionId}/diagrams`, { schema: DiagramsSchema, signal }),
    enabled,
  })
}

/** TRM applications to put on a draft's solution diagram (name and APM number), from two typed characters. */
export function useBusinessApplications(versionId: string, text: string) {
  const q = text.trim()
  return useQuery({
    queryKey: sadKeys.businessApplications(versionId, q),
    queryFn: ({ signal }) => api(`/api/v1/sad/versions/${versionId}/business-applications?${new URLSearchParams({ q })}`, { schema: BusinessApplicationsSchema, signal }),
    enabled: q.length >= 2,
  })
}

/** Saves one diagram slot; the cached slot and the version's completion take the result. */
export function useSaveDiagram(versionId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ slot, content, version, copyFromProduction }: { slot: DiagramSlot; content: DiagramContent; version: number; copyFromProduction?: true }) =>
      api(`/api/v1/sad/versions/${versionId}/diagrams/${slot}`, { method: 'PUT', body: { content, version, ...(copyFromProduction ? { copyFromProduction } : {}) }, schema: SavedDiagramSchema }),
    onSuccess: (saved) => {
      client.setQueryData<{ items: { slot: DiagramSlot; rowVersion: number; content: DiagramContent }[] }>(sadKeys.diagrams(versionId), (current) =>
        current && { ...current, items: current.items.map((item) => (item.slot === saved.slot ? { ...item, content: saved.content, rowVersion: saved.rowVersion } : item)) },
      )
      client.setQueryData<Version>(sadKeys.version(versionId), (current) => current && { ...current, completion: saved.completion, hidden: saved.hidden })
      // A diagram removed from the slot takes its files with it; what the editor cannot see may have changed (e.g. a copy).
      void client.invalidateQueries({ queryKey: sadKeys.uploads(versionId) })
      void client.invalidateQueries({ queryKey: sadKeys.diagrams(versionId) })
    },
  })
}

/** How often files still being checked for malware are looked at again. */
const SCAN_REFRESH_MS = 15_000

/** The files under the diagrams the caller sees (refreshed while any is being checked for malware). */
export function useUploads(versionId: string | undefined) {
  return useQuery({
    queryKey: sadKeys.uploads(versionId ?? ''),
    queryFn: ({ signal }) => api(`/api/v1/sad/versions/${versionId}/uploads`, { schema: UploadsSchema, signal }),
    // Diagrams shown without their version (e.g. in tests of the editor alone) have no files.
    enabled: versionId !== undefined,
    refetchInterval: (query) => (query.state.data?.items.some((item) => item.scan === 'scanning') ? SCAN_REFRESH_MS : false),
  })
}

/** Where a file is downloaded (an attachment, sent once it may be). */
export const uploadUrl = (versionId: string, uploadId: string) => `/api/v1/sad/versions/${versionId}/uploads/${uploadId}/file`

/** Adds a file under a saved diagram of a draft. */
export function useAddUpload(versionId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ slot, diagramId, file, name }: { slot: DiagramSlot; diagramId: string; file: Blob; name: string }) => {
      const form = new FormData()
      form.append('file', file, name)
      return api(`/api/v1/sad/versions/${versionId}/diagrams/${slot}/${diagramId}/uploads`, { method: 'POST', body: form, schema: UploadSchema })
    },
    onSettled: () => void client.invalidateQueries({ queryKey: sadKeys.uploads(versionId) }),
  })
}

export function useRemoveUpload(versionId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (uploadId: string) => api(`/api/v1/sad/versions/${versionId}/uploads/${uploadId}`, { method: 'DELETE' }),
    onSettled: () => void client.invalidateQueries({ queryKey: sadKeys.uploads(versionId) }),
  })
}

function versionAction(versionId: string, action: 'submit' | 'cancel') {
  return () => api(`/api/v1/sad/versions/${versionId}/${action}`, { method: 'POST', schema: VersionRefSchema })
}

export function useSubmitSad(versionId: string) {
  const client = useQueryClient()
  return useMutation({ mutationFn: versionAction(versionId, 'submit'), onSuccess: () => void client.invalidateQueries({ queryKey: sadKeys.all }) })
}

export function useCancelDraft(versionId: string) {
  const client = useQueryClient()
  return useMutation({ mutationFn: versionAction(versionId, 'cancel'), onSuccess: () => void client.invalidateQueries({ queryKey: sadKeys.all }) })
}

export function useSadApis(params: Record<string, string>, page: number) {
  return useQuery({
    queryKey: sadKeys.apis(params, page),
    queryFn: ({ signal }) => api(`/api/v1/sad/apis?${search(params, page)}`, { schema: ApiPageSchema, signal }),
    placeholderData: keepPreviousData,
  })
}

/** The standard retention rows, or none until loaded (or for someone who may not read them). */
export function useRetention(enabled = true) {
  return useQuery({ queryKey: sadKeys.retention, queryFn: ({ signal }) => api('/api/v1/sad/retention-standards', { schema: RetentionListSchema, signal }), enabled })
}

export function useSaveRetention() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: CreateRetention | UpdateRetention }) =>
      id
        ? api(`/api/v1/sad/retention-standards/${id}`, { method: 'PATCH', body, schema: RetentionStandardSchema })
        : api('/api/v1/sad/retention-standards', { method: 'POST', body, schema: RetentionStandardSchema }),
    onSuccess: () => void client.invalidateQueries({ queryKey: sadKeys.retention }),
  })
}

/** The hosting names new infrastructure diagrams start with. */
export function useDiagramDefaults() {
  return useQuery({ queryKey: sadKeys.diagramDefaults, queryFn: ({ signal }) => api('/api/v1/sad/diagram-defaults', { schema: DiagramDefaultsSchema, signal }) })
}

export function useSaveDiagramDefaults() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: DiagramDefaults) => api('/api/v1/sad/diagram-defaults', { method: 'PUT', body, schema: DiagramDefaultsSchema }),
    onSuccess: (saved) => client.setQueryData(sadKeys.diagramDefaults, saved),
  })
}

/** The application's TRM servers, for a draft's infrastructure diagram. */
export function useServers(versionId: string) {
  return useQuery({ queryKey: sadKeys.servers(versionId), queryFn: ({ signal }) => api(`/api/v1/sad/versions/${versionId}/servers`, { schema: ServersSchema, signal }) })
}

/** Calls between an application and others, from every application's latest approved SAD. */
export function useApplicationCalls(applicationId: string) {
  return useQuery({ queryKey: sadKeys.calls(applicationId), queryFn: ({ signal }) => api(`/api/v1/sad/applications/${applicationId}/calls`, { schema: ApplicationCallsSchema, signal }) })
}
