import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { AppRequest } from '../../common/http/app-request.js';
import type { Principal } from '../access/principal.js';
import { User } from '../identity/user.entity.js';
import { AuditLog, type AuditChanges } from './audit-log.entity.js';
import { personName } from '../identity/person-name.js';

export interface AuditPerson {
  id: string;
  name: string;
  email: string;
}

export type SecurityEventAction =
  | 'auth.failed'
  | 'access.denied'
  | 'auth.login'
  | 'auth.login.failed'
  | 'auth.logout'
  | 'auth.refresh.failed';

/** Who a sign-in event is about, before a principal exists on the request. */
export interface AuditActor {
  userId: string;
  sessionId?: string | null;
}

export interface AuditSearch {
  actorUserId?: string;
  /** Resolved to the user id; an unknown email matches nothing. */
  actorEmail?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
}

function requestFields(req: AppRequest) {
  return {
    httpMethod: req.method,
    path: req.originalUrl.split('?')[0].slice(0, 500),
    requestId: req.id,
    ipAddress: (req.ip ?? '').slice(0, 64) || null,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 500) || null,
  };
}

function actorFields(principal: Principal | undefined) {
  return {
    actorUserId: principal?.user.id ?? null,
    authMethod: principal?.auth.method ?? null,
    apiKeyId: principal?.auth.apiKeyId ?? null,
    sessionId: principal?.auth.sessionId ?? null,
  };
}

function sessionActorFields(actor: AuditActor) {
  return { actorUserId: actor.userId, authMethod: 'session', apiKeyId: null, sessionId: actor.sessionId ?? null };
}

/**
 * Writes the append-only audit trail. Each entry is written on its own forked
 * EntityManager so it never depends on (or flushes) the caller's unit of work.
 * Call recordChange only after the change has been committed.
 */
@Injectable()
export class AuditService {
  constructor(private readonly em: EntityManager) {}

  private async insert(data: Partial<AuditLog> & { action: string }): Promise<void> {
    const em = this.em.fork();
    em.create(AuditLog, data as AuditLog);
    await em.flush();
  }

  recordRequest(req: AppRequest, statusCode: number, resourceType: string | null): Promise<void> {
    return this.insert({
      action: 'http.request',
      ...actorFields(req.principal),
      ...requestFields(req),
      statusCode,
      resourceType,
      resourceId: typeof req.params?.id === 'string' ? req.params.id.slice(0, 100) : null,
    });
  }

  /** `actor` names the user for sign-in events, where the request has no principal yet. */
  recordSecurityEvent(
    action: SecurityEventAction,
    req: AppRequest,
    statusCode: number,
    metadata?: Record<string, unknown>,
    actor?: AuditActor,
  ): Promise<void> {
    return this.insert({
      action,
      ...(actor ? sessionActorFields(actor) : actorFields(req.principal)),
      ...requestFields(req),
      statusCode,
      metadata: metadata ?? null,
    });
  }

  recordChange(
    principal: Principal | null,
    action: string,
    resourceType: string,
    resourceId: string,
    changes: AuditChanges,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.insert({
      action,
      ...actorFields(principal ?? undefined),
      resourceType,
      resourceId,
      changes,
      metadata: metadata ?? null,
    });
  }

  async search(filters: AuditSearch): Promise<{ items: (AuditLog & { actor: AuditPerson | null })[]; total: number }> {
    const em = this.em.fork();
    const where: Record<string, unknown> = {};
    if (filters.actorUserId) where.actorUserId = filters.actorUserId;
    if (filters.actorEmail) {
      const user = await em.findOne(User, { email: filters.actorEmail.trim().toLowerCase() });
      if (!user || (filters.actorUserId && filters.actorUserId !== user.id)) return { items: [], total: 0 };
      where.actorUserId = user.id;
    }
    if (filters.action) where.action = filters.action;
    if (filters.resourceType) where.resourceType = filters.resourceType;
    if (filters.resourceId) where.resourceId = filters.resourceId;
    if (filters.from || filters.to) {
      where.occurredAt = { ...(filters.from && { $gte: filters.from }), ...(filters.to && { $lte: filters.to }) };
    }
    const [items, total] = await em.findAndCount(AuditLog, where, {
      orderBy: { occurredAt: 'desc', id: 'desc' },
      limit: filters.limit,
      offset: filters.offset,
    });
    const actorIds = [...new Set(items.map((item) => item.actorUserId).filter((id): id is string => Boolean(id)))];
    const users = actorIds.length ? await em.find(User, { id: { $in: actorIds } }) : [];
    const people = new Map(users.map((user) => [user.id, { id: user.id, name: personName(user), email: user.email }]));
    return { items: items.map((item) => Object.assign(item, { actor: (item.actorUserId && people.get(item.actorUserId)) || null })), total };
  }

  /** The actions and resource types that occur in the log (for the viewer's filters). */
  async facets(): Promise<{ actions: string[]; resourceTypes: string[] }> {
    const connection = this.em.getConnection();
    const actions = await connection.execute<{ action: string }[]>('select distinct "action" from "audit_log" order by 1');
    const types = await connection.execute<{ resource_type: string }[]>(
      'select distinct "resource_type" from "audit_log" where "resource_type" is not null order by 1',
    );
    return { actions: actions.map((row) => row.action), resourceTypes: types.map((row) => row.resource_type) };
  }
}
