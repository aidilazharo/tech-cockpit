import { EntityManager } from '@mikro-orm/postgresql';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { SadRetentionStandard, type RetentionValues } from './sad.entities.js';
import type { CreateSadRetention, UpdateSadRetention } from './sad.schemas.js';

const FIELDS = ['position', 'serviceType', 'dataType', 'yearly', 'monthly', 'weekly', 'daily', 'comment', 'active'] as const;

/** A row's values as a backup schedule shows them (and a submitted version keeps them). */
export function retentionValues(row: SadRetentionStandard): RetentionValues {
  return {
    id: row.id,
    serviceType: row.serviceType,
    dataType: row.dataType,
    yearly: row.yearly,
    monthly: row.monthly,
    weekly: row.weekly,
    daily: row.daily,
    comment: row.comment ?? null,
    active: row.active,
  };
}

function shape(row: SadRetentionStandard) {
  return { ...retentionValues(row), version: row.version, position: row.position };
}

/** AIA's standard backup retention rows: maintained by system admins, ticked in each SAD's backup schedule. */
@Injectable()
export class SadRetentionService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  /** Authors see the active rows; maintainers see all. */
  async list(principal: Principal) {
    const where = principal.can('sad:retention:manage') ? {} : { active: true };
    return { items: (await this.em.fork().find(SadRetentionStandard, where, { orderBy: { position: 'asc', id: 'asc' } })).map(shape) };
  }

  async create(principal: Principal, body: CreateSadRetention) {
    const em = this.em.fork();
    const [last] = await em.find(SadRetentionStandard, {}, { orderBy: { position: 'desc' }, limit: 1 });
    const row = em.create(SadRetentionStandard, {
      ...body,
      comment: body.comment ?? null,
      position: (last?.position ?? 0) + 1,
      active: true,
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await em.flush();
    await this.audit.recordChange(principal, 'sad.retention.created', 'sad-retention-standard', row.id, { before: null, after: shape(row) });
    return shape(row);
  }

  async update(principal: Principal, id: string, body: UpdateSadRetention) {
    const em = this.em.fork();
    const row = await em.findOne(SadRetentionStandard, id);
    if (!row) throw new NotFoundException('Retention row not found');
    if (row.version !== body.version) throw new ConflictException('Someone else changed this row. Reload to see their changes.');
    const before = shape(row);
    for (const field of FIELDS) {
      if (body[field] !== undefined) (row as unknown as Record<string, unknown>)[field] = body[field];
    }
    row.updatedBy = principal.user.id;
    await em.flush();
    await this.audit.recordChange(principal, 'sad.retention.updated', 'sad-retention-standard', id, { before, after: shape(row) });
    return shape(row);
  }
}
