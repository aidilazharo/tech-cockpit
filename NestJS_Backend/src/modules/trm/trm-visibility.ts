import type { EntityManager } from '@mikro-orm/postgresql';
import type { Principal } from '../access/principal.js';
import {
  TrmApplication,
  TrmApplicationPortfolio,
  TrmApplicationService,
  TrmCapability,
  TrmServiceDependency,
  TrmServiceServer,
  TrmServiceSoftware,
  TrmSoftwareModel,
} from './trm.entities.js';

/** Nullable columns load as null; MikroORM's types also allow undefined. */
const col = <T>(value: T | null | undefined) => value as T | null;

/** Everything, or the records a scoped caller may see (their applications and what links to them). */
export type Visibility =
  | { all: true }
  | {
      all: false;
      applications: Set<string>;
      services: Set<string>;
      servers: Set<string>;
      models: Set<string>;
      standards: Set<string>;
      capabilities: Set<string>;
    };

/** What the caller may see: everything, or (scoped roles, vendors) their applications and what links to them. */
export async function trmVisibility(em: EntityManager, principal: Principal): Promise<Visibility> {
  if (principal.isSystemAdmin) return { all: true };
  const grants = principal.grants.filter((grant) => grant.permissions.has('trm:application:read'));
  // A company-wide grant sees everything, vendors included: the role's scope decides (2026-10-22).
  if (grants.some((grant) => grant.scope.scopeType === 'global')) return { all: true };

  const applications = new Set<string>();
  const portfolios: string[] = [];
  for (const { scope } of grants) {
    if (scope.scopeType === 'application' && scope.scopeId) applications.add(scope.scopeId);
    if (scope.scopeType === 'portfolio' && scope.scopeId) portfolios.push(scope.scopeId);
  }
  if (portfolios.length > 0) {
    for (const link of await em.find(TrmApplicationPortfolio, { portfolio: { $in: portfolios } })) applications.add(link.application.id);
  }
  const ids = <T extends { id: string }>(items: T[]) => new Set(items.map((item) => item.id));
  const applicationServices = await em.find(TrmApplicationService, { application: { $in: [...applications] } });
  const services = new Set(applicationServices.map((link) => link.service.id));
  for (const link of await em.find(TrmServiceDependency, { service: { $in: [...services] } })) services.add(link.businessService.id);
  const servers = new Set((await em.find(TrmServiceServer, { service: { $in: [...services] } })).map((link) => link.server.id));
  const models = new Set((await em.find(TrmServiceSoftware, { service: { $in: [...services] } })).map((link) => link.softwareModel.id));
  const standards = new Set(
    (await em.find(TrmSoftwareModel, { id: { $in: [...models] }, productStandard: { $ne: null } })).map((model) => model.productStandard!.id),
  );
  const capabilities = new Set<string>();
  const tree = await capabilityParents(em);
  for (const application of await em.find(TrmApplication, { id: { $in: [...applications] }, capability: { $ne: null } })) {
    for (let id: string | null = application.capability!.id; id && !capabilities.has(id); id = tree.get(id)?.parentId ?? null) capabilities.add(id);
  }
  return { all: false, applications: ids(await em.find(TrmApplication, { id: { $in: [...applications] } })), services, servers, models, standards, capabilities };
}

export function seen(visibility: Visibility, kind: Exclude<keyof Extract<Visibility, { all: false }>, 'all'>, id: string): boolean {
  return visibility.all || visibility[kind].has(id);
}

export async function capabilityParents(em: EntityManager): Promise<Map<string, { name: string | null; parentId: string | null; level: number | null }>> {
  const all = await em.find(TrmCapability, {}, { fields: ['name', 'parent', 'level'] });
  return new Map(all.map((c) => [c.id, { name: col(c.name), parentId: c.parent ? c.parent.id : null, level: col(c.level) }]));
}
