import { randomUUID } from 'node:crypto';
import { p } from '@mikro-orm/core';

/**
 * Columns every TechCockpit table carries. Spread into `defineEntity({ properties })`.
 * `version` enables optimistic locking: concurrent updates fail instead of overwriting.
 */
export function baseProperties() {
  return {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
    createdBy: p.uuid().nullable(),
    updatedBy: p.uuid().nullable(),
    version: p.integer().version(),
  };
}

/**
 * All entities use the wildcard schema: migrations are generated without a schema
 * name and the runtime schema comes from DB_SCHEMA.
 */
export const WILDCARD_SCHEMA = '*';
