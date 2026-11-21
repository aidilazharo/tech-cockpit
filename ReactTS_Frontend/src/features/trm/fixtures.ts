import type { Application, ApplicationSummary, CapabilityItem, Domain, Facets, Initiative, LandscapeApp, Layers, MissingRecord, MissingSummary, Portfolio, RecordType, Service, SyncRun, TechnologyView } from './schemas'

export const APP_CRM = '80000000-0000-4000-8000-000000000001'
export const APP_BILLING = '80000000-0000-4000-8000-000000000002'
export const SVC_PROD = '81000000-0000-4000-8000-000000000001'
export const SVC_SALES = '81000000-0000-4000-8000-000000000002'
export const CAP_CUSTOMER = '82000000-0000-4000-8000-000000000001'
export const CAP_ONBOARDING = '82000000-0000-4000-8000-000000000002'
export const CAP_IDENTITY = '82000000-0000-4000-8000-000000000003'
export const MODEL_PG = '83000000-0000-4000-8000-000000000001'
export const STD_PG = '84000000-0000-4000-8000-000000000001'
export const SERVER_1 = '85000000-0000-4000-8000-000000000001'
export const PORTFOLIO_RETAIL = '86000000-0000-4000-8000-000000000001'
export const PORTFOLIO_GROUP = '86000000-0000-4000-8000-000000000002'
export const RUN_ID = '87000000-0000-4000-8000-000000000001'
export const ME = '00000000-0000-4000-8000-000000000001'

export const page = <T>(items: T[], total = items.length) => ({ items, page: 1, pageSize: 25, total })

export function applicationSummary(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: APP_CRM,
    number: 'APM-1',
    name: 'CRM',
    installStatus: 'In Production',
    criticalityRating: '2 - High',
    businessUnit: 'Group IT',
    timeRating: 'invest',
    capability: { id: CAP_IDENTITY, name: 'Identity check', level: 3 },
    capabilityMismatch: false,
    portfolios: [{ id: PORTFOLIO_RETAIL, name: 'Retail' }],
    missingSince: null,
    ...overrides,
  }
}

export function application(overrides: Partial<Application> = {}): Application {
  return {
    id: APP_CRM,
    version: 3,
    snSysId: '00000000000000000000000000000014',
    number: 'APM-1',
    name: 'CRM',
    displayName: 'CRM (display)',
    shortName: null,
    description: 'Customer relationship management',
    installStatus: 'In Production',
    operationalStatus: 'Operational',
    recordStatus: 'BA-Approved',
    installType: 'On Premise',
    groupOrLocal: 'Locally Managed',
    businessUnit: 'Group IT',
    ownedBusinessUnit: null,
    servingBusinessUnits: 'Retail',
    criticalityRating: '2 - High',
    bcmCriticality: 'Tier 1',
    rto: '4 hours',
    rpo: '1 hour',
    recoveryTimeCapability: '01:30',
    snUpdatedOn: '15-01-2025 10:30:00',
    people: { itApplicationOwner: 'Person Owner', applicationLead: 'Person Lead', applicationManager: null },
    costs: { licence: '136.22', internalSupport: null, externalSupport: '62.50', infraOnPremises: null, infraCloud: '10.00' },
    capability: {
      path: [
        { id: CAP_CUSTOMER, name: 'Customer' },
        { id: CAP_ONBOARDING, name: 'Onboarding' },
        { id: CAP_IDENTITY, name: 'Identity check' },
      ],
      mismatch: false,
      fields: { group: 'Customer', family: 'Onboarding', category: 'Identity check' },
    },
    portfolios: [{ id: PORTFOLIO_RETAIL, name: 'Retail' }],
    subdomains: [],
    trm: {
      timeRating: 'invest',
      timeRationale: 'Strategic platform',
      functionalFit: 4,
      technicalFit: 2,
      plannedGoLive: null,
      plannedPhaseOut: null,
      plannedRetirement: '2030-12-31',
      vendorEndOfSupport: null,
    },
    services: [
      {
        id: SVC_PROD,
        name: 'CRM Prod',
        kind: 'application',
        environment: 'Production',
        usedFor: 'Production',
        operationalStatus: 'Operational',
        missingSince: null,
        businessServices: [{ id: SVC_SALES, name: 'Sales' }],
        servers: [{ id: SERVER_1, name: 'SRV-CRM-01' }],
        software: [{ id: MODEL_PG, name: 'PostgreSQL 15', productVersion: '15', fullVersion: '15.4', primaryModel: true, productStandard: { id: STD_PG, name: 'PostgreSQL 15', status: 'Standard' } }],
      },
    ],
    missingSince: null,
    restricted: [],
    canEdit: true,
    canSetPortfolios: false,
    canSetDomains: false,
    source: { name: 'CRM', it_application_owner: 'Person Owner', u_application_manager: null, u_annual_license_cost_k_usd: '136.22', u_comment: '' },
    ...overrides,
  }
}

export const facets: Facets = {
  installStatuses: ['In Production', 'Retired'],
  criticalityRatings: ['1 - Critical', '2 - High'],
  businessUnits: ['Group IT'],
  environments: ['Production', 'Test'],
  productStandardStatuses: ['Restricted', 'Standard'],
}

export function capability(overrides: Partial<CapabilityItem>): CapabilityItem {
  return { id: CAP_CUSTOMER, name: 'Customer', parentId: null, level: 1, description: null, applicationCount: 0, missingSince: null, ...overrides }
}

export const capabilities: CapabilityItem[] = [
  capability({}),
  capability({ id: CAP_ONBOARDING, name: 'Onboarding', parentId: CAP_CUSTOMER, level: 2, applicationCount: 1 }),
  capability({ id: CAP_IDENTITY, name: 'Identity check', parentId: CAP_ONBOARDING, level: 3, applicationCount: 2 }),
]

export const portfolios: Portfolio[] = [
  { id: PORTFOLIO_GROUP, name: 'Group', active: true, version: 1 },
  { id: PORTFOLIO_RETAIL, name: 'Retail', active: true, version: 2 },
  { id: '86000000-0000-4000-8000-000000000003', name: 'Old', active: false, version: 4 },
]

export function service(overrides: Partial<Service> = {}): Service {
  return {
    id: SVC_PROD,
    snSysId: '0000000000000000000000000000001e',
    kind: 'application',
    number: 'SVC-1',
    name: 'CRM Prod',
    displayName: null,
    description: null,
    operationalStatus: 'Operational',
    environment: 'Production',
    usedFor: 'Production',
    serviceClassification: 'Application Service',
    portfolioStatus: null,
    businessCriticality: '1 - most critical',
    dataClassification: 'Confidential',
    customerPiiData: 'Yes',
    creditCardData: 'No',
    healthcareData: 'No',
    priceSensitiveData: 'No',
    networkFacing: 'Internal',
    rto: null,
    rpo: null,
    applicationSecurityRating: null,
    hostingProvider: null,
    ownedBusinessUnit: null,
    ownedBy: 'Person Service Owner',
    snUpdatedOn: null,
    applications: [{ id: APP_CRM, name: 'CRM' }],
    businessServices: [{ id: SVC_SALES, name: 'Sales' }],
    applicationServices: [],
    servers: [{ id: SERVER_1, name: 'SRV-CRM-01' }],
    software: application().services[0].software,
    missingSince: null,
    restricted: [],
    source: { name: 'CRM Prod', owned_by: 'Person Service Owner' },
    ...overrides,
  }
}

export function syncRun(overrides: Partial<SyncRun> = {}): SyncRun {
  return {
    id: RUN_ID,
    status: 'completed',
    dryRun: false,
    startedBy: { id: ME, name: 'Ada Admin' },
    createdAt: '2026-10-22T02:00:00.000Z',
    completedAt: '2026-10-22T02:01:00.000Z',
    received: { business_application: 20, ba_as_bs: 20 },
    report: {
      filesIncluded: ['business_application', 'ba_as_bs'],
      records: [
        { recordType: 'applications', refreshed: true, received: 20, inserted: 2, updated: 3, unchanged: 15, nowMissing: 1, returned: 0 },
        { recordType: 'servers', refreshed: false, received: 0, inserted: 0, updated: 0, unchanged: 0, nowMissing: 0, returned: 0 },
      ],
      links: [{ linkType: 'application-service', source: 'ba_as_bs', count: 12 }],
      capabilityMismatches: 4,
      capabilityIssues: [{ name: 'Orphan', problem: 'parent-not-found' }],
      unmatched: [{ file: 'ba_as_bs', field: 'u_business_service_1', name: 'Unknown service', problem: 'not-found', rows: 2 }],
      skipped: [{ file: 'business_application', row: 7, reason: 'missing sys_id' }],
      truncated: false,
    },
    error: null,
    ...overrides,
  }
}

// ----- Part 3

export const DOMAIN_CUSTOMER = '88000000-0000-4000-8000-000000000001'
export const SUB_SALES = '88100000-0000-4000-8000-000000000001'
export const SUB_SERVICE = '88100000-0000-4000-8000-000000000002'
export const LAYER_DATA = '89000000-0000-4000-8000-000000000001'
export const LAYER_SECURITY = '89000000-0000-4000-8000-000000000002'
export const INITIATIVE_ID = '8a000000-0000-4000-8000-000000000001'
export const PLANNED_ID = '8b000000-0000-4000-8000-000000000001'

export function landscapeApp(overrides: Partial<LandscapeApp> = {}): LandscapeApp {
  return {
    id: APP_CRM,
    name: 'CRM',
    number: 'APM-1',
    installStatus: 'In Production',
    criticalityRating: '2 - High',
    timeRating: 'invest',
    functionalFit: 4,
    technicalFit: 2,
    capabilityId: CAP_IDENTITY,
    capabilityMismatch: false,
    subdomainIds: [SUB_SALES],
    plannedGoLive: '2027-01-01',
    plannedPhaseOut: '2029-06-30',
    plannedRetirement: '2030-12-31',
    vendorEndOfSupport: null,
    missingSince: null,
    ...overrides,
  }
}

export const domains: Domain[] = [
  {
    id: DOMAIN_CUSTOMER,
    name: 'Customer',
    active: true,
    version: 1,
    subdomains: [
      { id: SUB_SALES, name: 'Sales', active: true, version: 1, applicationCount: 1 },
      { id: SUB_SERVICE, name: 'Service', active: false, version: 2, applicationCount: 0 },
    ],
  },
]

export const layers: Layers = {
  layers: [
    { id: LAYER_DATA, name: 'Data & Analytics', position: 1, active: true, version: 1 },
    { id: LAYER_SECURITY, name: 'Security & Identity', position: 2, active: true, version: 3 },
  ],
  mappings: [{ standardCategory: 'Database', layerId: LAYER_DATA }],
  unmappedCategories: ['Identity'],
}

export const technology: TechnologyView = {
  layers: layers.layers.map(({ id, name, position }) => ({ id, name, position })),
  standards: [
    { id: STD_PG, name: 'PostgreSQL 15', status: 'Standard', standardCategory: 'Database', layerId: LAYER_DATA, modelCount: 1, applicationCount: 2, missingSince: null },
    { id: '84000000-0000-4000-8000-000000000009', name: 'Okta', status: 'Restricted', standardCategory: 'Identity', layerId: null, modelCount: 0, applicationCount: 0, missingSince: null },
  ],
}

export function initiative(overrides: Partial<Initiative> = {}): Initiative {
  return {
    id: INITIATIVE_ID,
    version: 2,
    name: 'Modernise CRM',
    description: 'Move customer management to a new platform',
    rationale: 'Faster onboarding',
    startDate: '2027-01-01',
    endDate: '2028-06-30',
    status: 'approved',
    owner: { id: ME, name: 'Ada Admin' },
    estimatedCost: '1500000.00',
    capabilities: [{ id: CAP_ONBOARDING, name: 'Onboarding' }],
    actions: [
      { id: '8c000000-0000-4000-8000-000000000001', action: 'introduce', application: null, plannedApplication: { id: PLANNED_ID, name: 'New CRM', linkedApplication: { id: APP_CRM, name: 'CRM' } }, replacementApplication: null, replacementPlanned: null },
      { id: '8c000000-0000-4000-8000-000000000002', action: 'replace', application: { id: APP_BILLING, name: 'Billing' }, plannedApplication: null, replacementApplication: null, replacementPlanned: { id: '8b000000-0000-4000-8000-000000000002', name: 'New Billing', linkedApplication: null } },
      { id: '8c000000-0000-4000-8000-000000000003', action: 'retire', application: { id: '80000000-0000-4000-8000-000000000003', name: 'HR Portal' }, plannedApplication: null, replacementApplication: null, replacementPlanned: null },
    ],
    restricted: [],
    canEdit: true,
    ...overrides,
  }
}

export const MISSING_CRM = '88000000-0000-4000-8000-000000000001'
export const MISSING_BILLING = '88000000-0000-4000-8000-000000000002'
export const MISSING_HR = '88000000-0000-4000-8000-000000000003'

export function missingRecord(overrides: Partial<MissingRecord> = {}): MissingRecord {
  return {
    id: MISSING_CRM,
    recordType: 'applications',
    number: 'APM-10',
    name: 'Legacy CRM',
    snSysId: 'sys-crm',
    missingSince: '2026-09-30T02:00:00.000Z',
    blockers: [],
    ...overrides,
  }
}

/** Counts of flagged records per type (types not named have none). */
export function missingSummary(counts: Partial<Record<RecordType, number>> = {}): MissingSummary {
  const types: RecordType[] = ['applications', 'services', 'capabilities', 'productStandards', 'softwareModels', 'servers']
  const items = types.map((recordType) => ({ recordType, count: counts[recordType] ?? 0 }))
  return { items, total: items.reduce((sum, item) => sum + item.count, 0) }
}
