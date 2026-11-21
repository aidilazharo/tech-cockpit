import { describe, expect, it } from 'vitest';
import { buildSyncReport, REPORT_LIST_LIMIT } from './sync-report.js';
import { planSync } from './sync-plan.js';

const empty = { applications: [], services: [], capabilities: [], productStandards: [], softwareModels: [], servers: [] };

describe('sync report', () => {
  it('counts changes per record type and links per export', () => {
    const plan = planSync({
      staged: {
        business_application: [{ sys_id: 'a1', name: 'CRM', u_capability_family: 'Nope' }],
        mapped_application_service: [{ sys_id: 's1', name: 'CRM Prod' }],
        business_service: [{ sys_id: 'b1', name: 'Sales' }],
        business_capability: [{ sys_id: 'c1', name: 'Orphan', parent: 'Missing' }],
        ba_as_bs: [{ u_business_application_1: 'CRM', u_mapped_application_service_1: 'CRM Prod', u_business_service_1: 'Sales' }],
      },
      existing: { ...empty, servers: [{ name: 'OLD', missingSince: null }] },
      applicationServiceClasses: new Set(),
    });
    const report = buildSyncReport(plan);
    expect(report.filesIncluded).toEqual(['business_application', 'mapped_application_service', 'business_service', 'business_capability', 'ba_as_bs']);
    expect(report.records).toContainEqual({ recordType: 'applications', refreshed: true, received: 1, inserted: 1, updated: 0, unchanged: 0, nowMissing: 0, returned: 0 });
    expect(report.records).toContainEqual({ recordType: 'services', refreshed: true, received: 2, inserted: 2, updated: 0, unchanged: 0, nowMissing: 0, returned: 0 });
    expect(report.records).toContainEqual({ recordType: 'servers', refreshed: false, received: 0, inserted: 0, updated: 0, unchanged: 0, nowMissing: 0, returned: 0 });
    expect(report.links).toEqual([
      { linkType: 'application-service', source: 'ba_as_bs', count: 1 },
      { linkType: 'service-business-service', source: 'ba_as_bs', count: 1 },
    ]);
    expect(report.capabilityMismatches).toBe(1);
    expect(report.capabilityIssues).toEqual([{ name: 'Orphan', problem: 'parent-not-found' }]);
    expect(report.truncated).toBe(false);
  });

  it('counts servers by name and cuts long lists', () => {
    const rows = Array.from({ length: REPORT_LIST_LIMIT + 5 }, (_, i) => ({ u_business_application_1: `App ${i}`, u_mapped_application_service_1: 'S', u_server_1: `SRV${i}` }));
    const plan = planSync({
      staged: { ba_as_server: rows },
      existing: { ...empty, servers: [{ name: 'SRV0', missingSince: null }, { name: 'GONE', missingSince: null }] },
      applicationServiceClasses: new Set(),
    });
    const report = buildSyncReport(plan);
    expect(report.records).toContainEqual({
      recordType: 'servers',
      refreshed: true,
      received: REPORT_LIST_LIMIT + 5,
      inserted: REPORT_LIST_LIMIT + 4,
      updated: 0,
      unchanged: 1,
      nowMissing: 1,
      returned: 0,
    });
    expect(report.unmatched).toHaveLength(REPORT_LIST_LIMIT);
    expect(report.truncated).toBe(true);
  });
});
