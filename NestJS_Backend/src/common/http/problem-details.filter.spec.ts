import {
  CheckConstraintViolationException,
  ForeignKeyConstraintViolationException,
  NotFoundError,
  OptimisticLockError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { ArgumentsHost, ForbiddenException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { RequestValidationException } from '../zod/zod-validation.pipe.js';
import { problemStatus, ProblemDetailsFilter, redactCredentials, StaleUpdateException } from './problem-details.filter.js';

function run(error: unknown) {
  const response = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    json(body: unknown) {
      this.body = body;
    },
  };
  const request = { originalUrl: '/api/v1/roles/123?x=1', id: 'req-1' };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  } as unknown as ArgumentsHost;
  new ProblemDetailsFilter().catch(error, host);
  return response as typeof response & { body: Record<string, unknown> };
}

function driverError<T>(Type: new (error: Error) => T): T {
  return new Type(new Error('duplicate key value violates unique constraint "app_user_email_unique"'));
}

describe('ProblemDetailsFilter', () => {
  it('renders HttpExceptions as application/problem+json', () => {
    const res = run(new ForbiddenException('You may not view this portfolio.'));

    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toBe('application/problem+json');
    expect(res.body).toEqual({
      type: 'about:blank',
      title: 'Forbidden',
      status: 403,
      detail: 'You may not view this portfolio.',
      instance: '/api/v1/roles/123',
      requestId: 'req-1',
    });
  });

  it('includes field errors for validation failures', () => {
    const res = run(new RequestValidationException([{ path: 'name', message: 'Required' }]));

    expect(res.statusCode).toBe(400);
    expect(res.body.errors).toEqual([{ path: 'name', message: 'Required' }]);
  });

  it('includes the record as it now is when a stale update is refused', () => {
    const res = run(new StaleUpdateException('Someone else changed this.', { rowVersion: 2, answers: {} }));

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({ status: 409, title: 'Conflict', detail: 'Someone else changed this.', latest: { rowVersion: 2, answers: {} } });
  });

  it('uses the exception message object when Nest provides one', () => {
    const res = run(new NotFoundException());
    expect(res.body).toMatchObject({ status: 404, title: 'Not Found', detail: 'Not Found' });
  });

  it('handles custom HttpExceptions with unusual status codes', () => {
    const res = run(new HttpException('Slow down', 429));
    expect(res.body).toMatchObject({ status: 429, title: 'Too Many Requests', detail: 'Slow down' });
  });

  it.each([
    ['unique constraint', driverError(UniqueConstraintViolationException), 409],
    ['foreign key', driverError(ForeignKeyConstraintViolationException), 409],
    ['check constraint', driverError(CheckConstraintViolationException), 422],
  ])('maps a %s violation without leaking SQL', (_label, error, status) => {
    const res = run(error);
    expect(res.statusCode).toBe(status);
    expect(JSON.stringify(res.body)).not.toMatch(/duplicate key|constraint "/);
  });

  it('maps an optimistic-lock conflict to 409', () => {
    const res = run(OptimisticLockError.lockFailed('Role'));
    expect(res.statusCode).toBe(409);
    expect(res.body.detail).toMatch(/changed by someone else/);
  });

  it.each([
    [{ expose: true, status: 413, type: 'entity.too.large' }, 413, 'The request body was rejected.'],
    [{ expose: true, status: 400, type: 'entity.parse.failed' }, 400, 'The request body is not valid JSON.'],
  ])('maps body-parser errors (%j) to their status', (error, status, detail) => {
    const res = run(Object.assign(new Error('raw parser message'), error));
    expect(res.statusCode).toBe(status);
    expect(res.body.detail).toBe(detail);
  });

  it('does not trust a status on errors that are not marked safe to expose', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    expect(run(Object.assign(new Error('x'), { status: 400 })).statusCode).toBe(500);
    expect(run(Object.assign(new Error('x'), { expose: true, status: 503 })).statusCode).toBe(500);
    log.mockRestore();
  });

  it('maps MikroORM NotFoundError to 404', () => {
    const res = run(new NotFoundError('Role not found'));
    expect(res.statusCode).toBe(404);
  });

  it('hides unexpected errors behind a generic 500 and logs them without credentials', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const res = run(new Error('connection string postgres://user:pw@host'));

    expect(res.statusCode).toBe(500);
    expect(res.body.detail).toBe('An unexpected error occurred.');
    expect(JSON.stringify(res.body)).not.toContain('postgres://');
    expect(String(log.mock.calls[0][0])).toContain('postgres://***@host');
    expect(String(log.mock.calls[0][0])).not.toContain('user:pw');
    log.mockRestore();
  });

  it('logs non-Error throwables as text', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const res = run('boom');
    expect(res.statusCode).toBe(500);
    expect(log.mock.calls[0][0]).toBe('boom');
    log.mockRestore();
  });
});

describe('problemStatus', () => {
  it('reports the status the filter will send', () => {
    expect(problemStatus(new NotFoundException())).toBe(404);
    expect(problemStatus(new Error('boom'))).toBe(500);
  });
});

describe('ProblemDetailsFilter edge cases', () => {
  it('uses a generic title for a status without a standard name', () => {
    expect(run(new HttpException('x', 499)).body.title).toBe('Error');
  });

  it('logs the message when an error has no stack', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const error = new Error('no stack here');
    error.stack = undefined;
    run(error);
    expect(log.mock.calls[0][0]).toBe('no stack here');
    log.mockRestore();
  });
});

describe('redactCredentials', () => {
  it('masks credentials in every URL in the text', () => {
    expect(redactCredentials('a postgres://u:p@h/db and https://x:y@z')).toBe(
      'a postgres://***@h/db and https://***@z',
    );
  });
});
