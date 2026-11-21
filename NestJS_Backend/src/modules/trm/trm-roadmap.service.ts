import { LockMode } from '@mikro-orm/core';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { likePattern } from '../../common/http/pagination.js';
import { actingForStaff } from '../access/acting-for-staff.js';
import { FieldClassService } from '../access/field-classes.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { personName } from '../identity/person-name.js';
import { User } from '../identity/user.entity.js';
import { INITIATIVE_COST, INITIATIVE_OWNER } from './trm-fields.js';
import type { CreateInitiative, InitiativeQuery, LinkPlannedApplication, UpdateInitiative } from './trm.schemas.js';
import {
  ROADMAP_ACTIONS,
  TrmApplication,
  TrmCapability,
  TrmInitiative,
  TrmInitiativeAction,
  TrmInitiativeCapability,
  TrmPlannedApplication,
} from './trm.entities.js';

type InitiativeInput = CreateInitiative | UpdateInitiative;

/** Nullable columns load as null; MikroORM's types also allow undefined. */
const ref = (record: { id: string; name?: string | null }) => ({ id: record.id, name: record.name as string | null });
/** Escapes LIKE wildcards so a case-insensitive comparison matches the name exactly. */
const exactly = (name: string) => name.replace(/[\\%_]/g, (char) => `\\${char}`);

/** The EA roadmap: initiatives with exact dates, and applications named before they exist in ServiceNow. */
@Injectable()
export class TrmRoadmapService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly fieldClasses: FieldClassService,
  ) {}

  /** The roadmap is company-wide: its cost and owner follow company-wide data access. */
  private async classes(em: EntityManager, principal: Principal) {
    const see = (await this.fieldClasses.classes(em)).viewer(principal, { scope: {} });
    return { estimatedCost: see(INITIATIVE_COST), owner: see(INITIATIVE_OWNER) };
  }

  async list(principal: Principal, query: InitiativeQuery) {
    const em = this.em.fork();
    const where: FilterQuery<TrmInitiative> = {};
    if (query.q) where.name = { $ilike: likePattern(query.q) };
    if (query.status) where.status = query.status;
    if (query.from) where.endDate = { $gte: query.from };
    if (query.to) where.startDate = { $lte: query.to };
    const [items, total] = await em.findAndCount(TrmInitiative, where, {
      populate: ['owner'],
      orderBy: { startDate: 'asc', name: 'asc' },
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    const actions = await em.find(TrmInitiativeAction, { initiative: { $in: items.map((i) => i.id) } });
    const visible = await this.classes(em, principal);
    return {
      items: items.map((initiative) => {
        const mine = actions.filter((action) => action.initiative.id === initiative.id);
        return {
          id: initiative.id,
          name: initiative.name,
          status: initiative.status,
          startDate: initiative.startDate,
          endDate: initiative.endDate,
          owner: initiative.owner && visible.owner ? { id: initiative.owner.id, name: personName(initiative.owner) } : null,
          actionCounts: Object.fromEntries(ROADMAP_ACTIONS.map((kind) => [kind, mine.filter((a) => a.action === kind).length])),
        };
      }),
      total,
    };
  }

  async get(principal: Principal, id: string) {
    const em = this.em.fork();
    const initiative = await em.findOne(TrmInitiative, id, { populate: ['owner'] });
    if (!initiative) throw new NotFoundException('Initiative not found');
    const capabilities = await em.find(TrmInitiativeCapability, { initiative: id }, { populate: ['capability'] });
    const actions = await em.find(
      TrmInitiativeAction,
      { initiative: id },
      {
        populate: ['application', 'plannedApplication.linkedApplication', 'replacementApplication', 'replacementPlanned.linkedApplication'],
        orderBy: { position: 'asc' },
      },
    );
    const visible = await this.classes(em, principal);
    const planned = (record: TrmPlannedApplication | null | undefined) =>
      record ? { id: record.id, name: record.name, linkedApplication: record.linkedApplication ? ref(record.linkedApplication) : null } : null;
    return {
      id: initiative.id,
      version: initiative.version,
      name: initiative.name,
      description: initiative.description ?? null,
      rationale: initiative.rationale ?? null,
      startDate: initiative.startDate,
      endDate: initiative.endDate,
      status: initiative.status,
      owner: initiative.owner && visible.owner ? { id: initiative.owner.id, name: personName(initiative.owner) } : null,
      estimatedCost: visible.estimatedCost ? (initiative.estimatedCost ?? null) : null,
      capabilities: capabilities.map((link) => ref(link.capability)).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      actions: actions.map((action) => ({
        id: action.id,
        action: action.action,
        application: action.application ? ref(action.application) : null,
        plannedApplication: planned(action.plannedApplication),
        replacementApplication: action.replacementApplication ? ref(action.replacementApplication) : null,
        replacementPlanned: planned(action.replacementPlanned),
      })),
      restricted: (['estimatedCost', 'owner'] as const).filter((field) => !visible[field]),
      canEdit: principal.can('trm:roadmap:manage'),
    };
  }

  async create(principal: Principal, input: CreateInitiative) {
    const em = this.em.fork();
    const initiative = em.create(TrmInitiative, { ...(await this.fields(em, input)), createdBy: principal.user.id, updatedBy: principal.user.id });
    await this.replaceLinks(em, initiative, input, principal.user.id);
    await em.flush();
    await this.audit.recordChange(principal, 'trm.initiative.created', 'trm-initiative', initiative.id, { before: null, after: this.snapshot(input) });
    return this.get(principal, initiative.id);
  }

  async update(principal: Principal, id: string, input: UpdateInitiative) {
    const em = this.em.fork();
    const initiative = await em.findOne(TrmInitiative, id);
    if (!initiative) throw new NotFoundException('Initiative not found');
    await em.lock(initiative, LockMode.OPTIMISTIC, input.version);
    const before = await this.currentSnapshot(em, initiative);
    em.assign(initiative, { ...(await this.fields(em, input)), updatedBy: principal.user.id });
    await em.nativeDelete(TrmInitiativeCapability, { initiative: id });
    await em.nativeDelete(TrmInitiativeAction, { initiative: id });
    await this.replaceLinks(em, initiative, input, principal.user.id);
    // Linked records changed even if the initiative's own columns did not: bump its version.
    initiative.updatedAt = new Date();
    await em.flush();
    await this.audit.recordChange(principal, 'trm.initiative.updated', 'trm-initiative', id, { before, after: this.snapshot(input) });
    return this.get(principal, id);
  }

  private async fields(em: EntityManager, input: InitiativeInput) {
    let owner: User | null = null;
    if (input.ownerId) {
      owner = await em.findOne(User, { id: input.ownerId, status: 'active' });
      // The owner's role must allow acting for staff (configurable per role).
      if (!owner || !(await actingForStaff(em, [owner.id])).has(owner.id)) throw new UnprocessableEntityException("The owner's role must allow acting for staff");
    }
    return {
      name: input.name,
      description: input.description,
      rationale: input.rationale,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      owner,
      estimatedCost: input.estimatedCost,
    };
  }

  private async replaceLinks(em: EntityManager, initiative: TrmInitiative, input: InitiativeInput, userId: string): Promise<void> {
    const capabilities = await em.find(TrmCapability, { id: { $in: input.capabilityIds } });
    if (capabilities.length !== input.capabilityIds.length) throw new UnprocessableEntityException('Unknown capability');
    for (const capability of capabilities) em.create(TrmInitiativeCapability, { initiative, capability, createdBy: userId, updatedBy: userId });

    const applicationIds = [...new Set(input.actions.flatMap((a) => [a.applicationId, a.replacementApplicationId]).filter((id): id is string => Boolean(id)))];
    const applications = new Map((await em.find(TrmApplication, { id: { $in: applicationIds } })).map((app) => [app.id, app]));
    if (applications.size !== applicationIds.length) throw new UnprocessableEntityException('Unknown application');
    const planned = new Map<string, TrmPlannedApplication>();
    const plannedNamed = async (name: string | undefined) => {
      if (!name) return null;
      const key = name.toLowerCase();
      let record = planned.get(key) ?? (await em.findOne(TrmPlannedApplication, { name: { $ilike: exactly(name) } }));
      record ??= em.create(TrmPlannedApplication, { name, createdBy: userId, updatedBy: userId });
      planned.set(key, record);
      return record;
    };

    for (const [position, action] of input.actions.entries()) {
      em.create(TrmInitiativeAction, {
        initiative,
        position: position + 1,
        action: action.action,
        application: action.applicationId ? applications.get(action.applicationId)! : null,
        plannedApplication: await plannedNamed(action.plannedApplicationName),
        replacementApplication: action.replacementApplicationId ? applications.get(action.replacementApplicationId)! : null,
        replacementPlanned: await plannedNamed(action.replacementPlannedName),
        createdBy: userId,
        updatedBy: userId,
      });
    }
  }

  /** What the audit log keeps of an initiative. */
  private snapshot(input: InitiativeInput) {
    return {
      name: input.name,
      status: input.status,
      startDate: input.startDate,
      endDate: input.endDate,
      ownerId: input.ownerId,
      estimatedCost: input.estimatedCost,
      capabilityIds: [...input.capabilityIds].sort(),
      actions: input.actions,
    };
  }

  private async currentSnapshot(em: EntityManager, initiative: TrmInitiative) {
    const capabilities = await em.find(TrmInitiativeCapability, { initiative: initiative.id });
    const actions = await em.find(TrmInitiativeAction, { initiative: initiative.id }, { populate: ['plannedApplication', 'replacementPlanned'], orderBy: { position: 'asc' } });
    return {
      name: initiative.name,
      status: initiative.status,
      startDate: initiative.startDate,
      endDate: initiative.endDate,
      ownerId: initiative.owner?.id ?? null,
      estimatedCost: initiative.estimatedCost ?? null,
      capabilityIds: capabilities.map((link) => link.capability.id).sort(),
      actions: actions.map((action) => ({
        action: action.action,
        ...(action.application && { applicationId: action.application.id }),
        ...(action.plannedApplication && { plannedApplicationName: action.plannedApplication.name }),
        ...(action.replacementApplication && { replacementApplicationId: action.replacementApplication.id }),
        ...(action.replacementPlanned && { replacementPlannedName: action.replacementPlanned.name }),
      })),
    };
  }

  // ----- Planned applications

  async plannedApplications() {
    const em = this.em.fork();
    const planned = await em.find(TrmPlannedApplication, {}, { populate: ['linkedApplication'], orderBy: { name: 'asc' } });
    const actions = await em.find(
      TrmInitiativeAction,
      { $or: [{ plannedApplication: { $in: planned.map((p) => p.id) } }, { replacementPlanned: { $in: planned.map((p) => p.id) } }] },
      { populate: ['initiative'] },
    );
    return {
      items: planned.map((record) => ({
        id: record.id,
        name: record.name,
        linkedApplication: record.linkedApplication ? ref(record.linkedApplication) : null,
        initiatives: [
          ...new Map(
            actions
              .filter((action) => action.plannedApplication?.id === record.id || action.replacementPlanned?.id === record.id)
              .map((action) => [action.initiative.id, { id: action.initiative.id, name: action.initiative.name }]),
          ).values(),
        ].sort((a, b) => a.name.localeCompare(b.name)),
      })),
    };
  }

  async linkPlanned(principal: Principal, id: string, input: LinkPlannedApplication): Promise<void> {
    const em = this.em.fork();
    const planned = await em.findOne(TrmPlannedApplication, id, { populate: ['linkedApplication'] });
    if (!planned) throw new NotFoundException('Planned application not found');
    const application = input.applicationId ? await em.findOne(TrmApplication, input.applicationId) : null;
    if (input.applicationId && !application) throw new UnprocessableEntityException('Unknown application');
    const before = { linkedApplication: planned.linkedApplication?.name ?? null };
    planned.linkedApplication = application;
    planned.updatedBy = principal.user.id;
    await em.flush();
    await this.audit.recordChange(principal, 'trm.planned-application.linked', 'trm-planned-application', id, { before, after: { linkedApplication: application?.name ?? null } });
  }
}
