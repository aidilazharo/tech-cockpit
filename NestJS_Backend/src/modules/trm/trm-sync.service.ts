import { randomUUID } from 'node:crypto';
import { type EntityName, EntityManager } from '@mikro-orm/postgresql';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Env } from '../../config/env.js';
import { ENV } from '../../config/env.module.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../identity/user.entity.js';
import { stageJoinedView } from './domain/mapping.js';
import type { SyncFile } from './domain/sync-files.js';
import { type EntityPlan, type PlanInput, planSync, type SyncPlan } from './domain/sync-plan.js';
import { buildSyncReport, type SyncReportData } from './domain/sync-report.js';
import type { SourceRecord } from './domain/values.js';
import type { PageQuery } from '../../common/http/pagination.js';
import type { CompleteSyncRun, StartSyncRun, SyncRecords } from './trm.schemas.js';
import {
  TrmApplication,
  TrmApplicationService,
  TrmCapability,
  TrmProductStandard,
  TrmServer,
  TrmService,
  TrmServiceDependency,
  TrmServiceServer,
  TrmServiceSoftware,
  TrmSoftwareModel,
  TrmSyncRecord,
  TrmSyncRun,
} from './trm.entities.js';

/** A run with no activity for this long no longer blocks a new one. */
export const STALE_SYNC_RUN_MS = 2 * 3600_000;
const CHUNK = 1000;

function chunks<T>(items: readonly T[], size = CHUNK): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}

type SyncedEntity = TrmApplication | TrmService | TrmCapability | TrmProductStandard | TrmSoftwareModel;

/** Nullable columns load as null; MikroORM's types also allow undefined. */
const col = <T>(value: T | null | undefined) => value as T | null;

/**
 * Loads the Node app's ServiceNow exports. A system admin starts a run, sends each export
 * in batches, then completes it: the whole run is applied in one transaction (or, for a
 * dry run, only reported). Records are matched by sys_id and never deleted.
 */
@Injectable()
export class TrmSyncService {
  private readonly logger = new Logger(TrmSyncService.name);
  private readonly applicationClasses: ReadonlySet<string>;

  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    @Inject(ENV) env: Env,
  ) {
    this.applicationClasses = new Set(env.TRM_APPLICATION_SERVICE_CLASSES);
  }

  async start(principal: Principal, input: StartSyncRun, now = new Date()): Promise<TrmSyncRun> {
    const em = this.em.fork();
    await em.nativeUpdate(
      TrmSyncRun,
      { status: 'receiving', updatedAt: { $lt: new Date(now.getTime() - STALE_SYNC_RUN_MS) } },
      { status: 'abandoned', error: 'No activity for 2 hours', updatedAt: now },
    );
    const busy = await em.findOne(TrmSyncRun, { status: 'receiving' }, { populate: ['startedBy'] });
    if (busy) {
      throw new ConflictException(
        `A sync run started by ${busy.startedBy.firstName} ${busy.startedBy.lastName} is still receiving data. Complete or abandon it first.`,
      );
    }
    const run = em.create(TrmSyncRun, {
      startedBy: em.getReference(User, principal.user.id),
      status: 'receiving',
      dryRun: input.dryRun,
      received: {},
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await em.flush();
    return this.get(run.id);
  }

  private async ownRun(em: EntityManager, principal: Principal, id: string): Promise<TrmSyncRun> {
    const run = await em.findOne(TrmSyncRun, id);
    if (!run) throw new NotFoundException('Sync run not found');
    if (run.startedBy.id !== principal.user.id) {
      throw new ForbiddenException('Only the person who started a sync run can add to it, complete it or abandon it');
    }
    if (run.status !== 'receiving') throw new ConflictException(`This sync run is already ${run.status}`);
    return run;
  }

  /** Holds a batch of rows until the run completes. */
  async receive(principal: Principal, id: string, input: SyncRecords): Promise<Record<string, number>> {
    const em = this.em.fork();
    const run = await this.ownRun(em, principal, id);
    const offset = run.received[input.file] ?? 0;
    // The joined view repeats every application and service field; keep only what the sync uses.
    const rows = input.file === 'ba_as_sm' ? input.records.map(stageJoinedView) : input.records;
    rows.forEach((payload, index) => em.create(TrmSyncRecord, { run, file: input.file, position: offset + index + 1, payload }));
    run.received = { ...run.received, [input.file]: offset + rows.length };
    await em.flush();
    return run.received;
  }

  async abandon(principal: Principal, id: string, now = new Date()): Promise<TrmSyncRun> {
    const em = this.em.fork();
    const run = await this.ownRun(em, principal, id);
    run.status = 'abandoned';
    run.completedAt = now;
    run.updatedBy = principal.user.id;
    await em.nativeDelete(TrmSyncRecord, { run: run.id });
    await em.flush();
    return this.get(run.id);
  }

  async complete(principal: Principal, id: string, input: CompleteSyncRun, now = new Date()): Promise<TrmSyncRun> {
    const em = this.em.fork();
    const run = await this.ownRun(em, principal, id);
    const files = new Set([...Object.keys(input.expected), ...Object.keys(run.received)]) as Set<SyncFile>;
    const mismatched = [...files].filter((file) => (input.expected[file] ?? 0) !== (run.received[file] ?? 0));
    if (mismatched.length > 0) {
      const detail = mismatched.map((file) => `${file} (sent ${input.expected[file] ?? 0}, received ${run.received[file] ?? 0})`).join(', ');
      throw new UnprocessableEntityException(`Rows received do not match rows sent: ${detail}. Send the missing rows or abandon the run.`);
    }

    let report: SyncReportData;
    try {
      const plan = planSync({ staged: await this.staged(run.id), existing: await this.snapshot(), applicationServiceClasses: this.applicationClasses });
      report = buildSyncReport(plan);
      await em.transactional(async (tx) => {
        if (!run.dryRun) await this.apply(tx, plan, run.id, principal.user.id, now);
        await tx.nativeDelete(TrmSyncRecord, { run: run.id });
        const current = await tx.findOneOrFail(TrmSyncRun, run.id);
        current.status = 'completed';
        current.completedAt = now;
        current.report = report as unknown as Record<string, unknown>;
        current.updatedBy = principal.user.id;
      });
    } catch (error) {
      this.logger.error(`TRM sync run ${run.id} failed`, error);
      const cleanup = this.em.fork();
      await cleanup.nativeDelete(TrmSyncRecord, { run: run.id });
      await cleanup.nativeUpdate(TrmSyncRun, { id: run.id }, { status: 'failed', error: 'The sync failed and nothing was changed.', completedAt: now, updatedAt: now });
      throw error;
    }
    await this.audit.recordChange(principal, run.dryRun ? 'trm.sync.dry-run' : 'trm.sync.completed', 'trm-sync-run', run.id, {
      before: null,
      after: { filesIncluded: report.filesIncluded, records: report.records },
    });
    return this.get(run.id);
  }

  async list(query: PageQuery): Promise<{ items: TrmSyncRun[]; total: number }> {
    const [items, total] = await this.em.fork().findAndCount(
      TrmSyncRun,
      {},
      { populate: ['startedBy'], orderBy: { createdAt: 'desc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize },
    );
    return { items, total };
  }

  async get(id: string): Promise<TrmSyncRun> {
    const run = await this.em.fork().findOne(TrmSyncRun, id, { populate: ['startedBy'] });
    if (!run) throw new NotFoundException('Sync run not found');
    return run;
  }

  // ----- Completing a run

  private async staged(runId: string): Promise<PlanInput['staged']> {
    const rows = await this.em.fork().find(TrmSyncRecord, { run: runId }, { orderBy: { file: 'asc', position: 'asc' } });
    const staged: PlanInput['staged'] = {};
    for (const row of rows) (staged[row.file] ??= []).push(row.payload as SourceRecord);
    return staged;
  }

  /** What is stored now, as much as the plan needs (no full source records). */
  private async snapshot(): Promise<PlanInput['existing']> {
    const em = this.em.fork();
    const base = { fields: ['snSysId', 'contentHash', 'missingSince'] } as const;
    const record = (r: { snSysId: string; contentHash: string; missingSince?: Date | null }) => ({ sysId: r.snSysId, hash: r.contentHash, missingSince: col(r.missingSince) });
    const [applications, services, capabilities, productStandards, softwareModels, servers] = await Promise.all([
      em.find(TrmApplication, {}, { fields: [...base.fields, 'name', 'capabilityGroupName', 'capabilityFamilyName', 'capabilityCategoryName'] }),
      em.find(TrmService, {}, { fields: [...base.fields, 'name', 'kind'] }),
      em.find(TrmCapability, {}, { fields: [...base.fields, 'name', 'parentName'] }),
      em.find(TrmProductStandard, {}, { fields: [...base.fields, 'name'] }),
      em.find(TrmSoftwareModel, {}, { fields: [...base.fields, 'productStandardName'] }),
      em.find(TrmServer, {}, { fields: ['name', 'missingSince'] }),
    ]);
    return {
      applications: applications.map((a) => ({
        ...record(a),
        name: col(a.name),
        capabilityFields: { group: col(a.capabilityGroupName), family: col(a.capabilityFamilyName), category: col(a.capabilityCategoryName) },
      })),
      services: services.map((s) => ({ ...record(s), name: col(s.name), kind: s.kind })),
      capabilities: capabilities.map((c) => ({ ...record(c), name: col(c.name), parentName: col(c.parentName) })),
      productStandards: productStandards.map((p) => ({ ...record(p), name: col(p.name) })),
      softwareModels: softwareModels.map((m) => ({ ...record(m), productStandardName: col(m.productStandardName) })),
      servers: servers.map((s) => ({ name: s.name, missingSince: col(s.missingSince) })),
    };
  }

  private async apply(tx: EntityManager, plan: SyncPlan, runId: string, userId: string, now: Date): Promise<void> {
    await this.upsert(tx, TrmCapability, plan.capabilities, runId, userId, now);
    await this.upsert(tx, TrmProductStandard, plan.productStandards, runId, userId, now);
    await this.upsert(tx, TrmApplication, plan.applications, runId, userId, now);
    await this.upsert(tx, TrmService, plan.services, runId, userId, now);
    await this.upsert(tx, TrmSoftwareModel, plan.softwareModels, runId, userId, now);

    if (plan.servers.refreshed) {
      for (const name of plan.servers.newNames) tx.create(TrmServer, { name, lastSyncRunId: runId, createdBy: userId, updatedBy: userId });
      await tx.flush();
      for (const names of chunks(plan.servers.nowMissing)) await tx.nativeUpdate(TrmServer, { name: { $in: names } }, { missingSince: now });
      for (const names of chunks(plan.servers.returned)) await tx.nativeUpdate(TrmServer, { name: { $in: names } }, { missingSince: null });
    }

    // Capability tree: parent and level of every capability.
    const capabilities = await tx.find(TrmCapability, {}, { fields: ['snSysId', 'parent', 'level'] });
    const capabilityIds = new Map(capabilities.map((c) => [c.snSysId, c.id]));
    // The plan covers every stored capability, application and model, so lookups always succeed.
    for (const capability of capabilities) {
      const node = plan.capabilityTree.nodes.get(capability.snSysId)!;
      const parentId = node.parentSysId ? capabilityIds.get(node.parentSysId)! : null;
      if ((capability.parent ? capability.parent.id : null) !== parentId || capability.level !== node.level) {
        await tx.nativeUpdate(TrmCapability, { id: capability.id }, { parent: parentId, level: node.level });
      }
    }

    // Every application's capability; grouped so each distinct result is one update.
    const applications = await tx.find(TrmApplication, {}, { fields: ['snSysId', 'capability', 'capabilityMismatch'] });
    const applicationIds = new Map(applications.map((a) => [a.snSysId, a.id]));
    await this.updateGrouped(
      tx,
      TrmApplication,
      applications.flatMap((application) => {
        const resolved = plan.applicationCapabilities.get(application.snSysId)!;
        const capability = resolved.capabilitySysId ? capabilityIds.get(resolved.capabilitySysId)! : null;
        const unchanged = (application.capability ? application.capability.id : null) === capability && application.capabilityMismatch === resolved.mismatch;
        return unchanged ? [] : [{ id: application.id, data: { capability, capabilityMismatch: resolved.mismatch } }];
      }),
    );

    // Every software model's product standard.
    const standards = await tx.find(TrmProductStandard, {}, { fields: ['snSysId'] });
    const standardIds = new Map(standards.map((s) => [s.snSysId, s.id]));
    const models = await tx.find(TrmSoftwareModel, {}, { fields: ['snSysId', 'productStandard'] });
    const modelIds = new Map(models.map((m) => [m.snSysId, m.id]));
    await this.updateGrouped(
      tx,
      TrmSoftwareModel,
      models.flatMap((model) => {
        const standardSysId = plan.modelStandards.get(model.snSysId)!;
        const productStandard = standardSysId ? standardIds.get(standardSysId)! : null;
        return (model.productStandard ? model.productStandard.id : null) === productStandard ? [] : [{ id: model.id, data: { productStandard } }];
      }),
    );

    // Links: each included export replaces the links it states.
    const services = await tx.find(TrmService, {}, { fields: ['snSysId'] });
    const serviceIds = new Map(services.map((s) => [s.snSysId, s.id]));
    const servers = await tx.find(TrmServer, {}, { fields: ['name'] });
    const serverIds = new Map(servers.map((s) => [s.name, s.id]));
    const row = () => ({ id: randomUUID(), createdAt: now, updatedAt: now, version: 1, createdBy: userId, updatedBy: userId });
    // Every link in the plan refers to a stored record (the plan only links known sys_ids and names).
    const must = (ids: Map<string, string>, key: string) => ids.get(key)!;

    for (const group of plan.links.applicationService) {
      await tx.nativeDelete(TrmApplicationService, { linkSource: group.source });
      await this.insert(
        tx,
        TrmApplicationService,
        group.pairs.map((pair) => ({
          ...row(),
          application: must(applicationIds, pair.applicationSysId),
          service: must(serviceIds, pair.serviceSysId),
          linkSource: group.source,
        })),
      );
    }
    if (plan.links.serviceBusinessService) {
      await tx.nativeDelete(TrmServiceDependency, {});
      await this.insert(
        tx,
        TrmServiceDependency,
        plan.links.serviceBusinessService.map((link) => ({
          ...row(),
          service: must(serviceIds, link.serviceSysId),
          businessService: must(serviceIds, link.businessServiceSysId),
        })),
      );
    }
    if (plan.links.serviceServer) {
      await tx.nativeDelete(TrmServiceServer, {});
      await this.insert(
        tx,
        TrmServiceServer,
        plan.links.serviceServer.map((link) => ({ ...row(), service: must(serviceIds, link.serviceSysId), server: must(serverIds, link.serverName) })),
      );
    }
    if (plan.links.serviceSoftware) {
      await tx.nativeDelete(TrmServiceSoftware, {});
      await this.insert(
        tx,
        TrmServiceSoftware,
        plan.links.serviceSoftware.map((link) => ({
          ...row(),
          snSysId: link.sysId,
          service: must(serviceIds, link.serviceSysId),
          softwareModel: must(modelIds, link.modelSysId),
          fullVersion: link.fullVersion,
          primaryModel: link.primaryModel,
        })),
      );
    }
  }

  private async upsert<E extends SyncedEntity>(
    tx: EntityManager,
    entity: EntityName<E>,
    plan: EntityPlan<object>,
    runId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    const changed = plan.upserts.filter((upsert) => upsert.change !== 'unchanged');
    const updates = new Map(changed.filter((upsert) => upsert.change === 'update').map((upsert) => [upsert.sysId, upsert]));
    for (const sysIds of chunks([...updates.keys()])) {
      for (const record of await tx.find(entity, { snSysId: { $in: sysIds } } as never)) {
        const upsert = updates.get(record.snSysId)!;
        tx.assign(record, { ...upsert.columns, source: upsert.source, contentHash: upsert.hash, lastSyncRunId: runId, missingSince: null, updatedBy: userId } as never);
      }
    }
    for (const upsert of changed.filter((u) => u.change === 'insert')) {
      tx.create(entity, { ...upsert.columns, snSysId: upsert.sysId, source: upsert.source, contentHash: upsert.hash, lastSyncRunId: runId, createdBy: userId, updatedBy: userId } as never);
    }
    await tx.flush();
    for (const sysIds of chunks(plan.nowMissing)) await tx.nativeUpdate(entity, { snSysId: { $in: sysIds } } as never, { missingSince: now } as never);
    for (const sysIds of chunks(plan.returned)) await tx.nativeUpdate(entity, { snSysId: { $in: sysIds } } as never, { missingSince: null } as never);
  }

  /** Applies per-record changes, one statement per distinct change. */
  private async updateGrouped<E extends object>(tx: EntityManager, entity: EntityName<E>, changes: { id: string; data: Record<string, unknown> }[]) {
    const groups = new Map<string, { data: Record<string, unknown>; ids: string[] }>();
    for (const change of changes) {
      const key = JSON.stringify(change.data);
      const group = groups.get(key) ?? { data: change.data, ids: [] };
      group.ids.push(change.id);
      groups.set(key, group);
    }
    for (const { data, ids } of groups.values()) {
      for (const part of chunks(ids)) await tx.nativeUpdate(entity, { id: { $in: part } } as never, data as never);
    }
  }

  private async insert<E extends object>(tx: EntityManager, entity: EntityName<E>, rows: Record<string, unknown>[]) {
    for (const part of chunks(rows)) await tx.insertMany(entity, part as never[]);
  }
}
