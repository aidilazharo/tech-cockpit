import { LockMode } from '@mikro-orm/core';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { likePattern } from '../../common/http/pagination.js';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { seen, trmVisibility } from './trm-visibility.js';
import type { CreateNamed, LandscapeQuery, SetLayerMapping, SetSubdomains, UpdateLayer, UpdateNamed } from './trm.schemas.js';
import {
  TrmApplication,
  TrmApplicationPortfolio,
  TrmApplicationService,
  TrmApplicationSubdomain,
  TrmDomain,
  TrmLayer,
  TrmLayerMapping,
  TrmProductStandard,
  TrmServiceSoftware,
  TrmSoftwareModel,
  TrmSubdomain,
} from './trm.entities.js';

/** Domains, technology layers and the landscape views built on them. */
@Injectable()
export class TrmStructureService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
  ) {}

  // ----- Domains (two levels; applications sit in sub-domains, several allowed)

  async listDomains(principal: Principal) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const domains = await em.find(TrmDomain, {}, { orderBy: { name: 'asc' } });
    const subdomains = await em.find(TrmSubdomain, {}, { orderBy: { name: 'asc' } });
    const links = await em.find(TrmApplicationSubdomain, visibility.all ? {} : { application: { $in: [...visibility.applications] } });
    const counts = new Map<string, number>();
    for (const link of links) counts.set(link.subdomain.id, (counts.get(link.subdomain.id) ?? 0) + 1);
    return {
      items: domains.map((domain) => ({
        id: domain.id,
        name: domain.name,
        active: domain.active,
        version: domain.version,
        subdomains: subdomains
          .filter((sub) => sub.domain.id === domain.id)
          .map((sub) => ({ id: sub.id, name: sub.name, active: sub.active, version: sub.version, applicationCount: counts.get(sub.id) ?? 0 })),
      })),
    };
  }

  async createDomain(principal: Principal, input: CreateNamed) {
    const em = this.em.fork();
    const domain = em.create(TrmDomain, { name: input.name, createdBy: principal.user.id, updatedBy: principal.user.id });
    await em.flush();
    await this.audit.recordChange(principal, 'trm.domain.created', 'trm-domain', domain.id, { before: null, after: { name: domain.name } });
    return domain;
  }

  async updateDomain(principal: Principal, id: string, input: UpdateNamed) {
    return this.rename(principal, TrmDomain, id, input, 'trm.domain.updated', 'trm-domain', 'Domain not found');
  }

  async createSubdomain(principal: Principal, domainId: string, input: CreateNamed) {
    const em = this.em.fork();
    const domain = await em.findOne(TrmDomain, domainId);
    if (!domain) throw new NotFoundException('Domain not found');
    const subdomain = em.create(TrmSubdomain, { domain, name: input.name, createdBy: principal.user.id, updatedBy: principal.user.id });
    await em.flush();
    await this.audit.recordChange(principal, 'trm.subdomain.created', 'trm-subdomain', subdomain.id, { before: null, after: { domain: domain.name, name: subdomain.name } });
    return subdomain;
  }

  async updateSubdomain(principal: Principal, id: string, input: UpdateNamed) {
    return this.rename(principal, TrmSubdomain, id, input, 'trm.subdomain.updated', 'trm-subdomain', 'Sub-domain not found');
  }

  private async rename<E extends TrmDomain | TrmSubdomain>(
    principal: Principal,
    entity: new () => E,
    id: string,
    input: UpdateNamed,
    action: string,
    resourceType: string,
    notFound: string,
  ): Promise<E> {
    const em = this.em.fork();
    const record = (await em.findOne(entity as never, id as never)) as E | null;
    if (!record) throw new NotFoundException(notFound);
    await em.lock(record, LockMode.OPTIMISTIC, input.version);
    const before = { name: record.name, active: record.active };
    if (input.name !== undefined) record.name = input.name;
    if (input.active !== undefined) record.active = input.active;
    record.updatedBy = principal.user.id;
    await em.flush();
    await this.audit.recordChange(principal, action, resourceType, id, { before, after: { name: record.name, active: record.active } });
    return record;
  }

  async setApplicationSubdomains(principal: Principal, applicationId: string, input: SetSubdomains) {
    const em = this.em.fork();
    const application = await em.findOne(TrmApplication, applicationId);
    if (!application) throw new NotFoundException('Application not found');
    const portfolioIds = (await em.find(TrmApplicationPortfolio, { application: applicationId })).map((link) => link.portfolio.id);
    if (!principal.can('trm:domain:manage', { applicationId, applicationIds: [applicationId], portfolioIds })) {
      throw new ForbiddenException("You may not place this application in domains");
    }
    const current = await em.find(TrmApplicationSubdomain, { application: applicationId }, { populate: ['subdomain.domain'] });
    const wanted = await em.find(TrmSubdomain, { id: { $in: input.subdomainIds } }, { populate: ['domain'] });
    if (wanted.length !== input.subdomainIds.length) throw new UnprocessableEntityException('Unknown sub-domain');
    const currentIds = new Set(current.map((link) => link.subdomain.id));
    const inactive = wanted.filter((sub) => !currentIds.has(sub.id) && !(sub.active && sub.domain.active));
    if (inactive.length > 0) throw new UnprocessableEntityException(`Inactive sub-domains cannot be added: ${inactive.map((sub) => sub.name).join(', ')}`);

    const wantedIds = new Set(input.subdomainIds);
    for (const link of current) if (!wantedIds.has(link.subdomain.id)) em.remove(link);
    for (const subdomain of wanted) {
      if (!currentIds.has(subdomain.id)) em.create(TrmApplicationSubdomain, { application, subdomain, createdBy: principal.user.id, updatedBy: principal.user.id });
    }
    await em.flush();
    const label = (sub: TrmSubdomain) => `${sub.domain.name} / ${sub.name}`;
    await this.audit.recordChange(principal, 'trm.application.subdomains-set', 'trm-application', applicationId, {
      before: { subdomains: current.map((link) => label(link.subdomain)).sort() },
      after: { subdomains: wanted.map(label).sort() },
    });
  }

  // ----- Technology layers and the product-standard category mapping

  async layers(principal: Principal) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const layers = await em.find(TrmLayer, {}, { orderBy: { position: 'asc', name: 'asc' } });
    const mappings = await em.find(TrmLayerMapping, {}, { orderBy: { standardCategory: 'asc' } });
    const mapped = new Set(mappings.map((mapping) => mapping.standardCategory));
    const standards = await em.find(TrmProductStandard, visibility.all ? {} : { id: { $in: [...visibility.standards] } }, { fields: ['standardCategory'] });
    const categories = new Set(standards.map((standard) => standard.standardCategory).filter((category): category is string => Boolean(category)));
    return {
      layers: layers.map((layer) => ({ id: layer.id, name: layer.name, position: layer.position, active: layer.active, version: layer.version })),
      mappings: mappings.map((mapping) => ({ standardCategory: mapping.standardCategory, layerId: mapping.layer.id })),
      unmappedCategories: [...categories].filter((category) => !mapped.has(category)).sort(),
    };
  }

  async createLayer(principal: Principal, input: CreateNamed) {
    const em = this.em.fork();
    const [last] = await em.find(TrmLayer, {}, { orderBy: { position: 'desc' }, limit: 1 });
    const layer = em.create(TrmLayer, { name: input.name, position: (last?.position ?? 0) + 1, createdBy: principal.user.id, updatedBy: principal.user.id });
    await em.flush();
    await this.audit.recordChange(principal, 'trm.layer.created', 'trm-layer', layer.id, { before: null, after: { name: layer.name, position: layer.position } });
    return layer;
  }

  async updateLayer(principal: Principal, id: string, input: UpdateLayer) {
    const em = this.em.fork();
    const layer = await em.findOne(TrmLayer, id);
    if (!layer) throw new NotFoundException('Layer not found');
    await em.lock(layer, LockMode.OPTIMISTIC, input.version);
    const before = { name: layer.name, active: layer.active, position: layer.position };
    if (input.name !== undefined) layer.name = input.name;
    if (input.active !== undefined) layer.active = input.active;
    if (input.position !== undefined) layer.position = input.position;
    layer.updatedBy = principal.user.id;
    await em.flush();
    await this.audit.recordChange(principal, 'trm.layer.updated', 'trm-layer', id, { before, after: { name: layer.name, active: layer.active, position: layer.position } });
    return layer;
  }

  async setLayerMapping(principal: Principal, input: SetLayerMapping): Promise<void> {
    const em = this.em.fork();
    const mapping = await em.findOne(TrmLayerMapping, { standardCategory: input.standardCategory }, { populate: ['layer'] });
    const before = mapping ? { layer: mapping.layer.name } : null;
    let after: { layer: string } | null = null;
    if (input.layerId === null) {
      if (mapping) em.remove(mapping);
    } else {
      const layer = await em.findOne(TrmLayer, input.layerId);
      if (!layer) throw new UnprocessableEntityException('Unknown layer');
      if (mapping) {
        mapping.layer = layer;
        mapping.updatedBy = principal.user.id;
      } else {
        em.create(TrmLayerMapping, { standardCategory: input.standardCategory, layer, createdBy: principal.user.id, updatedBy: principal.user.id });
      }
      after = { layer: layer.name };
    }
    await em.flush();
    await this.audit.recordChange(principal, 'trm.layer-mapping.set', 'trm-layer-mapping', input.standardCategory, { before, after });
  }

  // ----- Landscape views

  async landscape(principal: Principal, query: LandscapeQuery) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    let ids: Set<string> | null = visibility.all ? null : visibility.applications;
    const narrow = (allowed: Iterable<string>) => {
      const set = new Set(allowed);
      ids = ids ? new Set([...ids].filter((id) => set.has(id))) : set;
    };
    if (query.portfolioId) narrow((await em.find(TrmApplicationPortfolio, { portfolio: query.portfolioId })).map((l) => l.application.id));
    if (query.domainId) narrow((await em.find(TrmApplicationSubdomain, { subdomain: { domain: query.domainId } })).map((l) => l.application.id));
    const where: FilterQuery<TrmApplication> = {};
    if (ids) where.id = { $in: [...(ids as Set<string>)] };
    if (query.q) where.$or = [{ name: { $ilike: likePattern(query.q) } }, { number: { $ilike: likePattern(query.q) } }];
    const applications = await em.find(TrmApplication, where, { orderBy: { name: 'asc', id: 'asc' } });
    const placements = await em.find(TrmApplicationSubdomain, { application: { $in: applications.map((a) => a.id) } });
    const subdomainsOf = new Map<string, string[]>();
    for (const link of placements) subdomainsOf.set(link.application.id, [...(subdomainsOf.get(link.application.id) ?? []), link.subdomain.id]);
    return {
      applications: applications.map((app) => ({
        id: app.id,
        name: app.name,
        number: app.number,
        installStatus: app.installStatus,
        criticalityRating: app.criticalityRating,
        timeRating: app.timeRating,
        functionalFit: app.functionalFit,
        technicalFit: app.technicalFit,
        capabilityId: app.capability ? app.capability.id : null,
        capabilityMismatch: app.capabilityMismatch,
        subdomainIds: subdomainsOf.get(app.id) ?? [],
        plannedGoLive: app.plannedGoLive,
        plannedPhaseOut: app.plannedPhaseOut,
        plannedRetirement: app.plannedRetirement,
        vendorEndOfSupport: app.vendorEndOfSupport,
        missingSince: app.missingSince,
      })),
    };
  }

  /** Product standards per technology layer, with how many models and applications use each. */
  async technology(principal: Principal) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const layers = await em.find(TrmLayer, { active: true }, { orderBy: { position: 'asc', name: 'asc' } });
    const active = new Set(layers.map((layer) => layer.id));
    const layerOf = new Map(
      (await em.find(TrmLayerMapping, {})).filter((mapping) => active.has(mapping.layer.id)).map((mapping) => [mapping.standardCategory, mapping.layer.id]),
    );
    const standards = await em.find(TrmProductStandard, visibility.all ? {} : { id: { $in: [...visibility.standards] } }, { orderBy: { name: 'asc' } });
    const usage = await this.usage(em, visibility, standards.map((s) => s.id));
    return {
      layers: layers.map((layer) => ({ id: layer.id, name: layer.name, position: layer.position })),
      standards: standards.map((standard) => ({
        id: standard.id,
        name: standard.name,
        status: standard.status,
        standardCategory: standard.standardCategory,
        layerId: (standard.standardCategory && layerOf.get(standard.standardCategory)) || null,
        modelCount: usage.models.get(standard.id)?.length ?? 0,
        applicationCount: new Set((usage.models.get(standard.id) ?? []).flatMap((model) => usage.applications.get(model.id) ?? [])).size,
        missingSince: standard.missingSince,
      })),
    };
  }

  /** A standard's software models, each with the applications running it. */
  async standardUsage(principal: Principal, standardId: string) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const standard = await em.findOne(TrmProductStandard, standardId);
    if (!standard || !seen(visibility, 'standards', standardId)) throw new NotFoundException('Product standard not found');
    const usage = await this.usage(em, visibility, [standardId]);
    const names = new Map((await em.find(TrmApplication, { id: { $in: [...new Set([...usage.applications.values()].flat())] } }, { fields: ['name'] })).map((a) => [a.id, a.name ?? null]));
    return {
      models: (usage.models.get(standardId) ?? []).map((model) => ({
        id: model.id,
        name: model.name,
        productVersion: model.productVersion,
        applications: [...new Set(usage.applications.get(model.id) ?? [])]
          .map((id) => ({ id, name: names.get(id) ?? null }))
          .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
      })),
    };
  }

  /** Software models per standard, and visible application ids per model. */
  private async usage(em: EntityManager, visibility: Awaited<ReturnType<typeof trmVisibility>>, standardIds: string[]) {
    const models = (await em.find(TrmSoftwareModel, { productStandard: { $in: standardIds } }, { orderBy: { name: 'asc' } })).filter((model) =>
      seen(visibility, 'models', model.id),
    );
    const uses = await em.find(TrmServiceSoftware, { softwareModel: { $in: models.map((m) => m.id) } });
    const links = await em.find(TrmApplicationService, { service: { $in: [...new Set(uses.map((u) => u.service.id))] } });
    const appsOfService = new Map<string, string[]>();
    for (const link of links) {
      if (seen(visibility, 'applications', link.application.id)) {
        appsOfService.set(link.service.id, [...(appsOfService.get(link.service.id) ?? []), link.application.id]);
      }
    }
    const applications = new Map<string, string[]>();
    for (const use of uses) applications.set(use.softwareModel.id, [...(applications.get(use.softwareModel.id) ?? []), ...(appsOfService.get(use.service.id) ?? [])]);
    const byStandard = new Map<string, TrmSoftwareModel[]>();
    for (const model of models) byStandard.set(model.productStandard!.id, [...(byStandard.get(model.productStandard!.id) ?? []), model]);
    return { models: byStandard, applications };
  }

}
