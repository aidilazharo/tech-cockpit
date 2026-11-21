import { z } from 'zod';
import { PageQuerySchema, pageOf } from '../../common/http/pagination.js';
import { SYNC_FILES } from './domain/sync-files.js';
import { APPLICATION_COSTS, APPLICATION_PEOPLE } from './trm-fields.js';
import { INITIATIVE_STATUSES, ROADMAP_ACTIONS, SERVICE_KINDS, SYNC_RUN_STATUSES, TIME_RATINGS } from './trm.entities.js';

const name = z.string().nullable();
const Ref = z.object({ id: z.uuid(), name }).meta({ id: 'TrmRef' });
const PortfolioRef = z.object({ id: z.uuid(), name: z.string() }).meta({ id: 'PortfolioRef' });
const StandardRef = z.object({ id: z.uuid(), name, status: z.string().nullable() }).meta({ id: 'TrmProductStandardRef' });
const missingSince = z.date().nullable().describe('When a complete sync last stopped finding the record in ServiceNow');
const source = z
  .record(z.string(), z.unknown())
  .nullable()
  .describe('Every ServiceNow field as exported. Cost and people fields are null when hidden from you; null for vendors.');
const restricted = <const T extends readonly [string, ...string[]]>(fields: T) =>
  z.array(z.enum(fields)).describe('Classified fields hidden from you on this record (they are null)');
const yes = (description: string) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true'))
    .describe(description);

// ----- Applications

export const ApplicationQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional().describe('Name, display name or number contains'),
  installStatus: z.string().max(100).optional(),
  criticalityRating: z.string().max(100).optional(),
  businessUnit: z.string().max(200).optional(),
  capabilityId: z.uuid().optional().describe('Applications under this capability (any level below it too)'),
  timeRating: z.enum([...TIME_RATINGS, 'none']).optional(),
  portfolioId: z.uuid().optional(),
  missing: yes('Only records missing from the last complete ServiceNow export (true) or only present ones (false)'),
});
export type ApplicationQuery = z.infer<typeof ApplicationQuerySchema>;

const CapabilityBrief = z.object({ id: z.uuid(), name, level: z.number().int().nullable() });

export const ApplicationSummarySchema = z
  .object({
    id: z.uuid(),
    number: z.string().nullable(),
    name,
    installStatus: z.string().nullable(),
    criticalityRating: z.string().nullable(),
    businessUnit: z.string().nullable(),
    timeRating: z.enum(TIME_RATINGS).nullable(),
    capability: CapabilityBrief.nullable(),
    capabilityMismatch: z.boolean(),
    portfolios: z.array(PortfolioRef),
    missingSince,
  })
  .meta({ id: 'TrmApplicationSummary' });
export const ApplicationPageSchema = pageOf(ApplicationSummarySchema).meta({ id: 'TrmApplicationPage' });

const SoftwareUse = z.object({
  id: z.uuid(),
  name,
  productVersion: z.string().nullable(),
  fullVersion: z.string().nullable(),
  primaryModel: z.boolean(),
  productStandard: StandardRef.nullable(),
});

const ApplicationServiceView = z.object({
  id: z.uuid(),
  name,
  kind: z.enum(SERVICE_KINDS),
  environment: z.string().nullable(),
  usedFor: z.string().nullable(),
  operationalStatus: z.string().nullable(),
  missingSince,
  businessServices: z.array(Ref),
  servers: z.array(Ref),
  software: z.array(SoftwareUse),
});

export const ApplicationSchemaOut = z
  .object({
    id: z.uuid(),
    version: z.number().int(),
    snSysId: z.string(),
    number: z.string().nullable(),
    name,
    displayName: z.string().nullable(),
    shortName: z.string().nullable(),
    description: z.string().nullable(),
    installStatus: z.string().nullable(),
    operationalStatus: z.string().nullable(),
    recordStatus: z.string().nullable(),
    installType: z.string().nullable(),
    groupOrLocal: z.string().nullable(),
    businessUnit: z.string().nullable(),
    ownedBusinessUnit: z.string().nullable(),
    servingBusinessUnits: z.string().nullable(),
    criticalityRating: z.string().nullable(),
    bcmCriticality: z.string().nullable(),
    rto: z.string().nullable(),
    rpo: z.string().nullable(),
    recoveryTimeCapability: z.string().nullable(),
    snUpdatedOn: z.string().nullable().describe('ServiceNow "updated on", as exported'),
    people: z
      .object({ itApplicationOwner: z.string().nullable(), applicationLead: z.string().nullable(), applicationManager: z.string().nullable() })
      .describe('Personal data'),
    costs: z
      .object({
        licence: z.string().nullable(),
        internalSupport: z.string().nullable(),
        externalSupport: z.string().nullable(),
        infraOnPremises: z.string().nullable(),
        infraCloud: z.string().nullable(),
      })
      .describe('Financial data: annual costs in thousands of USD'),
    capability: z.object({
      path: z.array(Ref).describe('From the top-level capability down to the application\'s capability'),
      mismatch: z.boolean().describe('The capability fields do not follow the capability tree'),
      fields: z.object({ group: z.string().nullable(), family: z.string().nullable(), category: z.string().nullable() }),
    }),
    portfolios: z.array(PortfolioRef),
    subdomains: z.array(z.object({ id: z.uuid(), name: z.string(), domain: z.object({ id: z.uuid(), name: z.string() }) })),
    trm: z.object({
      timeRating: z.enum(TIME_RATINGS).nullable(),
      timeRationale: z.string().nullable(),
      functionalFit: z.number().int().nullable(),
      technicalFit: z.number().int().nullable(),
      plannedGoLive: z.iso.date().nullable(),
      plannedPhaseOut: z.iso.date().nullable(),
      plannedRetirement: z.iso.date().nullable(),
      vendorEndOfSupport: z.iso.date().nullable(),
    }),
    services: z.array(ApplicationServiceView),
    missingSince,
    restricted: restricted([...APPLICATION_COSTS, ...APPLICATION_PEOPLE]),
    canEdit: z.boolean().describe('You may edit the TRM fields'),
    canSetPortfolios: z.boolean(),
    canSetDomains: z.boolean(),
    source,
  })
  .meta({ id: 'TrmApplication' });

const fit = z.number().int().min(1).max(5).nullable().optional().describe('1 Very poor · 2 Poor · 3 Fair · 4 Good · 5 Excellent');
const planDate = z.iso.date().nullable().optional();

export const UpdateApplicationSchema = z
  .object({
    version: z.number().int().min(1),
    timeRating: z.enum(TIME_RATINGS).nullable().optional(),
    timeRationale: z.string().trim().max(2000).nullable().optional(),
    functionalFit: fit,
    technicalFit: fit,
    plannedGoLive: planDate,
    plannedPhaseOut: planDate,
    plannedRetirement: planDate,
    vendorEndOfSupport: planDate,
  })
  .strict()
  .meta({ id: 'UpdateTrmApplication' });
export type UpdateApplication = z.infer<typeof UpdateApplicationSchema>;

export const SetPortfoliosSchema = z
  .object({ portfolioIds: z.array(z.uuid()).max(50).refine((ids) => new Set(ids).size === ids.length, 'Each portfolio only once') })
  .strict()
  .meta({ id: 'SetTrmApplicationPortfolios' });
export type SetPortfolios = z.infer<typeof SetPortfoliosSchema>;

export const FacetsSchema = z
  .object({
    installStatuses: z.array(z.string()),
    criticalityRatings: z.array(z.string()),
    businessUnits: z.array(z.string()),
    environments: z.array(z.string()),
    productStandardStatuses: z.array(z.string()),
  })
  .meta({ id: 'TrmFacets' });

// ----- Services

export const ServiceQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  kind: z.enum(SERVICE_KINDS).optional(),
  environment: z.string().max(100).optional(),
  missing: yes('Only missing (true) or only present (false) records'),
});
export type ServiceQuery = z.infer<typeof ServiceQuerySchema>;

export const ServiceSummarySchema = z
  .object({
    id: z.uuid(),
    number: z.string().nullable(),
    name,
    kind: z.enum(SERVICE_KINDS),
    environment: z.string().nullable(),
    operationalStatus: z.string().nullable(),
    missingSince,
  })
  .meta({ id: 'TrmServiceSummary' });
export const ServicePageSchema = pageOf(ServiceSummarySchema).meta({ id: 'TrmServicePage' });

export const ServiceSchemaOut = z
  .object({
    id: z.uuid(),
    snSysId: z.string(),
    kind: z.enum(SERVICE_KINDS),
    number: z.string().nullable(),
    name,
    displayName: z.string().nullable(),
    description: z.string().nullable(),
    operationalStatus: z.string().nullable(),
    environment: z.string().nullable(),
    usedFor: z.string().nullable(),
    serviceClassification: z.string().nullable(),
    portfolioStatus: z.string().nullable(),
    businessCriticality: z.string().nullable(),
    dataClassification: z.string().nullable(),
    customerPiiData: z.string().nullable(),
    creditCardData: z.string().nullable(),
    healthcareData: z.string().nullable(),
    priceSensitiveData: z.string().nullable(),
    networkFacing: z.string().nullable(),
    rto: z.string().nullable(),
    rpo: z.string().nullable(),
    applicationSecurityRating: z.string().nullable(),
    hostingProvider: z.string().nullable(),
    ownedBusinessUnit: z.string().nullable(),
    ownedBy: z.string().nullable().describe('Personal data'),
    snUpdatedOn: z.string().nullable(),
    applications: z.array(Ref),
    businessServices: z.array(Ref).describe('Business services this application service supports'),
    applicationServices: z.array(Ref).describe('Application services supporting this business service'),
    servers: z.array(Ref),
    software: z.array(SoftwareUse),
    missingSince,
    restricted: restricted(['ownedBy']),
    source,
  })
  .meta({ id: 'TrmService' });

// ----- Capabilities

export const CapabilityListSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.uuid(),
        name,
        parentId: z.uuid().nullable(),
        level: z.number().int().nullable(),
        description: z.string().nullable(),
        applicationCount: z.number().int().describe('Applications whose own capability this is'),
        missingSince,
      }),
    ),
  })
  .meta({ id: 'TrmCapabilityList' });

export const CapabilitySchemaOut = z
  .object({
    id: z.uuid(),
    snSysId: z.string(),
    name,
    description: z.string().nullable(),
    operationalStatus: z.string().nullable(),
    parentName: z.string().nullable(),
    level: z.number().int().nullable(),
    path: z.array(Ref),
    children: z.array(Ref),
    applications: z.array(ApplicationSummarySchema).describe('Applications at this capability or below it'),
    missingSince,
    source,
  })
  .meta({ id: 'TrmCapability' });

// ----- Software models, product standards, servers

export const CatalogueQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.string().max(100).optional().describe('Product standards only: Standard, Restricted, ...'),
  missing: yes('Only missing (true) or only present (false) records'),
});
export type CatalogueQuery = z.infer<typeof CatalogueQuerySchema>;

export const SoftwareModelSummarySchema = z
  .object({
    id: z.uuid(),
    name,
    product: z.string().nullable(),
    productVersion: z.string().nullable(),
    manufacturer: z.string().nullable(),
    productStandard: StandardRef.nullable(),
    missingSince,
  })
  .meta({ id: 'TrmSoftwareModelSummary' });
export const SoftwareModelPageSchema = pageOf(SoftwareModelSummarySchema).meta({ id: 'TrmSoftwareModelPage' });

export const SoftwareModelSchemaOut = z
  .object({
    id: z.uuid(),
    snSysId: z.string(),
    name,
    product: z.string().nullable(),
    productVersion: z.string().nullable(),
    manufacturer: z.string().nullable(),
    productType: z.string().nullable(),
    modelCategory: z.string().nullable(),
    productStandardName: z.string().nullable(),
    productStandard: StandardRef.nullable(),
    services: z.array(z.object({ id: z.uuid(), name, fullVersion: z.string().nullable(), primaryModel: z.boolean() })),
    applications: z.array(Ref),
    missingSince,
    source,
  })
  .meta({ id: 'TrmSoftwareModel' });

export const ProductStandardSummarySchema = z
  .object({
    id: z.uuid(),
    name,
    product: z.string().nullable(),
    manufacturer: z.string().nullable(),
    status: z.string().nullable(),
    standardCategory: z.string().nullable(),
    functionalCategory: z.string().nullable(),
    missingSince,
  })
  .meta({ id: 'TrmProductStandardSummary' });
export const ProductStandardPageSchema = pageOf(ProductStandardSummarySchema).meta({ id: 'TrmProductStandardPage' });

export const ProductStandardSchemaOut = z
  .object({
    id: z.uuid(),
    snSysId: z.string(),
    name,
    product: z.string().nullable(),
    manufacturer: z.string().nullable(),
    status: z.string().nullable(),
    standardCategory: z.string().nullable(),
    functionalCategory: z.string().nullable(),
    productType: z.string().nullable(),
    description: z.string().nullable(),
    cloudServiceType: z.string().nullable(),
    vmOnPremises: z.string().nullable(),
    vmCloud: z.string().nullable(),
    containerOnPremises: z.string().nullable(),
    containerCloud: z.string().nullable(),
    allowedOnDesktop: z.string().nullable(),
    aiControls: z.string().nullable(),
    remarks: z.string().nullable(),
    lastStatusDate: z.string().nullable(),
    addedDate: z.string().nullable(),
    assessmentLink: z.string().nullable(),
    softwareModels: z.array(Ref),
    missingSince,
    source,
  })
  .meta({ id: 'TrmProductStandard' });

export const ServerSummarySchema = z.object({ id: z.uuid(), name: z.string(), missingSince }).meta({ id: 'TrmServerSummary' });
export const ServerPageSchema = pageOf(ServerSummarySchema).meta({ id: 'TrmServerPage' });

export const ServerSchemaOut = z
  .object({
    id: z.uuid(),
    name: z.string(),
    missingSince,
    services: z.array(z.object({ id: z.uuid(), name, environment: z.string().nullable(), applications: z.array(Ref) })),
  })
  .meta({ id: 'TrmServer' });

// ----- Sync runs

export const StartSyncRunSchema = z
  .object({ dryRun: z.boolean().default(false).describe('Report what would change without changing anything') })
  .strict()
  .meta({ id: 'StartTrmSyncRun' });
export type StartSyncRun = z.infer<typeof StartSyncRunSchema>;

const SyncValue = z.union([z.string().max(100_000), z.number(), z.boolean(), z.null()]);
export const SyncRecordsSchema = z
  .object({
    file: z.enum(SYNC_FILES).describe('Which export the rows come from (file name without .json)'),
    records: z.array(z.record(z.string().max(200), SyncValue)).min(1).max(500).describe('Rows in export order'),
  })
  .strict()
  .meta({ id: 'TrmSyncRecords' });
export type SyncRecords = z.infer<typeof SyncRecordsSchema>;

const Received = z.partialRecord(z.enum(SYNC_FILES), z.number().int()).describe('Rows received per export');

export const SyncReceivedSchema = z.object({ received: Received }).meta({ id: 'TrmSyncReceived' });

export const CompleteSyncRunSchema = z
  .object({ expected: z.partialRecord(z.enum(SYNC_FILES), z.number().int().min(0)).describe('Rows sent per export; must match what the server received') })
  .strict()
  .meta({ id: 'CompleteTrmSyncRun' });
export type CompleteSyncRun = z.infer<typeof CompleteSyncRunSchema>;

export const RECORD_TYPES = ['applications', 'services', 'capabilities', 'productStandards', 'softwareModels', 'servers'] as const;
export const LINK_TYPES = ['application-service', 'service-business-service', 'service-server', 'service-software'] as const;

export const SyncReportSchema = z
  .object({
    filesIncluded: z.array(z.enum(SYNC_FILES)),
    records: z.array(
      z.object({
        recordType: z.enum(RECORD_TYPES),
        refreshed: z.boolean().describe('A complete export was included, so missing records were flagged'),
        received: z.number().int(),
        inserted: z.number().int(),
        updated: z.number().int(),
        unchanged: z.number().int(),
        nowMissing: z.number().int(),
        returned: z.number().int(),
      }),
    ),
    links: z.array(z.object({ linkType: z.enum(LINK_TYPES), source: z.enum(SYNC_FILES), count: z.number().int() })),
    capabilityMismatches: z.number().int().describe('Applications whose capability fields do not follow the tree'),
    capabilityIssues: z.array(z.object({ name, problem: z.string() })),
    unmatched: z.array(
      z.object({ file: z.enum(SYNC_FILES), field: z.string(), name: z.string(), problem: z.enum(['not-found', 'ambiguous']), rows: z.number().int() }),
    ),
    skipped: z.array(z.object({ file: z.enum(SYNC_FILES), row: z.number().int(), reason: z.string() })),
    truncated: z.boolean().describe('Lists were cut to the first 500 entries each'),
  })
  .meta({ id: 'TrmSyncReport' });
export type SyncReport = z.infer<typeof SyncReportSchema>;

export const SyncRunSchemaOut = z
  .object({
    id: z.uuid(),
    status: z.enum(SYNC_RUN_STATUSES),
    dryRun: z.boolean(),
    startedBy: z.object({ id: z.uuid(), name: z.string() }),
    createdAt: z.date(),
    completedAt: z.date().nullable(),
    received: Received,
    report: SyncReportSchema.nullable(),
    error: z.string().nullable(),
  })
  .meta({ id: 'TrmSyncRun' });

export const SyncRunPageSchema = pageOf(SyncRunSchemaOut.omit({ report: true })).meta({ id: 'TrmSyncRunPage' });

// ----- Part 3: domains, technology layers, landscape views, EA roadmap

const versioned = { version: z.number().int().min(1) };
const entityName = z.string().trim().min(1).max(200);

export const DomainListSchema = z
  .object({
    items: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        active: z.boolean(),
        version: z.number().int(),
        subdomains: z.array(
          z.object({ id: z.uuid(), name: z.string(), active: z.boolean(), version: z.number().int(), applicationCount: z.number().int().describe('Applications you can see') }),
        ),
      }),
    ),
  })
  .meta({ id: 'TrmDomainList' });

export const CreateNamedSchema = z.object({ name: entityName }).strict().meta({ id: 'CreateTrmNamed' });
export type CreateNamed = z.infer<typeof CreateNamedSchema>;
export const UpdateNamedSchema = z
  .object({ name: entityName.optional(), active: z.boolean().optional(), ...versioned })
  .strict()
  .meta({ id: 'UpdateTrmNamed' });
export type UpdateNamed = z.infer<typeof UpdateNamedSchema>;
export const DomainRefSchema = z.object({ id: z.uuid(), name: z.string(), active: z.boolean(), version: z.number().int() }).meta({ id: 'TrmDomainRef' });

export const SetSubdomainsSchema = z
  .object({ subdomainIds: z.array(z.uuid()).max(100).refine((ids) => new Set(ids).size === ids.length, 'Each sub-domain only once') })
  .strict()
  .meta({ id: 'SetTrmApplicationSubdomains' });
export type SetSubdomains = z.infer<typeof SetSubdomainsSchema>;

export const LayersSchema = z
  .object({
    layers: z.array(z.object({ id: z.uuid(), name: z.string(), position: z.number().int(), active: z.boolean(), version: z.number().int() })),
    mappings: z.array(z.object({ standardCategory: z.string(), layerId: z.uuid() })),
    unmappedCategories: z.array(z.string()).describe('Standard categories of product standards with no layer yet'),
  })
  .meta({ id: 'TrmLayers' });

export const UpdateLayerSchema = z
  .object({ name: entityName.optional(), active: z.boolean().optional(), position: z.number().int().min(1).max(1000).optional(), ...versioned })
  .strict()
  .meta({ id: 'UpdateTrmLayer' });
export type UpdateLayer = z.infer<typeof UpdateLayerSchema>;
export const LayerRefSchema = z.object({ id: z.uuid(), name: z.string(), position: z.number().int(), active: z.boolean(), version: z.number().int() }).meta({ id: 'TrmLayerRef' });

export const SetLayerMappingSchema = z
  .object({ standardCategory: z.string().trim().min(1).max(500), layerId: z.uuid().nullable().describe('null removes the mapping') })
  .strict()
  .meta({ id: 'SetTrmLayerMapping' });
export type SetLayerMapping = z.infer<typeof SetLayerMappingSchema>;

export const LandscapeQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  portfolioId: z.uuid().optional(),
  domainId: z.uuid().optional(),
});
export type LandscapeQuery = z.infer<typeof LandscapeQuerySchema>;

export const LandscapeSchema = z
  .object({
    applications: z.array(
      z.object({
        id: z.uuid(),
        name,
        number: z.string().nullable(),
        installStatus: z.string().nullable(),
        criticalityRating: z.string().nullable(),
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
        missingSince,
      }),
    ),
  })
  .meta({ id: 'TrmLandscape' });

export const TechnologyViewSchema = z
  .object({
    layers: z.array(z.object({ id: z.uuid(), name: z.string(), position: z.number().int() })),
    standards: z.array(
      z.object({
        id: z.uuid(),
        name,
        status: z.string().nullable(),
        standardCategory: z.string().nullable(),
        layerId: z.uuid().nullable().describe('null: the category is not mapped to an active layer'),
        modelCount: z.number().int(),
        applicationCount: z.number().int(),
        missingSince,
      }),
    ),
  })
  .meta({ id: 'TrmTechnologyView' });

export const StandardUsageSchema = z
  .object({ models: z.array(z.object({ id: z.uuid(), name, productVersion: z.string().nullable(), applications: z.array(Ref) })) })
  .meta({ id: 'TrmStandardUsage' });

// ----- EA roadmap

const isoDate = z.iso.date();
const PlannedRef = z.object({ id: z.uuid(), name: z.string(), linkedApplication: Ref.nullable() }).meta({ id: 'TrmPlannedApplicationRef' });
const ActionCounts = z.object(Object.fromEntries(ROADMAP_ACTIONS.map((a) => [a, z.number().int()])) as Record<(typeof ROADMAP_ACTIONS)[number], z.ZodNumber>);

export const InitiativeQuerySchema = PageQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  status: z.enum(INITIATIVE_STATUSES).optional(),
  from: isoDate.optional().describe('Initiatives still running on or after this date'),
  to: isoDate.optional().describe('Initiatives starting on or before this date'),
});
export type InitiativeQuery = z.infer<typeof InitiativeQuerySchema>;

const PersonRef = z.object({ id: z.uuid(), name: z.string() });

export const InitiativeSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    status: z.enum(INITIATIVE_STATUSES),
    startDate: isoDate,
    endDate: isoDate,
    owner: PersonRef.nullable().describe('Personal data: null when hidden from you'),
    actionCounts: ActionCounts,
  })
  .meta({ id: 'TrmInitiativeSummary' });
export const InitiativePageSchema = pageOf(InitiativeSummarySchema).meta({ id: 'TrmInitiativePage' });

export const InitiativeSchemaOut = z
  .object({
    id: z.uuid(),
    version: z.number().int(),
    name: z.string(),
    description: z.string().nullable(),
    rationale: z.string().nullable(),
    startDate: isoDate,
    endDate: isoDate,
    status: z.enum(INITIATIVE_STATUSES),
    owner: PersonRef.nullable().describe('Personal data'),
    estimatedCost: z.string().nullable().describe('Financial data, MYR'),
    capabilities: z.array(Ref),
    actions: z.array(
      z.object({
        id: z.uuid(),
        action: z.enum(ROADMAP_ACTIONS),
        application: Ref.nullable(),
        plannedApplication: PlannedRef.nullable(),
        replacementApplication: Ref.nullable(),
        replacementPlanned: PlannedRef.nullable(),
      }),
    ),
    restricted: restricted(['estimatedCost', 'owner']),
    canEdit: z.boolean(),
  })
  .meta({ id: 'TrmInitiative' });

const plannedName = z.string().trim().min(1).max(300);
const ActionInput = z
  .object({
    action: z.enum(ROADMAP_ACTIONS),
    applicationId: z.uuid().optional(),
    plannedApplicationName: plannedName.optional(),
    replacementApplicationId: z.uuid().optional(),
    replacementPlannedName: plannedName.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.applicationId === undefined) === (value.plannedApplicationName === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['applicationId'], message: 'Name either an existing application or a planned one' });
    }
    const replacements = Number(value.replacementApplicationId !== undefined) + Number(value.replacementPlannedName !== undefined);
    if (value.action === 'replace' && replacements !== 1) {
      ctx.addIssue({ code: 'custom', path: ['replacementApplicationId'], message: 'A replacement needs exactly one replacement application' });
    }
    if (value.action !== 'replace' && replacements > 0) {
      ctx.addIssue({ code: 'custom', path: ['replacementApplicationId'], message: 'Only a replacement names a replacement application' });
    }
    if (value.applicationId !== undefined && value.applicationId === value.replacementApplicationId) {
      ctx.addIssue({ code: 'custom', path: ['replacementApplicationId'], message: 'An application cannot replace itself' });
    }
  });

const initiativeFields = {
  name: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).nullable(),
  rationale: z.string().trim().max(5000).nullable(),
  startDate: isoDate,
  endDate: isoDate,
  status: z.enum(INITIATIVE_STATUSES),
  ownerId: z.uuid().nullable(),
  estimatedCost: z
    .string()
    .regex(/^\d{1,13}(\.\d{1,2})?$/, 'An amount in MYR, up to 2 decimals')
    .nullable(),
  capabilityIds: z.array(z.uuid()).max(100).refine((ids) => new Set(ids).size === ids.length, 'Each capability only once'),
  actions: z.array(ActionInput).max(200),
};
const datesInOrder = (value: { startDate: string; endDate: string }, ctx: z.RefinementCtx) => {
  if (value.endDate < value.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date cannot be before the start date' });
};

export const CreateInitiativeSchema = z.object(initiativeFields).strict().superRefine(datesInOrder).meta({ id: 'CreateTrmInitiative' });
export type CreateInitiative = z.infer<typeof CreateInitiativeSchema>;
export const UpdateInitiativeSchema = z
  .object({ ...initiativeFields, ...versioned })
  .strict()
  .superRefine(datesInOrder)
  .meta({ id: 'UpdateTrmInitiative' });
export type UpdateInitiative = z.infer<typeof UpdateInitiativeSchema>;

export const PlannedApplicationListSchema = z
  .object({ items: z.array(z.object({ id: z.uuid(), name: z.string(), linkedApplication: Ref.nullable(), initiatives: z.array(z.object({ id: z.uuid(), name: z.string() })) })) })
  .meta({ id: 'TrmPlannedApplicationList' });

export const LinkPlannedApplicationSchema = z
  .object({ applicationId: z.uuid().nullable().describe('The real application, or null to unlink') })
  .strict()
  .meta({ id: 'LinkTrmPlannedApplication' });
export type LinkPlannedApplication = z.infer<typeof LinkPlannedApplicationSchema>;

// ----- Removing records that are no longer in the ServiceNow export

export const REMOVAL_BLOCKERS = ['has-sad-history', 'open-approval', 'used-by-initiative', 'has-children'] as const;
export const REMOVAL_REFUSALS = [...REMOVAL_BLOCKERS, 'not-missing', 'not-found'] as const;
const RemovalBlockerSchema = z.enum(REMOVAL_BLOCKERS);

export const MissingSummarySchema = z
  .object({
    items: z.array(z.object({ recordType: z.enum(RECORD_TYPES), count: z.number().int() })),
    total: z.number().int().describe('Flagged records of all types'),
  })
  .meta({ id: 'TrmMissingSummary' });

export const MissingQuerySchema = PageQuerySchema.extend({
  recordType: z.enum(RECORD_TYPES),
  q: z.string().trim().min(1).max(100).optional().describe('Name or number contains'),
}).strict();
export type MissingQuery = z.infer<typeof MissingQuerySchema>;

export const MissingRecordSchema = z
  .object({
    id: z.uuid(),
    recordType: z.enum(RECORD_TYPES),
    number: z.string().nullable().describe('Only applications and services have one'),
    name,
    snSysId: z.string().nullable().describe('Servers have none: they are known by name only'),
    missingSince: z.date(),
    blockers: z.array(RemovalBlockerSchema).describe('Why this record cannot be removed yet; empty when it can'),
  })
  .meta({ id: 'TrmMissingRecord' });
export const MissingPageSchema = pageOf(MissingRecordSchema).meta({ id: 'TrmMissingRecordPage' });

export const DeleteMissingSchema = z
  .object({
    recordType: z.enum(RECORD_TYPES),
    ids: z.array(z.uuid()).min(1).max(100).refine((ids) => new Set(ids).size === ids.length, 'Each record only once'),
  })
  .strict()
  .meta({ id: 'DeleteTrmMissingRecords' });
export type DeleteMissing = z.infer<typeof DeleteMissingSchema>;

export const DeleteMissingResultSchema = z
  .object({
    deleted: z.array(z.uuid()).describe('Removed, in the order sent'),
    refused: z.array(z.object({ id: z.uuid(), reason: z.enum(REMOVAL_REFUSALS) })).describe('Kept, with the reason, in the order sent'),
  })
  .meta({ id: 'TrmDeleteMissingResult' });
