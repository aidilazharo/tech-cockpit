import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
}

/** 400 with one entry per invalid field; rendered as problem+json `errors`. */
export class RequestValidationException extends BadRequestException {
  constructor(public readonly issues: ValidationIssue[]) {
    super('The request contains invalid values.');
  }
}

/** Validates (and coerces) a request part against a Zod schema. */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new RequestValidationException(
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data;
  }
}
