import type { EntityManager } from '@mikro-orm/postgresql';
import { scopeContains, type ResourceScope } from '../access/principal.js';
import { RoleAssignment } from '../access/role-assignment.entity.js';
import { personName } from '../identity/person-name.js';
import {
  TrmApplication,
  TrmApplicationPortfolio,
  TrmApplicationService,
  TrmServiceServer,
  TrmServiceSoftware,
} from '../trm/trm.entities.js';
import { capabilityParents } from '../trm/trm-visibility.js';
import type { TrmValues } from './domain/visibility.js';
import type { TrmSource } from './domain/template-types.js';

/** TRM values that name people: personal data. */
export const PERSONAL_SOURCES: TrmSource[] = ['businessOwner', 'itApplicationOwner', 'applicationManager', 'applicationLead', 'productManagers', 'portfolioLeads'];

export interface EnvironmentService {
  name: string | null;
  environment: string | null;
  servers: string[];
  software: { name: string | null; version: string | null; standard: string | null; standardStatus: string | null }[];
}

export interface SadTrm {
  application: { id: string; name: string | null; number: string | null };
  /** Where the application lives: drives scoped permissions and approvers */
  scope: ResourceScope;
  values: TrmValues;
}

/** Nullable columns load as null; MikroORM's types also allow undefined. */
const col = <T>(value: T | null | undefined) => value as T | null;
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);
const byName = (a: string, b: string) => a.localeCompare(b);
/** Unnamed records last. */
const byOptionalName = (a: { name: string | null }, b: { name: string | null }) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name));

/** People holding a role for this application through an application or portfolio assignment (not company-wide). */
async function holders(em: EntityManager, roleCode: string, scope: ResourceScope, now: Date): Promise<string[]> {
  const assignments = await em.find(
    RoleAssignment,
    { role: { code: roleCode }, user: { status: 'active' }, scopeType: { $in: ['application', 'portfolio'] }, validFrom: { $lte: now }, $or: [{ validTo: null }, { validTo: { $gt: now } }] },
    { populate: ['user'] },
  );
  const names = assignments
    .filter((a) => scopeContains({ scopeType: a.scopeType, scopeId: col(a.scopeId) }, scope))
    .map((a) => personName(a.user));
  return [...new Set(names)].sort(byName);
}

async function environment(em: EntityManager, applicationId: string): Promise<EnvironmentService[]> {
  const links = await em.find(TrmApplicationService, { application: applicationId }, { populate: ['service'] });
  const services = [...new Map(links.map((link) => [link.service.id, link.service])).values()];
  const ids = services.map((service) => service.id);
  const hosting = await em.find(TrmServiceServer, { service: { $in: ids } }, { populate: ['server'] });
  const software = await em.find(TrmServiceSoftware, { service: { $in: ids } }, { populate: ['softwareModel.productStandard'] });
  return services
    .map((service) => ({
      name: col(service.name),
      environment: col(service.environment),
      servers: hosting
        .filter((h) => h.service.id === service.id)
        .map((h) => col(h.server.name))
        .filter((name): name is string => name !== null)
        .sort(byName),
      software: software
        .filter((s) => s.service.id === service.id)
        .map((s) => ({
          name: col(s.softwareModel.name),
          version: col(s.softwareModel.productVersion),
          standard: s.softwareModel.productStandard?.name ?? null,
          standardStatus: s.softwareModel.productStandard?.status ?? null,
        }))
        .sort(byOptionalName),
    }))
    .sort(byOptionalName);
}

/** The application's TRM values for its SAD (unmasked: callers mask personal ones), or null when it does not exist. */
export async function loadSadTrm(em: EntityManager, applicationId: string, now = new Date()): Promise<SadTrm | null> {
  const application = await em.findOne(TrmApplication, applicationId);
  if (!application) return null;
  const portfolios = (await em.find(TrmApplicationPortfolio, { application: applicationId }, { populate: ['portfolio'] })).map((link) => link.portfolio);
  const scope: ResourceScope = { applicationId, applicationIds: [applicationId], portfolioIds: portfolios.map((p) => p.id) };
  const tree = await capabilityParents(em);
  const path: (string | null)[] = [];
  // Every capability is in the tree (foreign keys), so lookups by id always succeed; unnamed ones are left out below.
  for (let id: string | null | undefined = application.capability?.id; id && path.length < 10; id = tree.get(id)!.parentId) path.unshift(tree.get(id)!.name);
  const source = application.source;
  const rpo = text(application.rpo);
  const rto = text(application.rto);

  const values: TrmValues = {
    name: text(application.name),
    number: text(application.number),
    description: text(application.description),
    capability: path.filter(Boolean).join(' › ') || null,
    portfolios: portfolios.map((p) => p.name).sort(byName),
    displayName: text(application.displayName),
    ownedBusinessUnit: text(application.ownedBusinessUnit),
    bcmCriticality: text(application.bcmCriticality),
    rpoRto: rpo || rto ? `${rpo ?? '—'} / ${rto ?? '—'}` : null,
    dataClassification: text(source.data_classification),
    businessOwner: text(source.owned_by),
    itApplicationOwner: text(application.itApplicationOwner),
    applicationManager: text(application.applicationManager),
    applicationLead: text(application.applicationLead),
    productManagers: await holders(em, 'product-manager', scope, now),
    portfolioLeads: await holders(em, 'portfolio-lead', scope, now),
    environment: await environment(em, applicationId),
  };
  return { application: { id: application.id, name: col(application.name), number: col(application.number) }, scope, values };
}

/** A copy without the values the caller may not see (people's names). */
export function maskTrm(values: TrmValues, personal: boolean): { values: TrmValues; restricted: TrmSource[] } {
  if (personal) return { values, restricted: [] };
  const copy = { ...values };
  for (const source of PERSONAL_SOURCES) copy[source] = null;
  return { values: copy, restricted: PERSONAL_SOURCES };
}
