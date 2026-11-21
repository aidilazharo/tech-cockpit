import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/core';
import { WILDCARD_SCHEMA } from '../../database/base-properties.js';

export interface AuditChanges {
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/**
 * Append-only audit trail (a database trigger blocks UPDATE, DELETE and TRUNCATE).
 * Records every authenticated request (views included), security events and changes.
 */
export const AuditLogSchema = defineEntity({
  name: 'AuditLog',
  tableName: 'audit_log',
  schema: WILDCARD_SCHEMA,
  indexes: [{ properties: ['resourceType', 'resourceId'] }],
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    occurredAt: p
      .datetime()
      .onCreate(() => new Date())
      .index(),
    actorUserId: p.uuid().nullable().index(),
    authMethod: p.string().length(20).nullable(),
    apiKeyId: p.uuid().nullable(),
    /** Browser session (auth_session.id) that made the request */
    sessionId: p.uuid().nullable().index(),
    /** http.request | auth.failed | access.denied | auth.login | auth.logout | <resource>.<verb> */
    action: p.string().length(100).index(),
    resourceType: p.string().length(100).nullable(),
    resourceId: p.string().length(100).nullable(),
    httpMethod: p.string().length(10).nullable(),
    path: p.string().length(500).nullable(),
    statusCode: p.integer().nullable(),
    requestId: p.string().length(64).nullable(),
    ipAddress: p.string().length(64).nullable(),
    userAgent: p.string().length(500).nullable(),
    changes: p.json<AuditChanges>().nullable(),
    metadata: p.json<Record<string, unknown>>().nullable(),
  },
});

export class AuditLog extends AuditLogSchema.class {}
AuditLogSchema.setClass(AuditLog);
