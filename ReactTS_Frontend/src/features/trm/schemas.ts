import { z } from 'zod'

// Shapes of the TRM API (NestJS_Backend/src/modules/trm/trm.schemas.ts), checked by contract.test.ts.

const dateTime = z.iso.datetime()
const name = z.string().nullable()
const text = z.string().nullable()

export const TIME_RATINGS = ['tolerate', 'invest', 'migrate', 'eliminate'] as const
export type TimeRating = (typeof TIME_RATINGS)[number]
export const SERVICE_KINDS = ['application', 'business'] as const
export const SYNC_RUN_STATUSES = ['receiving', 'completed', 'failed', 'abandoned'] as const
export const SYNC_FILES = [
  'business_application',
  'mapped_application_service',
  'business_service',
  'business_capability',
  'product_standard',
  'ba_as_sm',
  'ba_as_bs',
  'ba_as_server',
] as const
export const FIT_SCORES = [1, 2, 3, 4, 5] as const

export const RefSchema = z.object({ id: z.uuid(), name })
export type Ref = z.infer<typeof RefSchema>
export const PortfolioRefSchema = z.object({ id: z.uuid(), name: z.string() })
export const StandardRefSchema = z.object({ id: z.uuid(), name, status: text })
export type StandardRef = z.infer<typeof StandardRefSchema>
const source = z.record(z.string(), z.unknown()).nullable()
/** Classified fields hidden from the caller (they are null) */
const restricted = <const T extends readonly [string, ...string[]]>(fields: T) => z.array(z.enum(fields))
export const APPLICATION_COSTS = ['licenceCost', 'internalSupportCost', 'externalSupportCost', 'infraOnPremisesCost', 'infraCloudCost'] as const
export const APPLICATION_PEOPLE = ['itApplicationOwner', 'applicationLead', 'applicationManager'] as const
const pageOf = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() })

// ----- Applications

export const ApplicationSummarySchema = z.object({
  id: z.uuid(),
  number: text,
  name,
  installStatus: text,
  criticalityRating: text,
  businessUnit: text,
  timeRating: z.enum(TIME_RATINGS).nullable(),
  capability: z.object({ id: z.uuid(), name, level: z.number().int().nullable() }).nullable(),
  capabilityMismatch: z.boolean(),
  portfolios: z.array(PortfolioRefSchema),
  missingSince: dateTime.nullable(),
})
export type ApplicationSummary = z.infer<typeof ApplicationSummarySchema>
export const ApplicationPageSchema = pageOf(ApplicationSummarySchema)

export const SoftwareUseSchema = z.object({
  id: z.uuid(),
  name,
  productVersion: text,
  fullVersion: text,
  primaryModel: z.boolean(),
  productStandard: StandardRefSchema.nullable(),
})
export type SoftwareUse = z.infer<typeof SoftwareUseSchema>

export const ApplicationServiceSchema = z.object({
  id: z.uuid(),
  name,
  kind: z.enum(SERVICE_KINDS),
  environment: text,
  usedFor: text,
  operationalStatus: text,
  missingSince: dateTime.nullable(),
  businessServices: z.array(RefSchema),
  servers: z.array(RefSchema),
  software: z.array(SoftwareUseSchema),
})
export type ApplicationService = z.infer<typeof ApplicationServiceSchema>

export const TrmFieldsSchema = z.object({
  timeRating: z.enum(TIME_RATINGS).nullable(),
  timeRationale: text,
  functionalFit: z.number().int().nullable(),
  technicalFit: z.number().int().nullable(),
  plannedGoLive: z.iso.date().nullable(),
  plannedPhaseOut: z.iso.date().nullable(),
  plannedRetirement: z.iso.date().nullable(),
  vendorEndOfSupport: z.iso.date().nullable(),
})
export type TrmFields = z.infer<typeof TrmFieldsSchema>

export const ApplicationSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  snSysId: z.string(),
  number: text,
  name,
  displayName: text,
  shortName: text,
  description: text,
  installStatus: text,
  operationalStatus: text,
  recordStatus: text,
  installType: text,
  groupOrLocal: text,
  businessUnit: text,
  ownedBusinessUnit: text,
  servingBusinessUnits: text,
  criticalityRating: text,
  bcmCriticality: text,
  rto: text,
  rpo: text,
  recoveryTimeCapability: text,
  snUpdatedOn: text,
  people: z.object({ itApplicationOwner: text, applicationLead: text, applicationManager: text }),
  costs: z.object({ licence: text, internalSupport: text, externalSupport: text, infraOnPremises: text, infraCloud: text }),
  capability: z.object({
    path: z.array(RefSchema),
    mismatch: z.boolean(),
    fields: z.object({ group: text, family: text, category: text }),
  }),
  portfolios: z.array(PortfolioRefSchema),
  subdomains: z.array(z.object({ id: z.uuid(), name: z.string(), domain: z.object({ id: z.uuid(), name: z.string() }) })),
  trm: TrmFieldsSchema,
  services: z.array(ApplicationServiceSchema),
  missingSince: dateTime.nullable(),
  restricted: restricted([...APPLICATION_COSTS, ...APPLICATION_PEOPLE]),
  canEdit: z.boolean(),
  canSetPortfolios: z.boolean(),
  canSetDomains: z.boolean(),
  source,
})
export type Application = z.infer<typeof ApplicationSchema>

export const UpdateApplicationRequest = TrmFieldsSchema.partial().extend({ version: z.number().int().min(1) })
export type UpdateApplicationRequest = z.infer<typeof UpdateApplicationRequest>
export const SetPortfoliosRequest = z.object({ portfolioIds: z.array(z.uuid()) })

export const FacetsSchema = z.object({
  installStatuses: z.array(z.string()),
  criticalityRatings: z.array(z.string()),
  businessUnits: z.array(z.string()),
  environments: z.array(z.string()),
  productStandardStatuses: z.array(z.string()),
})
export type Facets = z.infer<typeof FacetsSchema>

// ----- Services

export const ServiceSummarySchema = z.object({
  id: z.uuid(),
  number: text,
  name,
  kind: z.enum(SERVICE_KINDS),
  environment: text,
  operationalStatus: text,
  missingSince: dateTime.nullable(),
})
export type ServiceSummary = z.infer<typeof ServiceSummarySchema>
export const ServicePageSchema = pageOf(ServiceSummarySchema)

export const ServiceSchema = z.object({
  id: z.uuid(),
  snSysId: z.string(),
  kind: z.enum(SERVICE_KINDS),
  number: text,
  name,
  displayName: text,
  description: text,
  operationalStatus: text,
  environment: text,
  usedFor: text,
  serviceClassification: text,
  portfolioStatus: text,
  businessCriticality: text,
  dataClassification: text,
  customerPiiData: text,
  creditCardData: text,
  healthcareData: text,
  priceSensitiveData: text,
  networkFacing: text,
  rto: text,
  rpo: text,
  applicationSecurityRating: text,
  hostingProvider: text,
  ownedBusinessUnit: text,
  ownedBy: text,
  snUpdatedOn: text,
  applications: z.array(RefSchema),
  businessServices: z.array(RefSchema),
  applicationServices: z.array(RefSchema),
  servers: z.array(RefSchema),
  software: z.array(SoftwareUseSchema),
  missingSince: dateTime.nullable(),
  restricted: restricted(['ownedBy']),
  source,
})
export type Service = z.infer<typeof ServiceSchema>

// ----- Capabilities

export const CapabilityItemSchema = z.object({
  id: z.uuid(),
  name,
  parentId: z.uuid().nullable(),
  level: z.number().int().nullable(),
  description: text,
  applicationCount: z.number().int(),
  missingSince: dateTime.nullable(),
})
export type CapabilityItem = z.infer<typeof CapabilityItemSchema>
export const CapabilityListSchema = z.object({ items: z.array(CapabilityItemSchema) })

export const CapabilitySchema = z.object({
  id: z.uuid(),
  snSysId: z.string(),
  name,
  description: text,
  operationalStatus: text,
  parentName: text,
  level: z.number().int().nullable(),
  path: z.array(RefSchema),
  children: z.array(RefSchema),
  applications: z.array(ApplicationSummarySchema),
  missingSince: dateTime.nullable(),
  source,
})
export type Capability = z.infer<typeof CapabilitySchema>

// ----- Software models, product standards, servers

export const SoftwareModelSummarySchema = z.object({
  id: z.uuid(),
  name,
  product: text,
  productVersion: text,
  manufacturer: text,
  productStandard: StandardRefSchema.nullable(),
  missingSince: dateTime.nullable(),
})
export type SoftwareModelSummary = z.infer<typeof SoftwareModelSummarySchema>
export const SoftwareModelPageSchema = pageOf(SoftwareModelSummarySchema)

export const SoftwareModelSchema = z.object({
  id: z.uuid(),
  snSysId: z.string(),
  name,
  product: text,
  productVersion: text,
  manufacturer: text,
  productType: text,
  modelCategory: text,
  productStandardName: text,
  productStandard: StandardRefSchema.nullable(),
  services: z.array(z.object({ id: z.uuid(), name, fullVersion: text, primaryModel: z.boolean() })),
  applications: z.array(RefSchema),
  missingSince: dateTime.nullable(),
  source,
})
export type SoftwareModel = z.infer<typeof SoftwareModelSchema>

export const ProductStandardSummarySchema = z.object({
  id: z.uuid(),
  name,
  product: text,
  manufacturer: text,
  status: text,
  standardCategory: text,
  functionalCategory: text,
  missingSince: dateTime.nullable(),
})
export type ProductStandardSummary = z.infer<typeof ProductStandardSummarySchema>
export const ProductStandardPageSchema = pageOf(ProductStandardSummarySchema)

export const ProductStandardSchema = z.object({
  id: z.uuid(),
  snSysId: z.string(),
  name,
  product: text,
  manufacturer: text,
  status: text,
  standardCategory: text,
  functionalCategory: text,
  productType: text,
  description: text,
  cloudServiceType: text,
  vmOnPremises: text,
  vmCloud: text,
  containerOnPremises: text,
  containerCloud: text,
  allowedOnDesktop: text,
  aiControls: text,
  remarks: text,
  lastStatusDate: text,
  addedDate: text,
  assessmentLink: text,
  softwareModels: z.array(RefSchema),
  missingSince: dateTime.nullable(),
  source,
})
export type ProductStandard = z.infer<typeof ProductStandardSchema>

export const ServerSummarySchema = z.object({ id: z.uuid(), name: z.string(), missingSince: dateTime.nullable() })
export type ServerSummary = z.infer<typeof ServerSummarySchema>
export const ServerPageSchema = pageOf(ServerSummarySchema)

export const ServerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  missingSince: dateTime.nullable(),
  services: z.array(z.object({ id: z.uuid(), name, environment: text, applications: z.array(RefSchema) })),
})
export type Server = z.infer<typeof ServerSchema>

// ----- Sync runs

const Received = z.partialRecord(z.enum(SYNC_FILES), z.number().int())

export const SyncReportSchema = z.object({
  filesIncluded: z.array(z.enum(SYNC_FILES)),
  records: z.array(
    z.object({
      recordType: z.enum(['applications', 'services', 'capabilities', 'productStandards', 'softwareModels', 'servers']),
      refreshed: z.boolean(),
      received: z.number().int(),
      inserted: z.number().int(),
      updated: z.number().int(),
      unchanged: z.number().int(),
      nowMissing: z.number().int(),
      returned: z.number().int(),
    }),
  ),
  links: z.array(
    z.object({
      linkType: z.enum(['application-service', 'service-business-service', 'service-server', 'service-software']),
      source: z.enum(SYNC_FILES),
      count: z.number().int(),
    }),
  ),
  capabilityMismatches: z.number().int(),
  capabilityIssues: z.array(z.object({ name, problem: z.string() })),
  unmatched: z.array(z.object({ file: z.enum(SYNC_FILES), field: z.string(), name: z.string(), problem: z.enum(['not-found', 'ambiguous']), rows: z.number().int() })),
  skipped: z.array(z.object({ file: z.enum(SYNC_FILES), row: z.number().int(), reason: z.string() })),
  truncated: z.boolean(),
})
export type SyncReport = z.infer<typeof SyncReportSchema>

export const SyncRunSchema = z.object({
  id: z.uuid(),
  status: z.enum(SYNC_RUN_STATUSES),
  dryRun: z.boolean(),
  startedBy: z.object({ id: z.uuid(), name: z.string() }),
  createdAt: dateTime,
  completedAt: dateTime.nullable(),
  received: Received,
  report: SyncReportSchema.nullable(),
  error: text,
})
export type SyncRun = z.infer<typeof SyncRunSchema>
export const SyncRunSummarySchema = SyncRunSchema.omit({ report: true })
export type SyncRunSummary = z.infer<typeof SyncRunSummarySchema>
export const SyncRunPageSchema = pageOf(SyncRunSummarySchema)

// ----- Records missing from ServiceNow (removal by people who hold trm:synced-record:delete)

export const RECORD_TYPES = ['applications', 'services', 'capabilities', 'productStandards', 'softwareModels', 'servers'] as const
export type RecordType = (typeof RECORD_TYPES)[number]
export const REMOVAL_BLOCKERS = ['has-sad-history', 'open-approval', 'used-by-initiative', 'has-children'] as const
export const REMOVAL_REFUSALS = [...REMOVAL_BLOCKERS, 'not-missing', 'not-found'] as const

export const MissingSummarySchema = z.object({
  items: z.array(z.object({ recordType: z.enum(RECORD_TYPES), count: z.number().int() })),
  total: z.number().int(),
})
export type MissingSummary = z.infer<typeof MissingSummarySchema>

export const MissingRecordSchema = z.object({
  id: z.uuid(),
  recordType: z.enum(RECORD_TYPES),
  number: text,
  name,
  snSysId: text,
  missingSince: dateTime,
  blockers: z.array(z.enum(REMOVAL_BLOCKERS)),
})
export type MissingRecord = z.infer<typeof MissingRecordSchema>
export const MissingPageSchema = pageOf(MissingRecordSchema)

export const DeleteMissingRequest = z.object({ recordType: z.enum(RECORD_TYPES), ids: z.array(z.uuid()).min(1).max(100) })
export type DeleteMissingRequest = z.infer<typeof DeleteMissingRequest>
export const DeleteMissingResultSchema = z.object({
  deleted: z.array(z.uuid()),
  refused: z.array(z.object({ id: z.uuid(), reason: z.enum(REMOVAL_REFUSALS) })),
})
export type DeleteMissingResult = z.infer<typeof DeleteMissingResultSchema>

// ----- Portfolios

export const PortfolioSchema = z.object({ id: z.uuid(), name: z.string(), active: z.boolean(), version: z.number().int() })
export type Portfolio = z.infer<typeof PortfolioSchema>
export const PortfolioListSchema = z.object({ items: z.array(PortfolioSchema) })
export const CreatePortfolioRequest = z.object({ name: z.string().trim().min(1).max(200) })
export const UpdatePortfolioRequest = z.object({ name: z.string().trim().min(1).max(200).optional(), active: z.boolean().optional(), version: z.number().int().min(1) })
export type UpdatePortfolioRequest = z.infer<typeof UpdatePortfolioRequest>

// ----- Part 3: domains, technology layers, landscape, EA roadmap

export const INITIATIVE_STATUSES = ['proposed', 'approved', 'in_progress', 'completed', 'cancelled'] as const
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number]
export const ROADMAP_ACTIONS = ['introduce', 'enhance', 'replace', 'retire'] as const
export type RoadmapAction = (typeof ROADMAP_ACTIONS)[number]

const named = { id: z.uuid(), name: z.string(), active: z.boolean(), version: z.number().int() }
export const DomainRefSchema = z.object(named)
export const SubdomainSchema = z.object({ ...named, applicationCount: z.number().int() })
export const DomainSchema = z.object({ ...named, subdomains: z.array(SubdomainSchema) })
export type Domain = z.infer<typeof DomainSchema>
export type Subdomain = z.infer<typeof SubdomainSchema>
export const DomainListSchema = z.object({ items: z.array(DomainSchema) })
export const CreateNamedRequest = z.object({ name: z.string().trim().min(1).max(200) })
export const UpdateNamedRequest = z.object({ name: z.string().trim().min(1).max(200).optional(), active: z.boolean().optional(), version: z.number().int().min(1) })
export type UpdateNamedRequest = z.infer<typeof UpdateNamedRequest>
export const SetSubdomainsRequest = z.object({ subdomainIds: z.array(z.uuid()) })

export const LayerSchema = z.object({ id: z.uuid(), name: z.string(), position: z.number().int(), active: z.boolean(), version: z.number().int() })
export type Layer = z.infer<typeof LayerSchema>
export const LayersSchema = z.object({
  layers: z.array(LayerSchema),
  mappings: z.array(z.object({ standardCategory: z.string(), layerId: z.uuid() })),
  unmappedCategories: z.array(z.string()),
})
export type Layers = z.infer<typeof LayersSchema>
export const UpdateLayerRequest = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  position: z.number().int().min(1).max(1000).optional(),
  version: z.number().int().min(1),
})
export type UpdateLayerRequest = z.infer<typeof UpdateLayerRequest>
export const SetLayerMappingRequest = z.object({ standardCategory: z.string().trim().min(1).max(500), layerId: z.uuid().nullable() })

export const LandscapeAppSchema = z.object({
  id: z.uuid(),
  name,
  number: text,
  installStatus: text,
  criticalityRating: text,
  timeRating: z.enum(TIME_RATINGS).nullable(),
  functionalFit: z.number().int().nullable(),
  technicalFit: z.number().int().nullable(),
  capabilityId: z.uuid().nullable(),
  capabilityMismatch: z.boolean(),
  subdomainIds: z.array(z.uuid()),
  plannedGoLive: z.iso.date().nullable(),
  plannedPhaseOut: z.iso.date().nullable(),
  plannedRetirement: z.iso.date().nullable(),
  vendorEndOfSupport: z.iso.date().nullable(),
  missingSince: dateTime.nullable(),
})
export type LandscapeApp = z.infer<typeof LandscapeAppSchema>
export const LandscapeSchema = z.object({ applications: z.array(LandscapeAppSchema) })

export const TechnologyViewSchema = z.object({
  layers: z.array(z.object({ id: z.uuid(), name: z.string(), position: z.number().int() })),
  standards: z.array(
    z.object({
      id: z.uuid(),
      name,
      status: text,
      standardCategory: text,
      layerId: z.uuid().nullable(),
      modelCount: z.number().int(),
      applicationCount: z.number().int(),
      missingSince: dateTime.nullable(),
    }),
  ),
})
export type TechnologyView = z.infer<typeof TechnologyViewSchema>
export const StandardUsageSchema = z.object({ models: z.array(z.object({ id: z.uuid(), name, productVersion: text, applications: z.array(RefSchema) })) })

const PersonRefSchema = z.object({ id: z.uuid(), name: z.string() })
export const PlannedRefSchema = z.object({ id: z.uuid(), name: z.string(), linkedApplication: RefSchema.nullable() })
export type PlannedRef = z.infer<typeof PlannedRefSchema>

export const InitiativeSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(INITIATIVE_STATUSES),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  owner: PersonRefSchema.nullable(),
  actionCounts: z.object({ introduce: z.number().int(), enhance: z.number().int(), replace: z.number().int(), retire: z.number().int() }),
})
export type InitiativeSummary = z.infer<typeof InitiativeSummarySchema>
export const InitiativePageSchema = pageOf(InitiativeSummarySchema)

export const InitiativeActionSchema = z.object({
  id: z.uuid(),
  action: z.enum(ROADMAP_ACTIONS),
  application: RefSchema.nullable(),
  plannedApplication: PlannedRefSchema.nullable(),
  replacementApplication: RefSchema.nullable(),
  replacementPlanned: PlannedRefSchema.nullable(),
})
export type InitiativeAction = z.infer<typeof InitiativeActionSchema>

export const InitiativeSchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  name: z.string(),
  description: text,
  rationale: text,
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  status: z.enum(INITIATIVE_STATUSES),
  owner: PersonRefSchema.nullable(),
  estimatedCost: text,
  capabilities: z.array(RefSchema),
  actions: z.array(InitiativeActionSchema),
  restricted: restricted(['estimatedCost', 'owner']),
  canEdit: z.boolean(),
})
export type Initiative = z.infer<typeof InitiativeSchema>

export const InitiativeActionRequest = z.object({
  action: z.enum(ROADMAP_ACTIONS),
  applicationId: z.uuid().optional(),
  plannedApplicationName: z.string().trim().min(1).max(300).optional(),
  replacementApplicationId: z.uuid().optional(),
  replacementPlannedName: z.string().trim().min(1).max(300).optional(),
})
export type InitiativeActionRequest = z.infer<typeof InitiativeActionRequest>
const initiativeRequest = {
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable(),
  rationale: z.string().trim().max(5000).nullable(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
  status: z.enum(INITIATIVE_STATUSES),
  ownerId: z.uuid().nullable(),
  estimatedCost: z.string().nullable(),
  capabilityIds: z.array(z.uuid()),
  actions: z.array(InitiativeActionRequest),
}
export const CreateInitiativeRequest = z.object(initiativeRequest)
export type CreateInitiativeRequest = z.infer<typeof CreateInitiativeRequest>
export const UpdateInitiativeRequest = z.object({ ...initiativeRequest, version: z.number().int().min(1) })

export const PlannedApplicationListSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), name: z.string(), linkedApplication: RefSchema.nullable(), initiatives: z.array(z.object({ id: z.uuid(), name: z.string() })) })),
})
export type PlannedApplication = z.infer<typeof PlannedApplicationListSchema>['items'][number]
export const LinkPlannedRequest = z.object({ applicationId: z.uuid().nullable() })
