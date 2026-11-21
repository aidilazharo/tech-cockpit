import { describe, expect, it } from 'vitest';
import { type PlanInput, planSync } from './sync-plan.js';
import { contentHash } from './values.js';

const CLASSES = new Set(['cmdb_ci_service_auto']);
const empty = (): PlanInput['existing'] => ({ applications: [], services: [], capabilities: [], productStandards: [], softwareModels: [], servers: [] });
const plan = (staged: PlanInput['staged'], existing = empty()) => planSync({ staged, existing, applicationServiceClasses: CLASSES });

const app = (sysId: string, name: string, extra: Record<string, unknown> = {}) => ({ sys_id: sysId, name, ...extra });
const svc = (sysId: string, name: string, extra: Record<string, unknown> = {}) => ({ sys_id: sysId, name, ...extra });

describe('sync plan: records', () => {
  it('inserts new records, updates changed ones and leaves unchanged ones alone', () => {
    const existing = empty();
    existing.applications = [
      { sysId: 'a1', hash: contentHash(app('a1', 'CRM')), missingSince: null, name: 'CRM', capabilityFields: { group: null, family: null, category: null } },
      { sysId: 'a2', hash: 'old', missingSince: null, name: 'Billing', capabilityFields: { group: null, family: null, category: null } },
    ];
    const result = plan({ business_application: [app('a1', 'CRM'), app('a2', 'Billing v2'), app('a3', 'HR')] }, existing);
    expect(result.applications.upserts.map((u) => [u.sysId, u.change])).toEqual([
      ['a1', 'unchanged'],
      ['a2', 'update'],
      ['a3', 'insert'],
    ]);
    expect(result.applications.upserts[1].columns.name).toBe('Billing v2');
    expect(result.applications.upserts[1].source).toEqual(app('a2', 'Billing v2'));
  });

  it('flags records missing from a complete export and clears the flag when they come back', () => {
    const existing = empty();
    const fields = { group: null, family: null, category: null };
    existing.applications = [
      { sysId: 'gone', hash: 'h', missingSince: null, name: 'Old', capabilityFields: fields },
      { sysId: 'still-gone', hash: 'h', missingSince: new Date('2026-01-01'), name: 'Older', capabilityFields: fields },
      { sysId: 'back', hash: 'h', missingSince: new Date('2026-01-01'), name: 'Back', capabilityFields: fields },
    ];
    const result = plan({ business_application: [app('back', 'Back')] }, existing);
    expect(result.applications.refreshed).toBe(true);
    expect(result.applications.nowMissing).toEqual(['gone']);
    expect(result.applications.returned).toEqual(['back']);
  });

  it('touches nothing for record types whose export was not included', () => {
    const existing = empty();
    existing.applications = [{ sysId: 'a1', hash: 'h', missingSince: null, name: 'CRM', capabilityFields: { group: null, family: null, category: null } }];
    const result = plan({ product_standard: [] }, existing);
    expect(result.applications).toEqual({ upserts: [], refreshed: false, nowMissing: [], returned: [] });
    expect(result.productStandards.refreshed).toBe(true);
    expect(result.filesIncluded).toEqual(['product_standard']);
  });

  it('skips rows without a sys_id and keeps the last of duplicate rows', () => {
    const result = plan({ business_application: [app('a1', 'First'), { name: 'No id' }, app('a1', 'Second')] });
    expect(result.applications.upserts).toHaveLength(1);
    expect(result.applications.upserts[0].columns.name).toBe('Second');
    expect(result.skipped).toEqual([
      { file: 'business_application', row: 2, reason: 'missing sys_id' },
      { file: 'business_application', row: 1, reason: 'duplicate sys_id (a later row wins)' },
    ]);
  });

  it('merges the two service exports: one record per sys_id, typed by class or by the application-service export', () => {
    const result = plan({
      business_service: [svc('s1', 'Sales'), svc('s2', 'CRM Prod', { sys_class_name: 'x' }), svc('s3', 'Auto', { sys_class_name: 'cmdb_ci_service_auto' })],
      mapped_application_service: [svc('s2', 'CRM Prod', { environment: 'Production' })],
    });
    expect(result.services.upserts.map((u) => [u.sysId, u.columns.kind, u.columns.environment])).toEqual([
      ['s1', 'business', null],
      ['s2', 'application', 'Production'],
      ['s3', 'application', null],
    ]);
    expect(result.services.refreshed).toBe(true);
  });

  it('flags services missing only when both service exports were included, and keeps known application services typed', () => {
    const existing = empty();
    existing.services = [
      { sysId: 's1', hash: 'h', missingSince: null, name: 'CRM Prod', kind: 'application' },
      { sysId: 's9', hash: 'h', missingSince: null, name: 'Gone', kind: 'business' },
    ];
    const result = plan({ business_service: [svc('s1', 'CRM Prod', { sys_class_name: 'label' })] }, existing);
    expect(result.services.refreshed).toBe(false);
    expect(result.services.nowMissing).toEqual([]);
    expect(result.services.upserts[0].columns.kind).toBe('application');
  });
});

describe('sync plan: capabilities and standards', () => {
  it('resolves the tree and every application\'s capability, including applications not in this export', () => {
    const existing = empty();
    existing.applications = [{ sysId: 'a0', hash: 'h', missingSince: null, name: 'Old', capabilityFields: { group: 'Customer', family: null, category: null } }];
    const result = plan(
      {
        business_capability: [{ sys_id: 'c1', name: 'Customer', parent: '' }, { sys_id: 'c2', name: 'Onboarding', parent: 'Customer' }],
        business_application: [app('a1', 'CRM', { u_capability_category_group: 'Customer', u_capability_family: 'Onboarding' }), app('a2', 'HR', { u_capability_family: 'Onboarding' })],
      },
      existing,
    );
    expect(result.capabilityTree.nodes.get('c2')).toEqual({ parentSysId: 'c1', level: 2 });
    expect(result.applicationCapabilities.get('a0')).toEqual({ capabilitySysId: 'c1', mismatch: false });
    expect(result.applicationCapabilities.get('a1')).toEqual({ capabilitySysId: 'c2', mismatch: false });
    expect(result.applicationCapabilities.get('a2')).toEqual({ capabilitySysId: 'c2', mismatch: true });
  });

  it('does not link a software model to a product standard name used twice', () => {
    const result = plan({
      product_standard: [{ sys_id: 'p1', u_product_standard: 'Java' }, { sys_id: 'p2', u_product_standard: 'Java' }],
      ba_as_sm: [{ sm_sys_id: 'm1', sm_u_product_standard: 'Java' }],
    });
    expect(result.modelStandards.get('m1')).toBeNull();
    expect(result.unmatched).toContainEqual({ file: 'ba_as_sm', field: 'sm_u_product_standard', name: 'Java', problem: 'ambiguous', rows: 1 });
  });

  it('links software models to product standards by name and reports names it cannot match', () => {
    const result = plan({
      product_standard: [{ sys_id: 'p1', u_product_standard: 'PostgreSQL 15' }],
      ba_as_sm: [
        { sm_sys_id: 'm1', sm_name: 'PostgreSQL', sm_u_product_standard: 'PostgreSQL 15' },
        { sm_sys_id: 'm2', sm_name: 'Oracle', sm_u_product_standard: 'Oracle 19c' },
      ],
    });
    expect(result.modelStandards.get('m1')).toBe('p1');
    expect(result.modelStandards.get('m2')).toBeNull();
    expect(result.unmatched).toContainEqual({ file: 'ba_as_sm', field: 'sm_u_product_standard', name: 'Oracle 19c', problem: 'not-found', rows: 1 });
  });
});

describe('sync plan: links', () => {
  const base = (): PlanInput['staged'] => ({
    business_application: [app('a1', 'CRM'), app('a2', 'Twin'), app('a3', 'Twin')],
    mapped_application_service: [svc('s1', 'CRM Prod')],
    business_service: [svc('b1', 'Sales')],
  });

  it('builds links from the joined view by sys_id, reporting ids it does not know', () => {
    const result = plan({
      ...base(),
      ba_as_sm: [
        { ba_sys_id: 'a1', app_sys_id: 's1', rel_sys_id: 'r1', sw_sys_id: 'w1', sm_sys_id: 'm1', sm_name: 'PostgreSQL', sw_full_version: '15.4', sw_primary_model: 'true' },
        { ba_sys_id: 'a1', app_sys_id: 's1', rel_sys_id: 'r1', sw_sys_id: 'w2', sm_sys_id: 'm2', sm_name: 'Nginx' },
        { ba_sys_id: 'zz', app_sys_id: 's1', rel_sys_id: 'r2' },
      ],
    });
    expect(result.links.applicationService).toEqual([{ source: 'ba_as_sm', pairs: [{ applicationSysId: 'a1', serviceSysId: 's1' }] }]);
    expect(result.links.serviceSoftware).toEqual([
      { sysId: 'w1', serviceSysId: 's1', modelSysId: 'm1', fullVersion: '15.4', primaryModel: true },
      { sysId: 'w2', serviceSysId: 's1', modelSysId: 'm2', fullVersion: null, primaryModel: false },
    ]);
    expect(result.softwareModels.upserts.map((u) => u.sysId)).toEqual(['m1', 'm2']);
    expect(result.unmatched).toContainEqual({ file: 'ba_as_sm', field: 'ba_sys_id', name: 'zz', problem: 'not-found', rows: 1 });
    expect(result.links.serviceBusinessService).toBeNull();
    expect(result.links.serviceServer).toBeNull();
  });

  it('builds links from the path exports by name, reporting names that match nothing or several records', () => {
    const result = plan({
      ...base(),
      ba_as_bs: [
        { u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Prod', u_business_service_1: 'Sales' },
        { u_business_application_1: 'Twin', u_mapped_application_service_1: 'CRM Prod', u_business_service_1: 'Nope' },
        { u_business_application_1: 'Twin', u_mapped_application_service_1: 'CRM Prod', u_business_service_1: 'Nope' },
        { u_business_application_1: 'CRM' },
      ],
      ba_as_server: [
        { u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Prod', u_server_1: 'SRV01' },
        { u_business_application_1: 'CRM', u_mapped_application_service_1: 'Sales', u_server_1: 'SRV02' },
      ],
    });
    expect(result.links.applicationService).toEqual([
      { source: 'ba_as_bs', pairs: [{ applicationSysId: 'a1', serviceSysId: 's1' }] },
      { source: 'ba_as_server', pairs: [{ applicationSysId: 'a1', serviceSysId: 's1' }] },
    ]);
    expect(result.links.serviceBusinessService).toEqual([{ serviceSysId: 's1', businessServiceSysId: 'b1' }]);
    expect(result.links.serviceServer).toEqual([{ serviceSysId: 's1', serverName: 'SRV01' }]);
    expect(result.servers).toEqual({ names: ['SRV01', 'SRV02'], newNames: ['SRV01', 'SRV02'], refreshed: true, nowMissing: [], returned: [] });
    expect(result.unmatched).toEqual(
      expect.arrayContaining([
        { file: 'ba_as_bs', field: 'u_business_application_1', name: 'Twin', problem: 'ambiguous', rows: 2 },
        { file: 'ba_as_bs', field: 'u_business_service_1', name: 'Nope', problem: 'not-found', rows: 2 },
        // A business service is not an application service.
        { file: 'ba_as_server', field: 'u_mapped_application_service_1', name: 'Sales', problem: 'not-found', rows: 1 },
      ]),
    );
    expect(result.skipped).toContainEqual({ file: 'ba_as_bs', row: 4, reason: 'missing name' });
  });

  it('flags servers missing from a complete server export', () => {
    const existing = empty();
    existing.servers = [{ name: 'OLD', missingSince: null }, { name: 'SRV01', missingSince: new Date() }];
    const result = plan({ ba_as_server: [{ u_business_application_1: 'x', u_mapped_application_service_1: 'y', u_server_1: 'SRV01' }] }, existing);
    expect(result.servers).toMatchObject({ names: ['SRV01'], newNames: [], nowMissing: ['OLD'], returned: ['SRV01'] });
    expect(plan({ ba_as_server: [{ u_business_application_1: 'x', u_mapped_application_service_1: 'y' }] }).skipped).toEqual([{ file: 'ba_as_server', row: 1, reason: 'missing name' }]);
  });
});
