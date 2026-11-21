import { decimal, isTrue, type SourceRecord, text } from './values.js';

type ColumnMap = Readonly<Record<string, string>>;
export type Columns<M extends ColumnMap> = { [K in keyof M]: string | null };

function columns<M extends ColumnMap>(row: SourceRecord, map: M, read: (value: unknown) => string | null = text): Columns<M> {
  return Object.fromEntries(Object.entries(map).map(([column, field]) => [column, read(row[field])])) as Columns<M>;
}

// Key fields per record type (column → ServiceNow field). Every other field is kept in `source`.

const APPLICATION_TEXT = {
  number: 'number',
  name: 'name',
  displayName: 'u_display_name',
  shortName: 'u_short_name',
  description: 'short_description',
  installStatus: 'install_status',
  operationalStatus: 'operational_status',
  recordStatus: 'u_ba_record_status',
  installType: 'install_type',
  groupOrLocal: 'u_group_or_local',
  businessUnit: 'business_unit',
  ownedBusinessUnit: 'u_owned_business_unit',
  servingBusinessUnits: 'u_serving_business_units',
  criticalityRating: 'u_application_criticality_rating',
  bcmCriticality: 'u_application_bcm_criticality',
  rto: 'u_business_application_rto',
  rpo: 'u_business_application_rpo',
  recoveryTimeCapability: 'u_recovery_time_capability',
  capabilityGroupName: 'u_capability_category_group',
  capabilityFamilyName: 'u_capability_family',
  capabilityCategoryName: 'u_capability_category',
  itApplicationOwner: 'it_application_owner',
  applicationLead: 'u_application_lead',
  applicationManager: 'u_application_manager',
  snUpdatedOn: 'sys_updated_on',
} as const;

/** Annual costs in thousands of USD (financial). */
const APPLICATION_COSTS = {
  licenceCost: 'u_annual_license_cost_k_usd',
  internalSupportCost: 'u_annual_internal_support_cost_k_usd',
  externalSupportCost: 'u_annual_external_support_cost_k_usd',
  infraOnPremisesCost: 'u_annual_infra_cost_on_premises_k_usd',
  infraCloudCost: 'u_annual_infra_cost_cloud_k_usd',
} as const;

const SERVICE_TEXT = {
  number: 'number',
  name: 'name',
  displayName: 'u_display_name',
  description: 'short_description',
  operationalStatus: 'operational_status',
  environment: 'environment',
  usedFor: 'used_for',
  serviceClassification: 'service_classification',
  portfolioStatus: 'portfolio_status',
  businessCriticality: 'busines_criticality', // spelt this way in ServiceNow
  dataClassification: 'u_data_classification',
  customerPiiData: 'u_customer_pii_data',
  creditCardData: 'u_credit_card_data',
  healthcareData: 'u_healthcare_data',
  priceSensitiveData: 'u_price_sensitive_data',
  networkFacing: 'u_network_facing',
  rto: 'u_recovery_time_objective',
  rpo: 'u_recovery_point_objective',
  applicationSecurityRating: 'u_application_security_rating',
  hostingProvider: 'u_hosting_provider',
  ownedBusinessUnit: 'u_owned_business_unit',
  ownedBy: 'owned_by',
  snUpdatedOn: 'sys_updated_on',
} as const;

const CAPABILITY_TEXT = {
  name: 'name',
  parentName: 'parent',
  description: 'short_description',
  operationalStatus: 'operational_status',
} as const;

const PRODUCT_STANDARD_TEXT = {
  name: 'u_product_standard',
  product: 'u_product',
  manufacturer: 'u_manufacturer',
  status: 'u_status',
  standardCategory: 'u_standard_category',
  functionalCategory: 'u_functional_category',
  productType: 'u_product_type',
  description: 'u_product_description',
  cloudServiceType: 'u_cloud_service_saas_paas_native',
  vmOnPremises: 'u_vm_prem',
  vmCloud: 'u_vm_cloud',
  containerOnPremises: 'u_containerized_prem',
  containerCloud: 'u_containerized_cloud',
  allowedOnDesktop: 'u_allowed_on_desktop',
  aiControls: 'u_ai_features_approved_functions_and_control_requirements',
  remarks: 'u_remarks',
  lastStatusDate: 'u_last_status',
  addedDate: 'u_added_date',
  assessmentLink: 'u_cloud_service_link_to_cloud_service_assessment_artefacts',
} as const;

const SOFTWARE_MODEL_TEXT = {
  name: 'name',
  product: 'product',
  productVersion: 'version',
  manufacturer: 'manufacturer',
  productType: 'sw_product_type',
  modelCategory: 'u_product_model_category',
  productStandardName: 'u_product_standard',
} as const;

export type ApplicationColumns = Columns<typeof APPLICATION_TEXT> & Columns<typeof APPLICATION_COSTS>;
export type ServiceColumns = Columns<typeof SERVICE_TEXT>;
export type CapabilityColumns = Columns<typeof CAPABILITY_TEXT>;
export type ProductStandardColumns = Columns<typeof PRODUCT_STANDARD_TEXT>;
export type SoftwareModelColumns = Columns<typeof SOFTWARE_MODEL_TEXT>;

export const applicationColumns = (row: SourceRecord): ApplicationColumns => ({
  ...columns(row, APPLICATION_TEXT),
  ...columns(row, APPLICATION_COSTS, decimal),
});
export const serviceColumns = (row: SourceRecord): ServiceColumns => columns(row, SERVICE_TEXT);
export const capabilityColumns = (row: SourceRecord): CapabilityColumns => columns(row, CAPABILITY_TEXT);
export const productStandardColumns = (row: SourceRecord): ProductStandardColumns => columns(row, PRODUCT_STANDARD_TEXT);

/** Standard ServiceNow application-service classes (override with TRM_APPLICATION_SERVICE_CLASSES). */
export const APPLICATION_SERVICE_CLASSES = [
  'cmdb_ci_service_auto',
  'cmdb_ci_service_discovered',
  'cmdb_ci_service_by_tags',
  'cmdb_ci_query_based_service',
  'cmdb_ci_service_calculated',
] as const;

export type ServiceKind = 'application' | 'business';

/**
 * The services export comes from the parent services table, so it also holds application
 * services. A record is an application service when its class says so, or when it also
 * appears in the application-service export.
 */
export function serviceKind(row: SourceRecord, inApplicationServiceExport: boolean, applicationClasses: ReadonlySet<string>): ServiceKind {
  const className = text(row.sys_class_name);
  return inApplicationServiceExport || (className !== null && applicationClasses.has(className)) ? 'application' : 'business';
}

// ----- Joined view (ba_as_sm): application + relationship + application service + software link + software model

const VIEW_PREFIXES = ['rel_', 'sw_', 'sm_'];

/** Keeps only what the sync needs from a view row (application and service fields arrive in their own exports). */
export function stageJoinedView(row: SourceRecord): SourceRecord {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key === 'ba_sys_id' || key === 'app_sys_id' || VIEW_PREFIXES.some((prefix) => key.startsWith(prefix))),
  );
}

export interface JoinedViewParts {
  relationship: { relSysId: string | null; applicationSysId: string; serviceSysId: string } | null;
  softwareLink: { sysId: string; serviceSysId: string; modelSysId: string; fullVersion: string | null; primaryModel: boolean } | null;
  softwareModel: { sysId: string; source: SourceRecord; columns: SoftwareModelColumns } | null;
}

export function splitJoinedView(row: SourceRecord): JoinedViewParts {
  const applicationSysId = text(row.ba_sys_id);
  const serviceSysId = text(row.app_sys_id);
  const linkSysId = text(row.sw_sys_id);
  const modelSysId = text(row.sm_sys_id);
  const modelSource = Object.fromEntries(Object.entries(row).filter(([key]) => key.startsWith('sm_')).map(([key, value]) => [key.slice(3), value]));
  return {
    relationship: applicationSysId && serviceSysId ? { relSysId: text(row.rel_sys_id), applicationSysId, serviceSysId } : null,
    softwareLink:
      linkSysId && serviceSysId && modelSysId
        ? { sysId: linkSysId, serviceSysId, modelSysId, fullVersion: text(row.sw_full_version), primaryModel: isTrue(row.sw_primary_model) }
        : null,
    softwareModel: modelSysId ? { sysId: modelSysId, source: modelSource, columns: columns(modelSource, SOFTWARE_MODEL_TEXT) } : null,
  };
}

// ----- Path exports, matched by name

export function pathToBusinessService(row: SourceRecord) {
  return {
    applicationName: text(row.u_business_application_1),
    serviceName: text(row.u_mapped_application_service_1),
    businessServiceName: text(row.u_business_service_1),
  };
}

export function pathToServer(row: SourceRecord) {
  return {
    applicationName: text(row.u_business_application_1),
    serviceName: text(row.u_mapped_application_service_1),
    serverName: text(row.u_server_1),
  };
}
