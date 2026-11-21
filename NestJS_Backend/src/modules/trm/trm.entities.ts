import { defineEntity, p } from '@mikro-orm/core';
import { baseProperties, WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { User } from '../identity/user.entity.js';
import { Portfolio } from '../portfolios/portfolio.entity.js';
import { SYNC_FILES } from './domain/sync-files.js';

export const TIME_RATINGS = ['tolerate', 'invest', 'migrate', 'eliminate'] as const;
export type TimeRating = (typeof TIME_RATINGS)[number];
export const SERVICE_KINDS = ['application', 'business'] as const;
export const APPLICATION_SERVICE_LINK_SOURCES = ['ba_as_sm', 'ba_as_bs', 'ba_as_server'] as const;
export const SYNC_RUN_STATUSES = ['receiving', 'completed', 'failed', 'abandoned'] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

/** Every ServiceNow-sourced record: its sys_id, all fields as delivered, and sync bookkeeping. */
function servicenowProperties() {
  return {
    snSysId: p.string().length(32).unique(),
    /** Every field as exported (display values). Classified by field name on read. */
    source: p.json<Record<string, unknown>>(),
    contentHash: p.string().length(64),
    /** Set by a complete sync run that no longer found the record; cleared when it returns. */
    missingSince: p.datetime().nullable(),
    lastSyncRunId: p.uuid().nullable(),
  };
}

const text = () => p.text().nullable();
const money = () => p.decimal('string').precision(15).scale(2).nullable();

export const TrmCapabilitySchema = defineEntity({
  name: 'TrmCapability',
  tableName: 'trm_capability',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    ...servicenowProperties(),
    name: text(),
    parentName: text(),
    description: text(),
    operationalStatus: text(),
    /** Resolved from parentName; null for top-level capabilities and unresolved parents. */
    parent: () => p.manyToOne(TrmCapability).nullable(),
    /** 1 = top level; null when the chain does not reach a top-level capability. */
    level: p.smallint().nullable(),
  },
});
export class TrmCapability extends TrmCapabilitySchema.class {}
TrmCapabilitySchema.setClass(TrmCapability);

export const TrmProductStandardSchema = defineEntity({
  name: 'TrmProductStandard',
  tableName: 'trm_product_standard',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    ...servicenowProperties(),
    name: text(),
    product: text(),
    manufacturer: text(),
    status: text(),
    standardCategory: text(),
    functionalCategory: text(),
    productType: text(),
    description: text(),
    cloudServiceType: text(),
    vmOnPremises: text(),
    vmCloud: text(),
    containerOnPremises: text(),
    containerCloud: text(),
    allowedOnDesktop: text(),
    aiControls: text(),
    remarks: text(),
    lastStatusDate: text(),
    addedDate: text(),
    assessmentLink: text(),
  },
});
export class TrmProductStandard extends TrmProductStandardSchema.class {}
TrmProductStandardSchema.setClass(TrmProductStandard);

export const TrmApplicationSchema = defineEntity({
  name: 'TrmApplication',
  tableName: 'trm_application',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    ...servicenowProperties(),
    number: text(),
    name: text(),
    displayName: text(),
    shortName: text(),
    description: text(),
    installStatus: text(),
    operationalStatus: text(),
    recordStatus: text(),
    installType: text(),
    groupOrLocal: text(),
    businessUnit: text(),
    ownedBusinessUnit: text(),
    servingBusinessUnits: text(),
    criticalityRating: text(),
    bcmCriticality: text(),
    rto: text(),
    rpo: text(),
    recoveryTimeCapability: text(),
    capabilityGroupName: text(),
    capabilityFamilyName: text(),
    capabilityCategoryName: text(),
    /** Personal */
    itApplicationOwner: text(),
    applicationLead: text(),
    applicationManager: text(),
    /** Financial: annual costs in thousands of USD */
    licenceCost: money(),
    internalSupportCost: money(),
    externalSupportCost: money(),
    infraOnPremisesCost: money(),
    infraCloudCost: money(),
    snUpdatedOn: text(),
    /** The lowest capability the application's fields name. */
    capability: () => p.manyToOne(TrmCapability).nullable(),
    /** The capability fields do not follow the capability tree. */
    capabilityMismatch: p.boolean().default(false),
    // TRM-only fields (never touched by the sync).
    timeRating: p.enum(TIME_RATINGS).nullable(),
    timeRationale: p.text().nullable(),
    functionalFit: p.smallint().nullable(),
    technicalFit: p.smallint().nullable(),
    plannedGoLive: p.date().nullable(),
    plannedPhaseOut: p.date().nullable(),
    plannedRetirement: p.date().nullable(),
    vendorEndOfSupport: p.date().nullable(),
  },
});
export class TrmApplication extends TrmApplicationSchema.class {}
TrmApplicationSchema.setClass(TrmApplication);

/** An application's portfolios (none, one or several), set by system admins. */
export const TrmApplicationPortfolioSchema = defineEntity({
  name: 'TrmApplicationPortfolio',
  tableName: 'trm_application_portfolio',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['application', 'portfolio'] }],
  properties: {
    ...baseProperties(),
    application: () => p.manyToOne(TrmApplication).deleteRule('cascade').index(),
    portfolio: () => p.manyToOne(Portfolio).index(),
  },
});
export class TrmApplicationPortfolio extends TrmApplicationPortfolioSchema.class {}
TrmApplicationPortfolioSchema.setClass(TrmApplicationPortfolio);

export const TrmServiceSchema = defineEntity({
  name: 'TrmService',
  tableName: 'trm_service',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    ...servicenowProperties(),
    kind: p.enum(SERVICE_KINDS).index(),
    number: text(),
    name: text(),
    displayName: text(),
    description: text(),
    operationalStatus: text(),
    environment: text(),
    usedFor: text(),
    serviceClassification: text(),
    portfolioStatus: text(),
    businessCriticality: text(),
    dataClassification: text(),
    customerPiiData: text(),
    creditCardData: text(),
    healthcareData: text(),
    priceSensitiveData: text(),
    networkFacing: text(),
    rto: text(),
    rpo: text(),
    applicationSecurityRating: text(),
    hostingProvider: text(),
    ownedBusinessUnit: text(),
    /** Personal */
    ownedBy: text(),
    snUpdatedOn: text(),
  },
});
export class TrmService extends TrmServiceSchema.class {}
TrmServiceSchema.setClass(TrmService);

export const TrmServerSchema = defineEntity({
  name: 'TrmServer',
  tableName: 'trm_server',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    /** Servers are known by name only for now (from the application → service → server export). */
    name: p.string().length(255).unique(),
    missingSince: p.datetime().nullable(),
    lastSyncRunId: p.uuid().nullable(),
  },
});
export class TrmServer extends TrmServerSchema.class {}
TrmServerSchema.setClass(TrmServer);

export const TrmSoftwareModelSchema = defineEntity({
  name: 'TrmSoftwareModel',
  tableName: 'trm_software_model',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    ...servicenowProperties(),
    name: text(),
    product: text(),
    /** The product's version (`version` is the row-lock column on every table). */
    productVersion: text(),
    manufacturer: text(),
    productType: text(),
    modelCategory: text(),
    productStandardName: text(),
    productStandard: () => p.manyToOne(TrmProductStandard).nullable(),
  },
});
export class TrmSoftwareModel extends TrmSoftwareModelSchema.class {}
TrmSoftwareModelSchema.setClass(TrmSoftwareModel);

/** Application → application service, rebuilt from each export that states it. */
export const TrmApplicationServiceSchema = defineEntity({
  name: 'TrmApplicationService',
  tableName: 'trm_application_service',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['application', 'service', 'linkSource'] }],
  properties: {
    ...baseProperties(),
    application: () => p.manyToOne(TrmApplication).deleteRule('cascade').index(),
    service: () => p.manyToOne(TrmService).deleteRule('cascade').index(),
    linkSource: p.enum(APPLICATION_SERVICE_LINK_SOURCES),
  },
});
export class TrmApplicationService extends TrmApplicationServiceSchema.class {}
TrmApplicationServiceSchema.setClass(TrmApplicationService);

/** Application service → business service (from ba_as_bs). */
export const TrmServiceDependencySchema = defineEntity({
  name: 'TrmServiceDependency',
  tableName: 'trm_service_dependency',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['service', 'businessService'] }],
  properties: {
    ...baseProperties(),
    service: () => p.manyToOne(TrmService).deleteRule('cascade').index(),
    businessService: () => p.manyToOne(TrmService).deleteRule('cascade').index(),
  },
});
export class TrmServiceDependency extends TrmServiceDependencySchema.class {}
TrmServiceDependencySchema.setClass(TrmServiceDependency);

/** Application service → server (from ba_as_server). */
export const TrmServiceServerSchema = defineEntity({
  name: 'TrmServiceServer',
  tableName: 'trm_service_server',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['service', 'server'] }],
  properties: {
    ...baseProperties(),
    service: () => p.manyToOne(TrmService).deleteRule('cascade').index(),
    server: () => p.manyToOne(TrmServer).deleteRule('cascade').index(),
  },
});
export class TrmServiceServer extends TrmServiceServerSchema.class {}
TrmServiceServerSchema.setClass(TrmServiceServer);

/** Application service → software model (from ba_as_sm). */
export const TrmServiceSoftwareSchema = defineEntity({
  name: 'TrmServiceSoftware',
  tableName: 'trm_service_software',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    snSysId: p.string().length(32).unique(),
    service: () => p.manyToOne(TrmService).deleteRule('cascade').index(),
    softwareModel: () => p.manyToOne(TrmSoftwareModel).deleteRule('cascade').index(),
    fullVersion: text(),
    primaryModel: p.boolean().default(false),
  },
});
export class TrmServiceSoftware extends TrmServiceSoftwareSchema.class {}
TrmServiceSoftwareSchema.setClass(TrmServiceSoftware);

/** One load of the Node app's exports. */
export const TrmSyncRunSchema = defineEntity({
  name: 'TrmSyncRun',
  tableName: 'trm_sync_run',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    startedBy: () => p.manyToOne(User).index(),
    status: p.enum(SYNC_RUN_STATUSES).index(),
    /** Report the changes without applying them. */
    dryRun: p.boolean().default(false),
    /** Rows received per export. */
    received: p.json<Record<string, number>>(),
    completedAt: p.datetime().nullable(),
    report: p.json<Record<string, unknown>>().nullable(),
    error: p.text().nullable(),
  },
});
export class TrmSyncRun extends TrmSyncRunSchema.class {}
TrmSyncRunSchema.setClass(TrmSyncRun);

/** Rows received for a run, held until the run completes (then removed). */
export const TrmSyncRecordSchema = defineEntity({
  name: 'TrmSyncRecord',
  tableName: 'trm_sync_record',
  schema: WILDCARD_SCHEMA,
  indexes: [{ properties: ['run', 'file', 'position'] }],
  properties: {
    id: p.bigint().primary().autoincrement(),
    run: () => p.manyToOne(TrmSyncRun).deleteRule('cascade'),
    file: p.enum(SYNC_FILES),
    /** 1-based row number in the export */
    position: p.integer(),
    payload: p.json<Record<string, unknown>>(),
  },
});
export class TrmSyncRecord extends TrmSyncRecordSchema.class {}
TrmSyncRecordSchema.setClass(TrmSyncRecord);

// ----- Part 3: domains, technology layers, EA roadmap

/** A business domain (configurable in TechCockpit; ServiceNow has none). Applications sit in its sub-domains. */
export const TrmDomainSchema = defineEntity({
  name: 'TrmDomain',
  tableName: 'trm_domain',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    name: p.string().length(200).unique(),
    active: p.boolean().default(true),
  },
});
export class TrmDomain extends TrmDomainSchema.class {}
TrmDomainSchema.setClass(TrmDomain);

export const TrmSubdomainSchema = defineEntity({
  name: 'TrmSubdomain',
  tableName: 'trm_subdomain',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['domain', 'name'] }],
  properties: {
    ...baseProperties(),
    domain: () => p.manyToOne(TrmDomain).index(),
    name: p.string().length(200),
    active: p.boolean().default(true),
  },
});
export class TrmSubdomain extends TrmSubdomainSchema.class {}
TrmSubdomainSchema.setClass(TrmSubdomain);

/** An application in a sub-domain (several allowed). */
export const TrmApplicationSubdomainSchema = defineEntity({
  name: 'TrmApplicationSubdomain',
  tableName: 'trm_application_subdomain',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['application', 'subdomain'] }],
  properties: {
    ...baseProperties(),
    application: () => p.manyToOne(TrmApplication).deleteRule('cascade').index(),
    subdomain: () => p.manyToOne(TrmSubdomain).index(),
  },
});
export class TrmApplicationSubdomain extends TrmApplicationSubdomainSchema.class {}
TrmApplicationSubdomainSchema.setClass(TrmApplicationSubdomain);

/** A technology layer (seeded from the research; editable). */
export const TrmLayerSchema = defineEntity({
  name: 'TrmLayer',
  tableName: 'trm_layer',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    name: p.string().length(200).unique(),
    position: p.integer(),
    active: p.boolean().default(true),
  },
});
export class TrmLayer extends TrmLayerSchema.class {}
TrmLayerSchema.setClass(TrmLayer);

/** A product-standard category (u_standard_category) placed in a technology layer. */
export const TrmLayerMappingSchema = defineEntity({
  name: 'TrmLayerMapping',
  tableName: 'trm_layer_mapping',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    standardCategory: p.string().length(500).unique(),
    layer: () => p.manyToOne(TrmLayer).index(),
  },
});
export class TrmLayerMapping extends TrmLayerMappingSchema.class {}
TrmLayerMappingSchema.setClass(TrmLayerMapping);

export const INITIATIVE_STATUSES = ['proposed', 'approved', 'in_progress', 'completed', 'cancelled'] as const;
export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];
export const ROADMAP_ACTIONS = ['introduce', 'enhance', 'replace', 'retire'] as const;
export type RoadmapAction = (typeof ROADMAP_ACTIONS)[number];

/** An application named on the roadmap before it exists in ServiceNow; linked to the real one later. */
export const TrmPlannedApplicationSchema = defineEntity({
  name: 'TrmPlannedApplication',
  tableName: 'trm_planned_application',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    name: p.string().length(300).unique(),
    linkedApplication: () => p.manyToOne(TrmApplication).nullable(),
  },
});
export class TrmPlannedApplication extends TrmPlannedApplicationSchema.class {}
TrmPlannedApplicationSchema.setClass(TrmPlannedApplication);

/** An EA roadmap initiative with exact dates. */
export const TrmInitiativeSchema = defineEntity({
  name: 'TrmInitiative',
  tableName: 'trm_initiative',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    name: p.string().length(300),
    description: p.text().nullable(),
    rationale: p.text().nullable(),
    startDate: p.date(),
    endDate: p.date(),
    status: p.enum(INITIATIVE_STATUSES).index(),
    /** Personal */
    owner: () => p.manyToOne(User).nullable(),
    /** Financial, MYR */
    estimatedCost: p.decimal('string').precision(15).scale(2).nullable(),
  },
});
export class TrmInitiative extends TrmInitiativeSchema.class {}
TrmInitiativeSchema.setClass(TrmInitiative);

export const TrmInitiativeCapabilitySchema = defineEntity({
  name: 'TrmInitiativeCapability',
  tableName: 'trm_initiative_capability',
  schema: WILDCARD_SCHEMA,
  uniques: [{ properties: ['initiative', 'capability'] }],
  properties: {
    ...baseProperties(),
    initiative: () => p.manyToOne(TrmInitiative).deleteRule('cascade').index(),
    capability: () => p.manyToOne(TrmCapability).index(),
  },
});
export class TrmInitiativeCapability extends TrmInitiativeCapabilitySchema.class {}
TrmInitiativeCapabilitySchema.setClass(TrmInitiativeCapability);

/** What an initiative does to one application (existing or planned); replace also names the replacement. */
export const TrmInitiativeActionSchema = defineEntity({
  name: 'TrmInitiativeAction',
  tableName: 'trm_initiative_action',
  schema: WILDCARD_SCHEMA,
  properties: {
    ...baseProperties(),
    initiative: () => p.manyToOne(TrmInitiative).deleteRule('cascade').index(),
    position: p.integer(),
    action: p.enum(ROADMAP_ACTIONS),
    application: () => p.manyToOne(TrmApplication).nullable().index(),
    plannedApplication: () => p.manyToOne(TrmPlannedApplication).nullable().index(),
    replacementApplication: () => p.manyToOne(TrmApplication).nullable(),
    replacementPlanned: () => p.manyToOne(TrmPlannedApplication).nullable(),
  },
});
export class TrmInitiativeAction extends TrmInitiativeActionSchema.class {}
TrmInitiativeActionSchema.setClass(TrmInitiativeAction);
