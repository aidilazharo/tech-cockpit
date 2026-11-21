import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect } from 'vitest'
import { z, type ZodType } from 'zod'

// The backend's OpenAPI document is the contract. Run `npm run openapi` in
// NestJS_Backend after API changes, then fix whatever the contract tests report.

export interface OpenApiSchema {
  properties?: Record<string, OpenApiSchema>
  required?: string[]
  enum?: unknown[]
  /** One allowed value (how our Zod literals come out; the API lists the same as a one-value enum) */
  const?: unknown
  nullable?: boolean
  anyOf?: OpenApiSchema[]
  type?: string | string[]
}

const openapi = JSON.parse(readFileSync(resolve(process.cwd(), '../NestJS_Backend/openapi.json'), 'utf8')) as {
  components: { schemas: Record<string, OpenApiSchema> }
}

/** Per property: is it nullable, and its enum values (if any). */
export function shape(schema: OpenApiSchema) {
  return Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, property]) => {
      const variants = property.anyOf ?? [property]
      const isNull = (type: OpenApiSchema['type']) => type === 'null' || (Array.isArray(type) && type.includes('null'))
      const nullable = property.nullable === true || variants.some((variant) => isNull(variant.type))
      const listed = variants.find((variant) => variant.enum || 'const' in variant)
      const values = listed ? (listed.enum ?? [listed.const]) : null
      return [name, { nullable, enum: values }]
    }),
  )
}

export const frontend = (schema: ZodType, io: 'input' | 'output') => z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as OpenApiSchema

export function backend(name: string): OpenApiSchema {
  const schema = openapi.components.schemas[name]
  if (!schema) throw new Error(`openapi.json has no schema named ${name}`)
  return schema
}

/** Our response schema has exactly the API's fields, required set, nullability and enums. */
export function expectSameResponse(name: string, schema: ZodType): void {
  const theirs = backend(name)
  const ours = frontend(schema, 'output')
  expect(Object.keys(ours.properties ?? {}).sort(), `${name}: fields`).toEqual(Object.keys(theirs.properties ?? {}).sort())
  expect([...(ours.required ?? [])].sort(), `${name}: required fields`).toEqual([...(theirs.required ?? [])].sort())
  expect(shape(ours), `${name}: nullability and enum values`).toEqual(shape(theirs))
}

/** We only send fields the API accepts, always send what it requires, and use its enum values. */
export function expectAcceptedRequest(name: string, schema: ZodType): void {
  const theirs = backend(name)
  const ours = frontend(schema, 'input')
  const accepted = Object.keys(theirs.properties ?? {})
  for (const field of Object.keys(ours.properties ?? {})) {
    expect(accepted, `${name} does not accept "${field}"`).toContain(field)
  }
  for (const field of theirs.required ?? []) {
    expect(ours.required ?? [], `${name} requires "${field}"`).toContain(field)
  }
  const theirShape = shape(theirs)
  for (const [field, ourField] of Object.entries(shape(ours))) {
    if (ourField.enum) expect(ourField.enum, `${name}.${field} values`).toEqual(theirShape[field].enum)
  }
}
