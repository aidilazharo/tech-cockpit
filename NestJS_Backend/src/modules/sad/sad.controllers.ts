import { Controller, Get, Header, HttpCode, Patch, Post, Put, Res, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../common/zod/index.js';
import { AuditResource, Authenticated, CurrentPrincipal, RequireAnyPermission, RequirePermission } from '../access/decorators.js';
import type { PermissionCode } from '../access/permission-catalogue.js';
import type { Principal } from '../access/principal.js';
import type { DiagramSlot } from './domain/diagrams.js';
import { SAD_SECTION_KEYS, sadRead, sadUpdate, type SadSectionKey } from './domain/sections.js';
import { SadDiagramDefaultsService } from './sad-diagram-defaults.service.js';
import { SadPdfService } from './sad-pdf.service.js';
import { SadRetentionService } from './sad-retention.service.js';
import {
  CreateSadRetentionSchema,
  SadApiPageSchema,
  SadApiQuerySchema,
  SadApplicationCallsSchema,
  SadBusinessApplicationQuerySchema,
  SadBusinessApplicationsSchema,
  SadDiagramDefaultsSchema,
  SadServersSchema,
  SaveSadDiagramDefaultsSchema,
  SadDiagramSlotSchema,
  SadDiagramsSchema,
  SadListQuerySchema,
  SadListSchema,
  SadOverviewSchema,
  SadRetentionListSchema,
  SadRetentionStandardSchema,
  SadSectionKeySchema,
  SadTemplateSchema,
  SadVersionRefSchema,
  SadVersionSchema,
  SaveSadDiagramSchema,
  SaveSadSectionSchema,
  SavedSadDiagramSchema,
  SavedSadSectionSchema,
  UpdateSadRetentionSchema,
  type CreateSadRetention,
  type SadApiQuery,
  type SadListQuery,
  type SaveSadDiagram,
  type SaveSadDiagramDefaults,
  type SaveSadSection,
  type UpdateSadRetention,
} from './sad.schemas.js';
import { SadService, TRM_LINKERS } from './sad.service.js';

const IdParam = z.uuid();
type Codes = [PermissionCode, ...PermissionCode[]];
/** Any section, viewed or edited: services check the application's scope. */
const ANY_SECTION = SAD_SECTION_KEYS.flatMap((key) => [sadRead(key), sadUpdate(key)]) as Codes;
const EDIT_ANY_SECTION = SAD_SECTION_KEYS.map(sadUpdate) as Codes;
const APPROVER_READ = 'Approvers read the SAD version they approve without holding SAD permissions; the service checks section permissions or the approval task';

/** Solution Architecture Documents: one living SAD per TRM application, versioned and approved. */
@ApiTags('SAD')
@AuditResource('sad')
@Controller({ path: 'sad', version: '1' })
export class SadController {
  constructor(
    private readonly sad: SadService,
    private readonly pdf: SadPdfService,
  ) {}

  @Get('template')
  @Authenticated('The SAD question set is not sensitive; approvers without SAD permissions need it to read what they approve')
  @ZodResponse({ status: 200, schema: SadTemplateSchema, description: "AIA's SAD template: sections, questions and when they apply" })
  template() {
    return this.sad.template();
  }

  @Get('documents')
  @RequireAnyPermission(...ANY_SECTION)
  @ZodResponse({ status: 200, schema: SadListSchema, description: 'Applications in your scope with their SAD status, by name' })
  list(@CurrentPrincipal() principal: Principal, @ZodQuery(SadListQuerySchema) query: SadListQuery) {
    return this.sad.list(principal, query);
  }

  @Get('applications/:id')
  @RequireAnyPermission(...ANY_SECTION)
  @ZodResponse({ status: 200, schema: SadOverviewSchema, description: "An application's SAD: current version, open draft, history and what you can do" })
  overview(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.overview(principal, id);
  }

  @Post('applications/:id/drafts')
  @RequireAnyPermission(...EDIT_ANY_SECTION)
  @ZodResponse({ status: 201, schema: SadVersionRefSchema, description: 'Draft started (a copy of the current version, or empty)' })
  startDraft(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.startDraft(principal, id);
  }

  @Get('versions/:id')
  @Authenticated(APPROVER_READ)
  @ZodResponse({ status: 200, schema: SadVersionSchema, description: 'The version with the sections you may view, completion and what you can do' })
  version(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.version(principal, id);
  }

  @Put('versions/:id/sections/:section')
  @RequireAnyPermission(...EDIT_ANY_SECTION)
  @ZodResponse({ status: 200, schema: SavedSadSectionSchema, description: "Section saved (send the section's row version; a stale one is refused with 409)" })
  saveSection(
    @CurrentPrincipal() principal: Principal,
    @ZodParam('id', IdParam) id: string,
    @ZodParam('section', SadSectionKeySchema) section: SadSectionKey,
    @ZodBody(SaveSadSectionSchema) body: SaveSadSection,
  ) {
    return this.sad.saveSection(principal, id, section, body);
  }

  @Get('versions/:id/diagrams')
  @Authenticated(APPROVER_READ)
  @ZodResponse({ status: 200, schema: SadDiagramsSchema, description: 'The diagram slots your sections show, with what you may edit' })
  diagrams(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.diagrams(principal, id);
  }

  @Get('versions/:id/business-applications')
  @RequireAnyPermission(...(TRM_LINKERS.map(sadUpdate) as Codes))
  @ZodResponse({
    status: 200,
    schema: SadBusinessApplicationsSchema,
    description: "TRM applications the editors of this draft's solution, infrastructure or monitoring diagram can put on it: any of them (name and APM number only), never the SAD's own",
  })
  businessApplications(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodQuery(SadBusinessApplicationQuerySchema) query: { q: string }) {
    return this.sad.businessApplications(principal, id, query.q);
  }

  @Get('applications/:id/calls')
  @Authenticated('Readers of the application in TRM or of section 2 of its SAD; the service checks both and masks what each call does per source SAD')
  @ZodResponse({ status: 200, schema: SadApplicationCallsSchema, description: "Calls between the application and others, from every application's latest approved SAD" })
  applicationCalls(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.applicationCalls(principal, id);
  }

  @Get('versions/:id/servers')
  @RequirePermission(sadUpdate('network'))
  @ZodResponse({ status: 200, schema: SadServersSchema, description: "The application's TRM servers, for section 3 editors to put on this draft's infrastructure diagram" })
  servers(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.servers(principal, id);
  }

  @Put('versions/:id/diagrams/:slot')
  @RequireAnyPermission(...EDIT_ANY_SECTION)
  @ZodResponse({
    status: 200,
    schema: SavedSadDiagramSchema,
    description: "Diagram slot saved; each editor changes only the views their sections edit (send the slot's row version; a stale one is refused with 409)",
  })
  saveDiagram(
    @CurrentPrincipal() principal: Principal,
    @ZodParam('id', IdParam) id: string,
    @ZodParam('slot', SadDiagramSlotSchema) slot: DiagramSlot,
    @ZodBody(SaveSadDiagramSchema) body: SaveSadDiagram,
  ) {
    return this.sad.saveDiagram(principal, id, slot, body);
  }

  @Post('versions/:id/submit')
  @RequireAnyPermission(...EDIT_ANY_SECTION)
  @HttpCode(200)
  @ZodResponse({ status: 200, schema: SadVersionRefSchema, description: 'Submitted for approval (or resubmitted after being returned)' })
  submit(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.submit(principal, id);
  }

  @Post('versions/:id/cancel')
  @Authenticated('The person who started a draft cancels it even after losing their SAD permissions; the service checks the starter or "Cancel any SAD draft" in scope')
  @HttpCode(200)
  @ZodResponse({ status: 200, schema: SadVersionRefSchema, description: 'Draft cancelled' })
  cancel(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.sad.cancelDraft(principal, id);
  }

  @Get('versions/:id/pdf')
  @Authenticated(APPROVER_READ)
  @Header('cache-control', 'no-store')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'The version as a PDF in the AIA template layout, with only the sections you may view', schema: { type: 'string', format: 'binary' } })
  async exportPdf(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @Res({ passthrough: true }) res: Response) {
    const { file, filename } = await this.pdf.render(principal, id);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(file);
  }

  @Get('apis')
  @RequireAnyPermission('sad:api-inventory:read', 'sad:api-inventory:update')
  @ZodResponse({ status: 200, schema: SadApiPageSchema, description: "Every API in the current SADs you may view, by application" })
  apis(@CurrentPrincipal() principal: Principal, @ZodQuery(SadApiQuerySchema) query: SadApiQuery) {
    return this.sad.apis(principal, query);
  }
}

/** AIA's standard backup retention rows used by the SAD backup schedule. */
@ApiTags('SAD')
@AuditResource('sad-retention')
@Controller({ path: 'sad/retention-standards', version: '1' })
export class SadRetentionController {
  constructor(private readonly retention: SadRetentionService) {}

  @Get()
  @RequireAnyPermission('sad:backup:read', 'sad:backup:update', 'sad:retention:manage')
  @ZodResponse({ status: 200, schema: SadRetentionListSchema, description: 'Standard retention rows by position (maintainers also see retired rows)' })
  list(@CurrentPrincipal() principal: Principal) {
    return this.retention.list(principal);
  }

  @Post()
  @RequirePermission('sad:retention:manage')
  @ZodResponse({ status: 201, schema: SadRetentionStandardSchema, description: 'Row added at the end' })
  create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateSadRetentionSchema) body: CreateSadRetention) {
    return this.retention.create(principal, body);
  }

  @Patch(':id')
  @RequirePermission('sad:retention:manage')
  @ZodResponse({ status: 200, schema: SadRetentionStandardSchema, description: 'Row changed (send its version; a stale one is refused with 409)' })
  update(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateSadRetentionSchema) body: UpdateSadRetention) {
    return this.retention.update(principal, id, body);
  }
}

/** The hosting names a new infrastructure diagram starts with ("Maintain SAD diagram defaults"). */
@ApiTags('SAD')
@AuditResource('sad-diagram-defaults')
@Controller({ path: 'sad/diagram-defaults', version: '1' })
export class SadDiagramDefaultsController {
  constructor(private readonly defaults: SadDiagramDefaultsService) {}

  @Get()
  @RequirePermission('sad:diagram-defaults:manage')
  @ZodResponse({ status: 200, schema: SadDiagramDefaultsSchema, description: 'The subscription, regions, data centres and office network new infrastructure diagrams start with' })
  get() {
    return this.defaults.get();
  }

  @Put()
  @RequirePermission('sad:diagram-defaults:manage')
  @ZodResponse({ status: 200, schema: SadDiagramDefaultsSchema, description: 'Defaults changed for diagrams set up from now on (send their version; a stale one is refused with 409)' })
  update(@CurrentPrincipal() principal: Principal, @ZodBody(SaveSadDiagramDefaultsSchema) body: SaveSadDiagramDefaults) {
    return this.defaults.update(principal, body);
  }
}
