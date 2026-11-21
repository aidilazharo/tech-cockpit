import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { User } from '../identity/user.entity.js';

/** Personal API key. Only the SHA-256 hash of the secret is stored. */
export const ApiKeySchema = defineEntity({
  name: 'ApiKey',
  tableName: 'api_key',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    user: () => p.manyToOne(User).index(),
    name: p.string().length(100),
    /** Public identifier embedded in the token (tck_<keyId>_<secret>). */
    keyId: p.string().length(32).unique(),
    secretHash: p.string().length(64),
    expiresAt: p.datetime(),
    lastUsedAt: p.datetime().nullable(),
    revokedAt: p.datetime().nullable(),
    revokedBy: p.uuid().nullable(),
  },
});

export class ApiKey extends ApiKeySchema.class {}
ApiKeySchema.setClass(ApiKey);
