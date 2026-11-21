import { describe, expect, it } from 'vitest';
import {
  APPLICATION_SERVICE_CLASSES,
  applicationColumns,
  capabilityColumns,
  pathToBusinessService,
  pathToServer,
  productStandardColumns,
  serviceColumns,
  serviceKind,
  splitJoinedView,
  stageJoinedView,
} from './mapping.js';

describe('mapping exported ServiceNow rows to TRM columns', () => {
  it('maps a business application, reading costs as amounts', () => {
    const columns = applicationColumns({
      number: 'APM001',
      name: 'CRM',
      u_display_name: 'CRM (display)',
      install_status: 'In Production',
      u_capability_category_group: 'Customer',
      u_capability_family: 'Onboarding',
      u_capability_category: '',
      it_application_owner: 'Person 1',
      u_annual_license_cost_k_usd: '136.22',
      u_annual_infra_cost_on_premises_k_usd: 'not a number',
      u_recovery_time_capability: '01:30',
      sys_updated_on: '15-01-2025 10:30:00',
    });
    expect(columns).toMatchObject({
      number: 'APM001',
      name: 'CRM',
      displayName: 'CRM (display)',
      installStatus: 'In Production',
      capabilityGroupName: 'Customer',
      capabilityFamilyName: 'Onboarding',
      capabilityCategoryName: null,
      itApplicationOwner: 'Person 1',
      licenceCost: '136.22',
      infraOnPremisesCost: null,
      recoveryTimeCapability: '01:30',
      snUpdatedOn: '15-01-2025 10:30:00',
      shortName: null,
    });
  });

  it('maps services, capabilities and product standards', () => {
    expect(serviceColumns({ name: 'CRM Prod', environment: 'Production', u_hosting_provider: 'null', owned_by: 'Person 2' })).toMatchObject({
      name: 'CRM Prod',
      environment: 'Production',
      hostingProvider: null,
      ownedBy: 'Person 2',
    });
    expect(capabilityColumns({ name: 'Onboarding', parent: 'Customer', short_description: 'x' })).toEqual({
      name: 'Onboarding',
      parentName: 'Customer',
      description: 'x',
      operationalStatus: null,
    });
    expect(productStandardColumns({ u_product_standard: 'PostgreSQL 15', u_status: 'Standard', u_manufacturer: 'PGDG' })).toMatchObject({
      name: 'PostgreSQL 15',
      status: 'Standard',
      manufacturer: 'PGDG',
      remarks: null,
    });
  });

  it('decides the service kind from the ServiceNow class, or from the application-service export', () => {
    expect(APPLICATION_SERVICE_CLASSES).toContain('cmdb_ci_service_auto');
    const classes = new Set(['cmdb_ci_service_auto']);
    expect(serviceKind({ sys_class_name: 'cmdb_ci_service_auto' }, false, classes)).toBe('application');
    expect(serviceKind({ sys_class_name: 'cmdb_ci_service_business' }, false, classes)).toBe('business');
    expect(serviceKind({ sys_class_name: 'Dummy Application 146' }, true, classes)).toBe('application');
  });

  it('splits a joined view row into the relationship, the software link and the software model', () => {
    const row = {
      ba_sys_id: 'ba1',
      ba_name: 'CRM',
      ba_u_total_ci_cost: 'RM0.00',
      app_sys_id: 'as1',
      app_name: 'CRM Prod',
      app_environment: 'Production',
      rel_sys_id: 'r1',
      rel_type: 'Consumes::Consumed by',
      sw_sys_id: 'sw1',
      sw_full_version: '15.4',
      sw_primary_model: 'true',
      sm_sys_id: 'sm1',
      sm_name: 'PostgreSQL',
      sm_version: '15',
      sm_u_product_standard: 'PostgreSQL 15',
    };
    expect(stageJoinedView(row)).toEqual({
      ba_sys_id: 'ba1',
      app_sys_id: 'as1',
      rel_sys_id: 'r1',
      rel_type: 'Consumes::Consumed by',
      sw_sys_id: 'sw1',
      sw_full_version: '15.4',
      sw_primary_model: 'true',
      sm_sys_id: 'sm1',
      sm_name: 'PostgreSQL',
      sm_version: '15',
      sm_u_product_standard: 'PostgreSQL 15',
    });
    expect(splitJoinedView(row)).toEqual({
      relationship: { relSysId: 'r1', applicationSysId: 'ba1', serviceSysId: 'as1' },
      softwareLink: { sysId: 'sw1', serviceSysId: 'as1', modelSysId: 'sm1', fullVersion: '15.4', primaryModel: true },
      softwareModel: {
        sysId: 'sm1',
        source: { sys_id: 'sm1', name: 'PostgreSQL', version: '15', u_product_standard: 'PostgreSQL 15' },
        columns: expect.objectContaining({ name: 'PostgreSQL', productVersion: '15', productStandardName: 'PostgreSQL 15', manufacturer: null }),
      },
    });
    expect(splitJoinedView({ ba_sys_id: 'ba1' })).toEqual({ relationship: null, softwareLink: null, softwareModel: null });
  });

  it('reads the names in the path exports', () => {
    expect(pathToBusinessService({ u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Prod', u_business_service_1: 'Sales' })).toEqual({
      applicationName: 'CRM',
      serviceName: 'CRM Prod',
      businessServiceName: 'Sales',
    });
    expect(pathToServer({ u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Prod', u_server_1: ' SRV01 ' })).toEqual({
      applicationName: 'CRM',
      serviceName: 'CRM Prod',
      serverName: 'SRV01',
    });
  });
});
