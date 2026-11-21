import { Controller, Get, HttpCode, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PageQuerySchema, type PageQuery } from '../../common/http/pagination.js';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../common/zod/index.js';
import { AuditResource, CurrentPrincipal, RequirePermission } from '../access/decorators.js';
import type { Principal } from '../access/principal.js';
import { TrmCatalogueService } from './trm-catalogue.service.js';
import { TrmRemovalService } from './trm-removal.service.js';
import { TrmRoadmapService } from './trm-roadmap.service.js';
import { TrmStructureService } from './trm-structure.service.js';
import { TrmSyncService } from './trm-sync.service.js';
import type { TrmSyncRun } from './trm.entities.js';
import {
  type CreateInitiative,
  CreateInitiativeSchema,
  type CreateNamed,
  CreateNamedSchema,
  DomainListSchema,
  DomainRefSchema,
  type InitiativeQuery,
  InitiativeQuerySchema,
  InitiativePageSchema,
  InitiativeSchemaOut,
  type LandscapeQuery,
  LandscapeQuerySchema,
  LandscapeSchema,
  LayerRefSchema,
  LayersSchema,
  type LinkPlannedApplication,
  LinkPlannedApplicationSchema,
  PlannedApplicationListSchema,
  type SetLayerMapping,
  SetLayerMappingSchema,
  type SetSubdomains,
  SetSubdomainsSchema,
  StandardUsageSchema,
  TechnologyViewSchema,
  type UpdateInitiative,
  UpdateInitiativeSchema,
  type UpdateLayer,
  UpdateLayerSchema,
  type UpdateNamed,
  UpdateNamedSchema,
  type ApplicationQuery,
  ApplicationQuerySchema,
  ApplicationPageSchema,
  ApplicationSchemaOut,
  type CatalogueQuery,
  CatalogueQuerySchema,
  CapabilityListSchema,
  CapabilitySchemaOut,
  type CompleteSyncRun,
  CompleteSyncRunSchema,
  type DeleteMissing,
  DeleteMissingResultSchema,
  DeleteMissingSchema,
  FacetsSchema,
  type MissingQuery,
  MissingPageSchema,
  MissingQuerySchema,
  MissingSummarySchema,
  ProductStandardPageSchema,
  ProductStandardSchemaOut,
  ServerPageSchema,
  ServerSchemaOut,
  type ServiceQuery,
  ServiceQuerySchema,
  ServicePageSchema,
  ServiceSchemaOut,
  type SetPortfolios,
  SetPortfoliosSchema,
  SoftwareModelPageSchema,
  SoftwareModelSchemaOut,
  type StartSyncRun,
  StartSyncRunSchema,
  SyncReceivedSchema,
  type SyncRecords,
  SyncRecordsSchema,
  SyncRunPageSchema,
  SyncRunSchemaOut,
  type UpdateApplication,
  UpdateApplicationSchema,
} from './trm.schemas.js';
import { personName } from '../identity/person-name.js';

const IdParam = z.uuid();
const paged = <T>(query: { page: number; pageSize: number }, result: { items: T[]; total: number }) => ({
  items: result.items,
  page: query.page,
  pageSize: query.pageSize,
  total: result.total,
});

@ApiTags('TRM')
@AuditResource('trm')
@Controller({ path: 'trm', version: '1' })
export class TrmController {
  constructor(private readonly catalogue: TrmCatalogueService) {}

  @Get('facets')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: FacetsSchema, description: 'Values for the list filters (from the records you can see)' })
  facets(@CurrentPrincipal() principal: Principal) {
    return this.catalogue.facets(principal);
  }

  @Get('applications')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ApplicationPageSchema, description: 'Business applications you can see, paged' })
  async applications(@CurrentPrincipal() principal: Principal, @ZodQuery(ApplicationQuerySchema) query: ApplicationQuery) {
    return paged(query, await this.catalogue.listApplications(principal, query));
  }

  @Get('applications/:id')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ApplicationSchemaOut, description: 'The application with its services, capability and TRM fields' })
  application(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.catalogue.getApplication(principal, id);
  }

  @Patch('applications/:id')
  @RequirePermission('trm:application:update')
  @ZodResponse({ status: 200, schema: ApplicationSchemaOut, description: 'TRM fields changed' })
  updateApplication(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateApplicationSchema) body: UpdateApplication) {
    return this.catalogue.updateApplication(principal, id, body);
  }

  @Put('applications/:id/portfolios')
  @RequirePermission('trm:application-portfolio:manage')
  @ZodResponse({ status: 200, schema: ApplicationSchemaOut, description: "The application's portfolios replaced" })
  setPortfolios(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(SetPortfoliosSchema) body: SetPortfolios) {
    return this.catalogue.setPortfolios(principal, id, body);
  }

  @Get('services')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ServicePageSchema, description: 'Application and business services you can see, paged' })
  async services(@CurrentPrincipal() principal: Principal, @ZodQuery(ServiceQuerySchema) query: ServiceQuery) {
    return paged(query, await this.catalogue.listServices(principal, query));
  }

  @Get('services/:id')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ServiceSchemaOut, description: 'The service and what it links to' })
  service(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.catalogue.getService(principal, id);
  }

  @Get('capabilities')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: CapabilityListSchema, description: 'The capability tree (as a flat list with parents)' })
  capabilities(@CurrentPrincipal() principal: Principal) {
    return this.catalogue.listCapabilities(principal);
  }

  @Get('capabilities/:id')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: CapabilitySchemaOut, description: 'The capability and the applications under it' })
  capability(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.catalogue.getCapability(principal, id);
  }

  @Get('software-models')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: SoftwareModelPageSchema, description: 'Software models, paged' })
  async softwareModels(@CurrentPrincipal() principal: Principal, @ZodQuery(CatalogueQuerySchema) query: CatalogueQuery) {
    return paged(query, await this.catalogue.listSoftwareModels(principal, query));
  }

  @Get('software-models/:id')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: SoftwareModelSchemaOut, description: 'The software model and where it is used' })
  softwareModel(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.catalogue.getSoftwareModel(principal, id);
  }

  @Get('product-standards')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ProductStandardPageSchema, description: 'Product standards, paged' })
  async productStandards(@CurrentPrincipal() principal: Principal, @ZodQuery(CatalogueQuerySchema) query: CatalogueQuery) {
    return paged(query, await this.catalogue.listProductStandards(principal, query));
  }

  @Get('product-standards/:id')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ProductStandardSchemaOut, description: 'The product standard and its software models' })
  productStandard(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.catalogue.getProductStandard(principal, id);
  }

  @Get('servers')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ServerPageSchema, description: 'Servers (names only for now), paged' })
  async servers(@CurrentPrincipal() principal: Principal, @ZodQuery(CatalogueQuerySchema) query: CatalogueQuery) {
    return paged(query, await this.catalogue.listServers(principal, query));
  }

  @Get('servers/:id')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: ServerSchemaOut, description: 'The server and the services it hosts' })
  server(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.catalogue.getServer(principal, id);
  }
}

function syncRunView(run: TrmSyncRun) {
  return {
    id: run.id,
    status: run.status,
    dryRun: run.dryRun,
    startedBy: { id: run.startedBy.id, name: personName(run.startedBy) },
    createdAt: run.createdAt,
    completedAt: run.completedAt ?? null,
    received: run.received,
    report: run.report ?? null,
    error: run.error ?? null,
  };
}

/** Loading the Node app's ServiceNow exports (system admins; used by tools/trm-sync). */
@ApiTags('TRM sync')
@AuditResource('trm-sync-run')
@Controller({ path: 'trm/sync-runs', version: '1' })
export class TrmSyncController {
  constructor(private readonly sync: TrmSyncService) {}

  @Get()
  @RequirePermission('trm:sync:run')
  @ZodResponse({ status: 200, schema: SyncRunPageSchema, description: 'Sync runs, newest first' })
  async list(@ZodQuery(PageQuerySchema) query: PageQuery) {
    const result = await this.sync.list(query);
    return paged(query, { items: result.items.map((run) => syncRunView(run)), total: result.total });
  }

  @Get(':id')
  @RequirePermission('trm:sync:run')
  @ZodResponse({ status: 200, schema: SyncRunSchemaOut, description: 'The run and its report' })
  async get(@ZodParam('id', IdParam) id: string) {
    return syncRunView(await this.sync.get(id));
  }

  @Post()
  @RequirePermission('trm:sync:run')
  @ZodResponse({ status: 201, schema: SyncRunSchemaOut, description: 'Run started; send the exports, then complete it' })
  async start(@CurrentPrincipal() principal: Principal, @ZodBody(StartSyncRunSchema) body: StartSyncRun) {
    return syncRunView(await this.sync.start(principal, body));
  }

  @Put(':id/records')
  @RequirePermission('trm:sync:run')
  @ZodResponse({ status: 200, schema: SyncReceivedSchema, description: 'Batch held until the run completes' })
  async records(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(SyncRecordsSchema) body: SyncRecords) {
    return { received: await this.sync.receive(principal, id, body) };
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('trm:sync:run')
  @ZodResponse({ status: 200, schema: SyncRunSchemaOut, description: 'Applied in one transaction (or only reported, for a dry run)' })
  async complete(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(CompleteSyncRunSchema) body: CompleteSyncRun) {
    return syncRunView(await this.sync.complete(principal, id, body));
  }

  @Post(':id/abandon')
  @HttpCode(200)
  @RequirePermission('trm:sync:run')
  @ZodResponse({ status: 200, schema: SyncRunSchemaOut, description: 'Run stopped; nothing was changed' })
  async abandon(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return syncRunView(await this.sync.abandon(principal, id));
  }
}

/** Removing records that the last complete export no longer contained (system admins; the sync itself never deletes). */
@ApiTags('TRM removal')
@AuditResource('trm-removal')
@Controller({ path: 'trm/missing-records', version: '1' })
export class TrmRemovalController {
  constructor(private readonly removal: TrmRemovalService) {}

  @Get('summary')
  @RequirePermission('trm:synced-record:delete')
  @ZodResponse({ status: 200, schema: MissingSummarySchema, description: 'How many records of each type are flagged as no longer in the export' })
  summary(@CurrentPrincipal() principal: Principal) {
    return this.removal.summary(principal);
  }

  @Get()
  @RequirePermission('trm:synced-record:delete')
  @ZodResponse({ status: 200, schema: MissingPageSchema, description: 'Flagged records of one type, with what stops each from being removed' })
  async list(@CurrentPrincipal() principal: Principal, @ZodQuery(MissingQuerySchema) query: MissingQuery) {
    return paged(query, await this.removal.list(principal, query));
  }

  @Post('delete')
  @HttpCode(200)
  @RequirePermission('trm:synced-record:delete')
  @ZodResponse({ status: 200, schema: DeleteMissingResultSchema, description: 'Which records were removed and which were kept, and why' })
  remove(@CurrentPrincipal() principal: Principal, @ZodBody(DeleteMissingSchema) body: DeleteMissing) {
    return this.removal.remove(principal, body);
  }
}

const domainView = (d: { id: string; name: string; active: boolean; version: number }) => ({ id: d.id, name: d.name, active: d.active, version: d.version });
const layerView = (l: { id: string; name: string; position: number; active: boolean; version: number }) => ({ id: l.id, name: l.name, position: l.position, active: l.active, version: l.version });

/** Domains, technology layers and the landscape views. */
@ApiTags('TRM landscape')
@AuditResource('trm')
@Controller({ path: 'trm', version: '1' })
export class TrmStructureController {
  constructor(
    private readonly structure: TrmStructureService,
    private readonly catalogue: TrmCatalogueService,
  ) {}

  @Get('landscape')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: LandscapeSchema, description: 'Every application you can see, with what the landscape views colour and group by' })
  landscape(@CurrentPrincipal() principal: Principal, @ZodQuery(LandscapeQuerySchema) query: LandscapeQuery) {
    return this.structure.landscape(principal, query);
  }

  @Get('technology')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: TechnologyViewSchema, description: 'Product standards per technology layer' })
  technology(@CurrentPrincipal() principal: Principal) {
    return this.structure.technology(principal);
  }

  @Get('technology/standards/:id')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: StandardUsageSchema, description: "A standard's software models and the applications running each" })
  standardUsage(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.structure.standardUsage(principal, id);
  }

  @Get('domains')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: DomainListSchema, description: 'Domains and their sub-domains' })
  domains(@CurrentPrincipal() principal: Principal) {
    return this.structure.listDomains(principal);
  }

  @Post('domains')
  @RequirePermission('trm:domain:manage')
  @ZodResponse({ status: 201, schema: DomainRefSchema, description: 'Domain created' })
  async createDomain(@CurrentPrincipal() principal: Principal, @ZodBody(CreateNamedSchema) body: CreateNamed) {
    return domainView(await this.structure.createDomain(principal, body));
  }

  @Patch('domains/:id')
  @RequirePermission('trm:domain:manage')
  @ZodResponse({ status: 200, schema: DomainRefSchema, description: 'Domain renamed, deactivated or reactivated' })
  async updateDomain(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateNamedSchema) body: UpdateNamed) {
    return domainView(await this.structure.updateDomain(principal, id, body));
  }

  @Post('domains/:id/subdomains')
  @RequirePermission('trm:domain:manage')
  @ZodResponse({ status: 201, schema: DomainRefSchema, description: 'Sub-domain created' })
  async createSubdomain(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(CreateNamedSchema) body: CreateNamed) {
    return domainView(await this.structure.createSubdomain(principal, id, body));
  }

  @Patch('subdomains/:id')
  @RequirePermission('trm:domain:manage')
  @ZodResponse({ status: 200, schema: DomainRefSchema, description: 'Sub-domain renamed, deactivated or reactivated' })
  async updateSubdomain(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateNamedSchema) body: UpdateNamed) {
    return domainView(await this.structure.updateSubdomain(principal, id, body));
  }

  @Put('applications/:id/subdomains')
  @RequirePermission('trm:domain:manage')
  @ZodResponse({ status: 200, schema: ApplicationSchemaOut, description: "The application's sub-domains replaced" })
  async setSubdomains(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(SetSubdomainsSchema) body: SetSubdomains) {
    await this.structure.setApplicationSubdomains(principal, id, body);
    return this.catalogue.getApplication(principal, id);
  }

  @Get('layers')
  @RequirePermission('trm:application:read')
  @ZodResponse({ status: 200, schema: LayersSchema, description: 'Technology layers and the category mapping' })
  layers(@CurrentPrincipal() principal: Principal) {
    return this.structure.layers(principal);
  }

  @Post('layers')
  @RequirePermission('trm:layer:manage')
  @ZodResponse({ status: 201, schema: LayerRefSchema, description: 'Layer added at the end' })
  async createLayer(@CurrentPrincipal() principal: Principal, @ZodBody(CreateNamedSchema) body: CreateNamed) {
    return layerView(await this.structure.createLayer(principal, body));
  }

  @Patch('layers/:id')
  @RequirePermission('trm:layer:manage')
  @ZodResponse({ status: 200, schema: LayerRefSchema, description: 'Layer renamed, moved, deactivated or reactivated' })
  async updateLayer(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateLayerSchema) body: UpdateLayer) {
    return layerView(await this.structure.updateLayer(principal, id, body));
  }

  @Put('layer-mappings')
  @RequirePermission('trm:layer:manage')
  @ZodResponse({ status: 200, schema: LayersSchema, description: 'Category placed in a layer (or removed)' })
  async setLayerMapping(@CurrentPrincipal() principal: Principal, @ZodBody(SetLayerMappingSchema) body: SetLayerMapping) {
    await this.structure.setLayerMapping(principal, body);
    return this.structure.layers(principal);
  }
}

/** The EA roadmap (never for vendors). */
@ApiTags('TRM roadmap')
@AuditResource('trm-roadmap')
@Controller({ path: 'trm', version: '1' })
export class TrmRoadmapController {
  constructor(private readonly roadmap: TrmRoadmapService) {}

  @Get('initiatives')
  @RequirePermission('trm:roadmap:read')
  @ZodResponse({ status: 200, schema: InitiativePageSchema, description: 'Roadmap initiatives by start date, paged' })
  async list(@CurrentPrincipal() principal: Principal, @ZodQuery(InitiativeQuerySchema) query: InitiativeQuery) {
    return paged(query, await this.roadmap.list(principal, query));
  }

  @Get('initiatives/:id')
  @RequirePermission('trm:roadmap:read')
  @ZodResponse({ status: 200, schema: InitiativeSchemaOut, description: 'The initiative with its applications and capabilities' })
  get(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.roadmap.get(principal, id);
  }

  @Post('initiatives')
  @RequirePermission('trm:roadmap:manage')
  @ZodResponse({ status: 201, schema: InitiativeSchemaOut, description: 'Initiative created' })
  create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateInitiativeSchema) body: CreateInitiative) {
    return this.roadmap.create(principal, body);
  }

  @Put('initiatives/:id')
  @RequirePermission('trm:roadmap:manage')
  @ZodResponse({ status: 200, schema: InitiativeSchemaOut, description: 'Initiative replaced (applications and capabilities included)' })
  update(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateInitiativeSchema) body: UpdateInitiative) {
    return this.roadmap.update(principal, id, body);
  }

  @Get('planned-applications')
  @RequirePermission('trm:roadmap:read')
  @ZodResponse({ status: 200, schema: PlannedApplicationListSchema, description: 'Applications named on the roadmap before they exist in ServiceNow' })
  planned() {
    return this.roadmap.plannedApplications();
  }

  @Put('planned-applications/:id/link')
  @RequirePermission('trm:roadmap:manage')
  @ZodResponse({ status: 200, schema: PlannedApplicationListSchema, description: 'Linked to the real application (or unlinked)' })
  async link(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(LinkPlannedApplicationSchema) body: LinkPlannedApplication) {
    await this.roadmap.linkPlanned(principal, id, body);
    return this.roadmap.plannedApplications();
  }
}
