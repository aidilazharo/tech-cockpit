import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { TrmApplication, TrmCapability, TrmService } from '../../src/modules/trm/trm.entities.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { resetTrm, SYS, trmExports } from './support/trm-fixtures.js';

let t: TestApp;
let admin: Actor;
let architect: Actor;
let viewer: Actor;
let ownerTeam: Actor;
let portfolioLead: Actor;
let vendor: Actor;
let vendorGlobal: Actor;
let vendorNarrow: Actor;
let seededVendor: Actor;
let noRawFields: Actor;
let billingOnly: Actor;
let productManager: Actor;
let nobody: Actor;
const id: Record<string, string> = {};
const portfolio: Record<string, { id: string; version: number }> = {};

const get = (actor: Actor, path: string, status = 200) => t.http().get(`/api/v1${path}`).set(actor.auth).expect(status);
const names = (items: { name: string | null }[]) => items.map((item) => item.name);
/** Fields of an application hidden from the caller, as the API lists them */
const COSTS = ['licenceCost', 'internalSupportCost', 'externalSupportCost', 'infraOnPremisesCost', 'infraCloudCost'];
const PEOPLE = ['itApplicationOwner', 'applicationLead', 'applicationManager'];

beforeAll(async () => {
  t = await createTestApp();
  await resetTrm(t.orm);
  admin = await createActor(t.orm, [{ code: 'system-admin' }], { label: 'trm-admin' });

  // Load the exports the way the CLI does.
  const run = (await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
  const expected: Record<string, number> = {};
  for (const [file, records] of Object.entries(trmExports())) {
    expected[file] = records.length;
    await t.http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(admin.auth).send({ file, records }).expect(200);
  }
  await t.http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected }).expect(200);

  const em = t.orm.em.fork();
  for (const [key, sysId] of Object.entries(SYS)) {
    const record =
      (await em.findOne(TrmApplication, { snSysId: sysId })) ?? (await em.findOne(TrmService, { snSysId: sysId })) ?? (await em.findOne(TrmCapability, { snSysId: sysId }));
    if (record) id[key] = record.id;
  }

  for (const name of ['Retail', 'Group']) {
    const body = (await t.http().post('/api/v1/portfolios').set(admin.auth).send({ name }).expect(201)).body;
    portfolio[name] = { id: body.id, version: body.version };
  }
  await t.http().put(`/api/v1/trm/applications/${id.appBilling}/portfolios`).set(admin.auth).send({ portfolioIds: [portfolio.Retail.id] }).expect(200);
  await t.http().put(`/api/v1/trm/applications/${id.appHr}/portfolios`).set(admin.auth).send({ portfolioIds: [portfolio.Retail.id, portfolio.Group.id] }).expect(200);

  architect = await createActor(t.orm, [{ code: 'enterprise-architect' }], { label: 'trm-ea' });
  viewer = await createActor(t.orm, [{ code: 'trm-viewer' }], { label: 'trm-viewer' });
  ownerTeam = await createActor(t.orm, [{ code: 'application-owner-team', scopeType: 'application', scopeId: id.appCrm }], { label: 'trm-owner' });
  portfolioLead = await createActor(t.orm, [{ code: 'portfolio-lead', scopeType: 'portfolio', scopeId: portfolio.Retail.id }], { label: 'trm-lead' });
  vendor = await createActor(t.orm, [{ code: 'application-owner-team', scopeType: 'application', scopeId: id.appCrm }], { label: 'trm-vendor', isExternal: true });
  vendorGlobal = await createActor(t.orm, [{ code: 'trm-viewer' }], { label: 'trm-vendor-global', isExternal: true });
  vendorNarrow = await createActor(t.orm, [{ code: await createRole(t.orm, ['trm:application:read']), scopeType: 'application', scopeId: id.appCrm }], { label: 'trm-vendor-narrow', isExternal: true });
  seededVendor = await createActor(t.orm, [{ code: 'vendor' }], { label: 'trm-vendor-seeded', isExternal: true });
  noRawFields = await createActor(t.orm, [{ code: await createRole(t.orm, ['trm:application:read'], { personal: 'all' }) }], { label: 'trm-noraw' });
  billingOnly = await createActor(t.orm, [{ code: 'trm-viewer', scopeType: 'application', scopeId: id.appBilling }], { label: 'trm-billing-only' });
  productManager = await createActor(t.orm, [{ code: 'product-manager' }], { label: 'trm-pm' });
  nobody = await createActor(t.orm, [], { label: 'trm-nobody' });
});

afterAll(async () => {
  await t.close();
});

describe('TRM: browsing (enterprise architect)', () => {
  it('lists applications with search and filters', async () => {
    const all = await get(architect, '/trm/applications');
    expect(all.body.total).toBe(5);
    expect(names(all.body.items)).toEqual(['Billing', 'CRM', 'HR Portal', 'Twin', 'Twin']);
    const billing = all.body.items[0];
    expect(billing).toMatchObject({ installStatus: 'Implementing', capability: { name: 'Payments', level: 2 }, capabilityMismatch: false });
    expect(billing.portfolios).toEqual([{ id: portfolio.Retail.id, name: 'Retail' }]);

    expect(names((await get(architect, '/trm/applications?q=crm')).body.items)).toEqual(['CRM']);
    expect(names((await get(architect, '/trm/applications?installStatus=Retired')).body.items)).toEqual(['HR Portal']);
    expect(names((await get(architect, `/trm/applications?capabilityId=${id.capCustomer}`)).body.items)).toEqual(['CRM', 'HR Portal']);
    expect(names((await get(architect, `/trm/applications?portfolioId=${portfolio.Group.id}`)).body.items)).toEqual(['HR Portal']);
    expect((await get(architect, '/trm/applications?timeRating=none')).body.total).toBe(5);
    expect((await get(architect, '/trm/applications?missing=true')).body.total).toBe(0);
    expect((await get(architect, '/trm/applications?pageSize=2&page=2')).body.items).toHaveLength(2);
    await get(architect, '/trm/applications?timeRating=great', 400);
  });

  it('filters every list', async () => {
    expect((await get(architect, '/trm/applications?criticalityRating=2%20-%20High&businessUnit=Group%20IT')).body.total).toBe(5);
    expect((await get(architect, '/trm/applications?timeRating=tolerate')).body.total).toBe(0);
    expect((await get(architect, '/trm/applications?missing=false')).body.total).toBe(5);
    expect((await get(architect, '/trm/services?missing=false')).body.total).toBe(5);
    expect(names((await get(architect, '/trm/software-models?missing=false&q=nginx')).body.items)).toEqual(['Nginx 1.24']);
    expect(names((await get(architect, '/trm/product-standards?q=oracle&missing=false')).body.items)).toEqual(['Oracle 11g']);
    expect(names((await get(architect, '/trm/servers?q=bil&missing=false')).body.items)).toEqual(['SRV-BIL-01']);
    for (const list of ['services', 'software-models', 'product-standards', 'servers']) expect((await get(architect, `/trm/${list}?missing=true`)).body.total).toBe(0);
    expect(names((await get(portfolioLead, `/trm/applications?portfolioId=${portfolio.Group.id}`)).body.items)).toEqual(['HR Portal']);
    const nginx = (await get(architect, '/trm/software-models?q=nginx')).body.items[0];
    expect((await get(architect, `/trm/software-models/${nginx.id}`)).body).toMatchObject({ productStandard: null, productStandardName: 'Nginx', services: [{ name: 'CRM DR' }] });
  });

  it('offers filter values', async () => {
    expect((await get(architect, '/trm/facets')).body).toEqual({
      installStatuses: ['Implementing', 'In Production', 'Retired'],
      criticalityRatings: ['2 - High'],
      businessUnits: ['Group IT'],
      environments: ['Disaster Recovery', 'Production', 'Test'],
      productStandardStatuses: ['Restricted', 'Standard'],
    });
  });

  it('shows an application with costs, people, capability path, services and software', async () => {
    const crm = (await get(architect, `/trm/applications/${id.appCrm}`)).body;
    expect(crm).toMatchObject({
      name: 'CRM',
      recoveryTimeCapability: '01:30',
      people: { itApplicationOwner: 'Person Owner', applicationLead: 'Person Lead', applicationManager: 'Person Manager' },
      costs: { licence: '136.22', infraCloud: '10.00', internalSupport: null },
      capability: { mismatch: false, fields: { group: 'Customer', family: 'Onboarding', category: 'Identity check' } },
      restricted: [],
      canEdit: true,
      canSetPortfolios: false,
      trm: { timeRating: null, functionalFit: null, plannedGoLive: null },
    });
    expect(names(crm.capability.path)).toEqual(['Customer', 'Onboarding', 'Identity check']);
    expect(names(crm.services)).toEqual(['CRM DR', 'CRM Prod', 'CRM Test']);
    expect(crm.services[2]).toMatchObject({ name: 'CRM Test', servers: [], software: [], businessServices: [{ name: 'Sales' }] });
    expect(crm.services[0].software).toEqual([expect.objectContaining({ name: 'Nginx 1.24', productStandard: null })]);
    const prod = crm.services[1];
    expect(prod).toMatchObject({ kind: 'application', environment: 'Production', businessServices: [{ name: 'Sales' }], servers: [{ name: 'SRV-CRM-01' }] });
    expect(prod.software).toEqual([
      expect.objectContaining({ name: 'PostgreSQL 15', productVersion: '15', fullVersion: '15.4', primaryModel: true, productStandard: expect.objectContaining({ name: 'PostgreSQL 15', status: 'Standard' }) }),
    ]);
    expect(crm.source).toMatchObject({ it_application_owner: 'Person Owner', u_annual_license_cost_k_usd: '136.22', sys_created_by: 'user001' });

    const hr = (await get(architect, `/trm/applications/${id.appHr}`)).body;
    expect(hr.capability.mismatch).toBe(true);
    expect(names(hr.capability.path)).toEqual(['Customer', 'Onboarding']);
  });

  it('shows services, capabilities, software models, product standards and servers with their links', async () => {
    const services = (await get(architect, '/trm/services')).body;
    expect(names(services.items)).toEqual(['Billing Prod', 'CRM DR', 'CRM Prod', 'CRM Test', 'Sales']);
    expect(names((await get(architect, '/trm/services?kind=business')).body.items)).toEqual(['Sales']);
    expect(names((await get(architect, '/trm/services?environment=Production&q=crm')).body.items)).toEqual(['CRM Prod']);

    const prod = (await get(architect, `/trm/services/${id.svcCrmProd}`)).body;
    expect(prod).toMatchObject({ kind: 'application', ownedBy: 'Person Service Owner', applications: [{ name: 'CRM' }], businessServices: [{ name: 'Sales' }], servers: [{ name: 'SRV-CRM-01' }] });
    expect((await get(architect, `/trm/services/${id.svcSales}`)).body).toMatchObject({ kind: 'business', applicationServices: [{ name: 'CRM Prod' }, { name: 'CRM Test' }], applications: [] });

    const capabilities = (await get(architect, '/trm/capabilities')).body.items;
    expect(capabilities.find((c: { name: string }) => c.name === 'Identity check')).toMatchObject({ level: 3, parentId: id.capOnboarding, applicationCount: 1 });
    const customer = (await get(architect, `/trm/capabilities/${id.capCustomer}`)).body;
    expect(customer).toMatchObject({ level: 1, path: [{ name: 'Customer' }], children: [{ name: 'Onboarding' }] });
    expect(names(customer.applications)).toEqual(['CRM', 'HR Portal']);

    const models = (await get(architect, '/trm/software-models?q=postgres')).body;
    expect(models.items).toEqual([expect.objectContaining({ name: 'PostgreSQL 15', manufacturer: 'PGDG', productStandard: expect.objectContaining({ status: 'Standard' }) })]);
    const model = (await get(architect, `/trm/software-models/${models.items[0].id}`)).body;
    expect(model).toMatchObject({ services: [{ name: 'CRM Prod', fullVersion: '15.4', primaryModel: true }], applications: [{ name: 'CRM' }] });
    expect(model.source).toMatchObject({ name: 'PostgreSQL 15', u_product_standard: 'PostgreSQL 15' });

    const restricted = (await get(architect, '/trm/product-standards?status=Restricted')).body;
    expect(names(restricted.items)).toEqual(['Oracle 11g']);
    expect((await get(architect, `/trm/product-standards/${restricted.items[0].id}`)).body).toMatchObject({ status: 'Restricted', softwareModels: [{ name: 'Oracle 11g' }] });

    const servers = (await get(architect, '/trm/servers')).body;
    expect(names(servers.items)).toEqual(['SRV-BIL-01', 'SRV-CRM-01', 'SRV-CRM-02']);
    const server = (await get(architect, `/trm/servers/${servers.items[1].id}`)).body;
    expect(server.services).toEqual([{ id: id.svcCrmProd, name: 'CRM Prod', environment: 'Production', applications: [{ id: id.appCrm, name: 'CRM' }] }]);
  });

  it('answers 404 for records that do not exist', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';
    for (const path of ['applications', 'services', 'capabilities', 'software-models', 'product-standards', 'servers']) {
      await get(architect, `/trm/${path}/${missing}`, 404);
    }
  });
});

describe('TRM: who sees what', () => {
  it('hides costs from roles without financial access, and names from roles without personal access', async () => {
    const asViewer = (await get(viewer, `/trm/applications/${id.appCrm}`)).body;
    expect(asViewer.costs).toEqual({ licence: null, internalSupport: null, externalSupport: null, infraOnPremises: null, infraCloud: null });
    expect(asViewer.people.itApplicationOwner).toBe('Person Owner');
    expect(asViewer.restricted).toEqual(COSTS);
    expect(asViewer.source).toMatchObject({ u_annual_license_cost_k_usd: null, it_application_owner: 'Person Owner', name: 'CRM' });
    expect(asViewer.canEdit).toBe(false);

    // System admins see every data class (the seeded role grants "all" for financial, contract and personal).
    const asAdmin = (await get(admin, `/trm/applications/${id.appCrm}`)).body;
    expect(asAdmin).toMatchObject({ restricted: [], canEdit: true, canSetPortfolios: true });
    expect(asAdmin.costs).toMatchObject({ licence: '136.22', infraCloud: '10.00' });
    expect(asAdmin.people.itApplicationOwner).toBe('Person Owner');
    expect(asAdmin.source).toMatchObject({ sys_created_by: 'user001', u_annual_license_cost_k_usd: '136.22' });
  });

  it('limits an application owner team to its application and what links to it', async () => {
    expect(names((await get(ownerTeam, '/trm/applications')).body.items)).toEqual(['CRM']);
    await get(ownerTeam, `/trm/applications/${id.appBilling}`, 404);
    expect(names((await get(ownerTeam, '/trm/services')).body.items)).toEqual(['CRM DR', 'CRM Prod', 'CRM Test', 'Sales']);
    expect(names((await get(ownerTeam, '/trm/servers')).body.items)).toEqual(['SRV-CRM-01', 'SRV-CRM-02']);
    expect(names((await get(ownerTeam, '/trm/software-models')).body.items)).toEqual(['Nginx 1.24', 'PostgreSQL 15']);
    expect(names((await get(ownerTeam, '/trm/product-standards')).body.items)).toEqual(['PostgreSQL 15']);
    expect(names((await get(ownerTeam, '/trm/capabilities')).body.items)).toEqual(['Customer', 'Identity check', 'Onboarding']);
    expect((await get(ownerTeam, '/trm/facets')).body.installStatuses).toEqual(['In Production']);
    await get(ownerTeam, `/trm/services/${id.svcBillingProd}`, 404);
    await get(ownerTeam, `/trm/capabilities/${id.capFinance}`, 404);
    expect(names((await get(ownerTeam, `/trm/capabilities/${id.capCustomer}`)).body.applications)).toEqual(['CRM']);

    const crm = (await get(ownerTeam, `/trm/applications/${id.appCrm}`)).body;
    expect(crm).toMatchObject({ canEdit: true, restricted: COSTS });
    expect(crm.people.itApplicationOwner).toBe('Person Owner');
  });

  it('limits a portfolio lead to the portfolio, with its costs', async () => {
    expect(names((await get(portfolioLead, '/trm/applications')).body.items)).toEqual(['Billing', 'HR Portal']);
    await get(portfolioLead, `/trm/applications/${id.appCrm}`, 404);
    const billing = (await get(portfolioLead, `/trm/applications/${id.appBilling}`)).body;
    expect(billing).toMatchObject({ costs: { licence: '50.00' }, restricted: [], canEdit: true });
  });

  it('refuses an edit of an application the caller sees but may not change', async () => {
    const editor = await createActor(t.orm, [{ code: 'trm-viewer' }, { code: await createRole(t.orm, ['trm:application:update']), scopeType: 'application', scopeId: id.appBilling }], { label: 'trm-billing-editor' });
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(editor.auth).send({ version: 999, timeRating: 'invest' }).expect(403);
  });

  it("treats vendors like anyone else: their role's scope, data access and permissions decide", async () => {
    // Application owner team on CRM: that application, people's names (personal: scope), editing, the raw fields.
    expect(names((await get(vendor, '/trm/applications')).body.items)).toEqual(['CRM']);
    const crm = (await get(vendor, `/trm/applications/${id.appCrm}`)).body;
    expect(crm).toMatchObject({ restricted: COSTS, canEdit: true });
    expect(crm.costs.licence).toBeNull();
    expect(crm.people.itApplicationOwner).toBe('Person Owner');
    expect(crm.source).toMatchObject({ it_application_owner: 'Person Owner', u_annual_license_cost_k_usd: null });
    expect(crm.services.length).toBe(3);
    // Allowed to edit: only the stale version stops this change.
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(vendor.auth).send({ version: 999, timeRating: 'invest' }).expect(409);
    expect((await get(vendor, '/portfolios')).body.items).toEqual([]); // CRM is in no portfolio

    // A role without names, editing or the raw-fields permission shows none of them.
    const narrow = (await get(vendorNarrow, `/trm/applications/${id.appCrm}`)).body;
    expect(narrow).toMatchObject({ restricted: [...COSTS, ...PEOPLE], canEdit: false, source: null });
    expect((await get(vendorNarrow, `/trm/services/${id.svcCrmProd}`)).body).toMatchObject({ ownedBy: null, source: null });
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(vendorNarrow.auth).send({ version: 999, timeRating: 'invest' }).expect(403);

    // A vendor given a company-wide role sees everything that role covers; the seeded Vendor role gives no TRM access.
    expect((await get(vendorGlobal, '/trm/applications')).body.total).toBeGreaterThan(1);
    expect((await get(vendorGlobal, '/portfolios')).body.items.map((p: { name: string }) => p.name)).toEqual(['Group', 'Retail']);
    await get(seededVendor, '/trm/applications', 403);
  });

  it('shows the raw ServiceNow fields only to roles holding that permission, and scoped portfolio lists follow the applications', async () => {
    expect((await get(viewer, `/trm/applications/${id.appCrm}`)).body.source).not.toBeNull();
    expect((await get(noRawFields, `/trm/applications/${id.appCrm}`)).body.source).toBeNull();
    expect((await get(noRawFields, `/trm/services/${id.svcCrmProd}`)).body.source).toBeNull();
    // A staff role scoped to Billing sees Billing's portfolio only; company-wide viewers see them all.
    expect((await get(portfolioLead, '/portfolios')).body.items.map((p: { name: string }) => p.name)).toEqual(['Group', 'Retail']);
    expect((await get(billingOnly, '/portfolios')).body.items.map((p: { name: string }) => p.name)).toEqual(['Retail']);
  });

  it('refuses people without TRM access, and changes from viewers', async () => {
    await t.http().get('/api/v1/trm/applications').expect(401);
    await get(nobody, '/trm/applications', 403);
    await get(nobody, '/portfolios', 403);
    expect((await get(productManager, '/trm/applications')).body.total).toBe(5);
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(productManager.auth).send({ version: 1, timeRating: 'invest' }).expect(403);
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(viewer.auth).send({ version: 1, timeRating: 'invest' }).expect(403);
  });
});

describe('TRM: editing the TRM-only fields', () => {
  it('saves TIME rating, fit scores and plan dates, audits the change and keeps them through the next sync', async () => {
    const before = (await get(architect, `/trm/applications/${id.appCrm}`)).body;
    const saved = await t
      .http()
      .patch(`/api/v1/trm/applications/${id.appCrm}`)
      .set(architect.auth)
      .send({
        version: before.version,
        timeRating: 'invest',
        timeRationale: 'Strategic platform',
        functionalFit: 4,
        technicalFit: 2,
        plannedGoLive: '2027-01-01',
        plannedRetirement: '2030-12-31',
      })
      .expect(200);
    expect(saved.body.trm).toEqual({
      timeRating: 'invest',
      timeRationale: 'Strategic platform',
      functionalFit: 4,
      technicalFit: 2,
      plannedGoLive: '2027-01-01',
      plannedPhaseOut: null,
      plannedRetirement: '2030-12-31',
      vendorEndOfSupport: null,
    });
    expect(saved.body.version).toBe(before.version + 1);

    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.application.updated', resourceId: id.appCrm });
    expect(audit.changes).toEqual({
      before: { timeRating: null, timeRationale: null, functionalFit: null, technicalFit: null, plannedGoLive: null, plannedRetirement: null },
      after: { timeRating: 'invest', timeRationale: 'Strategic platform', functionalFit: 4, technicalFit: 2, plannedGoLive: '2027-01-01', plannedRetirement: '2030-12-31' },
    });

    // A stale version is refused; nothing changes when nothing differs.
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(architect.auth).send({ version: before.version, technicalFit: 3 }).expect(409);
    const same = await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(architect.auth).send({ version: saved.body.version, timeRating: 'invest' }).expect(200);
    expect(same.body.version).toBe(saved.body.version);

    // The sync never touches TRM-only fields.
    const run = (await t.http().post('/api/v1/trm/sync-runs').set(admin.auth).send({}).expect(201)).body;
    const apps = trmExports().business_application.map((row) => (row.sys_id === SYS.appCrm ? { ...row, install_status: 'Retired' } : row));
    await t.http().put(`/api/v1/trm/sync-runs/${run.id}/records`).set(admin.auth).send({ file: 'business_application', records: apps }).expect(200);
    await t.http().post(`/api/v1/trm/sync-runs/${run.id}/complete`).set(admin.auth).send({ expected: { business_application: 5 } }).expect(200);
    const after = (await get(architect, `/trm/applications/${id.appCrm}`)).body;
    expect(after).toMatchObject({ installStatus: 'Retired', trm: { timeRating: 'invest', functionalFit: 4 } });

    const cleared = await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(architect.auth).send({ version: after.version, timeRating: null, timeRationale: null }).expect(200);
    expect(cleared.body.trm).toMatchObject({ timeRating: null, timeRationale: null, functionalFit: 4 });
  });

  it('rejects values outside the agreed ranges and unknown fields', async () => {
    const url = `/api/v1/trm/applications/${id.appCrm}`;
    await t.http().patch(url).set(architect.auth).send({ version: 1, functionalFit: 6 }).expect(400);
    await t.http().patch(url).set(architect.auth).send({ version: 1, technicalFit: 0 }).expect(400);
    await t.http().patch(url).set(architect.auth).send({ version: 1, plannedGoLive: '2027-13-01' }).expect(400);
    await t.http().patch(url).set(architect.auth).send({ version: 1, timeRating: 'keep' }).expect(400);
    await t.http().patch(url).set(architect.auth).send({ version: 1, timeRationale: 'x'.repeat(2001) }).expect(400);
    await t.http().patch(url).set(architect.auth).send({ version: 1, installStatus: 'Retired' }).expect(400);
    await t.http().patch(url).set(architect.auth).send({ timeRating: 'invest' }).expect(400);
  });

  it('lets owner teams and portfolio leads edit within their scope only', async () => {
    const crm = (await get(ownerTeam, `/trm/applications/${id.appCrm}`)).body;
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(ownerTeam.auth).send({ version: crm.version, functionalFit: 5 }).expect(200);
    await t.http().patch(`/api/v1/trm/applications/${id.appBilling}`).set(ownerTeam.auth).send({ version: 1, functionalFit: 5 }).expect(404);

    const hr = (await get(portfolioLead, `/trm/applications/${id.appHr}`)).body;
    await t.http().patch(`/api/v1/trm/applications/${id.appHr}`).set(portfolioLead.auth).send({ version: hr.version, timeRating: 'eliminate' }).expect(200);
    await t.http().patch(`/api/v1/trm/applications/${id.appCrm}`).set(portfolioLead.auth).send({ version: 1, timeRating: 'eliminate' }).expect(404);
  });
});

describe('Portfolios', () => {
  it('are maintained by system admins', async () => {
    await t.http().post('/api/v1/portfolios').set(architect.auth).send({ name: 'Nope' }).expect(403);
    await t.http().post('/api/v1/portfolios').set(admin.auth).send({ name: 'Retail' }).expect(409);
    await t.http().post('/api/v1/portfolios').set(admin.auth).send({ name: ' ' }).expect(400);
    const created = (await t.http().post('/api/v1/portfolios').set(admin.auth).send({ name: 'Wealth' }).expect(201)).body;
    expect(created).toMatchObject({ name: 'Wealth', active: true, version: 1 });

    const renamed = await t.http().patch(`/api/v1/portfolios/${created.id}`).set(admin.auth).send({ name: 'Wealth Management', version: 1 }).expect(200);
    await t.http().patch(`/api/v1/portfolios/${created.id}`).set(admin.auth).send({ active: false, version: 1 }).expect(409);
    await t.http().patch(`/api/v1/portfolios/${created.id}`).set(admin.auth).send({ active: false, version: renamed.body.version }).expect(200);
    await t.http().patch('/api/v1/portfolios/00000000-0000-4000-8000-000000000000').set(admin.auth).send({ active: false, version: 1 }).expect(404);
    await t.http().patch(`/api/v1/portfolios/${created.id}`).set(architect.auth).send({ active: true, version: 3 }).expect(403);

    const list = (await get(architect, '/portfolios')).body.items;
    expect(list.map((p: { name: string; active: boolean }) => [p.name, p.active])).toEqual([
      ['Group', true],
      ['Retail', true],
      ['Wealth Management', false],
    ]);

    // An inactive portfolio cannot be newly given to an application.
    await t.http().put(`/api/v1/trm/applications/${id.appCrm}/portfolios`).set(admin.auth).send({ portfolioIds: [created.id] }).expect(422);
  });

  it('are set on applications by system admins, replacing the previous set', async () => {
    const url = `/api/v1/trm/applications/${id.appHr}/portfolios`;
    await t.http().put(url).set(architect.auth).send({ portfolioIds: [] }).expect(403);
    await t.http().put(url).set(admin.auth).send({ portfolioIds: ['00000000-0000-4000-8000-000000000000'] }).expect(422);
    await t.http().put(url).set(admin.auth).send({ portfolioIds: [portfolio.Group.id, portfolio.Group.id] }).expect(400);
    await t.http().put('/api/v1/trm/applications/00000000-0000-4000-8000-000000000000/portfolios').set(admin.auth).send({ portfolioIds: [] }).expect(404);

    const set = await t.http().put(url).set(admin.auth).send({ portfolioIds: [portfolio.Group.id] }).expect(200);
    expect(set.body.portfolios).toEqual([{ id: portfolio.Group.id, name: 'Group' }]);
    const audit = await t.orm.em.fork().findOneOrFail(AuditLog, { action: 'trm.application.portfolios-set', resourceId: id.appHr }, { orderBy: { occurredAt: 'desc' } });
    expect(audit.changes).toEqual({ before: { portfolios: ['Group', 'Retail'] }, after: { portfolios: ['Group'] } });
    // The Retail lead no longer sees it.
    await get(portfolioLead, `/trm/applications/${id.appHr}`, 404);
  });
});
