import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { catchError, concatMap, from, type Observable, throwError } from 'rxjs';
import type { AppRequest } from '../../common/http/app-request.js';
import { problemStatus } from '../../common/http/problem-details.filter.js';
import { successStatus } from '../../common/http/success-status.js';
import { AUDIT_RESOURCE, SKIP_REQUEST_AUDIT } from '../access/decorators.js';
import { AuditService } from './audit.service.js';

/**
 * Records every authenticated request — views included — once the handler has run,
 * with the final status. The response waits for the audit row, so nothing is lost.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (!req.principal) {
      return next.handle();
    }
    const resourceType =
      this.reflector.getAllAndOverride<string | undefined>(AUDIT_RESOURCE, [context.getHandler(), context.getClass()]) ?? null;
    const record = (status: number) => from(this.audit.recordRequest(req, status, resourceType));
    const skipSuccess = this.reflector.get<string | undefined>(SKIP_REQUEST_AUDIT, context.getHandler()) !== undefined;

    return next.handle().pipe(
      concatMap((value) => (skipSuccess ? [value] : record(successStatus(context)).pipe(concatMap(() => [value])))),
      catchError((error: unknown) => record(problemStatus(error)).pipe(concatMap(() => throwError(() => error)))),
    );
  }
}
