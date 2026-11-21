import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { loadSadTrm } from '../../src/modules/sad/sad-trm.js';
import {
  TrmApplication,
  TrmApplicationService,
  TrmCapability,
  TrmInitiative,
  TrmInitiativeCapability,
  TrmProductStandard,
  TrmService,
  TrmServiceSoftware,
  TrmSoftwareModel,
} from '../../src/modules/trm/trm.entities.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { resetTrm, SYS, trmExports } from './support/trm-fixtures.js';

let t: TestApp;
let admin: Actor;
let architect: Actor;
let viewer: Actor;
let ownerTeam: Actor;
let vendor: Actor;
let vendorDomains: Actor;
let vendorNoRoadmap: Actor;
let productManager: Actor;
let nobody: Actor;
const id: Record<string, string> = {};

const http = () => t.http();
const get = (actor: Actor, path: string, status = 200) => http().get(`/api/v1${path}`).set(actor.auth).expect(status);
const names = (items: { name: string | null }[]) => items.map((item) => item.name);

beforeAll(async () => {
  t = await createTestApp();
  await resetTrm(t.orm);
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'land-admin' });
  const run = (await http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
  const expected: Record<string, number> = {};
  for (const [file, records] of Object.entries(trmExports())) {
    expected[file] = records.length;
    await http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(admin.auth).send({ file, records }).expect(200);
  }
  await http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected }).expect(200);
  const em = t.orm.em.fork();
  for (const [key, sysId] of Object.entries(SYS)) {
    const record =
      (await em.findOne(TrmApplication, { snSysId: sysId })) ?? (await em.findOne(TrmCapability, { snSysId: sysId })) ?? (await em.findOne(TrmProductStandard, { snSysId: sysId }));
    if (record) id[key] = record.id;
  }
  architect = await createActor(t.orm, [{ code: 'enterprise-architect' }], { label: 'land-ea' });
  viewer = await createActor(t.orm, [{ code: 'trm-viewer' }], { label: 'land-viewer' });
  ownerTeam = await createActor(t.orm, [{ code: 'application-owner-team', scopeType: 'application', scopeId: id.appCrm }], { label: 'land-owner' });
  vendor = await createActor(t.orm, [{ code: 'application-owner-team', scopeType: 'application', scopeId: id.appCrm }], { label: 'land-vendor', isExternal: true });
  vendorDomains = await createActor(t.orm, [{ code: await createRole(t.orm, ['trm:application:read', 'trm:domain:manage']), scopeType: 'application', scopeId: id.appCrm }], { label: 'land-vendor-dom', isExternal: true });
  vendorNoRoadmap = await createActor(t.orm, [{ code: await createRole(t.orm, ['trm:application:read']), scopeType: 'application', scopeId: id.appCrm }], { label: 'land-vendor-norm', isExternal: true });
  productManager = await createActor(t.orm, [{ code: 'product-manager' }], { label: 'land-pm' });
  nobody = await createActor(t.orm, [], { label: 'land-nobody' });
});

afterAll(async () => {
  await t.close();
});

describe('Domains', () => {
  const ids: Record<string, string> = {};

  it('are maintained by enterprise architects: domains, then sub-domains', async () => {
    await http().post('/api/v1/trm/domains').set(viewer.auth).send({ name: 'Customer' }).expect(403);
    const customer = (await http().post('/api/v1/trm/domains').set(architect.auth).send({ name: 'Customer' }).expect(201)).body;
    expect(customer).toMatchObject({ name: 'Customer', active: true, version: 1 });
    ids.customer = customer.id;
    ids.finance = (await http().post('/api/v1/trm/domains').set(architect.auth).send({ name: 'Finance' }).expect(201)).body.id;
    await http().post('/api/v1/trm/domains').set(architect.auth).send({ name: 'Customer' }).expect(409);

    ids.sales = (await http().post(`/api/v1/trm/domains/${ids.customer}/subdomains`).set(architect.auth).send({ name: 'Sales' }).expect(201)).body.id;
    ids.service = (await http().post(`/api/v1/trm/domains/${ids.customer}/subdomains`).set(architect.auth).send({ name: 'Service' }).expect(201)).body.id;
    ids.billing = (await http().post(`/api/v1/trm/domains/${ids.finance}/subdomains`).set(architect.auth).send({ name: 'Billing' }).expect(201)).body.id;
    await http().post(`/api/v1/trm/domains/${ids.customer}/subdomains`).set(architect.auth).send({ name: 'Sales' }).expect(409);
    // The same sub-domain name can exist in another domain.
    ids.financeSales = (await http().post(`/api/v1/trm/domains/${ids.finance}/subdomains`).set(architect.auth).send({ name: 'Sales' }).expect(201)).body.id;
    await http().post('/api/v1/trm/domains/00000000-0000-4000-8000-000000000000/subdomains').set(architect.auth).send({ name: 'X' }).expect(404);
    await http().post('/api/v1/trm/domains').set(architect.auth).send({ name: '' }).expect(400);
  });

  it('are renamed and deactivated with the version, and audited', async () => {
    const renamed = await http().patch(`/api/v1/trm/subdomains/${ids.financeSales}`).set(architect.auth).send({ name: 'Collections', version: 1 }).expect(200);
    expect(renamed.body).toMatchObject({ name: 'Collections', version: 2 });
    await http().patch(`/api/v1/trm/subdomains/${ids.financeSales}`).set(architect.auth).send({ active: false, version: 1 }).expect(409);
    await http().patch(`/api/v1/trm/subdomains/${ids.financeSales}`).set(architect.auth).send({ active: false, version: 2 }).expect(200);
    await http().patch(`/api/v1/trm/domains/${ids.finance}`).set(architect.auth).send({ name: 'Finance & Accounting', version: 1 }).expect(200);
    await http().patch('/api/v1/trm/domains/00000000-0000-4000-8000-000000000000').set(architect.auth).send({ version: 1 }).expect(404);
    await http().patch('/api/v1/trm/subdomains/00000000-0000-4000-8000-000000000000').set(architect.auth).send({ version: 1 }).expect(404);
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.subdomain.updated', resourceId: ids.financeSales }, { orderBy: { occurredAt: 'asc' } });
    expect(audit.changes).toEqual({ before: { name: 'Sales', active: true }, after: { name: 'Collections', active: true } });
  });

  it('place applications in several sub-domains, refusing unknown or inactive ones', async () => {
    const url = `/api/v1/trm/applications/${id.appCrm}/subdomains`;
    await http().put(url).set(viewer.auth).send({ subdomainIds: [ids.sales] }).expect(403);
    await http().put(url).set(architect.auth).send({ subdomainIds: ['00000000-0000-4000-8000-000000000000'] }).expect(422);
    await http().put(url).set(architect.auth).send({ subdomainIds: [ids.financeSales] }).expect(422); // inactive
    await http().put(url).set(architect.auth).send({ subdomainIds: [ids.sales, ids.sales] }).expect(400);
    await http().put('/api/v1/trm/applications/00000000-0000-4000-8000-000000000000/subdomains').set(architect.auth).send({ subdomainIds: [] }).expect(404);

    const crm = (await http().put(url).set(architect.auth).send({ subdomainIds: [ids.sales, ids.service] }).expect(200)).body;
    expect(crm.subdomains).toEqual([
      { id: ids.sales, name: 'Sales', domain: { id: ids.customer, name: 'Customer' } },
      { id: ids.service, name: 'Service', domain: { id: ids.customer, name: 'Customer' } },
    ]);
    expect(crm.canSetDomains).toBe(true);
    await http().put(`/api/v1/trm/applications/${id.appBilling}/subdomains`).set(architect.auth).send({ subdomainIds: [ids.billing] }).expect(200);
    const changed = await http().put(url).set(architect.auth).send({ subdomainIds: [ids.sales] }).expect(200);
    expect(names(changed.body.subdomains)).toEqual(['Sales']);
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.application.subdomains-set', resourceId: id.appCrm }, { orderBy: { occurredAt: 'desc' } });
    expect(audit.changes).toEqual({ before: { subdomains: ['Customer / Sales', 'Customer / Service'] }, after: { subdomains: ['Customer / Sales'] } });

    expect((await get(viewer, `/trm/applications/${id.appCrm}`)).body.canSetDomains).toBe(false);
    expect((await get(vendor, `/trm/applications/${id.appCrm}`)).body.canSetDomains).toBe(false);
    // A vendor whose role holds the domain permission may place their application.
    expect((await get(vendorDomains, `/trm/applications/${id.appCrm}`)).body.canSetDomains).toBe(true);
    await http().put(`/api/v1/trm/applications/${id.appCrm}/subdomains`).set(vendorDomains.auth).send({ subdomainIds: [ids.sales] }).expect(200);
    // ...but only within the role's scope.
    await http().put(`/api/v1/trm/applications/${id.appBilling}/subdomains`).set(vendorDomains.auth).send({ subdomainIds: [] }).expect(403);
  });

  it('are listed with how many of your applications each sub-domain holds', async () => {
    const list = (await get(architect, '/trm/domains')).body.items;
    expect(list.map((d: { name: string }) => d.name)).toEqual(['Customer', 'Finance & Accounting']);
    expect(list[0].subdomains.map((s: { name: string; applicationCount: number }) => [s.name, s.applicationCount])).toEqual([
      ['Sales', 1],
      ['Service', 0],
    ]);
    const asOwner = (await get(ownerTeam, '/trm/domains')).body.items;
    expect(asOwner[1].subdomains.find((s: { name: string }) => s.name === 'Billing').applicationCount).toBe(0); // Billing is not theirs
    await get(nobody, '/trm/domains', 403);
  });
});

describe('Landscape and technology views', () => {
  it('lists every visible application with what the views colour and group by', async () => {
    const all = (await get(architect, '/trm/landscape')).body.applications;
    expect(names(all)).toEqual(['Billing', 'CRM', 'HR Portal', 'Twin', 'Twin']);
    const crm = all[1];
    expect(crm).toMatchObject({ installStatus: 'In Production', capabilityId: id.capIdentity, capabilityMismatch: false, timeRating: null, plannedGoLive: null });
    expect(crm.subdomainIds).toHaveLength(1);

    const domains = (await get(architect, '/trm/domains')).body.items;
    expect(names((await get(architect, `/trm/landscape?domainId=${domains[1].id}`)).body.applications)).toEqual(['Billing']);
    expect(names((await get(architect, '/trm/landscape?q=hr')).body.applications)).toEqual(['HR Portal']);
    const portfolio = (await http().post('/api/v1/portfolios').set(admin.auth).send({ name: 'Landscape portfolio' }).expect(201)).body;
    await http().put(`/api/v1/trm/applications/${id.appHr}/portfolios`).set(admin.auth).send({ portfolioIds: [portfolio.id] }).expect(200);
    expect(names((await get(architect, `/trm/landscape?portfolioId=${portfolio.id}`)).body.applications)).toEqual(['HR Portal']);
    expect(names((await get(ownerTeam, `/trm/landscape?portfolioId=${portfolio.id}`)).body.applications)).toEqual([]);
    expect(names((await get(ownerTeam, '/trm/landscape')).body.applications)).toEqual(['CRM']);
    await get(nobody, '/trm/landscape', 403);
  });

  it('starts with the 10 researched layers and lists categories that have no layer yet', async () => {
    const layers = (await get(architect, '/trm/layers')).body;
    expect(layers.layers.map((l: { name: string }) => l.name)).toEqual([
      'Channels & Presentation',
      'Business Applications',
      'Integration & APIs',
      'Data & Analytics',
      'Application Platform',
      'Infrastructure & Hosting',
      'Network & Connectivity',
      'Security & Identity',
      'Management & Operations',
      'Engineering & Delivery',
    ]);
    expect(layers.unmappedCategories).toEqual(['Database']);
    expect(layers.mappings).toEqual([]);
  });

  it('maps product-standard categories to layers and shows standards per layer with their use', async () => {
    const layers = (await get(architect, '/trm/layers')).body.layers;
    const data = layers.find((l: { name: string }) => l.name === 'Data & Analytics');
    await http().put('/api/v1/trm/layer-mappings').set(viewer.auth).send({ standardCategory: 'Database', layerId: data.id }).expect(403);
    await http().put('/api/v1/trm/layer-mappings').set(architect.auth).send({ standardCategory: 'Database', layerId: '00000000-0000-4000-8000-000000000000' }).expect(422);
    const mapped = (await http().put('/api/v1/trm/layer-mappings').set(architect.auth).send({ standardCategory: 'Database', layerId: data.id }).expect(200)).body;
    expect(mapped).toMatchObject({ mappings: [{ standardCategory: 'Database', layerId: data.id }], unmappedCategories: [] });

    const view = (await get(architect, '/trm/technology')).body;
    expect(view.layers).toHaveLength(10);
    const postgres = view.standards.find((s: { name: string }) => s.name === 'PostgreSQL 15');
    expect(postgres).toMatchObject({ status: 'Standard', standardCategory: 'Database', layerId: data.id, modelCount: 1, applicationCount: 1 });
    const usage = (await get(architect, `/trm/technology/standards/${id.stdPostgres}`)).body;
    expect(usage.models).toEqual([{ id: expect.any(String), name: 'PostgreSQL 15', productVersion: '15', applications: [{ id: id.appCrm, name: 'CRM' }] }]);

    // Scoped: only the owner's standards, and only their applications.
    expect(names((await get(ownerTeam, '/trm/technology')).body.standards)).toEqual(['PostgreSQL 15']);
    await get(ownerTeam, `/trm/technology/standards/${id.stdOracle}`, 404);

    // Moving the mapping to another layer, then removing it.
    const security = layers.find((l: { name: string }) => l.name === 'Security & Identity');
    await http().put('/api/v1/trm/layer-mappings').set(architect.auth).send({ standardCategory: 'Database', layerId: security.id }).expect(200);
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.layer-mapping.set', resourceId: 'Database' }, { orderBy: { occurredAt: 'desc' } });
    expect(audit.changes).toEqual({ before: { layer: 'Data & Analytics' }, after: { layer: 'Security & Identity' } });
    const removed = (await http().put('/api/v1/trm/layer-mappings').set(architect.auth).send({ standardCategory: 'Database', layerId: null }).expect(200)).body;
    expect(removed.unmappedCategories).toEqual(['Database']);
    await http().put('/api/v1/trm/layer-mappings').set(architect.auth).send({ standardCategory: 'Nothing mapped', layerId: null }).expect(200);
  });

  it('counts standards without models, models nobody runs and applications without a name', async () => {
    const em = t.orm.em.fork();
    const sn = (label: string) => ({ snSysId: `${label}${Date.now()}`.slice(0, 32), source: {}, contentHash: 'x'.repeat(64) });
    const empty = em.create(TrmProductStandard, { ...sn('std-empty-'), name: 'Empty standard' });
    const idle = em.create(TrmProductStandard, { ...sn('std-idle-'), name: 'Idle standard' });
    const idleModel = em.create(TrmSoftwareModel, { ...sn('model-idle-'), name: 'Idle model', productStandard: idle });
    em.create(TrmSoftwareModel, { ...sn('model-unused-'), name: 'Unused model', productStandard: idle });
    const unnamed = em.create(TrmApplication, { ...sn('app-unnamed-'), name: null, rpo: '4 hours' });
    const bare = em.create(TrmApplication, { ...sn('app-bare-'), name: 'Bare' });
    const rtoOnly = em.create(TrmApplication, { ...sn('app-rto-'), name: 'RTO only', rto: '1 hour' });
    const alsoUnnamed = em.create(TrmApplication, { ...sn('app-unnamed2-'), name: null });
    const postgresUse = await em.findOneOrFail(TrmServiceSoftware, { softwareModel: { productStandard: id.stdPostgres } });
    em.create(TrmApplicationService, { application: unnamed, service: postgresUse.service, linkSource: 'ba_as_sm' });
    const nameless = em.create(TrmService, { ...sn('svc-nameless-'), kind: 'application', name: null });
    const other = em.create(TrmService, { ...sn('svc-other-'), kind: 'application', name: 'Another' });
    em.create(TrmApplicationService, { application: unnamed, service: nameless, linkSource: 'ba_as_sm' });
    em.create(TrmApplicationService, { application: unnamed, service: other, linkSource: 'ba_as_sm' });
    em.create(TrmApplicationService, { application: alsoUnnamed, service: postgresUse.service, linkSource: 'ba_as_sm' });
    // A service running the idle model, but linked to no application.
    const orphan = em.create(TrmService, { ...sn('svc-orphan-'), kind: 'application', name: 'Orphan' });
    em.create(TrmServiceSoftware, { snSysId: `use-orphan-${Date.now()}`.slice(0, 32), service: orphan, softwareModel: idleModel });
    await em.flush();

    // What a SAD takes from TRM: no capability, half-known recovery times, unnamed services last.
    const forSad = (await loadSadTrm(em, unnamed.id))!.values;
    expect(forSad).toMatchObject({ name: null, capability: null, rpoRto: '4 hours / —' });
    expect((forSad.environment as { name: string | null }[]).map((s) => s.name)).toEqual(['Another', 'CRM Prod', null]);
    expect((await loadSadTrm(em, bare.id))!.values.rpoRto).toBeNull();
    expect((await loadSadTrm(em, rtoOnly.id))!.values.rpoRto).toBe('— / 1 hour');

    // An application without capability or name, with unnamed services, still shows.
    const detail = (await get(architect, `/trm/applications/${unnamed.id}`)).body;
    expect(detail.capability.path).toEqual([]);
    expect(detail.services.map((s: { name: string | null }) => s.name)).toEqual([null, 'Another', 'CRM Prod']);

    const view = (await get(architect, '/trm/technology')).body.standards as { name: string; modelCount: number; applicationCount: number }[];
    expect(view.find((s) => s.name === 'Empty standard')).toMatchObject({ modelCount: 0, applicationCount: 0 });
    expect(view.find((s) => s.name === 'Idle standard')).toMatchObject({ modelCount: 2, applicationCount: 0 });
    expect((await get(architect, `/trm/technology/standards/${empty.id}`)).body.models).toEqual([]);
    expect((await get(architect, `/trm/technology/standards/${idle.id}`)).body.models.map((m: { applications: unknown[] }) => m.applications)).toEqual([[], []]);
    // Unnamed applications sort first.
    expect((await get(architect, `/trm/technology/standards/${id.stdPostgres}`)).body.models[0].applications.map((a: { name: string | null }) => a.name)).toEqual([null, null, 'CRM']);
    // A scoped viewer counts only their own applications on a shared service.
    expect((await get(ownerTeam, '/trm/technology')).body.standards.find((s: { name: string }) => s.name === 'PostgreSQL 15')).toMatchObject({ applicationCount: 1 });
    // A scoped viewer's layer list counts only the categories of their own standards.
    expect((await get(ownerTeam, '/trm/layers')).body.unmappedCategories).toEqual(['Database']);

    await em.nativeDelete(TrmApplication, { id: { $in: [unnamed.id, bare.id, rtoOnly.id, alsoUnnamed.id] } });
    await em.nativeDelete(TrmService, { id: { $in: [nameless.id, other.id, orphan.id] } });
    await em.nativeDelete(TrmSoftwareModel, { productStandard: idle.id });
    await em.nativeDelete(TrmProductStandard, { id: { $in: [empty.id, idle.id] } });
  });

  it('adds, renames, moves and deactivates layers; inactive layers drop out of the view', async () => {
    await http().post('/api/v1/trm/layers').set(viewer.auth).send({ name: 'Quantum' }).expect(403);
    const added = (await http().post('/api/v1/trm/layers').set(architect.auth).send({ name: 'Quantum' }).expect(201)).body;
    expect(added).toMatchObject({ name: 'Quantum', position: 11, active: true });
    await http().post('/api/v1/trm/layers').set(architect.auth).send({ name: 'Quantum' }).expect(409);
    const moved = (await http().patch(`/api/v1/trm/layers/${added.id}`).set(architect.auth).send({ name: 'Emerging tech', position: 0, version: 1 }).expect(400));
    expect(moved.status).toBe(400);
    const renamed = (await http().patch(`/api/v1/trm/layers/${added.id}`).set(architect.auth).send({ name: 'Emerging tech', position: 12, version: 1 }).expect(200)).body;
    expect(renamed).toMatchObject({ name: 'Emerging tech', position: 12, version: 2 });
    await http().patch(`/api/v1/trm/layers/${added.id}`).set(architect.auth).send({ active: false, version: 1 }).expect(409);

    await http().put('/api/v1/trm/layer-mappings').set(architect.auth).send({ standardCategory: 'Database', layerId: added.id }).expect(200);
    expect((await get(architect, '/trm/technology')).body.standards.find((s: { name: string }) => s.name === 'Oracle 11g').layerId).toBe(added.id);
    await http().patch(`/api/v1/trm/layers/${added.id}`).set(architect.auth).send({ active: false, version: 2 }).expect(200);
    const view = (await get(architect, '/trm/technology')).body;
    expect(view.layers.map((l: { id: string }) => l.id)).not.toContain(added.id);
    expect(view.standards.find((s: { name: string }) => s.name === 'Oracle 11g').layerId).toBeNull();
    await http().patch('/api/v1/trm/layers/00000000-0000-4000-8000-000000000000').set(architect.auth).send({ version: 1 }).expect(404);
  });
});

describe('EA roadmap', () => {
  let initiative: { id: string; version: number };
  const body = () => ({
    name: 'Modernise CRM',
    description: 'Move customer management to a new platform',
    rationale: 'Faster onboarding',
    startDate: '2027-01-01',
    endDate: '2028-06-30',
    status: 'proposed',
    ownerId: architect.id,
    estimatedCost: '1500000.00',
    capabilityIds: [id.capOnboarding],
    actions: [
      { action: 'introduce', plannedApplicationName: 'New CRM' },
      { action: 'enhance', applicationId: id.appCrm },
      { action: 'replace', applicationId: id.appBilling, replacementPlannedName: 'New Billing' },
      { action: 'retire', applicationId: id.appHr },
    ],
  });

  it('is created by enterprise architects, with planned applications by name', async () => {
    await http().post('/api/v1/trm/initiatives').set(viewer.auth).send(body()).expect(403);
    const created = (await http().post('/api/v1/trm/initiatives').set(architect.auth).send(body()).expect(201)).body;
    initiative = { id: created.id, version: created.version };
    expect(created).toMatchObject({
      name: 'Modernise CRM',
      status: 'proposed',
      startDate: '2027-01-01',
      endDate: '2028-06-30',
      owner: { id: architect.id },
      estimatedCost: '1500000.00',
      capabilities: [{ id: id.capOnboarding, name: 'Onboarding' }],
      restricted: [],
      canEdit: true,
    });
    expect(created.actions.map((a: { action: string }) => a.action)).toEqual(['introduce', 'enhance', 'replace', 'retire']);
    expect(created.actions[0]).toMatchObject({ application: null, plannedApplication: { name: 'New CRM', linkedApplication: null } });
    expect(created.actions[2]).toMatchObject({ application: { name: 'Billing' }, replacementPlanned: { name: 'New Billing' } });
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.initiative.created', resourceId: created.id });
    expect(audit.changes?.after).toMatchObject({ name: 'Modernise CRM', estimatedCost: '1500000.00' });
  });

  it('lists an initiative\'s capabilities by name, unnamed ones first', async () => {
    const em = t.orm.em.fork();
    const unnamed = em.create(TrmCapability, { snSysId: `cap-unnamed-${Date.now()}`.slice(0, 32), source: {}, contentHash: 'x'.repeat(64), name: null });
    await em.flush();
    const two = (await http().post('/api/v1/trm/initiatives').set(architect.auth).send({ ...body(), name: 'Two capabilities', capabilityIds: [id.capOnboarding, unnamed.id, id.capCustomer], actions: [] }).expect(201)).body;
    expect(two.capabilities.map((c: { name: string | null }) => c.name)).toEqual([null, 'Customer', 'Onboarding']);
    await em.nativeDelete(TrmInitiativeCapability, { initiative: two.id });
    await em.nativeDelete(TrmInitiative, { id: two.id });
    await em.nativeDelete(TrmCapability, { id: unnamed.id });
  });

  it('refuses inconsistent initiatives', async () => {
    const send = (changes: Record<string, unknown>) => http().post('/api/v1/trm/initiatives').set(architect.auth).send({ ...body(), ...changes });
    await send({ endDate: '2026-12-31' }).expect(400);
    await send({ actions: [{ action: 'retire' }] }).expect(400);
    await send({ actions: [{ action: 'retire', applicationId: id.appHr, plannedApplicationName: 'X' }] }).expect(400);
    await send({ actions: [{ action: 'replace', applicationId: id.appHr }] }).expect(400);
    await send({ actions: [{ action: 'retire', applicationId: id.appHr, replacementPlannedName: 'Y' }] }).expect(400);
    await send({ actions: [{ action: 'replace', applicationId: id.appHr, replacementApplicationId: id.appHr }] }).expect(400);
    await send({ estimatedCost: '12.345' }).expect(400);
    await send({ status: 'done' }).expect(400);
    await send({ actions: [{ action: 'retire', applicationId: '00000000-0000-4000-8000-000000000000' }] }).expect(422);
    await send({ capabilityIds: ['00000000-0000-4000-8000-000000000000'] }).expect(422);
    // The owner's role must allow acting for staff (vendors and TRM viewers do not).
    await send({ ownerId: vendor.id }).expect(422);
    await send({ ownerId: viewer.id }).expect(422);
  });

  it('hides the cost and owner from roles without that access; vendors see it only with the roadmap permission', async () => {
    const asViewer = (await get(viewer, `/trm/initiatives/${initiative.id}`)).body;
    expect(asViewer).toMatchObject({ estimatedCost: null, restricted: ['estimatedCost'], canEdit: false });
    expect(asViewer.owner).toMatchObject({ id: architect.id });
    expect((await get(productManager, `/trm/initiatives/${initiative.id}`)).body.estimatedCost).toBeNull();
    // The application owner team role includes the roadmap: so does a vendor holding it (no cost, no names).
    expect((await get(vendor, `/trm/initiatives/${initiative.id}`)).body).toMatchObject({ estimatedCost: null, owner: null });
    await get(vendor, '/trm/planned-applications');
    await get(vendorNoRoadmap, '/trm/initiatives', 403);
    await get(vendorNoRoadmap, `/trm/initiatives/${initiative.id}`, 403);
    await get(nobody, '/trm/initiatives', 403);
    await get(architect, '/trm/initiatives/00000000-0000-4000-8000-000000000000', 404);
  });

  it('is updated as a whole with the version, and filtered by status, name and dates', async () => {
    const changed = { ...body(), status: 'approved', actions: body().actions.slice(0, 2), version: initiative.version };
    const updated = (await http().put(`/api/v1/trm/initiatives/${initiative.id}`).set(architect.auth).send(changed).expect(200)).body;
    expect(updated).toMatchObject({ status: 'approved' });
    expect(updated.actions).toHaveLength(2);
    expect(updated.version).toBeGreaterThan(initiative.version);
    await http().put(`/api/v1/trm/initiatives/${initiative.id}`).set(architect.auth).send(changed).expect(409);
    await http()
      .put('/api/v1/trm/initiatives/00000000-0000-4000-8000-000000000000')
      .set(architect.auth)
      .send({ ...changed, version: 1 })
      .expect(404);
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.initiative.updated', resourceId: initiative.id });
    expect((audit.changes!.before as { actions: unknown[] }).actions).toHaveLength(4);

    await http()
      .post('/api/v1/trm/initiatives')
      .set(architect.auth)
      .send({
        ...body(),
        name: 'Retire HR',
        description: null,
        rationale: null,
        status: 'in_progress',
        startDate: '2029-01-01',
        endDate: '2029-12-31',
        ownerId: null,
        estimatedCost: null,
        actions: [{ action: 'introduce', plannedApplicationName: 'new crm' }],
      })
      .expect(201);
    const retireHr = (await get(viewer, '/trm/initiatives?q=retire')).body.items[0];
    const detail = (await get(architect, `/trm/initiatives/${retireHr.id}`)).body;
    expect(detail).toMatchObject({ description: null, rationale: null, owner: null, estimatedCost: null });
    // Replace by an existing application, then back to a planned one.
    const replaced = (
      await http()
        .put(`/api/v1/trm/initiatives/${retireHr.id}`)
        .set(architect.auth)
        .send({ ...body(), name: 'Retire HR', description: null, rationale: null, ownerId: null, estimatedCost: null, status: 'in_progress', startDate: '2029-01-01', endDate: '2029-12-31', version: detail.version, actions: [{ action: 'introduce', plannedApplicationName: 'new crm' }, { action: 'replace', applicationId: id.appHr, replacementApplicationId: id.appCrm }] })
        .expect(200)
    ).body;
    expect(replaced.actions[1]).toMatchObject({ application: { name: 'HR Portal' }, replacementApplication: { name: 'CRM' }, replacementPlanned: null });
    await http()
      .put(`/api/v1/trm/initiatives/${retireHr.id}`)
      .set(architect.auth)
      .send({ ...body(), name: 'Retire HR', description: null, rationale: null, ownerId: null, estimatedCost: null, status: 'in_progress', startDate: '2029-01-01', endDate: '2029-12-31', version: replaced.version, actions: [{ action: 'introduce', plannedApplicationName: 'new crm' }] })
      .expect(200);
    const replaceAudit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.initiative.updated', resourceId: retireHr.id }, { orderBy: { occurredAt: 'desc' } });
    expect((replaceAudit.changes!.before as { ownerId: unknown; actions: unknown[] }).actions[1]).toEqual({ action: 'replace', applicationId: id.appHr, replacementApplicationId: id.appCrm });
    const list = (await get(viewer, '/trm/initiatives')).body;
    expect(list.items.map((i: { name: string }) => i.name)).toEqual(['Modernise CRM', 'Retire HR']);
    expect(list.items[0]).toMatchObject({ owner: { id: architect.id }, actionCounts: { introduce: 1, enhance: 1, replace: 0, retire: 0 } });
    expect(names((await get(viewer, '/trm/initiatives?status=in_progress')).body.items)).toEqual(['Retire HR']);
    expect(names((await get(viewer, '/trm/initiatives?q=crm')).body.items)).toEqual(['Modernise CRM']);
    expect(names((await get(viewer, '/trm/initiatives?from=2028-07-01')).body.items)).toEqual(['Retire HR']);
    expect(names((await get(viewer, '/trm/initiatives?to=2028-12-31')).body.items)).toEqual(['Modernise CRM']);
  });

  it('keeps one planned application per name and links it to the real application later', async () => {
    const planned = (await get(viewer, '/trm/planned-applications')).body.items;
    expect(planned.map((p: { name: string; initiatives: { name: string }[] }) => [p.name, p.initiatives.map((i) => i.name)])).toEqual([
      ['New Billing', []],
      ['New CRM', ['Modernise CRM', 'Retire HR']],
    ]);
    const newCrm = planned[1];
    await http().put(`/api/v1/trm/planned-applications/${newCrm.id}/link`).set(viewer.auth).send({ applicationId: id.appCrm }).expect(403);
    await http().put(`/api/v1/trm/planned-applications/${newCrm.id}/link`).set(architect.auth).send({ applicationId: '00000000-0000-4000-8000-000000000000' }).expect(422);
    await http().put('/api/v1/trm/planned-applications/00000000-0000-4000-8000-000000000000/link').set(architect.auth).send({ applicationId: null }).expect(404);
    const linked = (await http().put(`/api/v1/trm/planned-applications/${newCrm.id}/link`).set(architect.auth).send({ applicationId: id.appCrm }).expect(200)).body.items;
    expect(linked[1].linkedApplication).toEqual({ id: id.appCrm, name: 'CRM' });
    expect((await get(viewer, `/trm/initiatives/${initiative.id}`)).body.actions[0].plannedApplication.linkedApplication).toEqual({ id: id.appCrm, name: 'CRM' });
    const unlinked = (await http().put(`/api/v1/trm/planned-applications/${newCrm.id}/link`).set(architect.auth).send({ applicationId: null }).expect(200)).body.items;
    expect(unlinked[1].linkedApplication).toBeNull();
  });
});
