import type { CapabilityProblem } from './capabilities.js';
import type { SyncFile } from './sync-files.js';
import type { EntityPlan, Skipped, SyncPlan, Unmatched } from './sync-plan.js';

export const REPORT_LIST_LIMIT = 500;

export type RecordType = 'applications' | 'services' | 'capabilities' | 'productStandards' | 'softwareModels' | 'servers';
export type LinkType = 'application-service' | 'service-business-service' | 'service-server' | 'service-software';

export interface RecordCounts {
  recordType: RecordType;
  refreshed: boolean;
  received: number;
  inserted: number;
  updated: number;
  unchanged: number;
  nowMissing: number;
  returned: number;
}

export interface SyncReportData {
  filesIncluded: SyncFile[];
  records: RecordCounts[];
  links: { linkType: LinkType; source: SyncFile; count: number }[];
  capabilityMismatches: number;
  capabilityIssues: { name: string | null; problem: CapabilityProblem }[];
  unmatched: Unmatched[];
  skipped: Skipped[];
  truncated: boolean;
}

function counts(recordType: RecordType, plan: EntityPlan<unknown>): RecordCounts {
  const by = (change: string) => plan.upserts.filter((u) => u.change === change).length;
  return {
    recordType,
    refreshed: plan.refreshed,
    received: plan.upserts.length,
    inserted: by('insert'),
    updated: by('update'),
    unchanged: by('unchanged'),
    nowMissing: plan.nowMissing.length,
    returned: plan.returned.length,
  };
}

/** What a run changed (or would change, for a dry run), for the sync-run page and the CLI. */
export function buildSyncReport(plan: SyncPlan): SyncReportData {
  const links: SyncReportData['links'] = plan.links.applicationService.map((group) => ({
    linkType: 'application-service',
    source: group.source,
    count: group.pairs.length,
  }));
  if (plan.links.serviceBusinessService) links.push({ linkType: 'service-business-service', source: 'ba_as_bs', count: plan.links.serviceBusinessService.length });
  if (plan.links.serviceServer) links.push({ linkType: 'service-server', source: 'ba_as_server', count: plan.links.serviceServer.length });
  if (plan.links.serviceSoftware) links.push({ linkType: 'service-software', source: 'ba_as_sm', count: plan.links.serviceSoftware.length });

  const { servers } = plan;
  const lists = {
    capabilityIssues: plan.capabilityTree.issues.map((issue) => ({ name: issue.name, problem: issue.problem })),
    unmatched: plan.unmatched,
    skipped: plan.skipped,
  };
  return {
    filesIncluded: plan.filesIncluded,
    records: [
      counts('applications', plan.applications),
      counts('services', plan.services),
      counts('capabilities', plan.capabilities),
      counts('productStandards', plan.productStandards),
      counts('softwareModels', plan.softwareModels),
      {
        recordType: 'servers',
        refreshed: servers.refreshed,
        received: servers.names.length,
        inserted: servers.newNames.length,
        updated: 0,
        unchanged: servers.names.length - servers.newNames.length,
        nowMissing: servers.nowMissing.length,
        returned: servers.returned.length,
      },
    ],
    links,
    capabilityMismatches: [...plan.applicationCapabilities.values()].filter((c) => c.mismatch).length,
    capabilityIssues: lists.capabilityIssues.slice(0, REPORT_LIST_LIMIT),
    unmatched: lists.unmatched.slice(0, REPORT_LIST_LIMIT),
    skipped: lists.skipped.slice(0, REPORT_LIST_LIMIT),
    truncated: Object.values(lists).some((list) => list.length > REPORT_LIST_LIMIT),
  };
}
