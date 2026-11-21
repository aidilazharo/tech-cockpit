import { ExecutionContext, ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { AuthService } from './auth.service.js';
import { Authenticated, principalFrom, Public, RequireAnyPermission, RequirePermission } from './decorators.js';
import { AuthGuard, PermissionGuard } from './guards.js';
import { Principal } from './principal.js';

class Routes {
  @Public('probe') open() {}
  @Authenticated('any user') any() {}
  @RequirePermission('audit:log:read') guarded() {}
  @RequireAnyPermission('audit:log:read', 'access:role:read') either() {}
  undeclared() {}
}

function ctx(handler: () => void, request: Record<string, unknown> = {}): ExecutionContext {
  const req = { method: 'GET', headers: {}, originalUrl: '/api/v1/x', ...request };
  return {
    getHandler: () => handler,
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const audit = () => ({ recordSecurityEvent: vi.fn().mockResolvedValue(undefined) }) as unknown as AuditService & { recordSecurityEvent: ReturnType<typeof vi.fn> };
const principal = (permissions: string[]) =>
  new Principal(
    { id: 'u', username: 'u@aia.com', email: 'u@aia.com', firstName: 'U', lastName: 'U', isExternal: false },
    [{ roleCode: 'r', permissions: new Set(permissions), scope: { scopeType: 'global', scopeId: null }, dataAccess: { financial: 'none', contract: 'none', personal: 'none' } }],
    { method: 'api-key' },
    false,
  );

describe('AuthGuard', () => {
  it('lets public routes through without authenticating', async () => {
    const auth = { authenticate: vi.fn() } as unknown as AuthService;
    await expect(new AuthGuard(new Reflector(), auth, audit()).canActivate(ctx(Routes.prototype.open))).resolves.toBe(true);
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it.each([
    [true, 'invalid credentials'],
    [false, 'no credentials'],
  ])('records the failure reason and answers 401 (credentials presented: %s)', async (presented, reason) => {
    const log = audit();
    const auth = { authenticate: vi.fn().mockResolvedValue(null), presentedCredentials: () => presented } as unknown as AuthService;
    const guard = new AuthGuard(new Reflector(), auth, log);
    await expect(guard.canActivate(ctx(Routes.prototype.guarded))).rejects.toThrow(UnauthorizedException);
    expect(log.recordSecurityEvent).toHaveBeenCalledWith('auth.failed', expect.anything(), 401, { reason });
  });

  it('refuses a cookie-session request from an untrusted origin (CSRF) and audits it', async () => {
    const log = audit();
    const sessionPrincipal = new Principal(principal([]).user, [], { method: 'session', sessionId: 's' }, false);
    const auth = { authenticate: vi.fn().mockResolvedValue(sessionPrincipal), isTrustedOrigin: () => false } as unknown as AuthService;
    const guard = new AuthGuard(new Reflector(), auth, log);
    await expect(guard.canActivate(ctx(Routes.prototype.any, { method: 'POST' }))).rejects.toThrow(ForbiddenException);
    expect(log.recordSecurityEvent).toHaveBeenCalledWith('access.denied', expect.anything(), 403, { reason: 'untrusted origin' });
  });

  it('does not apply the origin check to API keys', async () => {
    const auth = { authenticate: vi.fn().mockResolvedValue(principal([])), isTrustedOrigin: () => false } as unknown as AuthService;
    await expect(new AuthGuard(new Reflector(), auth, audit()).canActivate(ctx(Routes.prototype.any, { method: 'POST' }))).resolves.toBe(true);
  });
});

describe('PermissionGuard', () => {
  it('allows @Authenticated routes for any signed-in user', async () => {
    const guard = new PermissionGuard(new Reflector(), audit());
    await expect(guard.canActivate(ctx(Routes.prototype.any, { principal: principal([]) }))).resolves.toBe(true);
  });

  it('allows a route when the permission is held', async () => {
    const guard = new PermissionGuard(new Reflector(), audit());
    await expect(guard.canActivate(ctx(Routes.prototype.guarded, { principal: principal(['audit:log:read']) }))).resolves.toBe(true);
  });

  it('allows an any-of route when one of the permissions is held, and refuses (audited) when none is', async () => {
    const log = audit();
    const guard = new PermissionGuard(new Reflector(), log);
    await expect(guard.canActivate(ctx(Routes.prototype.either, { principal: principal(['access:role:read']) }))).resolves.toBe(true);
    await expect(guard.canActivate(ctx(Routes.prototype.either, { principal: principal(['trm:application:read']) }))).rejects.toThrow(ForbiddenException);
    expect(log.recordSecurityEvent).toHaveBeenCalledWith('access.denied', expect.anything(), 403, { permission: 'audit:log:read | access:role:read' });
  });

  it('fails closed on a route with no access declaration, and audits it', async () => {
    const log = audit();
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const guard = new PermissionGuard(new Reflector(), log);
    await expect(guard.canActivate(ctx(Routes.prototype.undeclared, { principal: principal(['audit:log:read']) }))).rejects.toThrow(ForbiddenException);
    expect(log.recordSecurityEvent).toHaveBeenCalledWith('access.denied', expect.anything(), 403, { reason: 'no access rule' });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('principalFrom', () => {
  it('returns the principal, or 401 when a route is reached without one', () => {
    const p = principal([]);
    expect(principalFrom(ctx(Routes.prototype.any, { principal: p }))).toBe(p);
    expect(() => principalFrom(ctx(Routes.prototype.any))).toThrow(UnauthorizedException);
  });
});
