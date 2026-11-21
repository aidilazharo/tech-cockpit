import { LockMode } from '@mikro-orm/core';
import { EntityManager, type FilterQuery } from '@mikro-orm/postgresql';
import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { likePattern } from '../../common/http/pagination.js';
import { canViewClass } from '../access/data-visibility.js';
import { FieldClassService } from '../access/field-classes.js';
import type { Principal, ResourceScope } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { Portfolio } from '../portfolios/portfolio.entity.js';
import { maskSource } from './domain/source-fields.js';
import { APPLICATION_COSTS, APPLICATION_PEOPLE, applicationField, SERVICE_OWNER, type ApplicationField } from './trm-fields.js';
import { capabilityParents, seen, trmVisibility, type Visibility } from './trm-visibility.js';
import type { ApplicationQuery, CatalogueQuery, ServiceQuery, SetPortfolios, UpdateApplication } from './trm.schemas.js';
import {
  TrmApplication,
  TrmApplicationPortfolio,
  TrmApplicationService,
  TrmApplicationSubdomain,
  TrmCapability,
  TrmProductStandard,
  TrmServer,
  TrmService,
  TrmServiceDependency,
  TrmServiceServer,
  TrmServiceSoftware,
  TrmSoftwareModel,
} from './trm.entities.js';

const TRM_FIELDS = [
  'timeRating',
  'timeRationale',
  'functionalFit',
  'technicalFit',
  'plannedGoLive',
  'plannedPhaseOut',
  'plannedRetirement',
  'vendorEndOfSupport',
] as const;

/** Nullable columns load as null; MikroORM's types also allow undefined. */
const col = <T>(value: T | null | undefined) => value as T | null;
const ref = (record: { id: string; name?: string | null }) => ({ id: record.id, name: col(record.name) });
const byName = <T extends { name?: string | null }>(a: T, b: T) => (a.name ?? '').localeCompare(b.name ?? '');
const page = (query: { page: number; pageSize: number }) => ({ limit: query.pageSize, offset: (query.page - 1) * query.pageSize });

/** Browsing TRM and editing the TRM-only fields. */
@Injectable()
export class TrmCatalogueService {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: AuditService,
    private readonly fieldClasses: FieldClassService,
  ) {}

  /** All ServiceNow fields, masked by class; only for roles holding "View all ServiceNow fields". */
  private source(principal: Principal, source: Record<string, unknown>, scope: ResourceScope): Record<string, unknown> | null {
    if (!principal.can('trm:source-fields:read', scope)) return null;
    return maskSource(source, (dataClass) => canViewClass(principal, dataClass, { scope }));
  }

  private async portfoliosOf(em: EntityManager, applicationIds: string[]): Promise<Map<string, { id: string; name: string }[]>> {
    const links = await em.find(TrmApplicationPortfolio, { application: { $in: applicationIds } }, { populate: ['portfolio'] });
    const result = new Map<string, { id: string; name: string }[]>();
    for (const link of links) {
      result.set(link.application.id, [...(result.get(link.application.id) ?? []), { id: link.portfolio.id, name: link.portfolio.name }].sort(byName));
    }
    return result;
  }

  // ----- Applications

  async listApplications(principal: Principal, query: ApplicationQuery) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    let ids: Set<string> | null = visibility.all ? null : visibility.applications;
    if (query.portfolioId) {
      const inPortfolio = new Set((await em.find(TrmApplicationPortfolio, { portfolio: query.portfolioId })).map((link) => link.application.id));
      ids = ids ? new Set([...ids].filter((id) => inPortfolio.has(id))) : inPortfolio;
    }
    const where: FilterQuery<TrmApplication> = {};
    if (ids) where.id = { $in: [...ids] };
    if (query.q) {
      const pattern = likePattern(query.q);
      where.$or = [{ name: { $ilike: pattern } }, { displayName: { $ilike: pattern } }, { number: { $ilike: pattern } }];
    }
    if (query.installStatus) where.installStatus = query.installStatus;
    if (query.criticalityRating) where.criticalityRating = query.criticalityRating;
    if (query.businessUnit) where.businessUnit = query.businessUnit;
    if (query.timeRating) where.timeRating = query.timeRating === 'none' ? null : query.timeRating;
    if (query.missing !== undefined) where.missingSince = query.missing ? { $ne: null } : null;
    if (query.capabilityId) where.capability = { $in: await this.capabilityAndBelow(em, query.capabilityId) };
    const [items, total] = await em.findAndCount(TrmApplication, where, { populate: ['capability'], orderBy: { name: 'asc', id: 'asc' }, ...page(query) });
    return { items: await this.summaries(em, items), total };
  }

  private async capabilityAndBelow(em: EntityManager, capabilityId: string): Promise<string[]> {
    const tree = await capabilityParents(em);
    const result = [capabilityId];
    for (let index = 0; index < result.length; index++) {
      for (const [id, node] of tree) if (node.parentId === result[index] && !result.includes(id)) result.push(id);
    }
    return result;
  }

  private async summaries(em: EntityManager, applications: TrmApplication[]) {
    const portfolios = await this.portfoliosOf(em, applications.map((a) => a.id));
    return applications.map((application) => ({
      id: application.id,
      number: application.number,
      name: application.name,
      installStatus: application.installStatus,
      criticalityRating: application.criticalityRating,
      businessUnit: application.businessUnit,
      timeRating: application.timeRating,
      capability: application.capability
        ? { id: application.capability.id, name: application.capability.name, level: application.capability.level }
        : null,
      capabilityMismatch: application.capabilityMismatch,
      portfolios: portfolios.get(application.id) ?? [],
      missingSince: application.missingSince,
    }));
  }

  async getApplication(principal: Principal, id: string) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const application = await em.findOne(TrmApplication, id);
    if (!application || !seen(visibility, 'applications', id)) throw new NotFoundException('Application not found');

    const portfolios = (await this.portfoliosOf(em, [id])).get(id) ?? [];
    const scope: ResourceScope = { applicationId: id, portfolioIds: portfolios.map((p) => p.id) };
    const see = (await this.fieldClasses.classes(em)).viewer(principal, { scope });
    const shown = (field: ApplicationField) => see(applicationField(field));
    const tree = await capabilityParents(em);
    const path: { id: string; name: string | null }[] = [];
    // Every capability is in the tree (foreign keys), so lookups by id always succeed.
    for (let current = application.capability?.id ?? null; current && path.length < 10; current = tree.get(current)!.parentId) {
      path.unshift({ id: current, name: tree.get(current)!.name });
    }

    return {
      id: application.id,
      version: application.version,
      snSysId: application.snSysId,
      number: application.number,
      name: application.name,
      displayName: application.displayName,
      shortName: application.shortName,
      description: application.description,
      installStatus: application.installStatus,
      operationalStatus: application.operationalStatus,
      recordStatus: application.recordStatus,
      installType: application.installType,
      groupOrLocal: application.groupOrLocal,
      businessUnit: application.businessUnit,
      ownedBusinessUnit: application.ownedBusinessUnit,
      servingBusinessUnits: application.servingBusinessUnits,
      criticalityRating: application.criticalityRating,
      bcmCriticality: application.bcmCriticality,
      rto: application.rto,
      rpo: application.rpo,
      recoveryTimeCapability: application.recoveryTimeCapability,
      snUpdatedOn: application.snUpdatedOn,
      people: {
        itApplicationOwner: shown('itApplicationOwner') ? application.itApplicationOwner : null,
        applicationLead: shown('applicationLead') ? application.applicationLead : null,
        applicationManager: shown('applicationManager') ? application.applicationManager : null,
      },
      costs: {
        licence: shown('licenceCost') ? application.licenceCost : null,
        internalSupport: shown('internalSupportCost') ? application.internalSupportCost : null,
        externalSupport: shown('externalSupportCost') ? application.externalSupportCost : null,
        infraOnPremises: shown('infraOnPremisesCost') ? application.infraOnPremisesCost : null,
        infraCloud: shown('infraCloudCost') ? application.infraCloudCost : null,
      },
      capability: {
        path,
        mismatch: application.capabilityMismatch,
        fields: {
          group: application.capabilityGroupName,
          family: application.capabilityFamilyName,
          category: application.capabilityCategoryName,
        },
      },
      portfolios,
      subdomains: (await em.find(TrmApplicationSubdomain, { application: id }, { populate: ['subdomain.domain'] }))
        .map((link) => ({ id: link.subdomain.id, name: link.subdomain.name, domain: { id: link.subdomain.domain.id, name: link.subdomain.domain.name } }))
        .sort((a, b) => a.domain.name.localeCompare(b.domain.name) || a.name.localeCompare(b.name)),
      trm: Object.fromEntries(TRM_FIELDS.map((field) => [field, application[field] ?? null])) as Record<(typeof TRM_FIELDS)[number], never>,
      services: await this.applicationServices(em, visibility, id),
      missingSince: application.missingSince,
      restricted: [...APPLICATION_COSTS, ...APPLICATION_PEOPLE].filter((field) => !shown(field)),
      canEdit: this.canEdit(principal, scope),
      canSetPortfolios: principal.can('trm:application-portfolio:manage'),
      canSetDomains: principal.can('trm:domain:manage', scope),
      source: this.source(principal, application.source, scope),
    };
  }

  private canEdit(principal: Principal, scope: ResourceScope): boolean {
    return principal.can('trm:application:update', scope);
  }

  private async applicationServices(em: EntityManager, visibility: Visibility, applicationId: string) {
    const links = await em.find(TrmApplicationService, { application: applicationId }, { populate: ['service'] });
    const services = [...new Map(links.map((link) => [link.service.id, link.service])).values()].sort(byName);
    const details = await this.serviceLinks(em, services.map((s) => s.id));
    return services.map((service) => ({
      id: service.id,
      name: service.name,
      kind: service.kind,
      environment: service.environment,
      usedFor: service.usedFor,
      operationalStatus: service.operationalStatus,
      missingSince: service.missingSince,
      businessServices: (details.businessServices.get(service.id) ?? []).filter((s) => seen(visibility, 'services', s.id)),
      servers: details.servers.get(service.id) ?? [],
      software: details.software.get(service.id) ?? [],
    }));
  }

  /** Business services, servers and software of the given services. */
  private async serviceLinks(em: EntityManager, serviceIds: string[]) {
    const group = <V>(pairs: [string, V][]) => {
      const map = new Map<string, V[]>();
      for (const [key, value] of pairs) map.set(key, [...(map.get(key) ?? []), value]);
      return map;
    };
    const dependencies = await em.find(TrmServiceDependency, { service: { $in: serviceIds } }, { populate: ['businessService'] });
    const hosting = await em.find(TrmServiceServer, { service: { $in: serviceIds } }, { populate: ['server'] });
    const software = await em.find(TrmServiceSoftware, { service: { $in: serviceIds } }, { populate: ['softwareModel.productStandard'] });
    return {
      businessServices: group(dependencies.map((d) => [d.service.id, ref(d.businessService)])),
      servers: group(hosting.map((h) => [h.service.id, { id: h.server.id, name: h.server.name }])),
      software: group(
        software.map((s) => [
          s.service.id,
          {
            id: s.softwareModel.id,
            name: s.softwareModel.name,
            productVersion: s.softwareModel.productVersion,
            fullVersion: s.fullVersion,
            primaryModel: s.primaryModel,
            productStandard: s.softwareModel.productStandard
              ? { id: s.softwareModel.productStandard.id, name: s.softwareModel.productStandard.name, status: s.softwareModel.productStandard.status }
              : null,
          },
        ]),
      ),
    };
  }

  async updateApplication(principal: Principal, id: string, input: UpdateApplication) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const application = await em.findOne(TrmApplication, id);
    if (!application || !seen(visibility, 'applications', id)) throw new NotFoundException('Application not found');
    const portfolios = (await this.portfoliosOf(em, [id])).get(id) ?? [];
    if (!this.canEdit(principal, { applicationId: id, portfolioIds: portfolios.map((p) => p.id) })) {
      throw new ForbiddenException("You may not change this application's TRM fields");
    }
    await em.lock(application, LockMode.OPTIMISTIC, input.version);
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    for (const field of TRM_FIELDS) {
      const value = input[field];
      if (value === undefined || value === (application[field] ?? null)) continue;
      before[field] = application[field] ?? null;
      after[field] = value;
      (application as unknown as Record<string, unknown>)[field] = value;
    }
    if (Object.keys(after).length > 0) {
      application.updatedBy = principal.user.id;
      await em.flush();
      await this.audit.recordChange(principal, 'trm.application.updated', 'trm-application', id, { before, after });
    }
    return this.getApplication(principal, id);
  }

  async setPortfolios(principal: Principal, id: string, input: SetPortfolios) {
    const em = this.em.fork();
    const application = await em.findOne(TrmApplication, id);
    if (!application) throw new NotFoundException('Application not found');
    const current = await em.find(TrmApplicationPortfolio, { application: id }, { populate: ['portfolio'] });
    const wanted = await em.find(Portfolio, { id: { $in: input.portfolioIds } });
    if (wanted.length !== input.portfolioIds.length) throw new UnprocessableEntityException('Unknown portfolio');
    const currentIds = new Set(current.map((link) => link.portfolio.id));
    const inactive = wanted.filter((portfolio) => !portfolio.active && !currentIds.has(portfolio.id));
    if (inactive.length > 0) throw new UnprocessableEntityException(`Inactive portfolios cannot be added: ${inactive.map((p) => p.name).join(', ')}`);

    const wantedIds = new Set(input.portfolioIds);
    for (const link of current) if (!wantedIds.has(link.portfolio.id)) em.remove(link);
    for (const portfolio of wanted) {
      if (!currentIds.has(portfolio.id)) em.create(TrmApplicationPortfolio, { application, portfolio, createdBy: principal.user.id, updatedBy: principal.user.id });
    }
    await em.flush();
    const names = (list: { name: string }[]) => list.map((p) => p.name).sort();
    await this.audit.recordChange(principal, 'trm.application.portfolios-set', 'trm-application', id, {
      before: { portfolios: names(current.map((link) => link.portfolio)) },
      after: { portfolios: names(wanted) },
    });
    return this.getApplication(principal, id);
  }

  async facets(principal: Principal) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const only = (kind: 'applications' | 'services' | 'standards') => (visibility.all ? {} : { id: { $in: [...visibility[kind]] } });
    const distinct = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();
    const applications = await em.find(TrmApplication, only('applications'), { fields: ['installStatus', 'criticalityRating', 'businessUnit'] });
    const services = await em.find(TrmService, only('services'), { fields: ['environment'] });
    const standards = await em.find(TrmProductStandard, only('standards'), { fields: ['status'] });
    return {
      installStatuses: distinct(applications.map((a) => a.installStatus)),
      criticalityRatings: distinct(applications.map((a) => a.criticalityRating)),
      businessUnits: distinct(applications.map((a) => a.businessUnit)),
      environments: distinct(services.map((s) => s.environment)),
      productStandardStatuses: distinct(standards.map((s) => s.status)),
    };
  }

  // ----- Services

  async listServices(principal: Principal, query: ServiceQuery) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const where: FilterQuery<TrmService> = visibility.all ? {} : { id: { $in: [...visibility.services] } };
    if (query.q) where.$or = [{ name: { $ilike: likePattern(query.q) } }, { number: { $ilike: likePattern(query.q) } }];
    if (query.kind) where.kind = query.kind;
    if (query.environment) where.environment = query.environment;
    if (query.missing !== undefined) where.missingSince = query.missing ? { $ne: null } : null;
    const [items, total] = await em.findAndCount(TrmService, where, { orderBy: { name: 'asc', id: 'asc' }, ...page(query) });
    return {
      items: items.map((s) => ({
        id: s.id,
        number: s.number,
        name: s.name,
        kind: s.kind,
        environment: s.environment,
        operationalStatus: s.operationalStatus,
        missingSince: s.missingSince,
      })),
      total,
    };
  }

  async getService(principal: Principal, id: string) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const service = await em.findOne(TrmService, id);
    if (!service || !seen(visibility, 'services', id)) throw new NotFoundException('Service not found');
    const applicationLinks = await em.find(TrmApplicationService, { service: id }, { populate: ['application'] });
    const applications = [...new Map(applicationLinks.map((l) => [l.application.id, ref(l.application)])).values()]
      .filter((a) => seen(visibility, 'applications', a.id))
      .sort(byName);
    const supporting = await em.find(TrmServiceDependency, { businessService: id }, { populate: ['service'] });
    const links = await this.serviceLinks(em, [id]);
    const scope: ResourceScope = { applicationIds: applicationLinks.map((l) => l.application.id) };
    const ownerShown = (await this.fieldClasses.classes(em)).viewer(principal, { scope })(SERVICE_OWNER);
    const columns = Object.fromEntries(
      (
        [
          'number', 'name', 'displayName', 'description', 'operationalStatus', 'environment', 'usedFor', 'serviceClassification',
          'portfolioStatus', 'businessCriticality', 'dataClassification', 'customerPiiData', 'creditCardData', 'healthcareData',
          'priceSensitiveData', 'networkFacing', 'rto', 'rpo', 'applicationSecurityRating', 'hostingProvider', 'ownedBusinessUnit', 'snUpdatedOn',
        ] as const
      ).map((field) => [field, service[field] ?? null]),
    );
    return {
      ...columns,
      id: service.id,
      snSysId: service.snSysId,
      kind: service.kind,
      ownedBy: ownerShown ? service.ownedBy : null,
      applications,
      businessServices: (links.businessServices.get(id) ?? []).filter((s) => seen(visibility, 'services', s.id)).sort(byName),
      applicationServices: supporting.map((d) => ref(d.service)).filter((s) => seen(visibility, 'services', s.id)).sort(byName),
      servers: (links.servers.get(id) ?? []).sort(byName),
      software: (links.software.get(id) ?? []).sort(byName),
      missingSince: service.missingSince,
      restricted: ownerShown ? [] : ['ownedBy'],
      source: this.source(principal, service.source, scope),
    };
  }

  // ----- Capabilities

  async listCapabilities(principal: Principal) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const capabilities = await em.find(TrmCapability, visibility.all ? {} : { id: { $in: [...visibility.capabilities] } }, { orderBy: { name: 'asc' } });
    const applications = await em.find(
      TrmApplication,
      { capability: { $ne: null }, ...(visibility.all ? {} : { id: { $in: [...visibility.applications] } }) },
      { fields: ['capability'] },
    );
    const counts = new Map<string, number>();
    for (const application of applications) counts.set(application.capability!.id, (counts.get(application.capability!.id) ?? 0) + 1);
    return {
      items: capabilities.map((c) => ({
        id: c.id,
        name: c.name,
        parentId: c.parent?.id ?? null,
        level: c.level,
        description: c.description,
        applicationCount: counts.get(c.id) ?? 0,
        missingSince: c.missingSince,
      })),
    };
  }

  async getCapability(principal: Principal, id: string) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const capability = await em.findOne(TrmCapability, id);
    if (!capability || !seen(visibility, 'capabilities', id)) throw new NotFoundException('Capability not found');
    const tree = await capabilityParents(em);
    const path: { id: string; name: string | null }[] = [];
    for (let current: string | null = id; current && path.length < 10; current = tree.get(current)!.parentId) {
      path.unshift({ id: current, name: tree.get(current)!.name });
    }
    const children = [...tree].filter(([, node]) => node.parentId === id).map(([childId, node]) => ({ id: childId, name: node.name }));
    const below = await this.capabilityAndBelow(em, id);
    const where: FilterQuery<TrmApplication> = { capability: { $in: below } };
    if (!visibility.all) where.id = { $in: [...visibility.applications] };
    const applications = await em.find(TrmApplication, where, { populate: ['capability'], orderBy: { name: 'asc' } });
    return {
      id: capability.id,
      snSysId: capability.snSysId,
      name: capability.name,
      description: capability.description,
      operationalStatus: capability.operationalStatus,
      parentName: capability.parentName,
      level: capability.level,
      path,
      children: children.filter((c) => seen(visibility, 'capabilities', c.id)).sort(byName),
      applications: await this.summaries(em, applications),
      missingSince: capability.missingSince,
      source: this.source(principal, capability.source, {}),
    };
  }

  // ----- Software models, product standards, servers

  async listSoftwareModels(principal: Principal, query: CatalogueQuery) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const where: FilterQuery<TrmSoftwareModel> = visibility.all ? {} : { id: { $in: [...visibility.models] } };
    if (query.q) where.$or = [{ name: { $ilike: likePattern(query.q) } }, { product: { $ilike: likePattern(query.q) } }, { manufacturer: { $ilike: likePattern(query.q) } }];
    if (query.missing !== undefined) where.missingSince = query.missing ? { $ne: null } : null;
    const [items, total] = await em.findAndCount(TrmSoftwareModel, where, { populate: ['productStandard'], orderBy: { name: 'asc', id: 'asc' }, ...page(query) });
    return {
      items: items.map((m) => ({
        id: m.id,
        name: m.name,
        product: m.product,
        productVersion: m.productVersion,
        manufacturer: m.manufacturer,
        productStandard: m.productStandard ? { id: m.productStandard.id, name: m.productStandard.name, status: m.productStandard.status } : null,
        missingSince: m.missingSince,
      })),
      total,
    };
  }

  async getSoftwareModel(principal: Principal, id: string) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const model = await em.findOne(TrmSoftwareModel, id, { populate: ['productStandard'] });
    if (!model || !seen(visibility, 'models', id)) throw new NotFoundException('Software model not found');
    const uses = (await em.find(TrmServiceSoftware, { softwareModel: id }, { populate: ['service'] })).filter((u) => seen(visibility, 'services', u.service.id));
    const applicationLinks = await em.find(TrmApplicationService, { service: { $in: uses.map((u) => u.service.id) } }, { populate: ['application'] });
    const scope: ResourceScope = { applicationIds: applicationLinks.map((l) => l.application.id) };
    return {
      id: model.id,
      snSysId: model.snSysId,
      name: model.name,
      product: model.product,
      productVersion: model.productVersion,
      manufacturer: model.manufacturer,
      productType: model.productType,
      modelCategory: model.modelCategory,
      productStandardName: model.productStandardName,
      productStandard: model.productStandard ? { id: model.productStandard.id, name: model.productStandard.name, status: model.productStandard.status } : null,
      services: uses.map((u) => ({ id: u.service.id, name: u.service.name, fullVersion: u.fullVersion, primaryModel: u.primaryModel })).sort(byName),
      applications: [...new Map(applicationLinks.map((l) => [l.application.id, ref(l.application)])).values()]
        .filter((a) => seen(visibility, 'applications', a.id))
        .sort(byName),
      missingSince: model.missingSince,
      source: this.source(principal, model.source, scope),
    };
  }

  async listProductStandards(principal: Principal, query: CatalogueQuery) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const where: FilterQuery<TrmProductStandard> = visibility.all ? {} : { id: { $in: [...visibility.standards] } };
    if (query.q) where.$or = [{ name: { $ilike: likePattern(query.q) } }, { product: { $ilike: likePattern(query.q) } }, { manufacturer: { $ilike: likePattern(query.q) } }];
    if (query.status) where.status = query.status;
    if (query.missing !== undefined) where.missingSince = query.missing ? { $ne: null } : null;
    const [items, total] = await em.findAndCount(TrmProductStandard, where, { orderBy: { name: 'asc', id: 'asc' }, ...page(query) });
    return {
      items: items.map((p) => ({
        id: p.id,
        name: p.name,
        product: p.product,
        manufacturer: p.manufacturer,
        status: p.status,
        standardCategory: p.standardCategory,
        functionalCategory: p.functionalCategory,
        missingSince: p.missingSince,
      })),
      total,
    };
  }

  async getProductStandard(principal: Principal, id: string) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const standard = await em.findOne(TrmProductStandard, id);
    if (!standard || !seen(visibility, 'standards', id)) throw new NotFoundException('Product standard not found');
    const models = (await em.find(TrmSoftwareModel, { productStandard: id }, { orderBy: { name: 'asc' } })).filter((m) => seen(visibility, 'models', m.id));
    const columns = Object.fromEntries(
      (
        [
          'name', 'product', 'manufacturer', 'status', 'standardCategory', 'functionalCategory', 'productType', 'description', 'cloudServiceType',
          'vmOnPremises', 'vmCloud', 'containerOnPremises', 'containerCloud', 'allowedOnDesktop', 'aiControls', 'remarks', 'lastStatusDate',
          'addedDate', 'assessmentLink',
        ] as const
      ).map((field) => [field, standard[field] ?? null]),
    );
    return {
      ...columns,
      id: standard.id,
      snSysId: standard.snSysId,
      softwareModels: models.map(ref),
      missingSince: standard.missingSince,
      source: this.source(principal, standard.source, {}),
    };
  }

  async listServers(principal: Principal, query: CatalogueQuery) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const where: FilterQuery<TrmServer> = visibility.all ? {} : { id: { $in: [...visibility.servers] } };
    if (query.q) where.name = { $ilike: likePattern(query.q) };
    if (query.missing !== undefined) where.missingSince = query.missing ? { $ne: null } : null;
    const [items, total] = await em.findAndCount(TrmServer, where, { orderBy: { name: 'asc' }, ...page(query) });
    return { items: items.map((s) => ({ id: s.id, name: s.name, missingSince: s.missingSince })), total };
  }

  async getServer(principal: Principal, id: string) {
    const em = this.em.fork();
    const visibility = await trmVisibility(em, principal);
    const server = await em.findOne(TrmServer, id);
    if (!server || !seen(visibility, 'servers', id)) throw new NotFoundException('Server not found');
    const hosted = (await em.find(TrmServiceServer, { server: id }, { populate: ['service'] })).filter((h) => seen(visibility, 'services', h.service.id));
    const applicationLinks = await em.find(TrmApplicationService, { service: { $in: hosted.map((h) => h.service.id) } }, { populate: ['application'] });
    return {
      id: server.id,
      name: server.name,
      missingSince: server.missingSince,
      services: hosted
        .map((h) => ({
          id: h.service.id,
          name: h.service.name,
          environment: h.service.environment,
          applications: [
            ...new Map(applicationLinks.filter((l) => l.service.id === h.service.id).map((l) => [l.application.id, ref(l.application)])).values(),
          ].filter((a) => seen(visibility, 'applications', a.id)),
        }))
        .sort(byName),
    };
  }
}
