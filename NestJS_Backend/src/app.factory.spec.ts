import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { loggerLevels, protectDocs } from './app.factory.js';
import { AuthService } from './modules/access/auth.service.js';
import { AuditService } from './modules/audit/audit.service.js';
import { HealthController } from './modules/health/health.controller.js';

describe('loggerLevels', () => {
  it('is quiet in tests and verbose otherwise', () => {
    expect(loggerLevels({ NODE_ENV: 'test' })).toEqual(['error', 'warn']);
    expect(loggerLevels({ NODE_ENV: 'production' })).toEqual(['log', 'error', 'warn']);
  });
});

describe('protectDocs', () => {
  it('passes unexpected errors to Express instead of crashing', async () => {
    const failure = new Error('db down');
    const app = {
      get: (token: unknown) =>
        token === AuthService ? { authenticate: vi.fn().mockRejectedValue(failure) } : ({ recordSecurityEvent: vi.fn() } as unknown as AuditService),
    };
    const next = vi.fn();
    await protectDocs(app as never)({ headers: {} } as never, {} as never, next);
    expect(next).toHaveBeenCalledWith(failure);
  });
});

describe('HealthController', () => {
  it('answers 503 when the database is unreachable', async () => {
    const em = { fork: () => ({ getConnection: () => ({ execute: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }) }) };
    await expect(new HealthController(em as never).check()).rejects.toThrow(ServiceUnavailableException);
  });
});
