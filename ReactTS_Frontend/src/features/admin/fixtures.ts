import type { ApiKey, Assignment, Department, RefusedSignIn, Role, User } from './schemas'

export const IT = '10000000-0000-4000-8000-000000000001'
export const PMO = '10000000-0000-4000-8000-000000000002'

export const departments: Department[] = [
  { id: IT, code: 'IT', name: 'Information Technology', active: true, version: 1 },
  { id: PMO, code: 'PMO', name: 'Project Management Office', active: true, version: 1 },
]

export function user(overrides: Partial<User> = {}): User {
  return {
    id: '20000000-0000-4000-8000-000000000001',
    username: 'ana.lim',
    email: 'ana.lim@aia.com',
    emailFromOkta: false,
    firstName: 'Ana',
    lastName: 'Lim',
    status: 'active',
    isExternal: false,
    departmentId: IT,
    lastLoginAt: '2026-10-20T02:00:00.000Z',
    version: 3,
    ...overrides,
  }
}

export function role(overrides: Partial<Role> = {}): Role {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    code: 'pmo',
    name: 'PMO',
    description: 'Project management office',
    isSystem: true,
    isSystemAdmin: false,
    permissions: ['approvals:instance:read'],
    dataAccess: { financial: 'all', contract: 'none', personal: 'none' },
    canActForStaff: true,
    version: 2,
    ...overrides,
  }
}

export const systemAdminRole = role({
  id: '30000000-0000-4000-8000-000000000009',
  code: 'system-admin',
  name: 'System administrator',
  isSystemAdmin: true,
  permissions: [],
})

export function assignment(overrides: Partial<Assignment> = {}): Assignment {
  return {
    id: '40000000-0000-4000-8000-000000000001',
    userId: '20000000-0000-4000-8000-000000000001',
    roleCode: 'pmo',
    roleName: 'PMO',
    scopeType: 'global',
    scopeId: null,
    validFrom: '2026-01-01T00:00:00.000Z',
    validTo: null,
    active: true,
    ...overrides,
  }
}

export function apiKey(overrides: Partial<ApiKey> = {}): ApiKey {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    name: 'ServiceNow sync',
    keyPrefix: 'tck_AbC123',
    expiresAt: '2099-01-01T00:00:00.000Z',
    lastUsedAt: null,
    revokedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

export const permissionCatalogue = [
  { code: 'access:role:read', description: 'View roles, their permissions and data access' },
  { code: 'access:role:manage', description: 'Create, change and delete roles' },
  { code: 'approvals:instance:read', description: 'See approval progress and where it is waiting' },
  { code: 'audit:log:read', description: 'Read the audit log' },
  { code: 'sad:application-details:read', description: 'SAD: view the "Application Details" section' },
  { code: 'sad:application-details:update', description: 'SAD: edit the "Application Details" section of drafts' },
  { code: 'sad:security-design:read', description: 'SAD: view the "Security Architecture Design" section' },
  { code: 'sad:security-design:update', description: 'SAD: edit the "Security Architecture Design" section of drafts' },
  { code: 'sad:retention:manage', description: 'Maintain the standard backup retention list that SADs use' },
]

export function refusedSignIn(overrides: Partial<RefusedSignIn> = {}): RefusedSignIn {
  return {
    id: '25000000-0000-4000-8000-000000000001',
    username: 'new.person',
    email: 'new.person@aia.com',
    firstName: 'New',
    lastName: 'Person',
    attempts: 2,
    firstAttemptAt: '2026-10-22T01:00:00.000Z',
    lastAttemptAt: '2026-10-23T01:00:00.000Z',
    ...overrides,
  }
}
