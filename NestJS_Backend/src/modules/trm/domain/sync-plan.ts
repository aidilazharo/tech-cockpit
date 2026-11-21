import {
  type ApplicationCapabilityFields,
  buildCapabilityTree,
  type CapabilityTree,
  resolveApplicationCapability,
} from './capabilities.js';
import {
  type ApplicationColumns,
  applicationColumns,
  type CapabilityColumns,
  capabilityColumns,
  pathToBusinessService,
  pathToServer,
  type ProductStandardColumns,
  productStandardColumns,
  type ServiceColumns,
  serviceColumns,
  type ServiceKind,
  serviceKind,
  type SoftwareModelColumns,
  splitJoinedView,
} from './mapping.js';
import { NameIndex } from './name-index.js';
import { SYNC_FILES, type SyncFile } from './sync-files.js';
import { contentHash, type SourceRecord, text } from './values.js';

export interface ExistingRecord {
  sysId: string;
  hash: string;
  missingSince: Date | null;
}

export interface PlanInput {
  /** Rows received per export in this run (only the exports that were included). */
  staged: Partial<Record<SyncFile, SourceRecord[]>>;
  existing: {
    applications: (ExistingRecord & { name: string | null; capabilityFields: ApplicationCapabilityFields })[];
    services: (ExistingRecord & { name: string | null; kind: ServiceKind })[];
    capabilities: (ExistingRecord & { name: string | null; parentName: string | null })[];
    productStandards: (ExistingRecord & { name: string | null })[];
    softwareModels: (ExistingRecord & { productStandardName: string | null })[];
    servers: { name: string; missingSince: Date | null }[];
  };
  applicationServiceClasses: ReadonlySet<string>;
}

export interface Upsert<C> {
  sysId: string;
  columns: C;
  source: SourceRecord;
  hash: string;
  change: 'insert' | 'update' | 'unchanged';
}

export interface EntityPlan<C> {
  upserts: Upsert<C>[];
  /** A complete export of this record type was included, so absent records are flagged missing. */
  refreshed: boolean;
  nowMissing: string[];
  returned: string[];
}

export type ServiceUpsertColumns = ServiceColumns & { kind: ServiceKind };
export type ApplicationServiceLinkSource = 'ba_as_sm' | 'ba_as_bs' | 'ba_as_server';

export interface Unmatched {
  file: SyncFile;
  field: string;
  name: string;
  problem: 'not-found' | 'ambiguous';
  rows: number;
}

export interface Skipped {
  file: SyncFile;
  /** 1-based row number in the export */
  row: number;
  reason: string;
}

export interface SyncPlan {
  filesIncluded: SyncFile[];
  applications: EntityPlan<ApplicationColumns>;
  services: EntityPlan<ServiceUpsertColumns>;
  capabilities: EntityPlan<CapabilityColumns>;
  productStandards: EntityPlan<ProductStandardColumns>;
  softwareModels: EntityPlan<SoftwareModelColumns>;
  servers: { names: string[]; newNames: string[]; refreshed: boolean; nowMissing: string[]; returned: string[] };
  capabilityTree: CapabilityTree;
  /** Every application's capability (also those not in this run), by application sys_id. */
  applicationCapabilities: Map<string, { capabilitySysId: string | null; mismatch: boolean }>;
  /** Every software model's product standard sys_id (or null), by model sys_id. */
  modelStandards: Map<string, string | null>;
  /** Links are rebuilt from each included export; null means that export was not included (links kept). */
  links: {
    applicationService: { source: ApplicationServiceLinkSource; pairs: { applicationSysId: string; serviceSysId: string }[] }[];
    serviceBusinessService: { serviceSysId: string; businessServiceSysId: string }[] | null;
    serviceServer: { serviceSysId: string; serverName: string }[] | null;
    serviceSoftware: { sysId: string; serviceSysId: string; modelSysId: string; fullVersion: string | null; primaryModel: boolean }[] | null;
  };
  unmatched: Unmatched[];
  skipped: Skipped[];
}

interface Incoming<C> {
  columns: C;
  source: SourceRecord;
  hash: string;
}

const EMPTY_PLAN = { upserts: [], refreshed: false, nowMissing: [], returned: [] };

/**
 * Works out everything one sync run changes, without touching the database: which
 * records to insert or update, which went missing, every link, and every name that
 * could not be matched. The sync service then applies the plan in one transaction.
 */
export function planSync(input: PlanInput): SyncPlan {
  const { staged, existing } = input;
  const skipped: Skipped[] = [];
  const unmatched = new Map<string, Unmatched>();
  const report = (file: SyncFile, field: string, name: string, problem: Unmatched['problem']) => {
    const key = JSON.stringify([file, field, name, problem]);
    const entry = unmatched.get(key);
    if (entry) entry.rows += 1;
    else unmatched.set(key, { file, field, name, problem, rows: 1 });
  };

  /** Rows of an export keyed by sys_id (a later duplicate wins); null when the export was not included. */
  function bySysId(file: SyncFile, read: (row: SourceRecord) => { sysId: string | null; incoming: Omit<Incoming<unknown>, 'hash'> }) {
    const rows = staged[file];
    if (!rows) return null;
    const result = new Map<string, Incoming<unknown> & { row: number }>();
    rows.forEach((row, index) => {
      const { sysId, incoming } = read(row);
      if (!sysId) {
        skipped.push({ file, row: index + 1, reason: 'missing sys_id' });
        return;
      }
      const previous = result.get(sysId);
      if (previous) skipped.push({ file, row: previous.row, reason: 'duplicate sys_id (a later row wins)' });
      result.set(sysId, { ...incoming, hash: contentHash(incoming.source), row: index + 1 });
    });
    return result;
  }

  function entityPlan<C>(incoming: Map<string, Incoming<C>> | null, current: ExistingRecord[], refreshed: boolean): EntityPlan<C> {
    if (!incoming) return { ...EMPTY_PLAN, upserts: [] };
    const known = new Map(current.map((record) => [record.sysId, record]));
    const upserts = [...incoming].map(([sysId, { columns, source, hash }]) => {
      const record = known.get(sysId);
      const change: Upsert<C>['change'] = !record ? 'insert' : record.hash === hash ? 'unchanged' : 'update';
      return { sysId, columns, source, hash, change };
    });
    return {
      upserts,
      refreshed,
      nowMissing: refreshed ? current.filter((r) => !incoming.has(r.sysId) && r.missingSince === null).map((r) => r.sysId) : [],
      returned: current.filter((r) => incoming.has(r.sysId) && r.missingSince !== null).map((r) => r.sysId),
    };
  }

  // ----- Records

  const applicationsIn = bySysId('business_application', (row) => ({ sysId: text(row.sys_id), incoming: { source: row, columns: applicationColumns(row) } })) as Map<
    string,
    Incoming<ApplicationColumns>
  > | null;
  const capabilitiesIn = bySysId('business_capability', (row) => ({ sysId: text(row.sys_id), incoming: { source: row, columns: capabilityColumns(row) } })) as Map<
    string,
    Incoming<CapabilityColumns>
  > | null;
  const standardsIn = bySysId('product_standard', (row) => ({ sysId: text(row.sys_id), incoming: { source: row, columns: productStandardColumns(row) } })) as Map<
    string,
    Incoming<ProductStandardColumns>
  > | null;

  // Services: the services export also holds application services; the application-service export wins.
  const hasServiceFile = { business: Boolean(staged.business_service), application: Boolean(staged.mapped_application_service) };
  let servicesIn: Map<string, Incoming<ServiceUpsertColumns>> | null = null;
  if (hasServiceFile.business || hasServiceFile.application) {
    const knownKinds = new Map(existing.services.map((service) => [service.sysId, service.kind]));
    const merged = new Map<string, Incoming<ServiceUpsertColumns>>();
    for (const [file, inApplicationExport] of [['business_service', false], ['mapped_application_service', true]] as const) {
      const rows = bySysId(file, (row) => ({ sysId: text(row.sys_id), incoming: { source: row, columns: serviceColumns(row) } }));
      for (const [sysId, item] of rows ?? []) {
        const keepApplication = !hasServiceFile.application && knownKinds.get(sysId) === 'application';
        const kind = serviceKind(item.source, inApplicationExport || keepApplication, input.applicationServiceClasses);
        merged.set(sysId, { columns: { ...(item.columns as ServiceColumns), kind }, source: item.source, hash: contentHash({ kind, source: item.source }) });
      }
    }
    servicesIn = merged;
  }

  // Joined view: software models and links.
  const viewRows = staged.ba_as_sm?.map(splitJoinedView) ?? null;
  let modelsIn: Map<string, Incoming<SoftwareModelColumns>> | null = null;
  if (viewRows) {
    modelsIn = new Map();
    for (const part of viewRows) {
      if (part.softwareModel) {
        const { sysId, source, columns } = part.softwareModel;
        modelsIn.set(sysId, { columns, source, hash: contentHash(source) });
      }
    }
  }

  const applications = entityPlan(applicationsIn, existing.applications, Boolean(applicationsIn));
  const services = entityPlan(servicesIn, existing.services, hasServiceFile.business && hasServiceFile.application);
  const capabilities = entityPlan(capabilitiesIn, existing.capabilities, Boolean(capabilitiesIn));
  const productStandards = entityPlan(standardsIn, existing.productStandards, Boolean(standardsIn));
  const softwareModels = entityPlan(modelsIn, existing.softwareModels, Boolean(modelsIn));

  // ----- The state after this run (existing records overlaid with what arrived)

  const finalApplications = new Map(existing.applications.map((a) => [a.sysId, { name: a.name, fields: a.capabilityFields }]));
  for (const [sysId, { columns }] of applicationsIn ?? []) {
    finalApplications.set(sysId, {
      name: columns.name,
      fields: { group: columns.capabilityGroupName, family: columns.capabilityFamilyName, category: columns.capabilityCategoryName },
    });
  }
  const finalServices = new Map(existing.services.map((s) => [s.sysId, { name: s.name, kind: s.kind }]));
  for (const [sysId, { columns }] of servicesIn ?? []) finalServices.set(sysId, { name: columns.name, kind: columns.kind });
  const finalCapabilities = new Map(existing.capabilities.map((c) => [c.sysId, { name: c.name, parentName: c.parentName }]));
  for (const [sysId, { columns }] of capabilitiesIn ?? []) finalCapabilities.set(sysId, { name: columns.name, parentName: columns.parentName });
  const finalStandards = new Map(existing.productStandards.map((p) => [p.sysId, p.name]));
  for (const [sysId, { columns }] of standardsIn ?? []) finalStandards.set(sysId, columns.name);
  const finalModels = new Map(existing.softwareModels.map((m) => [m.sysId, m.productStandardName]));
  for (const [sysId, { columns }] of modelsIn ?? []) finalModels.set(sysId, columns.productStandardName);

  // ----- Capabilities and standards

  const capabilityTree = buildCapabilityTree([...finalCapabilities].map(([sysId, c]) => ({ sysId, name: c.name, parentName: c.parentName })));
  const applicationCapabilities = new Map([...finalApplications].map(([sysId, a]) => [sysId, resolveApplicationCapability(capabilityTree, a.fields)]));

  const standardIndex = new NameIndex(finalStandards, ([, name]) => name, ([sysId]) => sysId);
  const modelStandards = new Map<string, string | null>();
  for (const [sysId, standardName] of finalModels) {
    const match = standardIndex.resolve(standardName);
    modelStandards.set(sysId, match.kind === 'one' ? match.id : null);
    if (standardName && match.kind !== 'one') report('ba_as_sm', 'sm_u_product_standard', standardName, match.kind === 'many' ? 'ambiguous' : 'not-found');
  }

  // ----- Links

  const applicationService: SyncPlan['links']['applicationService'] = [];
  const dedupe = <T>(items: T[]) => [...new Map(items.map((item) => [JSON.stringify(item), item])).values()];

  let serviceSoftware: SyncPlan['links']['serviceSoftware'] = null;
  if (viewRows) {
    const pairs: { applicationSysId: string; serviceSysId: string }[] = [];
    const software: NonNullable<SyncPlan['links']['serviceSoftware']> = [];
    for (const part of viewRows) {
      if (part.relationship) {
        const { applicationSysId, serviceSysId } = part.relationship;
        const knownApplication = finalApplications.has(applicationSysId);
        const knownService = finalServices.has(serviceSysId);
        if (!knownApplication) report('ba_as_sm', 'ba_sys_id', applicationSysId, 'not-found');
        if (!knownService) report('ba_as_sm', 'app_sys_id', serviceSysId, 'not-found');
        if (knownApplication && knownService) pairs.push({ applicationSysId, serviceSysId });
      }
      if (part.softwareLink && finalServices.has(part.softwareLink.serviceSysId)) software.push(part.softwareLink);
    }
    applicationService.push({ source: 'ba_as_sm', pairs: dedupe(pairs) });
    serviceSoftware = [...new Map(software.map((link) => [link.sysId, link])).values()];
  }

  const applicationIndex = new NameIndex(finalApplications, ([, a]) => a.name, ([sysId]) => sysId);
  const serviceIndex = (kind: ServiceKind) =>
    new NameIndex([...finalServices].filter(([, s]) => s.kind === kind), ([, s]) => s.name, ([sysId]) => sysId);
  const applicationServices = serviceIndex('application');
  const businessServices = serviceIndex('business');
  const find = (index: NameIndex<unknown>, file: SyncFile, field: string, name: string): string | null => {
    const match = index.resolve(name);
    if (match.kind === 'one') return match.id;
    report(file, field, name, match.kind === 'many' ? 'ambiguous' : 'not-found');
    return null;
  };

  let serviceBusinessService: SyncPlan['links']['serviceBusinessService'] = null;
  if (staged.ba_as_bs) {
    const pairs: { applicationSysId: string; serviceSysId: string }[] = [];
    const dependencies: { serviceSysId: string; businessServiceSysId: string }[] = [];
    staged.ba_as_bs.forEach((row, index) => {
      const path = pathToBusinessService(row);
      if (!path.applicationName || !path.serviceName || !path.businessServiceName) {
        skipped.push({ file: 'ba_as_bs', row: index + 1, reason: 'missing name' });
        return;
      }
      const applicationSysId = find(applicationIndex, 'ba_as_bs', 'u_business_application_1', path.applicationName);
      const serviceSysId = find(applicationServices, 'ba_as_bs', 'u_mapped_application_service_1', path.serviceName);
      const businessServiceSysId = find(businessServices, 'ba_as_bs', 'u_business_service_1', path.businessServiceName);
      if (applicationSysId && serviceSysId) pairs.push({ applicationSysId, serviceSysId });
      if (serviceSysId && businessServiceSysId) dependencies.push({ serviceSysId, businessServiceSysId });
    });
    applicationService.push({ source: 'ba_as_bs', pairs: dedupe(pairs) });
    serviceBusinessService = dedupe(dependencies);
  }

  let serviceServer: SyncPlan['links']['serviceServer'] = null;
  let servers: SyncPlan['servers'] = { names: [], newNames: [], refreshed: false, nowMissing: [], returned: [] };
  if (staged.ba_as_server) {
    const pairs: { applicationSysId: string; serviceSysId: string }[] = [];
    const hosting: { serviceSysId: string; serverName: string }[] = [];
    const names = new Set<string>();
    staged.ba_as_server.forEach((row, index) => {
      const path = pathToServer(row);
      if (!path.applicationName || !path.serviceName || !path.serverName) {
        skipped.push({ file: 'ba_as_server', row: index + 1, reason: 'missing name' });
        return;
      }
      names.add(path.serverName);
      const applicationSysId = find(applicationIndex, 'ba_as_server', 'u_business_application_1', path.applicationName);
      const serviceSysId = find(applicationServices, 'ba_as_server', 'u_mapped_application_service_1', path.serviceName);
      if (applicationSysId && serviceSysId) pairs.push({ applicationSysId, serviceSysId });
      if (serviceSysId) hosting.push({ serviceSysId, serverName: path.serverName });
    });
    applicationService.push({ source: 'ba_as_server', pairs: dedupe(pairs) });
    serviceServer = dedupe(hosting);
    const known = new Set(existing.servers.map((s) => s.name));
    servers = {
      names: [...names],
      newNames: [...names].filter((name) => !known.has(name)),
      refreshed: true,
      nowMissing: existing.servers.filter((s) => !names.has(s.name) && s.missingSince === null).map((s) => s.name),
      returned: existing.servers.filter((s) => names.has(s.name) && s.missingSince !== null).map((s) => s.name),
    };
  }

  return {
    filesIncluded: SYNC_FILES.filter((file) => staged[file] !== undefined),
    applications,
    services,
    capabilities,
    productStandards,
    softwareModels,
    servers,
    capabilityTree,
    applicationCapabilities,
    modelStandards,
    links: { applicationService, serviceBusinessService, serviceServer, serviceSoftware },
    unmatched: [...unmatched.values()],
    skipped,
  };
}
