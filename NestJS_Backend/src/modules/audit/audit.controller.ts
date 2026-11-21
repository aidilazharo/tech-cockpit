import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PageQuerySchema, offsetOf, pageOf } from '../../common/http/pagination.js';
import { ZodQuery, ZodResponse } from '../../common/zod/index.js';
import { AuditResource, RequirePermission } from '../access/decorators.js';
import { AuditService } from './audit.service.js';

const AuditQuerySchema = PageQuerySchema.extend({
  actorUserId: z.uuid().optional(),
  actorEmail: z.string().trim().max(320).optional().describe('Email of the person who acted'),
  action: z.string().max(100).optional(),
  resourceType: z.string().max(100).optional(),
  resourceId: z.string().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const AuditEntrySchema = z
  .object({
    id: z.uuid(),
    occurredAt: z.date(),
    actorUserId: z.uuid().nullable(),
    actor: z
      .object({ id: z.uuid(), name: z.string(), email: z.string() })
      .nullable()
      .describe('Who acted (null for the system or an unknown caller)'),
    authMethod: z.string().nullable(),
    action: z.string(),
    resourceType: z.string().nullable(),
    resourceId: z.string().nullable(),
    httpMethod: z.string().nullable(),
    path: z.string().nullable(),
    statusCode: z.number().int().nullable(),
    requestId: z.string().nullable(),
    ipAddress: z.string().nullable(),
    changes: z.object({ before: z.record(z.string(), z.unknown()).nullable().optional(), after: z.record(z.string(), z.unknown()).nullable().optional() }).nullable(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .meta({ id: 'AuditEntry' });

@ApiTags('Audit')
@AuditResource('audit-log')
@Controller({ path: 'audit-logs', version: '1' })
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('facets')
  @RequirePermission('audit:log:read')
  @ZodResponse({
    status: 200,
    schema: z.object({ actions: z.array(z.string()), resourceTypes: z.array(z.string()) }).meta({ id: 'AuditFacets' }),
    description: 'Actions and resource types present in the log',
  })
  facets() {
    return this.audit.facets();
  }

  @Get()
  @RequirePermission('audit:log:read')
  @ZodResponse({ status: 200, schema: pageOf(AuditEntrySchema), description: 'Audit entries, newest first' })
  async search(@ZodQuery(AuditQuerySchema) query: z.infer<typeof AuditQuerySchema>) {
    const { items, total } = await this.audit.search({ ...query, ...offsetOf(query) });
    return { items, page: query.page, pageSize: query.pageSize, total };
  }
}
