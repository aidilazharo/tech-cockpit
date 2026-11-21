import type { EntityName, MikroORM } from '@mikro-orm/postgresql';
import { Portfolio } from '../../../src/modules/portfolios/portfolio.entity.js';
import type { SyncFile } from '../../../src/modules/trm/domain/sync-files.js';
import {
  TrmApplication,
  TrmApplicationPortfolio,
  TrmApplicationService,
  TrmApplicationSubdomain,
  TrmCapability,
  TrmInitiative,
  TrmInitiativeAction,
  TrmInitiativeCapability,
  TrmPlannedApplication,
  TrmProductStandard,
  TrmServer,
  TrmService,
  TrmServiceDependency,
  TrmServiceServer,
  TrmServiceSoftware,
  TrmSoftwareModel,
  TrmSyncRecord,
  TrmSyncRun,
} from '../../../src/modules/trm/trm.entities.js';

/** A ServiceNow-style sys_id (32 hex characters) from a short number. */
export const sid = (n: number) => n.toString(16).padStart(32, '0');

export const SYS = {
  capCustomer: sid(1),
  capOnboarding: sid(2),
  capIdentity: sid(3),
  capFinance: sid(4),
  capPayments: sid(5),
  stdPostgres: sid(10),
  stdOracle: sid(11),
  appCrm: sid(20),
  appBilling: sid(21),
  appHr: sid(22),
  appTwinA: sid(23),
  appTwinB: sid(24),
  svcCrmProd: sid(30),
  svcCrmDr: sid(31),
  svcBillingProd: sid(32),
  svcSales: sid(33),
  svcCrmTest: sid(34),
  modelPostgres: sid(40),
  modelOracle: sid(41),
  modelNginx: sid(42),
} as const;

const capability = (sysId: string, name: string, parent: string) => ({ sys_id: sysId, name, parent, short_description: `${name} capability`, operational_status: 'Operational' });

const application = (sysId: string, name: string, extra: Record<string, string>) => ({
  sys_id: sysId,
  number: `APM-${name}`,
  name,
  u_display_name: `${name} (display)`,
  install_status: 'In Production',
  operational_status: 'Operational',
  business_unit: 'Group IT',
  u_application_criticality_rating: '2 - High',
  sys_created_by: 'user001',
  ...extra,
});

const service = (sysId: string, name: string, extra: Record<string, string> = {}) => ({
  sys_id: sysId,
  number: `SVC-${name}`,
  name,
  operational_status: 'Operational',
  sys_class_name: 'Synthetic class',
  ...extra,
});

/** One consistent set of exports, with a few deliberate problems for the report. */
export function trmExports(): Record<SyncFile, Record<string, string>[]> {
  return {
    business_capability: [
      capability(SYS.capCustomer, 'Customer', ''),
      capability(SYS.capOnboarding, 'Onboarding', 'Customer'),
      capability(SYS.capIdentity, 'Identity check', 'Onboarding'),
      capability(SYS.capFinance, 'Finance', ''),
      capability(SYS.capPayments, 'Payments', 'Finance'),
    ],
    product_standard: [
      { sys_id: SYS.stdPostgres, u_product_standard: 'PostgreSQL 15', u_product: 'PostgreSQL', u_manufacturer: 'PGDG', u_status: 'Standard', u_standard_category: 'Database' },
      { sys_id: SYS.stdOracle, u_product_standard: 'Oracle 11g', u_product: 'Oracle Database', u_manufacturer: 'Oracle', u_status: 'Restricted', u_standard_category: 'Database' },
    ],
    business_application: [
      application(SYS.appCrm, 'CRM', {
        u_capability_category_group: 'Customer',
        u_capability_family: 'Onboarding',
        u_capability_category: 'Identity check',
        it_application_owner: 'Person Owner',
        u_application_lead: 'Person Lead',
        u_application_manager: 'Person Manager',
        u_annual_license_cost_k_usd: '136.22',
        u_annual_infra_cost_cloud_k_usd: '10',
        u_recovery_time_capability: '01:30',
      }),
      application(SYS.appBilling, 'Billing', {
        u_capability_category_group: 'Finance',
        u_capability_family: 'Payments',
        u_annual_license_cost_k_usd: '50',
        install_status: 'Implementing',
      }),
      // Fields that do not follow the tree: flagged.
      application(SYS.appHr, 'HR Portal', { u_capability_category_group: 'Finance', u_capability_family: 'Onboarding', install_status: 'Retired' }),
      // Two applications with the same name: path rows naming "Twin" cannot be matched.
      application(SYS.appTwinA, 'Twin', {}),
      application(SYS.appTwinB, 'Twin', {}),
    ],
    mapped_application_service: [
      service(SYS.svcCrmProd, 'CRM Prod', { environment: 'Production', used_for: 'Production', owned_by: 'Person Service Owner' }),
      service(SYS.svcCrmDr, 'CRM DR', { environment: 'Disaster Recovery', used_for: 'Disaster recovery' }),
      service(SYS.svcBillingProd, 'Billing Prod', { environment: 'Production', used_for: 'Production' }),
      // No servers and no software.
      service(SYS.svcCrmTest, 'CRM Test', { environment: 'Test', used_for: 'Test' }),
    ],
    business_service: [
      service(SYS.svcSales, 'Sales', { u_data_classification: 'Confidential' }),
      // The services export also carries application services; the application-service export wins.
      service(SYS.svcCrmProd, 'CRM Prod'),
    ],
    ba_as_sm: [
      {
        ba_sys_id: SYS.appCrm,
        ba_name: 'CRM',
        ba_u_annual_license_cost_k_usd: '136.22',
        app_sys_id: SYS.svcCrmProd,
        app_name: 'CRM Prod',
        rel_sys_id: sid(50),
        rel_type: 'Consumes::Consumed by',
        sw_sys_id: sid(60),
        sw_full_version: '15.4',
        sw_primary_model: 'true',
        sw_sys_created_by: 'user002',
        sm_sys_id: SYS.modelPostgres,
        sm_name: 'PostgreSQL 15',
        sm_product: 'PostgreSQL',
        sm_version: '15',
        sm_manufacturer: 'PGDG',
        sm_u_product_standard: 'PostgreSQL 15',
      },
      {
        ba_sys_id: SYS.appBilling,
        app_sys_id: SYS.svcBillingProd,
        rel_sys_id: sid(51),
        sw_sys_id: sid(61),
        sw_full_version: '11.2.0.4',
        sw_primary_model: 'false',
        sm_sys_id: SYS.modelOracle,
        sm_name: 'Oracle 11g',
        sm_version: '11g',
        sm_manufacturer: 'Oracle',
        sm_u_product_standard: 'Oracle 11g',
      },
      // A product standard name that matches no standard.
      { ba_sys_id: SYS.appCrm, app_sys_id: SYS.svcCrmDr, rel_sys_id: sid(52), sw_sys_id: sid(62), sm_sys_id: SYS.modelNginx, sm_name: 'Nginx 1.24', sm_u_product_standard: 'Nginx' },
    ],
    ba_as_bs: [
      { u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Prod', u_business_service_1: 'Sales' },
      { u_business_application_1: 'Twin', u_mapped_application_service_1: 'CRM Prod', u_business_service_1: 'Sales' },
      { u_business_application_1: 'Billing', u_mapped_application_service_1: 'Billing Prod', u_business_service_1: 'Unknown service' },
      { u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Test', u_business_service_1: 'Sales' },
    ],
    ba_as_server: [
      { u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Prod', u_server_1: 'SRV-CRM-01' },
      { u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM DR', u_server_1: 'SRV-CRM-02' },
      { u_business_application_1: 'Billing', u_mapped_application_service_1: 'Billing Prod', u_server_1: 'SRV-BIL-01' },
    ],
  };
}

/** Empties every TRM table (and portfolios) so a spec starts from a known state. */
export async function resetTrm(orm: MikroORM): Promise<void> {
  const em = orm.em.fork();
  for (const entity of [
    // The roadmap and domain placements point at applications and capabilities.
    TrmInitiativeAction,
    TrmInitiativeCapability,
    TrmInitiative,
    TrmPlannedApplication,
    TrmApplicationSubdomain,
    TrmSyncRecord,
    TrmSyncRun,
    TrmServiceSoftware,
    TrmServiceServer,
    TrmServiceDependency,
    TrmApplicationService,
    TrmApplicationPortfolio,
    TrmSoftwareModel,
    TrmService,
    TrmServer,
    TrmApplication,
    TrmProductStandard,
  ]) {
    await em.nativeDelete(entity as EntityName<object>, {});
  }
  await em.nativeUpdate(TrmCapability, {}, { parent: null });
  await em.nativeDelete(TrmCapability, {});
  await em.nativeDelete(Portfolio, {});
}
