import { randomUUID } from 'node:crypto';
import { Controller, ExecutionContext, Get, HttpCode, Post } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { likePattern, offsetOf } from './pagination.js';
import { requestIdMiddleware } from './request-id.middleware.js';
import { successStatus } from './success-status.js';

@Controller()
class Sample {
  @Post() create() {}
  @Post('approve') @HttpCode(200) approve() {}
  @Get() list() {}
}

function ctx(handler: () => void, method: string): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

describe('successStatus', () => {
  it('is 201 for POST without @HttpCode', () => {
    expect(successStatus(ctx(Sample.prototype.create, 'POST'))).toBe(201);
  });

  it('honours @HttpCode', () => {
    expect(successStatus(ctx(Sample.prototype.approve, 'POST'))).toBe(200);
  });

  it('is 200 for other methods', () => {
    expect(successStatus(ctx(Sample.prototype.list, 'GET'))).toBe(200);
  });
});

describe('pagination helpers', () => {
  it('escapes LIKE wildcards in search terms', () => {
    expect(likePattern('50%_off\\')).toBe('%50\\%\\_off\\\\%');
  });

  it('computes limit and offset', () => {
    expect(offsetOf({ page: 3, pageSize: 25 })).toEqual({ limit: 25, offset: 50 });
  });
});

describe('requestIdMiddleware', () => {
  it('assigns a fresh UUID and returns it in x-request-id, ignoring any client value', () => {
    const req: { id?: string; headers: Record<string, string> } = { headers: { 'x-request-id': 'evil\nheader' } };
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    requestIdMiddleware(req as never, res as never, next);

    expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(req.id).not.toBe(randomUUID());
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.id);
    expect(next).toHaveBeenCalledOnce();
  });
});
