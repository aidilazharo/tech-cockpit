import { ALL_PERMISSION_CODES, type PermissionCode } from './permission-catalogue.js';

export const SCOPE_TYPES = ['global', 'department', 'portfolio', 'stream', 'application', 'vendor'] as const;
export type ScopeType = (typeof SCOPE_TYPES)[number];

// SAD sections are not a data class: each has its own View/Edit permissions (sad:<section>:read|update).
export const DATA_CLASSES = ['financial', 'contract', 'personal'] as const;
export type DataClass = (typeof DATA_CLASSES)[number];

export const DATA_ACCESS_LEVELS = ['none', 'own', 'scope', 'all'] as const;
export type DataAccessLevel = (typeof DATA_ACCESS_LEVELS)[number];
export type DataAccess = Record<DataClass, DataAccessLevel>;

export const NO_DATA_ACCESS: DataAccess = {
  financial: 'none',
  contract: 'none',
  personal: 'none',
};

export interface ScopeRef {
  scopeType: ScopeType;
  scopeId: string | null;
}

/** Where a record lives; used to test scoped grants. */
export interface ResourceScope {
  departmentId?: string | null;
  portfolioId?: string | null;
  streamId?: string | null;
  applicationId?: string | null;
  vendorId?: string | null;
  /** Records in several portfolios (e.g. a TRM application): any of them counts. */
  portfolioIds?: readonly string[];
  /** Records linked to several applications (e.g. a TRM service): any of them counts. */
  applicationIds?: readonly string[];
}

/** One active role assignment, flattened. */
export interface Grant {
  roleCode: string;
  permissions: ReadonlySet<string>;
  scope: ScopeRef;
  dataAccess: DataAccess;
}

export interface PrincipalUser {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  isExternal: boolean;
}

export interface AuthInfo {
  method: 'api-key' | 'session';
  apiKeyId?: string;
  sessionId?: string;
  /** Browser sessions: when the access token and the whole session end */
  accessExpiresAt?: Date;
  sessionExpiresAt?: Date;
}

const SCOPE_FIELD: Record<Exclude<ScopeType, 'global'>, 'departmentId' | 'portfolioId' | 'streamId' | 'applicationId' | 'vendorId'> = {
  department: 'departmentId',
  portfolio: 'portfolioId',
  stream: 'streamId',
  application: 'applicationId',
  vendor: 'vendorId',
};

/** True when a grant's scope covers the record. A portfolio scope covers its streams via portfolioId. */
export function scopeContains(scope: ScopeRef, resource: ResourceScope): boolean {
  if (scope.scopeType === 'global') {
    return true;
  }
  const value = resource[SCOPE_FIELD[scope.scopeType]];
  if (value != null && value === scope.scopeId) return true;
  const many = scope.scopeType === 'portfolio' ? resource.portfolioIds : scope.scopeType === 'application' ? resource.applicationIds : undefined;
  return scope.scopeId !== null && (many?.includes(scope.scopeId) ?? false);
}

/** The authenticated caller: identity, active grants, and how they authenticated. */
export class Principal {
  constructor(
    readonly user: PrincipalUser,
    readonly grants: readonly Grant[],
    readonly auth: AuthInfo,
    readonly isSystemAdmin: boolean,
  ) {}

  /**
   * Without `resource`: does the user hold the permission anywhere (route guard).
   * With `resource`: does a grant whose scope contains the record hold it (services).
   */
  can(code: PermissionCode, resource?: ResourceScope): boolean {
    if (this.isSystemAdmin) {
      return true;
    }
    return this.grants.some(
      (grant) => grant.permissions.has(code) && (resource === undefined || scopeContains(grant.scope, resource)),
    );
  }

  permissionCodes(): string[] {
    if (this.isSystemAdmin) {
      return [...ALL_PERMISSION_CODES].sort();
    }
    return [...new Set(this.grants.flatMap((grant) => [...grant.permissions]))].sort();
  }

  roleCodes(): string[] {
    return [...new Set(this.grants.map((grant) => grant.roleCode))].sort();
  }
}
