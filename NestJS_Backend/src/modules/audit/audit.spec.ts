import { CallHandler, ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AppRequest } from '../../common/http/app-request.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuditService } from './audit.service.js';

function fakeEm() {
  const created: Record<string, unknown>[] = [];
  const findAndCount = vi.fn().mockResolvedValue([[], 0]);
  const fork = () => ({
    create: (_entity: unknown, data: Record<string, unknown>) => created.push(data),
    flush: vi.fn().mockResolvedValue(undefined),
    findAndCount,
  });
  return { em: { fork } as never, created, findAndCount };
}

const bareRequest = { method: 'GET', originalUrl: '/api/v1/roles/abc?x=1', id: 'r1', headers: {}, params: {} } as unknown as AppRequest;

describe('AuditService', () => {
  it('records requests without optional client details as nulls', async () => {
    const { em, created } = fakeEm();
    await new AuditService(em).recordRequest(bareRequest, 200, null);
    expect(created[0]).toMatchObject({ action: 'http.request', path: '/api/v1/roles/abc', ipAddress: null, userAgent: null, resourceId: null, actorUserId: null });
  });

  it('records a security event without metadata', async () => {
    const { em, created } = fakeEm();
    await new AuditService(em).recordSecurityEvent('auth.failed', bareRequest, 401);
    expect(created[0]).toMatchObject({ action: 'auth.failed', statusCode: 401, metadata: null });
  });

  it('records a system change (no principal) with metadata', async () => {
    const { em, created } = fakeEm();
    await new AuditService(em).recordChange(null, 'x.done', 'x', '1', { before: null, after: {} }, { by: 'scheduler' });
    expect(created[0]).toMatchObject({ actorUserId: null, metadata: { by: 'scheduler' } });
  });

  it.each([
    [{ from: new Date('2026-01-01') }, { $gte: new Date('2026-01-01') }],
    [{ to: new Date('2026-02-01') }, { $lte: new Date('2026-02-01') }],
    [{ from: new Date('2026-01-01'), to: new Date('2026-02-01') }, { $gte: new Date('2026-01-01'), $lte: new Date('2026-02-01') }],
  ])('filters by time range %j', async (range, expected) => {
    const { em, findAndCount } = fakeEm();
    await new AuditService(em).search({ ...range, limit: 10, offset: 0 });
    expect(findAndCount.mock.calls[0][1]).toEqual({ occurredAt: expected });
  });
});

describe('AuditInterceptor', () => {
  class Routes {
    plain() {}
  }
  const ctx = (req: Partial<AppRequest>) =>
    ({
      getHandler: () => Routes.prototype.plain,
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => ({ method: 'GET', ...req }) }),
    }) as unknown as ExecutionContext;

  it('skips unauthenticated (public) requests', async () => {
    const audit = { recordRequest: vi.fn() } as unknown as AuditService;
    const result = await lastValueFrom(new AuditInterceptor(audit, new Reflector()).intercept(ctx({}), { handle: () => of('ok') }));
    expect(result).toBe('ok');
    expect(audit.recordRequest).not.toHaveBeenCalled();
  });

  it('records the error status for failed requests and rethrows; resource type defaults to null', async () => {
    const audit = { recordRequest: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const next: CallHandler = { handle: () => throwError(() => new NotFoundException()) };
    await expect(lastValueFrom(new AuditInterceptor(audit, new Reflector()).intercept(ctx({ principal: {} as never }), next))).rejects.toThrow(NotFoundException);
    expect(audit.recordRequest).toHaveBeenCalledWith(expect.anything(), 404, null);
  });
});
