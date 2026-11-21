import { Body, Param, Query, SetMetadata } from '@nestjs/common';
import { ApiBody, ApiParam, ApiQuery, ApiResponse, type ApiResponseSchemaHost } from '@nestjs/swagger';
import { z, type ZodObject, type ZodType } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

export const ZOD_RESPONSES = 'techcockpit:zod-responses';

// @nestjs/swagger does not export SchemaObject by name; take it from a public type.
type SchemaObject = ApiResponseSchemaHost['schema'];

type Json = Record<string, unknown>;

const LOCAL_REF = '#/definitions/';
const COMPONENT_REF = '#/components/schemas/';

function convert(schema: ZodType, io: 'input' | 'output'): Json {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    reused: 'inline',
    unrepresentable: 'any',
    // Dates travel as ISO 8601 strings in JSON.
    override: (ctx) => {
      if (ctx.zodSchema._zod.def.type === 'date') {
        ctx.jsonSchema.type = 'string';
        ctx.jsonSchema.format = 'date-time';
      }
    },
  }) as Json;
  delete json.$schema;
  delete json.id;
  return json;
}

/** Rewrites every "#/definitions/X" reference with `refFor(X)`. */
function rewriteRefs(value: unknown, refFor: (name: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteRefs(item, refFor));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) =>
      key === '$ref' && typeof child === 'string' && child.startsWith(LOCAL_REF)
        ? [key, refFor(child.slice(LOCAL_REF.length))]
        : [key, rewriteRefs(child, refFor)],
    ),
  );
}

/**
 * Converts a Zod schema to an OpenAPI 3.0 schema object. Schemas named with
 * `.meta({ id })` are referenced as `#/components/schemas/<id>` and carried along in a
 * local `definitions` map that `hoistSchemaDefinitions` moves into the document. A
 * request-side schema whose shape differs from the response side (e.g. defaults make
 * fields optional) is named `<id>Input`.
 */
export function toOpenApiSchema(
  schema: ZodType,
  io: 'input' | 'output' = 'input',
): SchemaObject {
  const json = convert(schema, io);
  const definitions = (json.definitions ?? {}) as Record<string, Json>;
  delete json.definitions;
  if (Object.keys(definitions).length === 0) {
    return json as SchemaObject;
  }
  const outputDefinitions = io === 'input' ? ((convert(schema, 'output').definitions ?? {}) as Record<string, Json>) : definitions;
  const nameOf = (name: string) =>
    JSON.stringify(definitions[name]) === JSON.stringify(outputDefinitions[name]) ? name : `${name}Input`;
  const refFor = (name: string) => `${COMPONENT_REF}${nameOf(name)}`;
  return {
    ...(rewriteRefs(json, refFor) as Json),
    definitions: Object.fromEntries(Object.entries(definitions).map(([name, definition]) => [nameOf(name), rewriteRefs(definition, refFor)])),
  } as SchemaObject;
}

/**
 * Moves the `definitions` carried by each schema into `components.schemas`, so every
 * `#/components/schemas/<id>` reference resolves. Two different schemas with the same
 * id are a developer error.
 */
export function hoistSchemaDefinitions(document: { components?: Json }): void {
  const schemas: Record<string, unknown> = {};
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Json;
    if (node.definitions && typeof node.definitions === 'object') {
      for (const [name, definition] of Object.entries(node.definitions as Json)) {
        if (name in schemas && JSON.stringify(schemas[name]) !== JSON.stringify(definition)) {
          throw new Error(`Two different OpenAPI schemas are named "${name}"; give one a different .meta({ id })`);
        }
        schemas[name] = definition;
      }
      delete node.definitions;
    }
    Object.values(node).forEach(visit);
  };
  visit(document);

  // "XInput" only needs its suffix when a different response-side "X" exists.
  const renames = new Map(
    Object.keys(schemas)
      .filter((name) => name.endsWith('Input') && !(name.slice(0, -'Input'.length) in schemas))
      .map((name) => [name, name.slice(0, -'Input'.length)]),
  );
  const refFor = (name: string) => `${COMPONENT_REF}${renames.get(name) ?? name}`;
  const rewrite = (value: unknown) => rewriteComponentRefs(value, refFor);
  const finalSchemas = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [renames.get(name) ?? name, rewrite(schema)]));
  for (const key of Object.keys(document) as (keyof typeof document)[]) {
    if (key !== 'components') (document as Json)[key] = rewrite((document as Json)[key]);
  }
  document.components = { ...document.components, schemas: { ...(document.components?.schemas as Json | undefined), ...finalSchemas } };
}

function rewriteComponentRefs(value: unknown, refFor: (name: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteComponentRefs(item, refFor));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) =>
      key === '$ref' && typeof child === 'string' && child.startsWith(COMPONENT_REF)
        ? [key, refFor(child.slice(COMPONENT_REF.length))]
        : [key, rewriteComponentRefs(child, refFor)],
    ),
  );
}

function descriptorOf(target: object, key: string | symbol | undefined): PropertyDescriptor {
  return Object.getOwnPropertyDescriptor(target, key as string | symbol) as PropertyDescriptor;
}

/** Validated, documented request body. Use `.strict()` schemas. */
export function ZodBody(schema: ZodType): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodValidationPipe(schema))(target, key, index);
    ApiBody({ schema: toOpenApiSchema(schema) })(target, key as string, descriptorOf(target, key));
  };
}

/** Validated, documented query string; one documented parameter per schema key. */
export function ZodQuery(schema: ZodObject): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodValidationPipe(schema))(target, key, index);
    for (const [name, property] of Object.entries(schema.shape)) {
      ApiQuery({
        name,
        required: !(property as ZodType).safeParse(undefined).success,
        schema: toOpenApiSchema(property as ZodType),
      })(target, key as string, descriptorOf(target, key));
    }
  };
}

/** Validated, documented path parameter. */
export function ZodParam(name: string, schema: ZodType): ParameterDecorator {
  return (target, key, index) => {
    Param(name, new ZodValidationPipe(schema))(target, key, index);
    ApiParam({ name, required: true, schema: toOpenApiSchema(schema) })(
      target,
      key as string,
      descriptorOf(target, key),
    );
  };
}

export interface ZodResponseOptions {
  status: number;
  schema: ZodType;
  description: string;
}

/**
 * Documents a success response AND enforces it: the serializer interceptor parses the
 * handler's return value with this schema, stripping any field not listed.
 */
export function ZodResponse(options: ZodResponseOptions): MethodDecorator {
  return (target, key, descriptor) => {
    const existing: Record<number, ZodType> =
      Reflect.getMetadata(ZOD_RESPONSES, descriptor.value as object) ?? {};
    SetMetadata(ZOD_RESPONSES, { ...existing, [options.status]: options.schema })(target, key, descriptor);
    ApiResponse({
      status: options.status,
      description: options.description,
      schema: toOpenApiSchema(options.schema, 'output'),
    })(target, key, descriptor);
  };
}
