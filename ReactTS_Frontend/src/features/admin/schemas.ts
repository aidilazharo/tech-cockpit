import { z } from 'zod'

// Shapes of the TechCockpit administration API. contract.test.ts checks them against
// NestJS_Backend/openapi.json, so a backend change that breaks the UI fails the build.

const isoDateTime = z.iso.datetime()

export const USER_STATUSES = ['active', 'disabled'] as const
// SAD sections have their own View/Edit permissions instead of a data class.
export const DATA_CLASSES = ['financial', 'contract', 'personal'] as const
export const DATA_ACCESS_LEVELS = ['none', 'own', 'scope', 'all'] as const
export const SCOPE_TYPES = ['global', 'department', 'portfolio', 'stream', 'application', 'vendor'] as const
/** Scopes the assign-role form offers today; the rest arrive with their modules. */
export const ASSIGNABLE_SCOPES = ['global', 'department', 'portfolio', 'application'] as const

export const UserSchema = z.object({
  id: z.uuid(),
  /** Okta username (lower-case): how the person signs in */
  username: z.string(),
  email: z.string(),
  /** The email came from Okta and cannot be edited */
  emailFromOkta: z.boolean(),
  firstName: z.string(),
  lastName: z.string(),
  status: z.enum(USER_STATUSES),
  isExternal: z.boolean(),
  departmentId: z.uuid().nullable(),
  lastLoginAt: isoDateTime.nullable(),
  version: z.number().int(),
})
export type User = z.infer<typeof UserSchema>

export const UserPageSchema = z.object({
  items: z.array(UserSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
})

const level = z.enum(DATA_ACCESS_LEVELS)
export const DataAccessSchema = z.object({ financial: level, contract: level, personal: level })
export type DataAccess = z.infer<typeof DataAccessSchema>
export type DataClass = (typeof DATA_CLASSES)[number]
export type DataAccessLevel = (typeof DATA_ACCESS_LEVELS)[number]

export const RoleSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  isSystemAdmin: z.boolean(),
  permissions: z.array(z.string()),
  dataAccess: DataAccessSchema,
  /** Holders can be out-of-office delegates and roadmap owners */
  canActForStaff: z.boolean(),
  version: z.number().int(),
})
export type Role = z.infer<typeof RoleSchema>
export const RoleListSchema = z.object({ items: z.array(RoleSchema) })

export const PermissionListSchema = z.object({ items: z.array(z.object({ code: z.string(), description: z.string() })) })
export type Permission = z.infer<typeof PermissionListSchema>['items'][number]

export const DepartmentSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string(), active: z.boolean(), version: z.number().int() })
export type Department = z.infer<typeof DepartmentSchema>
export const DepartmentListSchema = z.object({ items: z.array(DepartmentSchema) })

export const AssignmentSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  roleCode: z.string(),
  roleName: z.string(),
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: z.uuid().nullable(),
  validFrom: isoDateTime,
  validTo: isoDateTime.nullable(),
  active: z.boolean(),
})
export type Assignment = z.infer<typeof AssignmentSchema>
export const AssignmentListSchema = z.object({ items: z.array(AssignmentSchema) })

export const ApiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  keyPrefix: z.string(),
  expiresAt: isoDateTime,
  lastUsedAt: isoDateTime.nullable(),
  revokedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
})
export type ApiKey = z.infer<typeof ApiKeySchema>
export const ApiKeyListSchema = z.object({ items: z.array(ApiKeySchema) })
export const CreatedApiKeySchema = ApiKeySchema.extend({ token: z.string() })

// ----- Requests (what the screens send) --------------------------------------

export const CreateUserRequest = z.object({
  username: z.string(),
  email: z.string(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  isExternal: z.boolean(),
  departmentId: z.uuid().nullable().optional(),
})
export const UpdateUserRequest = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  isExternal: z.boolean().optional(),
  status: z.enum(USER_STATUSES).optional(),
  departmentId: z.uuid().nullable().optional(),
  version: z.number().int(),
})
export const CreateAssignmentRequest = z.object({
  userId: z.uuid(),
  roleCode: z.string(),
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: z.uuid().nullable().optional(),
  validFrom: z.iso.datetime().optional(),
  validTo: z.iso.datetime().nullable().optional(),
})
export const CreateRoleRequest = z.object({
  code: z.string(),
  name: z.string(),
  description: z.string().optional(),
  permissions: z.array(z.string()),
  dataAccess: DataAccessSchema,
  canActForStaff: z.boolean().optional(),
})
export const UpdateRoleRequest = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string()).optional(),
  dataAccess: DataAccessSchema.optional(),
  canActForStaff: z.boolean().optional(),
  version: z.number().int(),
})
export const CreateDepartmentRequest = z.object({ code: z.string(), name: z.string() })
export const UpdateDepartmentRequest = z.object({ name: z.string().optional(), active: z.boolean().optional(), version: z.number().int() })
export const CreateApiKeyRequest = z.object({ name: z.string(), expiresInDays: z.number().int() })

// ----- Field classification ----------------------------------------------------------

export const FIELD_CLASSES = ['financial', 'contract', 'personal', 'internal'] as const
export type FieldClass = (typeof FIELD_CLASSES)[number]
export const ClassifiedFieldSchema = z.object({
  key: z.string(),
  module: z.string(),
  label: z.string(),
  dataClass: z.enum(FIELD_CLASSES),
  defaultClass: z.enum(FIELD_CLASSES),
})
export type ClassifiedField = z.infer<typeof ClassifiedFieldSchema>
export const ClassifiedFieldListSchema = z.object({ items: z.array(ClassifiedFieldSchema) })
export const UpdateFieldClassRequest = z.object({ dataClass: z.enum(FIELD_CLASSES).nullable() })

// ----- Refused sign-ins ----------------------------------------------------------------

export const RefusedSignInSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  email: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  attempts: z.number().int(),
  firstAttemptAt: isoDateTime,
  lastAttemptAt: isoDateTime,
})
export type RefusedSignIn = z.infer<typeof RefusedSignInSchema>
export const RefusedSignInPageSchema = z.object({ items: z.array(RefusedSignInSchema), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() })
