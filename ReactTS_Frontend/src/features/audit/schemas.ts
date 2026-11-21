import { z } from 'zod'

export const AuditEntrySchema = z.object({
  id: z.uuid(),
  occurredAt: z.iso.datetime(),
  actorUserId: z.uuid().nullable(),
  actor: z.object({ id: z.uuid(), name: z.string(), email: z.string() }).nullable(),
  authMethod: z.string().nullable(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  httpMethod: z.string().nullable(),
  path: z.string().nullable(),
  statusCode: z.number().int().nullable(),
  requestId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  changes: z
    .object({
      before: z.record(z.string(), z.unknown()).nullable().optional(),
      after: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
})
export type AuditEntry = z.infer<typeof AuditEntrySchema>

export const AuditPageSchema = z.object({
  items: z.array(AuditEntrySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
})
export const AuditFacetsSchema = z.object({ actions: z.array(z.string()), resourceTypes: z.array(z.string()) })
