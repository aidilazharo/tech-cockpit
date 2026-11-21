import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service.js';
import type { SessionService } from './session.service.js';
import { NotRegisteredError, SignInService } from './sign-in.service.js';

const identity = { username: 'new@test.aia.com', email: 'new@test.aia.com', firstName: 'New', lastName: 'User' };
const client = { ipAddress: null, userAgent: null };

describe('SignInService', () => {
  it('counts a second refused attempt when a concurrent one created the entry first', async () => {
    const entry = { username: identity.username, attempts: 1 };
    const forks = [
      // Looking for the user: not added.
      { findOne: vi.fn().mockResolvedValue(null) },
      // First attempt to record the refusal: no entry yet, but the insert loses the race.
      {
        findOne: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        flush: vi.fn().mockRejectedValue(new UniqueConstraintViolationException(new Error('duplicate key'))),
      },
      // Second attempt: the other request's entry is found and counted.
      { findOne: vi.fn().mockResolvedValue(entry), create: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) },
    ];
    const em = { fork: vi.fn(() => forks.shift()) };

    await expect(new SignInService(em as never, {} as AuditService, {} as SessionService).signIn(identity, client)).rejects.toBeInstanceOf(NotRegisteredError);
    expect(entry.attempts).toBe(2);
  });

  it('keeps the stored email of a refused entry when Okta sends none, and does not retry other errors', async () => {
    const entry = { username: identity.username, email: 'kept@aia.com', attempts: 1 };
    const counted = [{ findOne: vi.fn().mockResolvedValue(null) }, { findOne: vi.fn().mockResolvedValue(entry), flush: vi.fn().mockResolvedValue(undefined) }];
    await expect(new SignInService({ fork: () => counted.shift() } as never, {} as AuditService, {} as SessionService).signIn({ ...identity, email: null }, client)).rejects.toBeInstanceOf(NotRegisteredError);
    expect(entry).toMatchObject({ email: 'kept@aia.com', attempts: 2 });

    const failing = [{ findOne: vi.fn().mockResolvedValue(null) }, { findOne: vi.fn().mockRejectedValue(new Error('connection lost')) }];
    await expect(new SignInService({ fork: () => failing.shift() } as never, {} as AuditService, {} as SessionService).signIn(identity, client)).rejects.toThrow('connection lost');
  });

  it('does not retry other database errors', async () => {
    const em = { fork: () => ({ findOne: vi.fn().mockRejectedValue(new Error('connection lost')) }) };

    await expect(new SignInService(em as never, {} as AuditService, {} as SessionService).signIn(identity, client)).rejects.toThrow('connection lost');
  });
});
