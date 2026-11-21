import { CallHandler, ExecutionContext, InternalServerErrorException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  hoistSchemaDefinitions,
  RequestValidationException,
  toOpenApiSchema,
  ZodBody,
  ZodParam,
  ZodQuery,
  ZodResponse,
  ZodSerializerInterceptor,
  ZodValidationPipe,
} from './index.js';

// Metadata keys used by @nestjs/swagger (not exported publicly).
const DECORATORS = { API_PARAMETERS: 'swagger/apiParameters', API_RESPONSE: 'swagger/apiResponse' };

const CreateRole = z
  .object({ code: z.string().regex(/^[a-z-]+$/), name: z.string().min(1).max(100) })
  .strict();

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(CreateRole);

  it('returns the parsed value when valid', () => {
    expect(pipe.transform({ code: 'pmo', name: 'PMO' })).toEqual({ code: 'pmo', name: 'PMO' });
  });

  it('rejects unknown fields (mass assignment protection)', () => {
    expect(() => pipe.transform({ code: 'pmo', name: 'PMO', isSystem: true })).toThrow(
      RequestValidationException,
    );
  });

  it('lists every invalid field with its path', () => {
    try {
      pipe.transform({ code: 'Bad Code', name: '' });
      expect.unreachable();
    } catch (error) {
      const issues = (error as RequestValidationException).issues;
      expect(issues.map((issue) => issue.path)).toEqual(['code', 'name']);
      expect((error as RequestValidationException).getStatus()).toBe(400);
    }
  });

  it('coerces query-string numbers when the schema asks for it', () => {
    const query = new ZodValidationPipe(z.object({ page: z.coerce.number().int().min(1) }));
    expect(query.transform({ page: '2' })).toEqual({ page: 2 });
  });
});

describe('toOpenApiSchema', () => {
  it('produces an OpenAPI 3.0 schema without JSON-Schema-only keys', () => {
    const schema = toOpenApiSchema(CreateRole);
    expect(schema).toMatchObject({
      type: 'object',
      properties: { code: { type: 'string', pattern: '^[a-z-]+$' }, name: { type: 'string' } },
      required: ['code', 'name'],
      additionalProperties: false,
    });
    expect(schema).not.toHaveProperty('$schema');
  });

  it('documents dates as ISO 8601 date-time strings', () => {
    const schema = toOpenApiSchema(z.object({ at: z.date(), until: z.coerce.date().nullable() }), 'output') as Record<string, Record<string, unknown>>;

    expect(schema.properties.at).toEqual({ type: 'string', format: 'date-time' });
    expect(schema.properties.until).toMatchObject({ type: 'string', format: 'date-time', nullable: true });
  });

  const Level = z.enum(['none', 'all']).default('none');
  const Access = z.object({ financial: Level }).strict().meta({ id: 'Access' });
  const Person = z.object({ id: z.string() }).strict().meta({ id: 'Person' });

  it('points named schemas at components/schemas (valid OpenAPI 3 references)', () => {
    const schema = toOpenApiSchema(z.object({ items: z.array(Person) }), 'output') as Record<string, unknown>;

    expect(schema.properties).toEqual({ items: { type: 'array', items: { $ref: '#/components/schemas/Person' } } });
    expect(schema.definitions).toEqual({ Person: expect.objectContaining({ type: 'object' }) });
    expect(JSON.stringify(schema)).not.toContain('#/definitions/');
  });

  it('names the request variant separately when it differs from the response shape', () => {
    const input = toOpenApiSchema(z.object({ dataAccess: Access }), 'input') as Record<string, Record<string, unknown>>;
    const output = toOpenApiSchema(z.object({ dataAccess: Access }), 'output') as Record<string, Record<string, unknown>>;

    expect(input.properties.dataAccess).toEqual({ $ref: '#/components/schemas/AccessInput' });
    expect(Object.keys(input.definitions)).toEqual(['AccessInput']);
    expect(output.properties.dataAccess).toEqual({ $ref: '#/components/schemas/Access' });
  });

  it('keeps one name when request and response shapes are the same', () => {
    const input = toOpenApiSchema(z.object({ person: Person }), 'input') as Record<string, Record<string, unknown>>;

    expect(input.properties.person).toEqual({ $ref: '#/components/schemas/Person' });
  });
});

describe('hoistSchemaDefinitions', () => {
  const person = { type: 'object', properties: { id: { type: 'string' } } };

  it('moves inline definitions into components.schemas', () => {
    const document = {
      paths: {
        '/a': { get: { responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Person', definitions: { Person: person } } } } } } } },
        '/b': { get: { responses: { 200: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Person' }, definitions: { Person: person } } } } } } } },
      },
      components: { securitySchemes: {} },
    };

    hoistSchemaDefinitions(document);

    expect(document.components).toEqual({ securitySchemes: {}, schemas: { Person: person } });
    expect(JSON.stringify(document.paths)).not.toContain('definitions');
  });

  it('drops the Input suffix when there is no response-side schema of that name', () => {
    const document = {
      paths: {
        '/a': { post: { requestBody: { schema: { $ref: '#/components/schemas/CreateThingInput', definitions: { CreateThingInput: person } } } } },
        '/b': { post: { requestBody: { schema: { $ref: '#/components/schemas/AccessInput', definitions: { AccessInput: person } } } } },
        '/c': { get: { schema: { $ref: '#/components/schemas/Access', definitions: { Access: { type: 'string' } } } } },
      },
      components: {} as Record<string, unknown>,
    };

    hoistSchemaDefinitions(document);

    expect(Object.keys(document.components.schemas as object).sort()).toEqual(['Access', 'AccessInput', 'CreateThing']);
    expect(JSON.stringify(document.paths)).toContain('"#/components/schemas/CreateThing"');
    expect(JSON.stringify(document.paths)).toContain('"#/components/schemas/AccessInput"');
  });

  it('refuses two different schemas with the same name', () => {
    const document = {
      paths: {
        '/a': { schema: { definitions: { Person: person } } },
        '/b': { schema: { definitions: { Person: { type: 'string' } } } },
      },
      components: {},
    };

    expect(() => hoistSchemaDefinitions(document)).toThrow(/Person/);
  });
});

describe('Zod decorators', () => {
  class Controller {
    create(@ZodBody(CreateRole) _body: unknown) {}
    list(@ZodQuery(z.object({ page: z.coerce.number().optional(), q: z.string() })) _query: unknown) {}
    get(@ZodParam('id', z.uuid()) _id: string) {}
    @ZodResponse({ status: 200, schema: CreateRole, description: 'The role' })
    show() {}
  }
  const reflector = new Reflector();

  it('documents the request body', () => {
    const params = reflector.get(DECORATORS.API_PARAMETERS, Controller.prototype.create);
    expect(params[0]).toMatchObject({ in: 'body', schema: { type: 'object' } });
  });

  it('documents each query parameter with its required flag', () => {
    const params = reflector.get(DECORATORS.API_PARAMETERS, Controller.prototype.list);
    expect(params.map((p: { name: string; required: boolean }) => [p.name, p.required])).toEqual([
      ['page', false],
      ['q', true],
    ]);
  });

  it('documents the path parameter', () => {
    const params = reflector.get(DECORATORS.API_PARAMETERS, Controller.prototype.get);
    expect(params[0]).toMatchObject({ name: 'id', in: 'path', required: true });
  });

  it('documents the response and registers it for serialisation', () => {
    const responses = reflector.get(DECORATORS.API_RESPONSE, Controller.prototype.show);
    expect(responses['200']).toMatchObject({ description: 'The role' });
  });
});

describe('ZodSerializerInterceptor', () => {
  class Controller {
    @ZodResponse({ status: 200, schema: z.object({ id: z.string(), name: z.string() }), description: 'ok' })
    show() {}
    plain() {}
  }

  function context(handler: () => void, method = 'GET'): ExecutionContext {
    return {
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => ({ method }) }),
    } as unknown as ExecutionContext;
  }

  const interceptor = new ZodSerializerInterceptor(new Reflector());
  const handle = (value: unknown): CallHandler => ({ handle: () => of(value) });

  it('strips fields that are not in the response schema', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(
        context(Controller.prototype.show),
        handle({ id: '1', name: 'PMO', passwordHash: 'secret', version: 3 }),
      ),
    );
    expect(result).toEqual({ id: '1', name: 'PMO' });
  });

  it('passes values through for routes without a response schema', async () => {
    const value = { anything: true };
    const result = await lastValueFrom(interceptor.intercept(context(Controller.prototype.plain), handle(value)));
    expect(result).toBe(value);
  });

  it('fails closed when the success status has no registered schema', () => {
    expect(() => interceptor.intercept(context(Controller.prototype.show, 'POST'), handle({ id: '1' }))).toThrow(
      InternalServerErrorException,
    );
  });

  it('fails closed with 500 when the service returns data that breaks the contract', async () => {
    await expect(
      lastValueFrom(interceptor.intercept(context(Controller.prototype.show), handle({ id: 1 }))),
    ).rejects.toThrow(InternalServerErrorException);
  });
});
