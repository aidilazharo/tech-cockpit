import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { ZodType } from 'zod';
import { successStatus } from '../http/success-status.js';
import { ZOD_RESPONSES } from './zod-openapi.js';

/**
 * Enforces @ZodResponse schemas on the way out: unknown fields are stripped, so an
 * entity column (hash, internal flag) can never leak by accident. A response that
 * breaks its own contract fails closed with 500.
 */
@Injectable()
export class ZodSerializerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ZodSerializerInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const schemas = this.reflector.get<Record<number, ZodType> | undefined>(
      ZOD_RESPONSES,
      context.getHandler(),
    );
    if (!schemas) {
      return next.handle();
    }
    const statusCode = successStatus(context);
    const schema = schemas[statusCode];
    if (!schema) {
      // Declared schemas but none for the status actually sent: a developer error.
      // Fail closed rather than return unchecked data.
      this.logger.error(`No @ZodResponse schema for status ${statusCode}`);
      throw new InternalServerErrorException();
    }
    return next.handle().pipe(
      map((value) => {
        const result = schema.safeParse(value);
        if (!result.success) {
          this.logger.error(
            `Response for status ${statusCode} violates its schema: ${result.error.issues
              .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
              .join('; ')}`,
          );
          throw new InternalServerErrorException();
        }
        return result.data;
      }),
    );
  }
}
