import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AppRequest } from '../../common/http/app-request.js';
import { AuditService } from '../audit/audit.service.js';
import { ACCESS_RULE, type AccessRule } from './decorators.js';
import { AuthService } from './auth.service.js';

function ruleFor(reflector: Reflector, context: ExecutionContext): AccessRule | undefined {
  return reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [context.getHandler(), context.getClass()]);
}

/** Authenticates every request except @Public routes and applies the CSRF origin check. Failures are audited. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (ruleFor(this.reflector, context)?.kind === 'public') {
      return true;
    }
    const req = context.switchToHttp().getRequest<AppRequest>();
    const principal = await this.auth.authenticate(req);
    if (!principal) {
      await this.audit.recordSecurityEvent('auth.failed', req, 401, {
        reason: this.auth.presentedCredentials(req) ? 'invalid credentials' : 'no credentials',
      });
      throw new UnauthorizedException('Sign in or provide a valid API key.');
    }
    req.principal = principal;
    // Cookies are sent automatically by browsers, so cookie-authenticated changes must
    // come from our own pages (CSRF). API keys are never sent automatically.
    if (principal.auth.method === 'session' && !this.auth.isTrustedOrigin(req)) {
      await this.audit.recordSecurityEvent('access.denied', req, 403, { reason: 'untrusted origin' });
      throw new ForbiddenException('Cross-site request refused.');
    }
    return true;
  }
}

/**
 * Enforces @RequirePermission. Fail-closed: a route with no access declaration at
 * all is refused, so a forgotten decorator can never expose an endpoint.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  private readonly logger = new Logger(PermissionGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const rule = ruleFor(this.reflector, context);
    if (rule?.kind === 'public' || rule?.kind === 'authenticated') {
      return true;
    }
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (!rule) {
      this.logger.error(`Route ${req.method} ${req.route?.path} has no access rule; refusing.`);
    }
    const codes = rule ? (rule.kind === 'permission' ? [rule.code] : rule.codes) : [];
    if (!codes.some((code) => req.principal?.can(code))) {
      await this.audit.recordSecurityEvent('access.denied', req, 403, rule ? { permission: codes.join(' | ') } : { reason: 'no access rule' });
      throw new ForbiddenException('You do not have permission to do this.');
    }
    return true;
  }
}
