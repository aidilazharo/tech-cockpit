import { STATUS_CODES } from 'node:http';
import {
  CheckConstraintViolationException,
  ForeignKeyConstraintViolationException,
  NotFoundError,
  OptimisticLockError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import {
  type ArgumentsHost,
  Catch,
  ConflictException,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { RequestValidationException } from '../zod/zod-validation.pipe.js';

interface Problem {
  status: number;
  detail: string;
  errors?: unknown;
  latest?: unknown;
}

/** A refused update of a record someone else changed first (409), with the record as it now is (`latest` in the problem). */
export class StaleUpdateException extends ConflictException {
  constructor(
    message: string,
    readonly latest: unknown,
  ) {
    super(message);
  }
}

/** Masks user:password@ in URLs so connection strings never reach the logs. */
export function redactCredentials(text: string): string {
  return text.replace(/(\w+:\/\/)[^\s/@]+@/g, '$1***@');
}

function toProblem(error: unknown): Problem | null {
  if (error instanceof RequestValidationException) {
    return { status: 400, detail: error.message, errors: error.issues };
  }
  if (error instanceof StaleUpdateException) {
    return { status: 409, detail: error.message, latest: error.latest };
  }
  if (error instanceof HttpException) {
    return { status: error.getStatus(), detail: error.message };
  }
  if (error instanceof OptimisticLockError) {
    return { status: 409, detail: 'The record was changed by someone else. Reload and try again.' };
  }
  if (error instanceof UniqueConstraintViolationException) {
    return { status: 409, detail: 'A record with the same unique value already exists.' };
  }
  if (error instanceof ForeignKeyConstraintViolationException) {
    return { status: 409, detail: 'The record is referenced by, or refers to, another record.' };
  }
  if (error instanceof CheckConstraintViolationException) {
    return { status: 422, detail: 'A value is not allowed.' };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, detail: 'The requested record does not exist.' };
  }
  // body-parser errors (too large, malformed JSON, bad charset) carry a safe 4xx status.
  const bodyError = error as { expose?: boolean; status?: number; type?: string };
  if (bodyError?.expose === true && typeof bodyError.status === 'number' && bodyError.status >= 400 && bodyError.status < 500) {
    return {
      status: bodyError.status,
      detail: bodyError.type === 'entity.parse.failed' ? 'The request body is not valid JSON.' : 'The request body was rejected.',
    };
  }
  return null;
}

/** The HTTP status the filter will send for an error (used by the audit trail). */
export function problemStatus(error: unknown): number {
  return toProblem(error)?.status ?? 500;
}

/**
 * Renders every error as RFC 9457 application/problem+json. Database and unexpected
 * errors never expose SQL, stack traces or connection details.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<{ originalUrl: string; id?: string }>();
    const response = http.getResponse<{
      status(code: number): { json(body: unknown): void };
      setHeader(name: string, value: string): void;
    }>();

    let problem = toProblem(error);
    if (!problem) {
      this.logger.error(
        redactCredentials(error instanceof Error ? (error.stack ?? error.message) : String(error)),
        undefined,
        request.id,
      );
      problem = { status: 500, detail: 'An unexpected error occurred.' };
    }

    response.setHeader('content-type', 'application/problem+json');
    response.status(problem.status).json({
      type: 'about:blank',
      title: STATUS_CODES[problem.status] ?? 'Error',
      status: problem.status,
      detail: problem.detail,
      instance: request.originalUrl.split('?')[0],
      requestId: request.id,
      ...(problem.errors ? { errors: problem.errors } : {}),
      ...(problem.latest ? { latest: problem.latest } : {}),
    });
  }
}
