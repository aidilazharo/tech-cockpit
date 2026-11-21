import { LockMode } from '@mikro-orm/core';
import { EntityManager, type EntityName, type FilterQuery } from '@mikro-orm/postgresql';
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { likePattern, offsetOf } from '../../common/http/pagination.js';
import type { Principal } from '../access/principal.js';
import { ApprovalInstance } from '../approvals/approval.entities.js';
import { AuditService } from '../audit/audit.service.js';
import { SadVersion } from '../sad/sad.entities.js';
import { STALE_SYNC_RUN_MS } from './trm-sync.service.js';
import type { DeleteMissing, MissingQuery, REMOVAL_BLOCKERS, REMOVAL_REFUSALS } from './trm.schemas.js';
import { RECORD_TYPES } from './trm.schemas.js';
import {
  TrmApplication,
  TrmCapability,
  TrmInitiativeAction,
  TrmInitiativeCapability,
  TrmProductStandard,
  TrmServer,
  TrmService,
  TrmSoftwareModel,
  TrmSyncRun,
} from './trm.entities.js';

type RecordType = (typeof RECORD_TYPES)[number];
type Blocker = (typeof REMOVAL_BLOCKERS)[number];
type Refusal = (typeof REMOVAL_REFUSALS)[number];

/** The columns that differ: `number` only exists on applications and services, `snSysId` on everything except servers (known by name only). */
interface Row {
  id: string;
  snSysId?: string | null;
  name: string | null;
  number?: string | null;
  missingSince: Date | null;
}

export interface MissingRecord {
  id: string;
  recordType: RecordType;
  number: string | null;
  name: string | null;
  snSysId: string | null;
  missingSince: Date;
  blockers: Blocker[];
}

const ENTITIES: Record<RecordType, unknown> = {
  applications: TrmApplication,
  services: TrmService,
  capabilities: TrmCapability,
  productStandards: TrmProductStandard,
  softwareModels: TrmSoftwareModel,
  servers: TrmServer,
};
const NUMBERED: ReadonlySet<RecordType> = new Set(['applications', 'services']);
const RUNNING_APPROVALS = ['in_progress', 'returned', 'awaiting_info'] as const;
const PERMISSION = 'trm:synced-record:delete';

const entityOf = (recordType: RecordType) => ENTITIES[recordType] as EntityName<Row>;
const columnsOf = (recordType: RecordType) => [
  'name',
  'missingSince',
  ...(recordType === 'servers' ? [] : ['snSysId']),
  ...(NUMBERED.has(recordType) ? ['number'] : []),
];

/**
 * Removes records that the last complete ServiceNow export no longer contained.
 * The sync never deletes; this is the one place a person can, on purpose.
 */
@Injectable()
export class TrmRemovalService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  async summary(principal: Principal): Promise<{ items: { recordType: RecordType; count: number }[]; total: number }> {
    this.assertGlobal(principal);
    const em = this.em.fork();
    const items = await Promise.all(
      RECORD_TYPES.map(async (recordType) => ({ recordType, count: await em.count(entityOf(recordType), { missingSince: { $ne: null } }) })),
    );
    return { items, total: items.reduce((sum, item) => sum + item.count, 0) };
  }

  async list(principal: Principal, query: MissingQuery): Promise<{ items: MissingRecord[]; total: number }> {
    this.assertGlobal(principal);
    const em = this.em.fork();
    const where: FilterQuery<Row> = { missingSince: { $ne: null } };
    if (query.q) {
      const pattern = likePattern(query.q);
      where.$or = NUMBERED.has(query.recordType) ? [{ name: { $ilike: pattern } }, { number: { $ilike: pattern } }] : [{ name: { $ilike: pattern } }];
    }
    const [rows, total] = await em.findAndCount(entityOf(query.recordType), where, {
      fields: columnsOf(query.recordType) as never,
      orderBy: { name: 'asc', id: 'asc' },
      ...offsetOf(query),
    });
    const blocked = await this.blockers(em, query.recordType, rows);
    return {
      items: rows.map((row) => ({
        id: row.id,
        recordType: query.recordType,
        number: row.number ?? null,
        name: row.name,
        snSysId: row.snSysId ?? null,
        missingSince: row.missingSince as Date,
        blockers: blocked.get(row.id) ?? [],
      })),
      total,
    };
  }

  async remove(principal: Principal, input: DeleteMissing): Promise<{ deleted: string[]; refused: { id: string; reason: Refusal }[] }> {
    this.assertGlobal(principal);
    await this.assertNoRunReceiving();
    const { recordType } = input;
    const outcome = await this.em.fork().transactional(async (tx) => {
      // Locked until the commit, so a new SAD or roadmap link cannot attach to a record while it is checked and removed.
      const rows = await tx.find(entityOf(recordType), { id: { $in: input.ids } }, { fields: columnsOf(recordType) as never, lockMode: LockMode.PESSIMISTIC_WRITE });
      const byId = new Map(rows.map((row) => [row.id, row]));
      const blocked = await this.blockers(tx, recordType, rows.filter((row) => row.missingSince !== null));

      const removable: Row[] = [];
      const refused: { id: string; reason: Refusal }[] = [];
      for (const id of input.ids) {
        const row = byId.get(id);
        const reason: Refusal | undefined = !row ? 'not-found' : row.missingSince === null ? 'not-missing' : blocked.get(id)?.[0];
        if (reason) refused.push({ id, reason });
        else if (row) removable.push(row);
      }
      if (removable.length > 0) await tx.nativeDelete(entityOf(recordType), { id: { $in: removable.map((row) => row.id) } });
      return { removable, refused };
    });

    for (const row of outcome.removable) {
      await this.audit.recordChange(principal, 'trm.record.deleted', 'trm-synced-record', row.id, {
        before: {
          recordType,
          number: row.number ?? null,
          name: row.name,
          snSysId: row.snSysId ?? null,
          missingSince: (row.missingSince as Date).toISOString(),
        },
        after: null,
      });
    }
    return { deleted: outcome.removable.map((row) => row.id), refused: outcome.refused };
  }

  // ----- Rules

  /** The route guard accepts any grant, including one limited to a department; removal reaches every record. */
  private assertGlobal(principal: Principal): void {
    if (!principal.can(PERMISSION, {})) throw new ForbiddenException('Removing records needs this permission for the whole organisation, not for one department');
  }

  private async assertNoRunReceiving(now = new Date()): Promise<void> {
    const busy = await this.em.fork().count(TrmSyncRun, { status: 'receiving', updatedAt: { $gte: new Date(now.getTime() - STALE_SYNC_RUN_MS) } });
    if (busy > 0) throw new ConflictException('A sync run is still receiving data. Complete or abandon it before removing records.');
  }

  /** What stops each record from being removed, first reason first. Records that nothing stops are absent. */
  private async blockers(em: EntityManager, recordType: RecordType, rows: Row[]): Promise<Map<string, Blocker[]>> {
    const found = new Map<string, Blocker[]>();
    if (rows.length === 0) return found;
    const ids = rows.map((row) => row.id);
    const add = (blocker: Blocker, owners: Iterable<string>) => {
      for (const id of new Set(owners)) found.set(id, [...(found.get(id) ?? []), blocker]);
    };

    if (recordType === 'applications') {
      const versions = await em.find(SadVersion, { status: { $ne: 'cancelled' }, document: { application: { $in: ids } } }, { populate: ['document'] });
      add('has-sad-history', versions.map((version) => version.document.application.id));

      const approvals = await em.find(ApprovalInstance, { applicationId: { $in: ids }, status: { $in: [...RUNNING_APPROVALS] } }, { fields: ['applicationId'] });
      add('open-approval', approvals.map((approval) => approval.applicationId as string));

      const actions = await em.find(TrmInitiativeAction, { $or: [{ application: { $in: ids } }, { replacementApplication: { $in: ids } }] }, { fields: ['application', 'replacementApplication'] });
      const named = actions.flatMap((action) => [action.application?.id, action.replacementApplication?.id]);
      add('used-by-initiative', named.filter((id): id is string => id !== undefined && ids.includes(id)));
    }

    if (recordType === 'capabilities') {
      const links = await em.find(TrmInitiativeCapability, { capability: { $in: ids } }, { fields: ['capability'] });
      add('used-by-initiative', links.map((link) => link.capability.id));

      const children = await em.find(TrmCapability, { parent: { $in: ids }, missingSince: null }, { fields: ['parent'] });
      add('has-children', children.map((child) => (child.parent as { id: string }).id));
    }
    return found;
  }
}
