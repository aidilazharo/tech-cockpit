import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { z } from 'zod'
import { api } from '../../lib/api'
import {
  ApiKeyListSchema,
  AssignmentListSchema,
  AssignmentSchema,
  CreatedApiKeySchema,
  type CreateApiKeyRequest,
  type CreateAssignmentRequest,
  type CreateDepartmentRequest,
  type CreateRoleRequest,
  type CreateUserRequest,
  DepartmentListSchema,
  DepartmentSchema,
  PermissionListSchema,
  RoleListSchema,
  RoleSchema,
  type UpdateDepartmentRequest,
  type UpdateRoleRequest,
  type UpdateUserRequest,
  UserPageSchema,
  UserSchema,
  ApiKeySchema,
  ClassifiedFieldListSchema,
  RefusedSignInPageSchema,
  ClassifiedFieldSchema,
  type FieldClass,
} from './schemas'

export const PAGE_SIZE = 25

export const keys = {
  users: ['users'] as const,
  userPage: (q: string, page: number) => ['users', 'page', { q, page }] as const,
  user: (id: string) => ['users', id] as const,
  assignments: (userId: string) => ['users', userId, 'assignments'] as const,
  roles: ['roles'] as const,
  role: (id: string) => ['roles', id] as const,
  permissions: ['permissions'] as const,
  departments: ['departments'] as const,
  apiKeys: ['me', 'api-keys'] as const,
  userApiKeys: (userId: string) => ['users', userId, 'api-keys'] as const,
  fieldClasses: ['field-classes'] as const,
  refusedSignIns: ['refused-sign-ins'] as const,
}

// ----- Users -----------------------------------------------------------------

export function useUsers(q: string, page: number) {
  return useQuery({
    queryKey: keys.userPage(q, page),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...(q && { q }) })
      return api(`/api/v1/users?${params}`, { schema: UserPageSchema, signal })
    },
    placeholderData: keepPreviousData,
  })
}

export function useUser(id: string) {
  return useQuery({ queryKey: keys.user(id), queryFn: ({ signal }) => api(`/api/v1/users/${id}`, { schema: UserSchema, signal }) })
}

export function useCreateUser() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateUserRequest>) => api('/api/v1/users', { method: 'POST', body, schema: UserSchema }),
    // Adding someone removes their refused sign-in.
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: keys.users }), client.invalidateQueries({ queryKey: keys.refusedSignIns })]),
  })
}

export function useUpdateUser(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof UpdateUserRequest>) => api(`/api/v1/users/${id}`, { method: 'PATCH', body, schema: UserSchema }),
    onSuccess: (user) => {
      client.setQueryData(keys.user(id), user)
      return client.invalidateQueries({ queryKey: keys.users })
    },
  })
}

// ----- Role assignments ------------------------------------------------------

export function useAssignments(userId: string, enabled = true) {
  return useQuery({
    queryKey: keys.assignments(userId),
    queryFn: ({ signal }) => api(`/api/v1/users/${userId}/role-assignments`, { schema: AssignmentListSchema, signal }),
    enabled,
  })
}

export function useCreateAssignment(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateAssignmentRequest>) =>
      api('/api/v1/role-assignments', { method: 'POST', body, schema: AssignmentSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.assignments(userId) }),
  })
}

export function useEndAssignment(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (assignmentId: string) => api(`/api/v1/role-assignments/${assignmentId}/end`, { method: 'POST', schema: AssignmentSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.assignments(userId) }),
  })
}

// ----- Roles and permissions -------------------------------------------------

export function useRoles(enabled = true) {
  return useQuery({ queryKey: keys.roles, queryFn: ({ signal }) => api('/api/v1/roles', { schema: RoleListSchema, signal }), enabled })
}

export function useRole(id: string | undefined) {
  return useQuery({
    queryKey: keys.role(id ?? ''),
    queryFn: ({ signal }) => api(`/api/v1/roles/${id}`, { schema: RoleSchema, signal }),
    enabled: Boolean(id),
  })
}

export function usePermissions() {
  return useQuery({
    queryKey: keys.permissions,
    queryFn: ({ signal }) => api('/api/v1/permissions', { schema: PermissionListSchema, signal }),
    staleTime: Infinity,
  })
}

export function useCreateRole() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateRoleRequest>) => api('/api/v1/roles', { method: 'POST', body, schema: RoleSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.roles }),
  })
}

export function useUpdateRole(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof UpdateRoleRequest>) => api(`/api/v1/roles/${id}`, { method: 'PATCH', body, schema: RoleSchema }),
    onSuccess: (role) => {
      client.setQueryData(keys.role(id), role)
      return client.invalidateQueries({ queryKey: keys.roles })
    },
  })
}

export function useDeleteRole() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.roles }),
  })
}

// ----- Departments -----------------------------------------------------------

export function useDepartments() {
  return useQuery({
    queryKey: keys.departments,
    queryFn: ({ signal }) => api('/api/v1/departments', { schema: DepartmentListSchema, signal }),
  })
}

export function useCreateDepartment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateDepartmentRequest>) =>
      api('/api/v1/departments', { method: 'POST', body, schema: DepartmentSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.departments }),
  })
}

export function useUpdateDepartment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: z.input<typeof UpdateDepartmentRequest> & { id: string }) =>
      api(`/api/v1/departments/${id}`, { method: 'PATCH', body, schema: DepartmentSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.departments }),
  })
}

// ----- Another user's API keys (administrators) ---------------------------------

export function useUserApiKeys(userId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.userApiKeys(userId),
    queryFn: ({ signal }) => api(`/api/v1/users/${userId}/api-keys`, { schema: ApiKeyListSchema, signal }),
    enabled,
  })
}

export function useRevokeUserApiKey(userId: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/v1/api-keys/${id}/revoke`, { method: 'POST', schema: ApiKeySchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.userApiKeys(userId) }),
  })
}

// ----- My API keys -----------------------------------------------------------

export function useMyApiKeys() {
  return useQuery({ queryKey: keys.apiKeys, queryFn: ({ signal }) => api('/api/v1/me/api-keys', { schema: ApiKeyListSchema, signal }) })
}

export function useCreateApiKey() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: z.input<typeof CreateApiKeyRequest>) =>
      api('/api/v1/me/api-keys', { method: 'POST', body, schema: CreatedApiKeySchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.apiKeys }),
  })
}

export function useRevokeApiKey() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/v1/me/api-keys/${id}/revoke`, { method: 'POST', schema: ApiKeySchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.apiKeys }),
  })
}

// ----- Field classification

export function useFieldClasses() {
  return useQuery({ queryKey: keys.fieldClasses, queryFn: ({ signal }) => api('/api/v1/field-classes', { schema: ClassifiedFieldListSchema, signal }) })
}

/** null goes back to the default from code. */
export function useSetFieldClass() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ key, dataClass }: { key: string; dataClass: FieldClass | null }) =>
      api(`/api/v1/field-classes/${encodeURIComponent(key)}`, { method: 'PUT', body: { dataClass }, schema: ClassifiedFieldSchema }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.fieldClasses }),
  })
}

// ----- Refused sign-ins

/** People Okta signed in who have not been added (latest attempt first). */
export function useRefusedSignIns(enabled: boolean) {
  return useQuery({
    queryKey: keys.refusedSignIns,
    queryFn: ({ signal }) => api('/api/v1/refused-sign-ins?pageSize=100', { schema: RefusedSignInPageSchema, signal }),
    enabled,
  })
}

export function useDismissRefusedSignIn() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api(`/api/v1/refused-sign-ins/${id}`, { method: 'DELETE' }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.refusedSignIns }),
  })
}
