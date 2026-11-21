import type { ExecutionContext } from '@nestjs/common';

// Metadata key written by @HttpCode() in @nestjs/common.
const HTTP_CODE_METADATA = '__httpCode__';

/**
 * The status Nest will send on success. Interceptors run before Nest applies it, so
 * response.statusCode is still 200 there even for a POST that returns 201.
 */
export function successStatus(context: ExecutionContext): number {
  const explicit = Reflect.getMetadata(HTTP_CODE_METADATA, context.getHandler()) as number | undefined;
  if (explicit !== undefined) {
    return explicit;
  }
  return context.switchToHttp().getRequest<{ method: string }>().method === 'POST' ? 201 : 200;
}
