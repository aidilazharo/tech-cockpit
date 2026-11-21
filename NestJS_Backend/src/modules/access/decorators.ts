import { createParamDecorator, type ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';
import type { AppRequest } from '../../common/http/app-request.js';
import type { PermissionCode } from './permission-catalogue.js';
import type { Principal } from './principal.js';

export const ACCESS_RULE = 'techcockpit:access-rule';
export const AUDIT_RESOURCE = 'techcockpit:audit-resource';
export const SKIP_REQUEST_AUDIT = 'techcockpit:skip-request-audit';

export type AccessRule =
  | { kind: 'public'; reason: string }
  | { kind: 'authenticated'; reason: string }
  | { kind: 'permission'; code: PermissionCode }
  | { kind: 'anyPermission'; codes: PermissionCode[] };

/** No login required. A reason is mandatory and reviewed in security reviews. */
export const Public = (reason: string) => SetMetadata(ACCESS_RULE, { kind: 'public', reason } satisfies AccessRule);

/** Any signed-in user, no specific permission. A reason is mandatory. */
export const Authenticated = (reason: string) =>
  SetMetadata(ACCESS_RULE, { kind: 'authenticated', reason } satisfies AccessRule);

/** Requires the permission in at least one scope. Services still check the record's scope. */
export const RequirePermission = (code: PermissionCode) =>
  SetMetadata(ACCESS_RULE, { kind: 'permission', code } satisfies AccessRule);

/** Requires at least one of the permissions in at least one scope (e.g. any SAD section). Services still check the record. */
export const RequireAnyPermission = (...codes: [PermissionCode, ...PermissionCode[]]) =>
  SetMetadata(ACCESS_RULE, { kind: 'anyPermission', codes } satisfies AccessRule);

/**
 * Do not record this route's successful requests in the audit log (failures still are).
 * Only for polled endpoints that return no business data. A reason is mandatory.
 */
export const SkipRequestAudit = (reason: string) => SetMetadata(SKIP_REQUEST_AUDIT, reason);

/** Names the resource type recorded in the audit log for a controller's requests. */
export const AuditResource = (resourceType: string) => SetMetadata(AUDIT_RESOURCE, resourceType);

/** The authenticated principal of the request; 401 if the route was reached without one. */
export function principalFrom(ctx: ExecutionContext): Principal {
  const principal = ctx.switchToHttp().getRequest<AppRequest>().principal;
  if (!principal) {
    throw new UnauthorizedException();
  }
  return principal;
}

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext) => principalFrom(ctx));
