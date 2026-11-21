import { randomUUID } from 'node:crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ApprovalInstance,
  ApprovalRuleSet,
} from '../../src/modules/approvals/approval.entities.js';
import { RoleAssignment } from '../../src/modules/access/role-assignment.entity.js';
import { AuditLog } from '../../src/modules/audit/audit-log.entity.js';
import { Portfolio } from '../../src/modules/portfolios/portfolio.entity.js';
import {
  DIAGRAM_SLOTS,
  emptyContent,
  SLOT_OWNER,
  type DiagramSlot,
} from '../../src/modules/sad/domain/diagrams.js';
import { SAD_TEMPLATE } from '../../src/modules/sad/domain/template.js';
import {
  SadDiagram,
  SadSection,
  SadVersion,
} from '../../src/modules/sad/sad.entities.js';
import {
  isQuestion,
  type Question,
  type TableColumn,
} from '../../src/modules/sad/domain/template-types.js';
import { SadService } from '../../src/modules/sad/sad.service.js';
import {
  TrmApplication,
  TrmApplicationPortfolio,
  TrmServer,
} from '../../src/modules/trm/trm.entities.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';
import { resetTrm, SYS, trmExports } from './support/trm-fixtures.js';

let t: TestApp;
let admin: Actor;
let lead: Actor;
let dev: Actor;
let manager: Actor;
let architect: Actor;
let reviewer: Actor;
let ea: Actor;
let pm: Actor;
let vendor: Actor;
let vendorWithNames: Actor;
let billingLead: Actor;
let billingEditor: Actor;
let draftManager: Actor;
let nobody: Actor;
const app: Record<string, string> = {};
let retentionIds: string[] = [];
let firstVersion = '';
let returnedDraft = '';

const http = () => t.http();
const get = (actor: Actor, path: string, status = 200) =>
  http().get(`/api/v1${path}`).set(actor.auth).expect(status);
const post = (actor: Actor, path: string, body: object = {}, status = 200) =>
  http().post(`/api/v1${path}`).set(actor.auth).send(body).expect(status);
const put = (actor: Actor, path: string, body: object, status = 200) =>
  http().put(`/api/v1${path}`).set(actor.auth).send(body).expect(status);
const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** A valid answer for every question of a section (hidden ones too: saving them is allowed). */
function answersFor(
  sectionKey: string,
  person: { id: string; name: string },
): Record<string, unknown> {
  const section = SAD_TEMPLATE.sections.find((s) => s.key === sectionKey)!;
  const cell = (column: TableColumn): unknown =>
    ({
      text: `${column.label} value`,
      choice: column.options?.[0].value,
      yesno: 'yes',
      number: 1,
      date: '2026-09-30',
      person,
      applications: { items: [] },
      dataObjects: [{ object: 'Policy', attributes: 'policy number' }],
    })[column.type];
  const value = (q: Question): unknown => {
    switch (q.type) {
      case 'text':
        return doc(`${q.label} answer`);
      case 'short':
        return 'Answer';
      case 'choice':
        return { selected: q.options[0].value };
      case 'multi':
        return {
          selected:
            q.key === 'third-party-access' ? ['vpn'] : [q.options[0].value],
        };
      case 'yesno':
        return { answer: 'yes', details: 'Details' };
      case 'number':
        return 30;
      case 'date':
        return '2026-09-30';
      case 'links':
        return [{ label: 'Link', url: 'https://aia.com/doc' }];
      case 'table': {
        const cells = Object.fromEntries(
          q.columns.map((c) => [c.key, cell(c)]),
        );
        return q.fixedRows
          ? q.fixedRows.map((row) => ({ row, cells }))
          : [{ cells }];
      }
      case 'retention':
        return {
          rows: [{ standardId: retentionIds[0], resourceName: 'sql-crm-prod' }],
        };
      case 'trm':
        return q.fallback?.type === 'choice'
          ? { selected: q.fallback.options[0].value }
          : 'From the SAD';
    }
  };
  return Object.fromEntries(
    section.groups
      .flatMap((g) => g.items)
      .filter(isQuestion)
      .filter((q) => !(q.type === 'trm' && q.fallback?.type === 'none'))
      .map((q) => [q.key, { value: value(q) }]),
  );
}

/** A slot's diagrams, each with one box (what counts as drawn). */
function drawn(slot: DiagramSlot) {
  // Solution diagram blocks have a block type; infrastructure boxes a kind and their place (a server in PDC); CI and CD
  // steps a kind and a lane; monitoring blocks a kind.
  const kind = {
    solution: { type: 'part' },
    infrastructure: { type: 'server', parentId: 'primary-dc' },
    'ci-cd': { type: 'step', parentId: 'lane-1' },
    monitoring: { type: 'monitoring' },
  }[slot];
  const lanes =
    slot === 'ci-cd'
      ? [
          {
            id: 'lane-1',
            label: 'Azure DevOps',
            kind: 'lane',
            x: 0,
            y: 0,
            width: 600,
            height: 150,
          },
        ]
      : [];
  const content = emptyContent(slot);
  return {
    ...content,
    diagrams: content.diagrams.map((d) => ({
      ...d,
      zones: [...d.zones, ...lanes],
      boxes: [{ id: `${d.id}-box`, label: 'Web app', x: 20, y: 40, ...kind }],
    })),
  };
}

async function fill(
  actor: Actor,
  versionId: string,
  person = { id: actor.id, name: 'Ada Author' },
) {
  const view = (await get(actor, `/sad/versions/${versionId}`)).body;
  for (const section of view.sections.filter(
    (s: { editable: boolean }) => s.editable,
  )) {
    await put(actor, `/sad/versions/${versionId}/sections/${section.key}`, {
      answers: answersFor(section.key, person),
      version: section.rowVersion,
    });
  }
  const drawsIt = (d: { slot: DiagramSlot; editableViews: string[] }) =>
    d.editableViews.includes(SLOT_OWNER[d.slot].view);
  for (const slot of (
    await get(actor, `/sad/versions/${versionId}/diagrams`)
  ).body.items.filter(drawsIt)) {
    await put(actor, `/sad/versions/${versionId}/diagrams/${slot.slot}`, {
      content: drawn(slot.slot),
      version: slot.rowVersion,
    });
  }
}

async function taskOf(actor: Actor, versionId: string): Promise<string> {
  const tasks = (await get(actor, '/approval-tasks')).body.items as {
    taskId: string;
    instance: { subjectId: string };
  }[];
  const task = tasks.find((item) => item.instance.subjectId === versionId);
  expect(task, `task for ${actor.email}`).toBeDefined();
  return task!.taskId;
}

beforeAll(async () => {
  t = await createTestApp();
  await resetTrm(t.orm);
  admin = await createActor(t.orm, [{ code: 'system-admin' }], {
    label: 'sad-admin',
  });
  const run = (await post(admin, '/trm/sync-runs', {}, 201)).body;
  const expected: Record<string, number> = {};
  for (const [file, records] of Object.entries(trmExports())) {
    expected[file] = records.length;
    await put(admin, `/trm/sync-runs/${run.id}/records`, { file, records });
  }
  await post(admin, `/trm/sync-runs/${run.id}/complete`, { expected });
  const em = t.orm.em.fork();
  app.crm = (
    await em.findOneOrFail(TrmApplication, { snSysId: SYS.appCrm })
  ).id;
  app.billing = (
    await em.findOneOrFail(TrmApplication, { snSysId: SYS.appBilling })
  ).id;
  const portfolio = em.create(Portfolio, {
    name: `SAD portfolio ${randomUUID().slice(0, 6)}`,
  });
  em.create(TrmApplicationPortfolio, {
    application: em.getReference(TrmApplication, app.crm),
    portfolio,
  });
  await em.flush();

  const crm = { scopeType: 'application' as const, scopeId: app.crm };
  lead = await createActor(t.orm, [{ code: 'application-lead', ...crm }], {
    label: 'sad-lead',
  });
  dev = await createActor(
    t.orm,
    [{ code: 'developer', scopeType: 'portfolio', scopeId: portfolio.id }],
    { label: 'sad-dev' },
  );
  manager = await createActor(
    t.orm,
    [{ code: 'application-manager', ...crm }],
    { label: 'sad-manager' },
  );
  architect = await createActor(
    t.orm,
    [{ code: 'solution-architect', ...crm }],
    { label: 'sad-sa' },
  );
  // An approver with no SAD permissions at all: sees a version only through their task.
  reviewer = await createActor(
    t.orm,
    [
      {
        code: await createRole(
          t.orm,
          ['approvals:task:act', 'approvals:instance:read'],
          { personal: 'all' },
        ),
      },
    ],
    { label: 'sad-reviewer' },
  );
  ea = await createActor(t.orm, [{ code: 'enterprise-architect' }], {
    label: 'sad-ea',
  });
  pm = await createActor(t.orm, [{ code: 'product-manager' }], {
    label: 'sad-pm',
  });
  // Vendors follow their role: this one has no personal-data access, the second one has.
  const vendorPermissions = [
    'sad:api-inventory:read',
    'sad:api-inventory:update',
    'sad:solution-integration:read',
  ] as const;
  vendor = await createActor(
    t.orm,
    [{ code: await createRole(t.orm, [...vendorPermissions]), ...crm }],
    { label: 'sad-vendor', isExternal: true },
  );
  vendorWithNames = await createActor(
    t.orm,
    [
      {
        code: await createRole(t.orm, [...vendorPermissions], {
          personal: 'scope',
        }),
        ...crm,
      },
    ],
    { label: 'sad-vendor-names', isExternal: true },
  );
  billingLead = await createActor(
    t.orm,
    [
      {
        code: 'application-lead',
        scopeType: 'application',
        scopeId: app.billing,
      },
    ],
    { label: 'sad-billing' },
  );
  // Named in Application Details (Product Manager, Portfolio Lead) through their scoped roles.
  await createActor(t.orm, [{ code: 'product-manager', ...crm }], {
    label: 'Pat',
  });
  await createActor(
    t.orm,
    [{ code: 'portfolio-lead', scopeType: 'portfolio', scopeId: portfolio.id }],
    { label: 'Lee' },
  );
  // Edits Billing's SAD and reads every SAD, but edits nothing of CRM's.
  billingEditor = await createActor(
    t.orm,
    [
      { code: 'enterprise-architect' },
      { code: 'developer', scopeType: 'application', scopeId: app.billing },
    ],
    { label: 'sad-billing-ea' },
  );
  draftManager = await createActor(
    t.orm,
    [
      {
        code: await createRole(t.orm, [
          'sad:application-details:read',
          'sad:draft:manage',
        ]),
      },
    ],
    { label: 'sad-draft-manager' },
  );
  nobody = await createActor(t.orm, [], { label: 'sad-nobody' });
  retentionIds = (await get(lead, '/sad/retention-standards')).body.items.map(
    (row: { id: string }) => row.id,
  );

  // Insert the reviewer between the two seeded steps (the rule is data, editable by admins).
  const draft = (
    await post(
      admin,
      '/approval-rule-sets',
      {
        workflowCode: 'sad-version',
        definition: {
          rules: [
            {
              key: 'sad-version',
              name: 'SAD version',
              priority: 10,
              when: null,
              steps: [
                {
                  key: 'application-manager',
                  name: 'Application manager',
                  approvers: [
                    {
                      kind: 'role',
                      roleCode: 'application-manager',
                      scope: 'subject',
                    },
                  ],
                  quorum: 'any',
                  reReview: 'all',
                },
                {
                  key: 'reviewer',
                  name: 'Reviewer',
                  approvers: [{ kind: 'user', userId: reviewer.id }],
                  quorum: 'any',
                  reReview: 'all',
                },
                {
                  key: 'solution-architect',
                  name: 'Solution architect',
                  approvers: [
                    {
                      kind: 'role',
                      roleCode: 'solution-architect',
                      scope: 'subject',
                    },
                  ],
                  quorum: 'any',
                  reReview: 'all',
                },
              ],
            },
          ],
        },
      },
      201,
    )
  ).body;
  await post(admin, `/approval-rule-sets/${draft.id}/publish`);
});

afterAll(async () => {
  await t.close();
});

describe('SAD access', () => {
  it('serves the template to any signed-in user, and nothing to anonymous callers (P1)', async () => {
    const template = (await get(nobody, '/sad/template')).body;
    expect(template.sections).toHaveLength(13);
    expect(template.sections[5]).toMatchObject({
      key: 'api-inventory',
      title: 'API Inventory',
    });
    await http().get('/api/v1/sad/template').expect(401);
  });

  it('lists the applications in scope with their SAD status (P2-P4, P7)', async () => {
    await get(nobody, '/sad/documents', 403);
    expect(
      (await get(lead, '/sad/documents')).body.items.map(
        (i: { applicationId: string }) => i.applicationId,
      ),
    ).toEqual([app.crm]);
    expect(
      (await get(dev, '/sad/documents')).body.items.map(
        (i: { applicationId: string }) => i.applicationId,
      ),
    ).toEqual([app.crm]);
    expect(
      (await get(billingLead, '/sad/documents')).body.items.map(
        (i: { applicationId: string }) => i.applicationId,
      ),
    ).toEqual([app.billing]);
    const everything = (await get(ea, '/sad/documents?pageSize=100')).body;
    expect(everything.total).toBeGreaterThanOrEqual(5);
    expect(
      (await get(admin, '/sad/documents?q=crm')).body.items[0],
    ).toMatchObject({ applicationId: app.crm, current: null, open: null });
    expect((await get(ea, '/sad/documents?status=draft')).body.total).toBe(0);
  });

  it('shows an overview with what the caller can view and edit', async () => {
    const mine = (await get(lead, `/sad/applications/${app.crm}`)).body;
    expect(mine).toMatchObject({
      current: null,
      open: null,
      canStartDraft: true,
    });
    expect(mine.editable).toHaveLength(13);
    const architectView = (await get(ea, `/sad/applications/${app.crm}`)).body;
    expect(architectView).toMatchObject({ editable: [], canStartDraft: false });
    expect(
      (await get(pm, `/sad/applications/${app.crm}`)).body.readable,
    ).toEqual([
      'application-details',
      'solution-integration',
      'resiliency',
      'deployment',
      'environment',
      'backup',
    ]);
    expect(
      (await get(vendor, `/sad/applications/${app.crm}`)).body,
    ).toMatchObject({
      readable: ['solution-integration', 'api-inventory'],
      editable: ['api-inventory'],
    });
    await get(billingLead, `/sad/applications/${app.crm}`, 404);
    await get(admin, `/sad/applications/${randomUUID()}`, 404);
  });
});

describe('Drafts', () => {
  it('are started by people who can edit a section, one at a time', async () => {
    await post(ea, `/sad/applications/${app.crm}/drafts`, {}, 403);
    await post(billingEditor, `/sad/applications/${app.crm}/drafts`, {}, 403);
    await post(billingLead, `/sad/applications/${app.crm}/drafts`, {}, 404);
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    expect(draft).toMatchObject({ status: 'draft', approvalInstanceId: null });
    firstVersion = draft.id;
    await post(dev, `/sad/applications/${app.crm}/drafts`, {}, 409);
    expect(
      (await get(lead, `/sad/applications/${app.crm}`)).body.open,
    ).toMatchObject({
      versionId: firstVersion,
      status: 'draft',
      draftOf: 1,
      startedBy: { id: lead.id },
    });
    expect(
      (await get(ea, '/sad/documents?status=draft')).body.items.map(
        (i: { applicationId: string }) => i.applicationId,
      ),
    ).toEqual([app.crm]);
    expect(
      (await get(ea, '/sad/documents?status=none&pageSize=100')).body.items.map(
        (i: { applicationId: string }) => i.applicationId,
      ),
    ).not.toContain(app.crm);
  });

  it('show each reader only the sections their role grants, with TRM values live and names only for those allowed', async () => {
    const view = (await get(lead, `/sad/versions/${firstVersion}`)).body;
    expect(view).toMatchObject({
      status: 'draft',
      draftOf: 1,
      number: null,
      asApprover: false,
      namesHidden: false,
      canSubmit: true,
      canCancel: true,
    });
    expect(view.trm).toMatchObject({ live: true, restricted: [] });
    expect(view.trm.values).toMatchObject({
      name: 'CRM',
      applicationManager: 'Person Manager',
      productManagers: ['Pat User'],
      portfolioLeads: ['Lee User'],
    });
    expect(
      view.trm.values.environment.map((s: { name: string }) => s.name),
    ).toContain('CRM Prod');
    expect(
      view.sections.every(
        (s: { readable: boolean; editable: boolean }) =>
          s.readable && s.editable,
      ),
    ).toBe(true);

    const seenByVendor = (await get(vendor, `/sad/versions/${firstVersion}`))
      .body;
    expect(seenByVendor.trm).toBeNull();
    expect(
      seenByVendor.sections
        .filter((s: { readable: boolean }) => s.readable)
        .map((s: { key: string }) => s.key),
    ).toEqual(['solution-integration', 'api-inventory']);
    expect(
      seenByVendor.sections.find(
        (s: { key: string }) => s.key === 'security-design',
      ).answers,
    ).toBeNull();
    // No counts for sections the reader cannot view.
    expect(
      seenByVendor.completion.map((c: { section: string }) => c.section),
    ).toEqual(['solution-integration', 'api-inventory']);
    expect(seenByVendor).toMatchObject({
      canSubmit: true,
      canCancel: false,
      startedBy: null,
      namesHidden: true,
    });
    expect(
      (await get(vendorWithNames, `/sad/versions/${firstVersion}`)).body,
    ).toMatchObject({ startedBy: { id: lead.id }, namesHidden: false });

    const seenByPm = (await get(pm, `/sad/versions/${firstVersion}`)).body;
    expect(seenByPm).toMatchObject({ canSubmit: false });
    expect(
      seenByPm.sections.filter((s: { editable: boolean }) => s.editable),
    ).toHaveLength(0);
    await get(billingLead, `/sad/versions/${firstVersion}`, 404);
    await get(nobody, `/sad/versions/${firstVersion}`, 404);
    await get(lead, `/sad/versions/${randomUUID()}`, 404);
  });

  it('gives each reader only the TRM values their sections show', async () => {
    const crm = { scopeType: 'application' as const, scopeId: app.crm };
    const environmentReader = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, ['sad:environment:read'], {
            personal: 'all',
          }),
          ...crm,
        },
      ],
      { label: 'sad-environment-reader' },
    );
    const detailsReader = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, ['sad:application-details:read'], {
            personal: 'all',
          }),
          ...crm,
        },
      ],
      { label: 'sad-details-reader' },
    );
    const seenInEnvironment = (
      await get(environmentReader, `/sad/versions/${firstVersion}`)
    ).body.trm;
    expect(Object.keys(seenInEnvironment.values)).toEqual(['environment']);
    expect(seenInEnvironment.restricted).toEqual([]);
    const seenInDetails = (
      await get(detailsReader, `/sad/versions/${firstVersion}`)
    ).body.trm;
    expect(seenInDetails.values).not.toHaveProperty('environment');
    expect(seenInDetails.values).toMatchObject({
      name: 'CRM',
      applicationManager: 'Person Manager',
    });
    // Without names, the people's values are restricted, in the sections that show them only.
    const namesHidden = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, [
            'sad:environment:read',
            'sad:application-details:read',
          ]),
          ...crm,
        },
      ],
      { label: 'sad-trm-no-names' },
    );
    expect(
      (await get(namesHidden, `/sad/versions/${firstVersion}`)).body.trm
        .restricted,
    ).toContain('applicationManager');
    const environmentNoNames = await createActor(
      t.orm,
      [{ code: await createRole(t.orm, ['sad:environment:read']), ...crm }],
      { label: 'sad-environment-no-names' },
    );
    expect(
      (await get(environmentNoNames, `/sad/versions/${firstVersion}`)).body.trm
        .restricted,
    ).toEqual([]);
  });

  it('save one section at a time with its row version, refusing invalid answers, stale saves and sections the caller cannot edit', async () => {
    const path = `/sad/versions/${firstVersion}/sections/solution-integration`;
    const saved = (
      await put(lead, path, {
        answers: { 'hosting-location': { value: { selected: ['aia-azure'] } } },
        version: 0,
      })
    ).body;
    expect(saved).toMatchObject({
      section: 'solution-integration',
      rowVersion: 1,
    });
    expect(saved.hidden).toContain('tpsa'); // 3rd-party questions hide for Azure hosting
    expect(saved.hidden).not.toContain('vm-check-in');
    // A stale save is refused with the section as it now is.
    const stale = (await put(dev, path, { answers: {}, version: 0 }, 409)).body;
    expect(stale).toMatchObject({
      detail:
        'Someone else changed this section. Their latest is included: reload it, then make your changes again.',
      latest: { rowVersion: 1, answers: saved.answers },
    });
    const invalid = (
      await put(
        lead,
        path,
        {
          answers: { 'hosting-location': { value: { selected: ['mars'] } } },
          version: 1,
        },
        400,
      )
    ).body;
    expect(invalid.errors[0].path).toMatch(/^answers\.hosting-location/);
    await put(lead, path, { answers: { nope: { value: 1 } }, version: 1 }, 400);
    await put(
      lead,
      `/sad/versions/${firstVersion}/sections/not-a-section`,
      { answers: {}, version: 0 },
      400,
    );
    await put(ea, path, { answers: {}, version: 1 }, 403);
    await put(
      vendor,
      `/sad/versions/${firstVersion}/sections/security-design`,
      { answers: {}, version: 0 },
      403,
    );
    await put(
      lead,
      `/sad/versions/${firstVersion}/sections/backup`,
      {
        answers: {
          'backup-schedule': {
            value: { rows: [{ standardId: randomUUID(), resourceName: 'x' }] },
          },
        },
        version: 0,
      },
      422,
    );
    const audit = await t.orm.em
      .fork()
      .findOne(AuditLog, {
        action: 'sad.section.saved',
        resourceId: firstVersion,
      });
    expect(audit).not.toBeNull();
  });

  it('keep names a vendor cannot see when the vendor saves', async () => {
    const path = `/sad/versions/${firstVersion}/sections/api-inventory`;
    const owner = { id: lead.id, name: 'sad-lead User' }; // the name in TechCockpit
    const rowId = randomUUID();
    const first = (
      await put(lead, path, {
        answers: {
          apis: {
            value: [
              { id: rowId, cells: { name: 'Policy API', apiOwner: owner } },
            ],
          },
        },
        version: 0,
      })
    ).body;
    const seen = (
      await get(vendor, `/sad/versions/${firstVersion}`)
    ).body.sections.find((s: { key: string }) => s.key === 'api-inventory');
    expect(seen.answers.apis.value[0].cells).toEqual({ name: 'Policy API' });
    // The latest content of a refused save hides the same names.
    expect(
      (await put(vendor, path, { answers: {}, version: 0 }, 409)).body.latest
        .answers.apis.value[0].cells,
    ).toEqual({ name: 'Policy API' });
    await put(vendor, path, {
      answers: {
        apis: {
          value: [
            {
              id: rowId,
              cells: {
                name: 'Policy API v2',
                apiOwner: { id: vendor.id, name: 'Vendor' },
              },
            },
          ],
        },
      },
      version: first.rowVersion,
    });
    const after = (
      await get(lead, `/sad/versions/${firstVersion}`)
    ).body.sections.find((s: { key: string }) => s.key === 'api-inventory');
    expect(after.answers.apis.value[0].cells).toEqual({
      name: 'Policy API v2',
      apiOwner: owner,
    });
  });

  it('name people and applications in tables from TechCockpit and TRM, refusing ones that are not there', async () => {
    const view = (await get(lead, `/sad/versions/${firstVersion}`)).body;
    const leadName = view.startedBy.name;
    const section = () =>
      get(lead, `/sad/versions/${firstVersion}`).then((res) =>
        res.body.sections.find(
          (s: { key: string }) => s.key === 'api-inventory',
        ),
      );
    const withRow = (cells: object) => {
      const answers = answersFor('api-inventory', {
        id: lead.id,
        name: 'Typed by the browser',
      }) as { apis: { value: { cells: object }[] } };
      return {
        ...answers,
        apis: {
          value: [
            {
              ...answers.apis.value[0],
              cells: { ...answers.apis.value[0].cells, ...cells },
            },
          ],
        },
      };
    };
    const path = `/sad/versions/${firstVersion}/sections/api-inventory`;
    const saved = (
      await put(lead, path, {
        answers: withRow({
          dependencies: { items: [{ id: app.billing, name: 'Not its name' }] },
        }),
        version: (await section()).rowVersion,
      })
    ).body;
    expect(saved.answers.apis.value[0].cells).toMatchObject({
      apiOwner: { id: lead.id, name: leadName },
      dependencies: { items: [{ id: app.billing, name: 'Billing' }] },
    });
    const unknownPerson = withRow({
      apiOwner: { id: randomUUID(), name: 'Nobody' },
    });
    expect(
      (
        await put(
          lead,
          path,
          { answers: unknownPerson, version: saved.rowVersion },
          422,
        )
      ).body.detail,
    ).toBe('API owner in APIs: pick a person from the directory.');
    const unknownApplication = withRow({
      dependencies: { items: [{ id: randomUUID(), name: 'Ghost' }] },
    });
    expect(
      (
        await put(
          lead,
          path,
          { answers: unknownApplication, version: saved.rowVersion },
          422,
        )
      ).body.detail,
    ).toBe('Dependent applications in APIs: pick applications from TRM.');
  });
});

describe('Diagrams', () => {
  const path = (slot: string) =>
    `/sad/versions/${firstVersion}/diagrams/${slot}`;

  type Slot = {
    slot: string;
    owner: string;
    readableViews: string[];
    editableViews: string[];
    rowVersion: number;
    content: unknown;
    hidden: {
      diagramId: string;
      takenIds: string[];
      carriers: { id: string; view: string }[];
    }[];
  };
  it('shows each reader the slots their sections show, starting empty, with the views they read and edit', async () => {
    const mine = (await get(lead, `/sad/versions/${firstVersion}/diagrams`))
      .body.items;
    expect(
      mine.map((d: Slot) => [
        d.slot,
        d.owner,
        d.readableViews,
        d.editableViews,
        d.rowVersion,
      ]),
    ).toEqual([
      [
        'solution',
        'solution-integration',
        ['solution', 'data-flow'],
        ['solution', 'data-flow'],
        0,
      ],
      [
        'infrastructure',
        'network',
        ['infrastructure', 'integration'],
        ['infrastructure', 'integration'],
        0,
      ],
      ['ci-cd', 'deployment', ['process'], ['process'], 0],
      ['monitoring', 'logging', ['monitoring'], ['monitoring'], 0],
    ]);
    // The solution diagram starts with a grouping box named after the application.
    expect(mine[0].content).toEqual(emptyContent('solution', 'CRM'));
    expect(mine[1].content).toEqual(emptyContent('infrastructure'));
    // Product managers read sections 2, 4 and 10 (not 9 or 12); the vendor reads section 2 (solution and its integration view).
    expect(
      (await get(pm, `/sad/versions/${firstVersion}/diagrams`)).body.items.map(
        (d: Slot) => [d.slot, d.readableViews, d.editableViews],
      ),
    ).toEqual([
      ['solution', ['solution'], []],
      ['infrastructure', ['infrastructure', 'integration'], []],
      ['ci-cd', ['process'], []],
    ]);
    expect(
      (
        await get(vendor, `/sad/versions/${firstVersion}/diagrams`)
      ).body.items.map((d: { slot: string }) => d.slot),
    ).toEqual(['solution', 'infrastructure']);
    await get(nobody, `/sad/versions/${firstVersion}/diagrams`, 404);
    await get(billingLead, `/sad/versions/${firstVersion}/diagrams`, 404);
  });

  it('counts an undrawn slot as missing in its owning section', async () => {
    const view = (await get(lead, `/sad/versions/${firstVersion}`)).body;
    const missing = (section: string) =>
      view.completion.find((c: { section: string }) => c.section === section)
        .missing;
    expect(missing('solution-integration')).toContain('diagram:solution');
    expect(missing('network')).toContain('diagram:infrastructure');
    expect(missing('resiliency')).not.toContain('diagram:infrastructure');
  });

  it('saves a slot with its row version: drawn or Not applicable, checked against the slot, by the owning section only', async () => {
    const saved = (
      await put(lead, path('solution'), {
        content: drawn('solution'),
        version: 0,
      })
    ).body;
    expect(saved).toMatchObject({
      slot: 'solution',
      rowVersion: 1,
      content: drawn('solution'),
    });
    expect(
      saved.completion.find(
        (c: { section: string }) => c.section === 'solution-integration',
      ).missing,
    ).not.toContain('diagram:solution');
    const stale = (
      await put(
        dev,
        path('solution'),
        { content: drawn('solution'), version: 0 },
        409,
      )
    ).body;
    expect(stale).toMatchObject({
      detail:
        'Someone else changed this diagram. Their latest is included: reload it, then make your changes again.',
      latest: { rowVersion: saved.rowVersion, content: saved.content },
    });

    const broken = {
      diagrams: [
        {
          ...drawn('solution').diagrams[0],
          boxes: [
            {
              id: 'b',
              label: 'Box',
              type: 'part',
              x: 0,
              y: 0,
              parentId: 'nowhere',
            },
          ],
        },
      ],
    };
    const invalid = (
      await put(lead, path('solution'), { content: broken, version: 1 }, 400)
    ).body;
    expect(invalid.errors).toEqual([
      {
        path: 'content.diagrams.0.boxes.0.parentId',
        message: 'Not a zone on this diagram',
      },
    ]);
    await put(
      lead,
      path('infrastructure'),
      { content: drawn('solution'), version: 0 },
      400,
    );
    await put(
      lead,
      path('monitoring'),
      { content: { notApplicable: true, reason: ' ' }, version: 0 },
      400,
    );
    await put(
      lead,
      path('not-a-slot'),
      { content: drawn('solution'), version: 0 },
      400,
    );
    await put(
      lead,
      path('monitoring'),
      { content: drawn('monitoring'), version: 0, extra: true },
      400,
    );

    const notApplicable = (
      await put(lead, path('monitoring'), {
        content: {
          notApplicable: true,
          reason: 'Monitored by the SaaS vendor',
        },
        version: 0,
      })
    ).body;
    expect(
      notApplicable.completion.find(
        (c: { section: string }) => c.section === 'logging',
      ).missing,
    ).not.toContain('diagram:monitoring');

    // Section 2 editors draw the solution diagram but not the infrastructure (section 3's); readers edit nothing.
    const section2 = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, ['sad:solution-integration:update']),
          scopeType: 'application',
          scopeId: app.crm,
        },
      ],
      { label: 'sad-s2-editor' },
    );
    const section3 = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, ['sad:network:update']),
          scopeType: 'application',
          scopeId: app.crm,
        },
      ],
      { label: 'sad-s3-editor' },
    );
    await put(
      section2,
      path('infrastructure'),
      { content: drawn('infrastructure'), version: 0 },
      403,
    );
    await put(section3, path('infrastructure'), {
      content: drawn('infrastructure'),
      version: 0,
    });
    expect(
      (
        await get(section2, `/sad/versions/${firstVersion}/diagrams`)
      ).body.items.map((d: Slot) => [d.slot, d.editableViews]),
    ).toEqual([
      ['solution', ['solution']],
      ['infrastructure', ['integration']],
    ]);
    await put(
      ea,
      path('solution'),
      { content: drawn('solution'), version: 1 },
      403,
    );
    await put(
      vendor,
      path('solution'),
      { content: drawn('solution'), version: 1 },
      403,
    );
    await put(
      lead,
      `/sad/versions/${randomUUID()}/diagrams/solution`,
      { content: drawn('solution'), version: 0 },
      404,
    );
    expect(
      await t.orm.em
        .fork()
        .count(AuditLog, {
          action: 'sad.diagram.saved',
          resourceId: firstVersion,
        }),
    ).toBe(3);
  });

  it('lets a vendor whose role edits section 2 draw the solution diagram, like any section 2 editor, and nothing else', async () => {
    const drawer = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, ['sad:solution-integration:update']),
          scopeType: 'application',
          scopeId: app.crm,
        },
      ],
      { label: 'sad-vendor-drawer', isExternal: true },
    );
    const slots = (await get(drawer, `/sad/versions/${firstVersion}/diagrams`))
      .body.items as Slot[];
    const solution = slots.find((d) => d.slot === 'solution')!;
    expect(solution.editableViews).toEqual(['solution']);
    const saved = (
      await put(drawer, path('solution'), {
        content: drawn('solution'),
        version: solution.rowVersion,
      })
    ).body;
    expect(saved.rowVersion).toBe(solution.rowVersion + 1);
    await put(
      drawer,
      path('monitoring'),
      { content: drawn('monitoring'), version: 0 },
      403,
    );
  });

  describe('solution diagram (section 2) and its data flow view (section 9)', () => {
    const solutionPath = () => path('solution');
    const current = async (actor: Actor) =>
      (
        await get(actor, `/sad/versions/${firstVersion}/diagrams`)
      ).body.items.find((d: Slot) => d.slot === 'solution') as Slot & {
        content: { diagrams: { lines: unknown[] }[] };
      };
    const block = (id: string, type: string, extra: object = {}) => ({
      id,
      label: id,
      type,
      x: 0,
      y: 0,
      ...extra,
    });
    const content = (lines: object[], boxes: object[] = []) => ({
      diagrams: [
        {
          ...emptyContent('solution', 'CRM').diagrams[0],
          boxes: [
            block('customer', 'actor'),
            block('core', 'part', { parentId: 'zone-1' }),
            ...boxes,
          ],
          lines,
        },
      ],
    });
    const described = {
      id: 'l1',
      from: 'customer',
      to: 'core',
      calls: 'Agent portal (web)',
      does: 'Manage leads',
    };
    const facts = {
      data: 'Lead: name, mobile no.',
      classification: 'confidential',
      frequency: 'Real time',
    };
    const save = async (actor: Actor, body: object, status = 200) =>
      put(
        actor,
        solutionPath(),
        { content: body, version: (await current(lead)).rowVersion },
        status,
      );
    let section2: Actor;
    let section9: Actor;
    beforeAll(async () => {
      section2 = await createActor(
        t.orm,
        [
          {
            code: await createRole(t.orm, ['sad:solution-integration:update']),
            scopeType: 'application',
            scopeId: app.crm,
          },
        ],
        { label: 'sad-solution-editor' },
      );
      section9 = await createActor(
        t.orm,
        [
          {
            code: await createRole(t.orm, ['sad:data-architecture:update']),
            scopeType: 'application',
            scopeId: app.crm,
          },
        ],
        { label: 'sad-data-editor' },
      );
    });

    it("finds every TRM application by name or APM number for section 2 editors (only name and number), never the SAD's own", async () => {
      // The section 2 editor holds no TRM permission: the search does not follow TRM access.
      const search = (actor: Actor, q: string, status = 200) =>
        get(
          actor,
          `/sad/versions/${firstVersion}/business-applications?q=${q}`,
          status,
        );
      expect((await search(section2, 'bill')).body).toEqual({
        items: [{ id: app.billing, number: 'APM-Billing', name: 'Billing' }],
      });
      // By name, CRM's own application left out.
      expect(
        (await search(lead, 'APM-')).body.items.map(
          (a: { name: string }) => a.name,
        ),
      ).toEqual(['Billing', 'HR Portal', 'Twin', 'Twin']);
      expect((await search(lead, 'CRM')).body.items).toEqual([]);
      await search(lead, 'b', 400);
      await search(section9, 'bill', 403);
      await search(pm, 'bill', 403);
      // Editors of the other diagrams that link TRM applications search too: infrastructure (section 3), monitoring (section 12).
      for (const permission of [
        'sad:network:update',
        'sad:logging:update',
      ] as const) {
        const editor = await createActor(
          t.orm,
          [
            {
              code: await createRole(t.orm, [permission]),
              scopeType: 'application',
              scopeId: app.crm,
            },
          ],
          { label: `search-${permission.split(':')[1]}` },
        );
        expect(
          (await search(editor, 'bill')).body.items.map(
            (a: { name: string }) => a.name,
          ),
        ).toEqual(['Billing']);
      }
      await get(
        lead,
        `/sad/versions/${randomUUID()}/business-applications?q=bill`,
        404,
      );
    });

    it("keeps the TRM name and number a business application was picked with, and refuses unknown applications and the SAD's own", async () => {
      const picked = (label: string, id: string) =>
        block('policy', 'business', {
          label,
          application: { id, number: null },
        });
      const saved = (
        await save(lead, content([], [picked('anything', app.billing)]))
      ).body.content.diagrams[0].boxes[2];
      expect(saved).toMatchObject({
        label: 'Billing',
        application: { id: app.billing, number: 'APM-Billing' },
      });
      const kept = (
        await save(
          lead,
          content(
            [],
            [
              {
                ...picked('Typed over', app.billing),
                application: { id: app.billing, number: 'APM-0' },
              },
            ],
          ),
        )
      ).body.content.diagrams[0].boxes[2];
      expect(kept).toMatchObject({
        label: 'Billing',
        application: { id: app.billing, number: 'APM-Billing' },
      });
      const unknown = (
        await save(lead, content([], [picked('Gone', randomUUID())]), 400)
      ).body;
      expect(unknown.errors).toEqual([
        {
          path: 'content.diagrams.0.boxes.2.application.id',
          message: 'Not a TRM application',
        },
      ]);
      const own = (await save(lead, content([], [picked('CRM', app.crm)]), 400))
        .body;
      expect(own.errors).toEqual([
        {
          path: 'content.diagrams.0.boxes.2.application.id',
          message:
            'Use "Part of this application" blocks for the application itself',
        },
      ]);
    });

    it('refreshes a business application picked again after TRM renamed it; just saving keeps the name it was picked with', async () => {
      const picked = block('policy', 'business', {
        label: 'anything',
        application: { id: app.billing, number: null },
      });
      await save(lead, content([], [picked]));
      const em = t.orm.em.fork();
      const billing = await em.findOneOrFail(TrmApplication, app.billing);
      billing.name = 'Billing and Collections';
      await em.flush();
      try {
        const kept = (
          await save(
            lead,
            content(
              [],
              [
                {
                  ...picked,
                  label: 'Billing',
                  application: { id: app.billing, number: 'APM-Billing' },
                },
              ],
            ),
          )
        ).body.content.diagrams[0].boxes[2];
        expect(kept.label).toBe('Billing');
        const repicked = (
          await save(
            lead,
            content(
              [],
              [
                {
                  ...picked,
                  label: 'Billing and Collections',
                  application: { id: app.billing, number: 'APM-Billing' },
                },
              ],
            ),
          )
        ).body.content.diagrams[0].boxes[2];
        expect(repicked).toMatchObject({
          label: 'Billing and Collections',
          application: { id: app.billing, number: 'APM-Billing' },
        });
      } finally {
        billing.name = 'Billing';
        await em.flush();
      }
    });

    it('lets section 2 change the blocks and connections and section 9 only the data flow facts, each seeing only what their sections show', async () => {
      await save(lead, content([{ ...described, ...facts }]));
      // Section 9 alone: the data flow view, without what connections call or do; the facts are theirs to change.
      const forData = await current(section9);
      expect([forData.readableViews, forData.editableViews]).toEqual([
        ['data-flow'],
        ['data-flow'],
      ]);
      expect(forData.content.diagrams[0].lines).toEqual([
        { id: 'l1', from: 'customer', to: 'core', ...facts },
      ]);
      const updated = (
        await save(
          section9,
          content([
            {
              id: 'l1',
              from: 'customer',
              to: 'core',
              ...facts,
              frequency: 'Nightly batch',
            },
          ]),
        )
      ).body;
      expect(updated.content.diagrams[0].lines[0]).toEqual({
        id: 'l1',
        from: 'customer',
        to: 'core',
        ...facts,
        frequency: 'Nightly batch',
      });
      expect((await current(lead)).content.diagrams[0].lines[0]).toEqual({
        ...described,
        ...facts,
        frequency: 'Nightly batch',
      });
      const moved = content([
        { id: 'l1', from: 'customer', to: 'core', ...facts },
      ]);
      (moved.diagrams[0].boxes as { x: number }[])[0].x = 300;
      expect((await save(section9, moved, 403)).body.detail).toBe(
        'You cannot change the blocks and connections on this diagram.',
      );

      // Section 2 alone: the solution view without data flow facts; what it sends never changes them.
      const forSolution = await current(section2);
      expect([forSolution.readableViews, forSolution.editableViews]).toEqual([
        ['solution'],
        ['solution'],
      ]);
      expect(forSolution.content.diagrams[0].lines).toEqual([described]);
      await save(
        section2,
        content([{ ...described, does: 'Creates leads', data: 'Ignored' }]),
      );
      expect((await current(lead)).content.diagrams[0].lines[0]).toEqual({
        ...described,
        does: 'Creates leads',
        ...facts,
        frequency: 'Nightly batch',
      });
      const withData = content([
        { ...described, does: 'Creates leads' },
        {
          id: 'l2',
          from: 'core',
          to: 'customer',
          calls: 'SMS',
          does: 'Notifies',
          data: 'Mobile no.',
        },
      ]);
      expect((await save(section2, withData, 403)).body.detail).toBe(
        'You cannot change the data flow facts on this diagram.',
      );
      await save(section2, { notApplicable: true, reason: 'Not yet' });
      await save(section9, content([described]), 403);
    });

    it('needs every connection described in section 2, and the facts of connections with data objects in section 9, before submit', async () => {
      const missing = (
        body: { completion: { section: string; missing: string[] }[] },
        section: string,
      ) => body.completion.find((c) => c.section === section)!.missing;
      const undescribed = (
        await save(
          lead,
          content([
            {
              id: 'l1',
              from: 'customer',
              to: 'core',
              calls: 'Agent portal',
              data: 'Lead: name',
            },
          ]),
        )
      ).body;
      expect(missing(undescribed, 'solution-integration')).toContain(
        'diagram:solution',
      );
      expect(missing(undescribed, 'data-architecture')).toContain(
        'diagram:solution:data-flow',
      );
      const complete = (await save(lead, content([{ ...described, ...facts }])))
        .body;
      expect(missing(complete, 'solution-integration')).not.toContain(
        'diagram:solution',
      );
      expect(missing(complete, 'data-architecture')).not.toContain(
        'diagram:solution:data-flow',
      );
    });
  });

  describe('infrastructure diagram (section 3)', () => {
    type Infra = {
      hosting: Record<string, string>;
      diagrams: {
        zones: { id: string; label: string; ownName?: boolean }[];
        boxes: Record<string, unknown>[];
      }[];
    };
    const infraPath = () => path('infrastructure');
    const slotOf = async (actor: Actor) =>
      (
        await get(actor, `/sad/versions/${firstVersion}/diagrams`)
      ).body.items.find((d: Slot) => d.slot === 'infrastructure') as Slot & {
        content: Infra;
      };
    const save = async (actor: Actor, body: object, status = 200) =>
      put(
        actor,
        infraPath(),
        { content: body, version: (await slotOf(lead)).rowVersion },
        status,
      );
    const serverId = async (name: string) =>
      (await t.orm.em.fork().findOneOrFail(TrmServer, { name })).id;
    const withBoxes = (...boxes: object[]) => {
      const content = emptyContent('infrastructure');
      return {
        ...content,
        diagrams: [{ ...content.diagrams[0], boxes }, content.diagrams[1]],
      };
    };
    let section3: Actor;
    beforeAll(async () => {
      section3 = await createActor(
        t.orm,
        [
          {
            code: await createRole(t.orm, ['sad:network:update']),
            scopeType: 'application',
            scopeId: app.crm,
          },
        ],
        { label: 'sad-infra-editor' },
      );
    });

    it('starts from the diagram defaults, which only their maintainers change', async () => {
      const defaults = (await get(ea, '/sad/diagram-defaults')).body;
      expect(defaults).toEqual({
        subscription: 'MY01',
        primaryRegion: 'southeastasia',
        drRegion: 'eastasia',
        primaryDc: 'PDC',
        drDc: 'SDC',
        officeNetwork: 'Office network',
        version: 1,
      });
      await get(lead, '/sad/diagram-defaults', 403);
      await get(vendor, '/sad/diagram-defaults', 403);
      const changed = (
        await put(ea, '/sad/diagram-defaults', {
          ...defaults,
          subscription: 'MY02',
          primaryRegion: 'malaysiawest',
        })
      ).body;
      expect(changed).toMatchObject({
        subscription: 'MY02',
        primaryRegion: 'malaysiawest',
        version: 2,
      });
      await put(ea, '/sad/diagram-defaults', { ...defaults }, 409);
      const invalid = (
        await put(
          ea,
          '/sad/diagram-defaults',
          { ...changed, drRegion: 'malaysiawest' },
          400,
        )
      ).body;
      expect(invalid.errors).toEqual([
        {
          path: 'drRegion',
          message: 'The DR region must differ from the primary region',
        },
      ]);
      await put(lead, '/sad/diagram-defaults', { ...changed }, 403);
      expect(
        await t.orm.em
          .fork()
          .count(AuditLog, { action: 'sad.diagram-defaults.updated' }),
      ).toBe(1);

      // A draft whose infrastructure diagram was never saved starts from the new defaults; saved ones keep theirs.
      const draft = (
        await post(
          billingLead,
          `/sad/applications/${app.billing}/drafts`,
          {},
          201,
        )
      ).body;
      const billing = (
        await get(billingLead, `/sad/versions/${draft.id}/diagrams`)
      ).body.items.find((d: Slot) => d.slot === 'infrastructure');
      expect(billing.content.hosting).toMatchObject({
        subscription: 'MY02',
        primaryRegion: 'malaysiawest',
      });
      expect(
        billing.content.diagrams[0].zones
          .slice(0, 2)
          .map((z: { label: string }) => z.label),
      ).toEqual(['MY02', 'Malaysia West']);
      expect((await slotOf(lead)).content.hosting.subscription).toBe('MY01');
      await post(billingLead, `/sad/versions/${draft.id}/cancel`);
      await put(ea, '/sad/diagram-defaults', { ...defaults, version: 2 });
    });

    it("lists the application's TRM servers to section 3 editors, and keeps the name a server was picked with", async () => {
      const servers = (
        await get(section3, `/sad/versions/${firstVersion}/servers`)
      ).body;
      expect(
        servers.items.map((server: { name: string }) => server.name),
      ).toEqual(['SRV-CRM-01', 'SRV-CRM-02']);
      expect(Object.keys(servers.items[0])).toEqual(['id', 'name']);
      await get(pm, `/sad/versions/${firstVersion}/servers`, 403);
      const s2 = await createActor(
        t.orm,
        [
          {
            code: await createRole(t.orm, ['sad:solution-integration:update']),
            scopeType: 'application',
            scopeId: app.crm,
          },
        ],
        { label: 'sad-s2-servers' },
      );
      await get(s2, `/sad/versions/${firstVersion}/servers`, 403);

      const linked = (label: string, id: string) => ({
        id: 'srv',
        label,
        type: 'server',
        parentId: 'primary-dc',
        server: { id },
        x: 20,
        y: 40,
      });
      const crm01 = await serverId('SRV-CRM-01');
      expect(
        (await save(section3, withBoxes(linked('anything', crm01)))).body
          .content.diagrams[0].boxes[0],
      ).toMatchObject({ label: 'SRV-CRM-01', server: { id: crm01 } });
      expect(
        (await save(section3, withBoxes(linked('Typed over', crm01)))).body
          .content.diagrams[0].boxes[0].label,
      ).toBe('SRV-CRM-01');
      for (const id of [await serverId('SRV-BIL-01'), randomUUID()]) {
        const refused = (
          await save(section3, withBoxes(linked('Other', id)), 400)
        ).body;
        expect(refused.errors).toEqual([
          {
            path: 'content.diagrams.0.boxes.0.server.id',
            message: 'Not a TRM server of this application',
          },
        ]);
      }
    });

    it('names the fixed zones from the hosting settings, and refuses zones and boxes out of place', async () => {
      const content = withBoxes();
      content.hosting = {
        ...content.hosting!,
        subscription: 'MY09',
        drRegion: 'japaneast',
      };
      content.diagrams[1] = {
        ...content.diagrams[1],
        zones: content.diagrams[1].zones.map((z) =>
          z.id === 'primary-dc'
            ? { ...z, label: 'PDC Cyberjaya', ownName: true as const }
            : z,
        ),
      };
      const saved = (await save(section3, content)).body.content as Infra;
      expect(saved.diagrams.map((d) => d.zones.map((z) => z.label))).toEqual([
        [
          'MY09',
          'Southeast Asia',
          'Japan East',
          'PDC',
          'SDC',
          'Office network',
        ],
        [
          'MY09',
          'Southeast Asia',
          'Japan East',
          'PDC Cyberjaya',
          'SDC',
          'Office network',
        ],
      ]);
      const misplaced = (
        await save(
          section3,
          withBoxes({
            id: 'p',
            label: 'Agent',
            type: 'person',
            parentId: 'primary-dc',
            x: 0,
            y: 0,
          }),
          400,
        )
      ).body;
      expect(misplaced.errors).toEqual([
        {
          path: 'content.diagrams.0.boxes.0.parentId',
          message: 'A person sits in the office network or the Internet zone',
        },
      ]);
    });

    it('keeps servers, network devices and Azure services drawn straight in a VNet, but not people', async () => {
      const inVnet = (...boxes: object[]) => {
        const content = withBoxes(...boxes);
        const [production, nonProduction] = content.diagrams;
        const vnet = {
          id: 'vnet',
          label: 'vnet-crm',
          kind: 'vnet',
          parentId: 'primary-region',
          x: 15,
          y: 35,
          width: 300,
          height: 300,
        };
        return {
          ...content,
          diagrams: [
            { ...production, zones: [...production.zones, vnet] },
            nonProduction,
          ],
        };
      };
      const saved = (
        await save(
          section3,
          inVnet(
            {
              id: 'vm',
              label: 'vm-01',
              type: 'server',
              parentId: 'vnet',
              x: 20,
              y: 40,
            },
            {
              id: 'fw',
              label: 'fw-01',
              type: 'firewall',
              parentId: 'vnet',
              x: 20,
              y: 124,
            },
            {
              id: 'agw',
              label: 'agw-01',
              type: 'azure',
              icon: 'application-gateways',
              parentId: 'vnet',
              x: 20,
              y: 208,
            },
          ),
        )
      ).body.content as Infra;
      expect(saved.diagrams[0].boxes.map((b) => [b.id, b.parentId])).toEqual([
        ['vm', 'vnet'],
        ['fw', 'vnet'],
        ['agw', 'vnet'],
      ]);
      const person = (
        await save(
          section3,
          inVnet({
            id: 'p',
            label: 'Agent',
            type: 'person',
            parentId: 'vnet',
            x: 0,
            y: 0,
          }),
          400,
        )
      ).body;
      expect(person.errors).toEqual([
        {
          path: 'content.diagrams.0.boxes.0.parentId',
          message: 'A person sits in the office network or the Internet zone',
        },
      ]);
    });

    it('fills in the hosting settings for an infrastructure diagram drawn before they existed', async () => {
      const em = t.orm.em.fork();
      const row = await em.findOneOrFail(SadDiagram, {
        sadVersion: firstVersion,
        slot: 'infrastructure',
      });
      const { hosting: _, ...older } = row.content as Infra;
      row.content = older as unknown as typeof row.content;
      await em.flush();
      expect((await slotOf(lead)).content.hosting).toEqual(
        emptyContent('infrastructure').hosting,
      );
    });
  });

  describe('CI and CD flows (section 10)', () => {
    it('keeps every step in a lane, and needs every approval to name who approves before submit', async () => {
      const { rowVersion } = (
        await get(lead, `/sad/versions/${firstVersion}/diagrams`)
      ).body.items.find((d: Slot) => d.slot === 'ci-cd');
      const flow = drawn('ci-cd');
      const approval = {
        id: 'approve',
        label: 'Change approved?',
        type: 'approval',
        parentId: 'lane-1',
        x: 260,
        y: 40,
      };
      const withApproval = (approver?: string) => ({
        diagrams: [
          {
            ...flow.diagrams[0],
            boxes: [
              ...flow.diagrams[0].boxes,
              { ...approval, ...(approver ? { approver } : {}) },
            ],
            lines: [
              { id: 'l1', from: 'ci-cd-1-box', to: 'approve', label: 'Ready' },
            ],
          },
        ],
      });
      const missing = (body: {
        completion: { section: string; missing: string[] }[];
      }) => body.completion.find((c) => c.section === 'deployment')!.missing;

      const loose = {
        diagrams: [
          {
            ...flow.diagrams[0],
            boxes: [{ ...flow.diagrams[0].boxes[0], parentId: undefined }],
          },
        ],
      };
      expect(
        (
          await put(
            lead,
            path('ci-cd'),
            { content: loose, version: rowVersion },
            400,
          )
        ).body.errors,
      ).toEqual([
        {
          path: 'content.diagrams.0.boxes.0.parentId',
          message: 'Every step sits in a lane',
        },
      ]);
      const unnamed = (
        await put(lead, path('ci-cd'), {
          content: withApproval(),
          version: rowVersion,
        })
      ).body;
      expect(missing(unnamed)).toContain('diagram:ci-cd');
      const named = (
        await put(lead, path('ci-cd'), {
          content: withApproval('Application manager'),
          version: rowVersion + 1,
        })
      ).body;
      expect(missing(named)).not.toContain('diagram:ci-cd');
      expect(named.content.diagrams[0].boxes[1]).toMatchObject({
        type: 'approval',
        approver: 'Application manager',
      });
    });
  });

  describe('monitoring diagram (section 12)', () => {
    it('keeps the TRM name an other system was picked with, and refuses TRM links on other blocks', async () => {
      const slotOf = async () =>
        (
          await get(lead, `/sad/versions/${firstVersion}/diagrams`)
        ).body.items.find((d: Slot) => d.slot === 'monitoring');
      const page = drawn('monitoring').diagrams[0];
      const withBlock = (extra: object) => ({
        diagrams: [
          {
            ...page,
            boxes: [
              ...page.boxes,
              { id: 'itsm', label: 'Typed over', x: 300, y: 0, ...extra },
            ],
          },
        ],
      });
      const linked = { application: { id: app.billing, number: null } };
      const saved = (
        await put(lead, path('monitoring'), {
          content: withBlock({ type: 'system', ...linked }),
          version: (await slotOf()).rowVersion,
        })
      ).body;
      expect(saved.content.diagrams[0].boxes[1]).toMatchObject({
        label: 'Billing',
        application: { id: app.billing, number: 'APM-Billing' },
      });
      const refused = (
        await put(
          lead,
          path('monitoring'),
          {
            content: withBlock({ type: 'team', ...linked }),
            version: saved.rowVersion,
          },
          400,
        )
      ).body;
      expect(refused.errors).toEqual([
        {
          path: 'content.diagrams.0.boxes.1.application',
          message: 'Only an other system links to TRM',
        },
      ]);
    });
  });

  describe('integration view (section 2)', () => {
    type Line = Record<string, unknown> & { id: string };
    type Infra = {
      hosting: object;
      diagrams: {
        zones: object[];
        boxes: { id: string; x: number }[];
        lines: Line[];
      }[];
    };
    const infraPath = () => path('infrastructure');
    const slotOf = async (actor: Actor) =>
      (
        await get(actor, `/sad/versions/${firstVersion}/diagrams`)
      ).body.items.find((d: Slot) => d.slot === 'infrastructure') as Slot & {
        content: Infra;
      };
    const save = async (actor: Actor, body: object, status = 200) =>
      put(
        actor,
        infraPath(),
        { content: body, version: (await slotOf(lead)).rowVersion },
        status,
      );
    const facts = {
      layer: 'integration',
      protocol: 'TDS',
      port: 1433,
      tls: '1.2',
      pattern: 'database',
      authentication: 'Managed identity',
      classification: 'confidential',
      purpose: 'Store customers',
      flow: 'service',
    };
    const drawnWith = (lines: object[], extraBoxes: object[] = []): Infra => {
      const content = emptyContent('infrastructure') as unknown as Infra;
      const [production] = content.diagrams;
      production.zones.push(
        {
          id: 'vnet',
          label: 'vnet-crm',
          kind: 'vnet',
          parentId: 'primary-region',
          x: 15,
          y: 35,
          width: 300,
          height: 200,
        },
        {
          id: 'snet',
          label: 'snet-app',
          kind: 'subnet',
          parentId: 'vnet',
          x: 15,
          y: 35,
          width: 250,
          height: 150,
        },
      );
      production.boxes.push(
        {
          id: 'srv',
          label: 'CRM app',
          type: 'server',
          parentId: 'snet',
          x: 20,
          y: 40,
        } as never,
        {
          id: 'sql',
          label: 'CRM DB',
          type: 'database',
          parentId: 'snet',
          x: 20,
          y: 120,
        } as never,
        ...(extraBoxes as never[]),
      );
      production.lines.push(
        { id: 'i1', from: 'vnet', to: 'primary-dc', label: 'ExpressRoute' },
        ...(lines as Line[]),
      );
      return content;
    };
    let section2: Actor;
    let section3: Actor;
    beforeAll(async () => {
      section2 = await createActor(
        t.orm,
        [
          {
            code: await createRole(t.orm, ['sad:solution-integration:update']),
            scopeType: 'application',
            scopeId: app.crm,
          },
        ],
        { label: 'sad-integration-editor' },
      );
      section3 = await createActor(
        t.orm,
        [
          {
            code: await createRole(t.orm, ['sad:network:update']),
            scopeType: 'application',
            scopeId: app.crm,
          },
        ],
        { label: 'sad-network-editor' },
      );
    });

    it('lets section 2 change the integration connections and section 3 everything else, each seeing only its own lines', async () => {
      await save(lead, drawnWith([]));
      const forSection2 = await slotOf(section2);
      expect([forSection2.readableViews, forSection2.editableViews]).toEqual([
        ['integration'],
        ['integration'],
      ]);
      expect(forSection2.content.diagrams[0].lines).toEqual([]);
      const connection = { id: 'g1', from: 'srv', to: 'sql', ...facts };
      await save(section2, {
        ...forSection2.content,
        diagrams: [
          { ...forSection2.content.diagrams[0], lines: [connection] },
          forSection2.content.diagrams[1],
        ],
      });
      expect(
        (await slotOf(lead)).content.diagrams[0].lines.map((line) => line.id),
      ).toEqual(['g1', 'i1']);

      const moved = (await slotOf(section2)).content;
      moved.diagrams[0].boxes[0].x = 400;
      expect((await save(section2, moved, 403)).body.detail).toBe(
        'You cannot change the zones, boxes and infrastructure lines on this diagram.',
      );
      // Other applications and external parties: section 2 may place them too.
      const withApp = (await slotOf(section2)).content;
      withApp.diagrams[0].boxes.push({
        id: 'policy',
        label: 'Policy Admin',
        type: 'business',
        x: 600,
        y: 0,
      } as never);
      await save(section2, withApp);

      const forSection3 = await slotOf(section3);
      expect([forSection3.readableViews, forSection3.editableViews]).toEqual([
        ['infrastructure'],
        ['infrastructure'],
      ]);
      expect(
        forSection3.content.diagrams[0].lines.map((line) => line.id),
      ).toEqual(['i1']);
      const added = forSection3.content;
      added.diagrams[0].lines.push({
        id: 'g2',
        from: 'sql',
        to: 'srv',
        ...facts,
      });
      await save(section3, added);
      // What section 3 sends for integration connections it cannot see is ignored.
      expect(
        (await slotOf(lead)).content.diagrams[0].lines.map((line) => line.id),
      ).toEqual(['i1', 'g1']);
      const serverGone = (await slotOf(section3)).content;
      serverGone.diagrams[0].boxes = serverGone.diagrams[0].boxes.filter(
        (b) => b.id !== 'srv',
      );
      await save(section3, serverGone);
      expect(
        (await slotOf(lead)).content.diagrams[0].lines.map((line) => line.id),
      ).toEqual(['i1']);
    });

    it('keeps each tab under its id, and refuses ids that clash with lines the editor cannot see', async () => {
      await save(
        lead,
        drawnWith([{ id: 'g1', from: 'srv', to: 'sql', ...facts }]),
      );
      const forSection3 = (await slotOf(section3)).content;
      // Renaming the tab would lose section 2's connections kept with it.
      const renamed = (
        await save(
          section3,
          {
            ...forSection3,
            diagrams: [
              { ...forSection3.diagrams[0], id: 'prod2' },
              forSection3.diagrams[1],
            ],
          },
          400,
        )
      ).body;
      expect(renamed.errors).toEqual([
        {
          path: 'content.diagrams',
          message: 'Each tab keeps its id ("production", "non-production")',
        },
      ]);
      const clash = {
        ...forSection3,
        diagrams: [
          {
            ...forSection3.diagrams[0],
            lines: [
              ...forSection3.diagrams[0].lines,
              { id: 'g1', from: 'sql', to: 'srv', label: 'Backup' },
            ],
          },
          forSection3.diagrams[1],
        ],
      };
      expect((await save(section3, clash, 400)).body.errors).toEqual([
        { path: 'content.diagrams.0', message: '"g1" is used twice' },
      ]);
      expect(
        (await slotOf(lead)).content.diagrams[0].lines.map((line) => line.id),
      ).toEqual(['i1', 'g1']);
    });

    it('tells each editor the ids it must not reuse and which of its boxes carry lines of a view it cannot see', async () => {
      await save(
        lead,
        drawnWith([{ id: 'g1', from: 'srv', to: 'sql', ...facts }]),
      );
      expect((await slotOf(section3)).hidden).toEqual([
        {
          diagramId: 'production',
          takenIds: ['g1'],
          carriers: [
            { id: 'srv', view: 'integration' },
            { id: 'sql', view: 'integration' },
          ],
        },
        { diagramId: 'non-production', takenIds: [], carriers: [] },
      ]);
      expect((await slotOf(section2)).hidden[0]).toEqual({
        diagramId: 'production',
        takenIds: ['i1'],
        carriers: [
          { id: 'vnet', view: 'infrastructure' },
          { id: 'primary-dc', view: 'infrastructure' },
        ],
      });
      expect((await slotOf(lead)).hidden).toEqual([]);
    });

    it("copies production's integration connections to non-production when section 3 asks for Copy from production, and only then", async () => {
      const withNonProduction = (lines: object[]) => {
        const content = drawnWith([
          { id: 'g1', from: 'srv', to: 'sql', ...facts },
        ]);
        content.diagrams[1] = {
          ...content.diagrams[1],
          boxes: [
            {
              id: 'srv',
              label: 'CRM app',
              type: 'server',
              parentId: 'primary-dc',
              x: 20,
              y: 40,
            },
            {
              id: 'sql',
              label: 'CRM DB',
              type: 'server',
              parentId: 'primary-dc',
              x: 220,
              y: 40,
            },
          ] as never[],
          lines: lines as Line[],
        };
        return content;
      };
      await save(
        lead,
        withNonProduction([{ id: 'g7', from: 'sql', to: 'srv', ...facts }]),
      );
      // Section 3 cannot see integration connections: its copy of production carries none, the API copies them.
      const seen = (await slotOf(section3)).content;
      const copy = {
        ...seen,
        diagrams: [
          seen.diagrams[0],
          {
            ...seen.diagrams[0],
            id: 'non-production',
            title: 'Non-production',
            tab: 'non-production',
          },
        ],
      };
      await put(section3, infraPath(), {
        content: copy,
        version: (await slotOf(lead)).rowVersion,
        copyFromProduction: true,
      });
      expect(
        (await slotOf(lead)).content.diagrams[1].lines.map((line) => line.id),
      ).toEqual(['i1', 'g1']);
      await put(
        section2,
        infraPath(),
        {
          content: (await slotOf(section2)).content,
          version: (await slotOf(lead)).rowVersion,
          copyFromProduction: true,
        },
        403,
      );

      // Without asking for the copy, section 3 never changes non-production's integration connections, even to match production's.
      const reader = await createActor(
        t.orm,
        [
          {
            code: await createRole(t.orm, [
              'sad:network:update',
              'sad:solution-integration:read',
            ]),
            scopeType: 'application',
            scopeId: app.crm,
          },
        ],
        { label: 'sad-network-reader' },
      );
      const noIntegration = drawnWith([]);
      noIntegration.diagrams[1] = withNonProduction([
        { id: 'g7', from: 'sql', to: 'srv', ...facts },
      ]).diagrams[1];
      await save(lead, noIntegration);
      const cleared = (await slotOf(reader)).content;
      cleared.diagrams[1].lines = cleared.diagrams[1].lines.filter(
        (line) => line.layer !== 'integration',
      );
      expect((await save(reader, cleared, 403)).body.detail).toBe(
        'You cannot change the integration connections on this diagram.',
      );
    });

    it('lets section 2 place an external party in a zone that grows to hold it (zone sizes follow the boxes when automatic)', async () => {
      const content = drawnWith([]);
      content.diagrams[0].zones.push({
        id: 'third',
        label: '3rd party',
        kind: 'third-party',
        x: 700,
        y: 0,
        width: 200,
        height: 40,
      });
      await save(lead, content);
      const placed = (await slotOf(section2)).content;
      placed.diagrams[0].zones = placed.diagrams[0].zones.map((zone) =>
        (zone as { id: string }).id === 'third'
          ? { ...zone, width: 230, height: 130 }
          : zone,
      );
      placed.diagrams[0].boxes.push({
        id: 'bank',
        label: 'Bank',
        type: 'external',
        parentId: 'third',
        x: 20,
        y: 40,
      } as never);
      await save(section2, placed);
    });

    it('lets section 2 save an infrastructure diagram drawn before the hosting settings existed', async () => {
      await save(lead, drawnWith([]));
      const em = t.orm.em.fork();
      const row = await em.findOneOrFail(SadDiagram, {
        sadVersion: firstVersion,
        slot: 'infrastructure',
      });
      const { hosting: _, ...older } = row.content as unknown as Infra;
      row.content = older as never;
      await em.flush();
      const seen = (await slotOf(section2)).content;
      seen.diagrams[0].lines.push({
        id: 'g5',
        from: 'srv',
        to: 'sql',
        ...facts,
      });
      await save(section2, seen);
    });

    it("links API connections to the SAD's API inventory, whose API names section 2 readers see", async () => {
      const inventory = answersFor('api-inventory', {
        id: lead.id,
        name: 'Ada Author',
      }) as { apis: { value: object[] } };
      inventory.apis.value.push({ cells: {} }); // a row without its name yet
      const sections = (await get(lead, `/sad/versions/${firstVersion}`)).body
        .sections as {
        key: string;
        rowVersion: number;
        answers: Record<
          string,
          { value: { id: string; cells: { name: string } }[] }
        >;
      }[];
      const before = sections.find(
        (section) => section.key === 'api-inventory',
      )!;
      await put(lead, `/sad/versions/${firstVersion}/sections/api-inventory`, {
        answers: inventory,
        version: before.rowVersion,
      });
      const [row, unnamed] = (
        await get(lead, `/sad/versions/${firstVersion}`)
      ).body.sections.find(
        (section: { key: string }) => section.key === 'api-inventory',
      ).answers.apis.value;
      // Editors of integration connections pick from every API; readers who cannot read section 6 see only the linked ones.
      expect(
        (await get(section2, `/sad/versions/${firstVersion}/diagrams`)).body
          .apis,
      ).toEqual([
        { id: row.id, name: row.cells.name },
        { id: unnamed.id, name: '' },
      ]);
      expect(
        (await get(pm, `/sad/versions/${firstVersion}/diagrams`)).body.apis,
      ).toEqual([]);
      expect(
        (await get(section3, `/sad/versions/${firstVersion}/diagrams`)).body
          .apis,
      ).toEqual([]);

      const call = (api: string) => ({
        id: 'g3',
        from: 'srv',
        to: 'sql',
        ...facts,
        pattern: 'api',
        api: { id: api },
      });
      const unknown = (await save(lead, drawnWith([call(randomUUID())]), 400))
        .body;
      expect(unknown.errors).toEqual([
        {
          path: 'content.diagrams.0.lines.1.api.id',
          message: "Not an API in this SAD's API inventory",
        },
      ]);
      const linked = (await save(lead, drawnWith([call(row.id)]))).body;
      expect(
        linked.completion.find(
          (c: { section: string }) => c.section === 'solution-integration',
        ).missing,
      ).not.toContain('diagram:infrastructure:integration');
      expect(
        (await get(pm, `/sad/versions/${firstVersion}/diagrams`)).body.apis,
      ).toEqual([{ id: row.id, name: row.cells.name }]);
      await save(lead, {
        notApplicable: true,
        reason: 'SaaS, no infrastructure of ours',
      });
      expect(
        (await get(pm, `/sad/versions/${firstVersion}/diagrams`)).body.apis,
      ).toEqual([]);
      const undescribed = (
        await save(
          lead,
          drawnWith([
            { id: 'g4', from: 'srv', to: 'sql', layer: 'integration' },
          ]),
        )
      ).body;
      expect(
        undescribed.completion.find(
          (c: { section: string }) => c.section === 'solution-integration',
        ).missing,
      ).toContain('diagram:infrastructure:integration');
    });
  });

  it('leaves out answers to questions the template no longer asks, so older drafts still save', async () => {
    const em = t.orm.em.fork();
    const row = await em.findOneOrFail(SadSection, {
      sadVersion: firstVersion,
      section: 'solution-integration',
    });
    row.answers = {
      ...row.answers,
      'communication-matrix': { value: doc('Old matrix') },
    };
    await em.flush();
    const section = (
      await get(lead, `/sad/versions/${firstVersion}`)
    ).body.sections.find(
      (s: { key: string }) => s.key === 'solution-integration',
    );
    expect(section.answers['communication-matrix']).toBeUndefined();
    await put(
      lead,
      `/sad/versions/${firstVersion}/sections/solution-integration`,
      { answers: section.answers, version: section.rowVersion },
    );
  });
});

describe('Submitting and approval', () => {
  it('refuses an incomplete SAD, naming the sections still to answer (with counts only for sections the submitter views)', async () => {
    const res = (
      await post(lead, `/sad/versions/${firstVersion}/submit`, {}, 422)
    ).body;
    expect(res.detail).toMatch(
      /Answer every applicable question first: Application Details \(\d+\)/,
    );
    expect(
      (await post(vendor, `/sad/versions/${firstVersion}/submit`, {}, 422)).body
        .detail,
    ).toMatch(/Answer every applicable question first: Application Details, /);
  });

  it('refuses a submission no application manager could approve', async () => {
    const draft = (
      await post(
        billingLead,
        `/sad/applications/${app.billing}/drafts`,
        {},
        201,
      )
    ).body;
    await fill(billingLead, draft.id);
    const res = (
      await post(billingLead, `/sad/versions/${draft.id}/submit`, {}, 422)
    ).body;
    expect(res.detail).toBe(
      'No application manager is assigned to this application, so it cannot be approved. Ask an administrator to assign one.',
    );
    await post(billingLead, `/sad/versions/${draft.id}/cancel`);
  });

  it('says so when the only application manager is the submitter, who cannot approve their own SAD', async () => {
    const billing = { scopeType: 'application' as const, scopeId: app.billing };
    const selfManager = await createActor(
      t.orm,
      [
        { code: 'application-lead', ...billing },
        { code: 'application-manager', ...billing },
      ],
      { label: 'sad-self-manager' },
    );
    const draft = (
      await post(
        selfManager,
        `/sad/applications/${app.billing}/drafts`,
        {},
        201,
      )
    ).body;
    await fill(selfManager, draft.id);
    expect(
      (await post(selfManager, `/sad/versions/${draft.id}/submit`, {}, 422))
        .body.detail,
    ).toBe(
      'No application manager other than you is assigned to this application, and you cannot approve your own SAD. Ask an administrator to assign one.',
    );
    await post(selfManager, `/sad/versions/${draft.id}/cancel`);
  });

  it('submits a complete SAD; it is then read-only and approvers see it only from when their step is active (V5)', async () => {
    await fill(lead, firstVersion);
    await post(ea, `/sad/versions/${firstVersion}/submit`, {}, 403);
    const submitted = (await post(lead, `/sad/versions/${firstVersion}/submit`))
      .body;
    expect(submitted).toMatchObject({ status: 'in_approval' });
    expect(submitted.approvalInstanceId).toBeTruthy();
    await put(
      lead,
      `/sad/versions/${firstVersion}/sections/network`,
      { answers: {}, version: 1 },
      409,
    );
    await put(
      lead,
      `/sad/versions/${firstVersion}/diagrams/solution`,
      { content: drawn('solution'), version: 1 },
      409,
    );
    await get(
      lead,
      `/sad/versions/${firstVersion}/business-applications?q=bill`,
      403,
    );
    await get(lead, `/sad/versions/${firstVersion}/servers`, 403);
    await post(lead, `/sad/versions/${firstVersion}/submit`, {}, 409);
    await post(lead, `/sad/versions/${firstVersion}/cancel`, {}, 409);
    const view = (await get(lead, `/sad/versions/${firstVersion}`)).body;
    expect(view).toMatchObject({
      status: 'in_approval',
      approvalStatus: 'in_progress',
      canSubmit: false,
      canCancel: false,
      submittedBy: { id: lead.id },
    });
    expect(view.trm.live).toBe(false);
    expect(view.sections.every((s: { editable: boolean }) => !s.editable)).toBe(
      true,
    );

    expect(
      (await get(lead, `/sad/applications/${app.crm}`)).body.open,
    ).toMatchObject({
      status: 'in_approval',
      approvalStatus: 'in_progress',
      approvalInstanceId: submitted.approvalInstanceId,
    });
    await get(reviewer, `/sad/versions/${firstVersion}`, 404); // step not active yet
    await post(
      manager,
      `/approval-tasks/${await taskOf(manager, firstVersion)}/approve`,
      { comment: 'Looks right' },
    );
    const asApprover = (await get(reviewer, `/sad/versions/${firstVersion}`))
      .body;
    expect(asApprover).toMatchObject({ asApprover: true, canSubmit: false });
    expect(
      asApprover.sections.every(
        (s: { readable: boolean; editable: boolean }) =>
          s.readable && !s.editable,
      ),
    ).toBe(true);
    const diagrams = (
      await get(reviewer, `/sad/versions/${firstVersion}/diagrams`)
    ).body.items;
    expect(
      diagrams.map((d: { slot: string; editableViews: string[] }) => [
        d.slot,
        d.editableViews,
      ]),
    ).toEqual(DIAGRAM_SLOTS.map((slot) => [slot, []]));
    await put(
      reviewer,
      `/sad/versions/${firstVersion}/sections/network`,
      { answers: {}, version: 1 },
      403,
    );
    await put(
      reviewer,
      `/sad/versions/${firstVersion}/diagrams/infrastructure`,
      { content: drawn('infrastructure'), version: 1 },
      403,
    );
  });

  it('becomes version 1 when every step approves, filling the central API inventory', async () => {
    await post(
      reviewer,
      `/approval-tasks/${await taskOf(reviewer, firstVersion)}/approve`,
      {},
    );
    await post(
      architect,
      `/approval-tasks/${await taskOf(architect, firstVersion)}/approve`,
      {},
    );
    const overview = (await get(lead, `/sad/applications/${app.crm}`)).body;
    expect(overview).toMatchObject({
      current: { versionId: firstVersion, number: 1 },
      open: null,
      canStartDraft: true,
    });
    expect(overview.history).toEqual([
      expect.objectContaining({
        versionId: firstVersion,
        number: 1,
        status: 'current',
      }),
    ]);
    expect(
      (await get(reviewer, `/sad/versions/${firstVersion}`)).body,
    ).toMatchObject({ status: 'current', number: 1, asApprover: true }); // after acting
    expect(
      (await get(ea, '/sad/documents?status=current')).body.items.map(
        (i: { applicationId: string }) => i.applicationId,
      ),
    ).toEqual([app.crm]);
    expect(
      (await get(lead, '/sad/documents?status=current&q=CR')).body.items[0],
    ).toMatchObject({
      applicationId: app.crm,
      current: { number: 1 },
      open: null,
    });
    expect(
      (await get(lead, '/sad/documents?status=in_approval')).body.total,
    ).toBe(0);

    const apis = (await get(lead, '/sad/apis')).body;
    expect(apis.total).toBe(1);
    expect(apis.items[0]).toMatchObject({
      application: { id: app.crm, name: 'CRM' },
      name: 'API name value',
      productionUrl: 'Production URL value',
      uatUrl: 'UAT URL value',
      devUrl: 'DEV URL value',
      data: [{ object: 'Policy', attributes: 'policy number' }],
      classification: 'public',
      priority: 'critical',
      thirdParty: true,
      apiOwner: { id: lead.id },
    });
    expect((await get(vendor, '/sad/apis')).body.items[0]).toMatchObject({
      apiOwner: null,
      namesHidden: true,
    });
    expect((await get(lead, '/sad/apis')).body.items[0].namesHidden).toBe(
      false,
    );
    expect((await get(lead, '/sad/apis?priority=low')).body.total).toBe(0);
    expect(
      (
        await get(
          lead,
          '/sad/apis?thirdParty=yes&classification=public&environment=production&hosting=on-premise&q=name',
        )
      ).body.total,
    ).toBe(1);
    expect((await get(billingLead, '/sad/apis')).body.total).toBe(0);
    expect(
      (await get(billingLead, `/sad/apis?applicationId=${app.crm}`)).body.total,
    ).toBe(0);
    expect(
      (await get(lead, `/sad/apis?applicationId=${app.crm}`)).body.total,
    ).toBe(1);
    await get(nobody, '/sad/apis', 403);
    const audit = await t.orm.em
      .fork()
      .findOne(AuditLog, {
        action: 'sad.version.approved',
        resourceId: firstVersion,
      });
    expect(audit?.changes).toMatchObject({
      after: { status: 'current', number: 1 },
    });
  });

  it('copies the current version into a new draft; a returned draft is edited and resubmitted by its submitter (L6)', async () => {
    const draft = (
      await post(dev, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const view = (await get(dev, `/sad/versions/${draft.id}`)).body;
    expect(
      view.completion.every(
        (c: { missing: string[] }) => c.missing.length === 0,
      ),
    ).toBe(true);
    const copied = (await get(dev, `/sad/versions/${draft.id}/diagrams`)).body
      .items;
    expect(
      copied.map(
        (d: { slot: string; rowVersion: number; content: unknown }) => [
          d.slot,
          d.rowVersion,
          d.content,
        ],
      ),
    ).toEqual(DIAGRAM_SLOTS.map((slot) => [slot, 1, drawn(slot)]));
    await post(dev, `/sad/versions/${draft.id}/submit`);
    await post(
      manager,
      `/approval-tasks/${await taskOf(manager, draft.id)}/reject`,
      { comment: 'Add the DR test date' },
    );
    returnedDraft = draft.id;
    const returned = (await get(dev, `/sad/versions/${draft.id}`)).body;
    expect(returned).toMatchObject({
      status: 'draft',
      approvalStatus: 'returned',
      canSubmit: true,
    });
    const resiliency = returned.sections.find(
      (s: { key: string }) => s.key === 'resiliency',
    );
    await put(dev, `/sad/versions/${draft.id}/sections/resiliency`, {
      answers: {
        ...resiliency.answers,
        'dr-plan': { value: doc('DR tested 2026-09') },
      },
      version: resiliency.rowVersion,
    });
    await post(lead, `/sad/versions/${draft.id}/submit`, {}, 403); // only the submitter resubmits
    expect(
      (await get(dev, `/sad/versions/${draft.id}`)).body.submittedBy,
    ).toMatchObject({ id: dev.id }); // the refusal changed nothing
    expect(
      (await post(dev, `/sad/versions/${draft.id}/submit`)).body,
    ).toMatchObject({ status: 'in_approval' });
    for (const approver of [manager, reviewer, architect])
      await post(
        approver,
        `/approval-tasks/${await taskOf(approver, draft.id)}/approve`,
        {},
      );
    const overview = (await get(lead, `/sad/applications/${app.crm}`)).body;
    expect(overview.current).toMatchObject({ versionId: draft.id, number: 2 });
    expect(
      overview.history.map((h: { number: number; status: string }) => [
        h.number,
        h.status,
      ]),
    ).toEqual([
      [2, 'current'],
      [1, 'superseded'],
    ]);
  });

  it('lets the person who started a draft, or holders of "Cancel any SAD draft", cancel it', async () => {
    const managed = (
      await post(dev, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    expect(
      (await get(draftManager, `/sad/versions/${managed.id}`)).body.canCancel,
    ).toBe(true);
    expect(
      (await post(draftManager, `/sad/versions/${managed.id}/cancel`)).body,
    ).toMatchObject({ status: 'cancelled' });
    const draft = (
      await post(dev, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    await post(lead, `/sad/versions/${draft.id}/cancel`, {}, 403);
    expect(
      (await post(dev, `/sad/versions/${draft.id}/cancel`)).body,
    ).toMatchObject({ status: 'cancelled' });
    await get(dev, `/sad/versions/${draft.id}`, 404);
    expect(
      (await get(lead, `/sad/applications/${app.crm}`)).body.open,
    ).toBeNull();
    const another = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    await post(admin, `/sad/versions/${another.id}/cancel`);
  });

  it('lets the starter cancel after losing their edit rights, and "Cancel any SAD draft" holders without reading the SAD', async () => {
    const crm = { scopeType: 'application' as const, scopeId: app.crm };
    const starter = await createActor(t.orm, [{ code: 'developer', ...crm }], {
      label: 'sad-starter',
    });
    const started = (
      await post(starter, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    await t.orm.em.fork().nativeDelete(RoleAssignment, { user: starter.id });
    expect(
      (await post(starter, `/sad/versions/${started.id}/cancel`)).body,
    ).toMatchObject({ status: 'cancelled' });

    const cancelOnly = await createActor(
      t.orm,
      [{ code: await createRole(t.orm, ['sad:draft:manage']), ...crm }],
      { label: 'sad-cancel-only' },
    );
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    await post(nobody, `/sad/versions/${draft.id}/cancel`, {}, 404); // cannot see it
    await get(cancelOnly, `/sad/versions/${draft.id}`, 404); // cannot read it either
    // "Cancel any SAD draft" for another application's drafts does not reach this one.
    const elsewhere = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, ['sad:draft:manage']),
          scopeType: 'application',
          scopeId: app.billing,
        },
      ],
      { label: 'sad-cancel-billing' },
    );
    await post(elsewhere, `/sad/versions/${draft.id}/cancel`, {}, 404);
    expect(
      (await post(cancelOnly, `/sad/versions/${draft.id}/cancel`)).body,
    ).toMatchObject({ status: 'cancelled' });
    await post(cancelOnly, `/sad/versions/${randomUUID()}/cancel`, {}, 404);
    const cancelled = await t.orm.em
      .fork()
      .findOneOrFail(AuditLog, {
        action: 'sad.draft.cancelled',
        resourceId: draft.id,
      });
    expect(cancelled).toMatchObject({
      actorUserId: cancelOnly.id,
      changes: { before: { status: 'draft' }, after: { status: 'cancelled' } },
    });
  });

  it('returns the draft to editing when its approval is cancelled in the Approval Centre, and cancels a returned approval with the draft', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const instance = (await post(lead, `/sad/versions/${draft.id}/submit`)).body
      .approvalInstanceId;
    await post(lead, `/approval-instances/${instance}/cancel`);
    expect((await get(lead, `/sad/versions/${draft.id}`)).body).toMatchObject({
      status: 'draft',
      approvalInstanceId: null,
    });
    await post(lead, `/sad/versions/${draft.id}/submit`);
    await post(
      manager,
      `/approval-tasks/${await taskOf(manager, draft.id)}/reject`,
      { comment: 'Not now' },
    );
    // Only the submitter, or someone allowed to act for submitters, withdraws the returned approval.
    await post(draftManager, `/sad/versions/${draft.id}/cancel`, {}, 409);
    await post(lead, `/sad/versions/${draft.id}/cancel`);
    expect(
      (await get(lead, `/sad/applications/${app.crm}`)).body.open,
    ).toBeNull();

    const returned = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const returnedInstance = (
      await post(lead, `/sad/versions/${returned.id}/submit`)
    ).body.approvalInstanceId;
    await post(
      manager,
      `/approval-tasks/${await taskOf(manager, returned.id)}/reject`,
      { comment: 'Not now' },
    );
    await post(admin, `/sad/versions/${returned.id}/cancel`); // system admins hold "Act for submitters"
    expect(
      (await get(lead, `/approval-instances/${returnedInstance}`)).body.status,
    ).toBe('cancelled');
    expect(
      (await get(lead, `/sad/applications/${app.crm}`)).body.open,
    ).toBeNull();
  });
});

describe('Submitting is all or nothing', () => {
  const ACTIVE = {
    $in: ['in_progress', 'returned', 'awaiting_info'] as (
      'in_progress' | 'returned' | 'awaiting_info'
    )[],
  };

  it('leaves the draft as it was when the approval engine refuses the submission', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const em = t.orm.em.fork();
    const published = await em.findOneOrFail(ApprovalRuleSet, {
      workflowCode: 'sad-version',
      status: 'published',
    });
    await em.nativeUpdate(
      ApprovalRuleSet,
      { id: published.id },
      { status: 'retired' },
    );
    try {
      expect(
        (await post(lead, `/sad/versions/${draft.id}/submit`, {}, 422)).body
          .detail,
      ).toBe('No published approval rules for "sad-version"');
    } finally {
      await em.nativeUpdate(
        ApprovalRuleSet,
        { id: published.id },
        { status: 'published' },
      );
    }
    expect((await get(lead, `/sad/versions/${draft.id}`)).body).toMatchObject({
      status: 'draft',
      approvalInstanceId: null,
      submittedBy: null,
      submittedAt: null,
    });
    await post(lead, `/sad/versions/${draft.id}/cancel`);
  });

  it('lets one of two submissions at once through', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const submit = () =>
      http()
        .post(`/api/v1/sad/versions/${draft.id}/submit`)
        .set(lead.auth)
        .send({});
    const statuses = (await Promise.all([submit(), submit(), submit()])).map(
      (res) => res.status,
    );
    expect(statuses.sort((a, b) => a - b)).toEqual([200, 409, 409]);
    expect(
      await t.orm.em
        .fork()
        .count(ApprovalInstance, { subjectId: draft.id, status: ACTIVE }),
    ).toBe(1);
    const { approvalInstanceId } = (
      await get(lead, `/sad/versions/${draft.id}`)
    ).body;
    await post(lead, `/approval-instances/${approvalInstanceId}/cancel`);
    await post(lead, `/sad/versions/${draft.id}/cancel`);
  });

  it('never keeps two approvals in progress for one record', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const { approvalInstanceId } = (
      await post(lead, `/sad/versions/${draft.id}/submit`)
    ).body;
    const em = t.orm.em.fork();
    const first = await em.findOneOrFail(ApprovalInstance, approvalInstanceId);
    const {
      workflowCode,
      subjectType,
      subjectId,
      subjectTitle,
      ruleSet,
      ruleKey,
      steps,
      context,
      status,
      currentStepIndex,
      round,
      submittedBy,
    } = first;
    em.create(ApprovalInstance, {
      workflowCode,
      subjectType,
      subjectId,
      subjectTitle,
      ruleSet,
      ruleKey,
      steps,
      context,
      status,
      currentStepIndex,
      round,
      submittedBy,
    });
    await expect(em.flush()).rejects.toThrow(/unique/i);
    await post(lead, `/approval-instances/${approvalInstanceId}/cancel`);
    await post(lead, `/sad/versions/${draft.id}/cancel`);
  });

  it('runs the SAD checks when the Approval Centre resubmits a returned SAD', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const { approvalInstanceId } = (
      await post(lead, `/sad/versions/${draft.id}/submit`)
    ).body;
    await post(
      manager,
      `/approval-tasks/${await taskOf(manager, draft.id)}/reject`,
      { comment: 'Redo the overview' },
    );
    const view = async () =>
      (await get(lead, `/sad/versions/${draft.id}`)).body;
    const solution = (await view()).sections.find(
      (s: { key: string }) => s.key === 'solution-integration',
    );
    const without = Object.fromEntries(
      Object.entries(solution.answers).filter(
        ([key]) => key !== 'solution-overview',
      ),
    );
    const saved = (
      await put(
        lead,
        `/sad/versions/${draft.id}/sections/solution-integration`,
        { answers: without, version: solution.rowVersion },
      )
    ).body;
    expect(
      (
        await post(
          lead,
          `/approval-instances/${approvalInstanceId}/resubmit`,
          {},
          422,
        )
      ).body.detail,
    ).toBe(
      'Answer every applicable question first: Solution & Integration Architecture (1).',
    );
    expect(await view()).toMatchObject({
      status: 'draft',
      approvalStatus: 'returned',
    });

    await put(lead, `/sad/versions/${draft.id}/sections/solution-integration`, {
      answers: solution.answers,
      version: saved.rowVersion,
    });
    const before = (await view()).submittedAt;
    await post(lead, `/approval-instances/${approvalInstanceId}/resubmit`);
    const resubmitted = await view();
    expect(resubmitted).toMatchObject({
      status: 'in_approval',
      approvalStatus: 'in_progress',
      submittedBy: { id: lead.id },
    });
    expect(Date.parse(resubmitted.submittedAt)).toBeGreaterThan(
      Date.parse(before),
    );
    expect(resubmitted.history.at(-1)).toMatchObject({
      action: 'resubmitted',
      user: { id: lead.id },
    });
    await post(lead, `/approval-instances/${approvalInstanceId}/cancel`);
    await post(lead, `/sad/versions/${draft.id}/cancel`);
  });

  it("ignores approval events that are not about the version's own approval", async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const { approvalInstanceId } = (
      await post(lead, `/sad/versions/${draft.id}/submit`)
    ).body;
    const sad = t.app.get(SadService);
    for (const status of [
      'approved',
      'returned',
      'cancelled',
      'in_progress',
    ] as const) {
      await sad.onApprovalStatus({
        instanceId: randomUUID(),
        workflowCode: 'sad-version',
        subjectType: 'sad-version',
        subjectId: draft.id,
        status,
      });
    }
    expect((await get(lead, `/sad/versions/${draft.id}`)).body).toMatchObject({
      status: 'in_approval',
      number: null,
      approvalInstanceId,
    });
    await post(lead, `/approval-instances/${approvalInstanceId}/cancel`);
    await post(lead, `/sad/versions/${draft.id}/cancel`);
  });
});

describe('Approved versions without APIs, and refusals at the edges', () => {
  const approve = async (versionId: string) => {
    for (const approver of [manager, reviewer, architect])
      await post(
        approver,
        `/approval-tasks/${await taskOf(approver, versionId)}/approve`,
        {},
      );
  };
  const sectionOf = async (versionId: string, key: string) =>
    (await get(lead, `/sad/versions/${versionId}`)).body.sections.find(
      (s: { key: string }) => s.key === key,
    );

  it('finds an API by any environment it has a URL for, and lists typed owners by name, hidden like picked ones', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const inventory = await sectionOf(draft.id, 'api-inventory');
    const [row] = inventory.answers.apis.value;
    const devOnly = {
      ...row,
      cells: {
        ...row.cells,
        productionUrl: undefined,
        uatUrl: undefined,
        devUrl: 'https://dev.aia.com/crm',
        apiOwner: { name: 'Vendor support desk' },
      },
    };
    await put(lead, `/sad/versions/${draft.id}/sections/api-inventory`, {
      answers: { ...inventory.answers, apis: { value: [devOnly] } },
      version: inventory.rowVersion,
    });
    await post(lead, `/sad/versions/${draft.id}/submit`);
    await approve(draft.id);
    const found = async (query: string) =>
      (await get(lead, `/sad/apis?applicationId=${app.crm}${query}`)).body
        .items;
    expect(await found('&environment=dev')).toEqual([
      expect.objectContaining({
        devUrl: 'https://dev.aia.com/crm',
        productionUrl: null,
        apiOwner: { name: 'Vendor support desk' },
      }),
    ]);
    expect(await found('&environment=production')).toEqual([]);
    expect(await found('&environment=uat')).toEqual([]);
    expect(await found('&q=dev.aia.com')).toHaveLength(1);
    expect(
      (await get(vendor, `/sad/apis?applicationId=${app.crm}`)).body.items[0],
    ).toMatchObject({ apiOwner: null, namesHidden: true });
    await get(lead, '/sad/apis?environment=staging', 400);
  });

  it('lists no APIs once an approved version says the API table does not apply, or that the application uses none', async () => {
    const notApplicable = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const apis = await sectionOf(notApplicable.id, 'api-inventory');
    await put(
      lead,
      `/sad/versions/${notApplicable.id}/sections/api-inventory`,
      {
        answers: {
          ...apis.answers,
          apis: { notApplicable: true, reason: 'APIs retired' },
        },
        version: apis.rowVersion,
      },
    );
    await post(lead, `/sad/versions/${notApplicable.id}/submit`);
    await approve(notApplicable.id);
    expect(
      (await get(lead, `/sad/apis?applicationId=${app.crm}`)).body.total,
    ).toBe(0);

    const none = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const security = await sectionOf(none.id, 'security-design');
    await put(lead, `/sad/versions/${none.id}/sections/security-design`, {
      answers: {
        ...security.answers,
        'uses-apis': { value: { answer: 'no' } },
      },
      version: security.rowVersion,
    });
    await post(billingEditor, `/sad/versions/${none.id}/submit`, {}, 403); // reads CRM's SAD but edits none of it
    await post(lead, `/sad/versions/${none.id}/submit`);
    await approve(none.id);
    expect(
      (await get(lead, `/sad/apis?applicationId=${app.crm}`)).body.total,
    ).toBe(0);
    expect((await get(admin, '/sad/apis')).body.total).toBeGreaterThanOrEqual(
      0,
    ); // system admins see every application's APIs
  });

  it('puts right a version whose approval moved on while updating the version failed', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    await post(lead, `/sad/versions/${draft.id}/submit`);
    const sad = t.app.get(SadService);
    // The job runs every five minutes: here it runs only when the test says.
    const job = t.app.get(SchedulerRegistry).getCronJob('sad-approval-sync');
    await job.stop();
    const failing = vi
      .spyOn(sad, 'onApprovalStatus')
      .mockRejectedValueOnce(new Error('database went away'));
    try {
      await approve(draft.id);
      failing.mockRestore();
      expect((await get(lead, `/sad/versions/${draft.id}`)).body).toMatchObject(
        { status: 'in_approval', approvalStatus: 'approved' },
      );
      expect(await sad.syncApprovals()).toBe(1);
      expect((await get(lead, `/sad/versions/${draft.id}`)).body).toMatchObject(
        { status: 'current', approvalStatus: 'approved' },
      );
      expect(await sad.syncApprovals()).toBe(0);
    } finally {
      failing.mockRestore();
      job.start();
    }
  });

  it('refuses a draft for an application that does not exist, and ignores approval events it has no version for', async () => {
    await post(lead, `/sad/applications/${randomUUID()}/drafts`, {}, 404);
    const sad = t.app.get(SadService);
    await sad.onApprovalStatus({
      instanceId: randomUUID(),
      workflowCode: 'sad-version',
      subjectType: 'sad-version',
      subjectId: randomUUID(),
      status: 'approved',
    });
    const overview = (await get(lead, `/sad/applications/${app.crm}`)).body;
    // A status the SAD does not react to changes nothing.
    await sad.onApprovalStatus({
      instanceId: randomUUID(),
      workflowCode: 'sad-version',
      subjectType: 'sad-version',
      subjectId: overview.current.versionId,
      status: 'awaiting_info',
    });
    expect(
      (await get(lead, `/sad/versions/${overview.current.versionId}`)).body
        .status,
    ).toBe('current');
  });

  it("finds approvers assigned on the application's portfolio at every step, and refuses a submission no solution architect could approve", async () => {
    const em = t.orm.em.fork();
    const portfolio = em.create(Portfolio, {
      name: `Billing portfolio ${randomUUID().slice(0, 6)}`,
    });
    em.create(TrmApplicationPortfolio, {
      application: em.getReference(TrmApplication, app.billing),
      portfolio,
    });
    await em.flush();
    const billingManager = await createActor(
      t.orm,
      [
        {
          code: 'application-manager',
          scopeType: 'application',
          scopeId: app.billing,
        },
      ],
      { label: 'billing-manager' },
    );
    const draft = (
      await post(
        billingLead,
        `/sad/applications/${app.billing}/drafts`,
        {},
        201,
      )
    ).body;
    await fill(billingLead, draft.id);
    // The CRM solution architect does not cover Billing.
    expect(
      (await post(billingLead, `/sad/versions/${draft.id}/submit`, {}, 422))
        .body.detail,
    ).toBe(
      'No solution architect is assigned to this application, so it cannot be approved. Ask an administrator to assign one.',
    );
    const portfolioArchitect = await createActor(
      t.orm,
      [
        {
          code: 'solution-architect',
          scopeType: 'portfolio',
          scopeId: portfolio.id,
        },
      ],
      { label: 'portfolio-sa' },
    );
    await post(billingLead, `/sad/versions/${draft.id}/submit`);
    // Followers of the portfolio's approvals see it in All approvals (the record is in the portfolio through TRM).
    const follower = await createActor(
      t.orm,
      [
        {
          code: await createRole(t.orm, ['approvals:instance:read']),
          scopeType: 'portfolio',
          scopeId: portfolio.id,
        },
      ],
      { label: 'portfolio-follower' },
    );
    const listed = (await get(follower, '/approval-instances')).body.items.map(
      (item: { subjectId: string }) => item.subjectId,
    );
    expect(listed).toContain(draft.id);
    for (const approver of [billingManager, reviewer, portfolioArchitect])
      await post(
        approver,
        `/approval-tasks/${await taskOf(approver, draft.id)}/approve`,
        {},
      );
    expect(
      (await get(billingLead, `/sad/versions/${draft.id}`)).body,
    ).toMatchObject({ status: 'current', number: 1 });
  });
});

describe('Version Control', () => {
  it('lists what happened to a version in date order: every approval round, question, answer, return, withdrawal and resubmission', async () => {
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const withdrawn = (await post(lead, `/sad/versions/${draft.id}/submit`))
      .body.approvalInstanceId;
    await post(lead, `/approval-instances/${withdrawn}/cancel`);
    const instance = (await post(lead, `/sad/versions/${draft.id}/submit`)).body
      .approvalInstanceId;
    await post(
      manager,
      `/approval-tasks/${await taskOf(manager, draft.id)}/request-info`,
      { comment: 'Which region?' },
    );
    await post(lead, `/approval-instances/${instance}/respond-info`, {
      answer: 'Malaysia West',
    });
    await post(
      manager,
      `/approval-tasks/${await taskOf(manager, draft.id)}/approve`,
      { comment: 'Fine' },
    );
    await post(
      reviewer,
      `/approval-tasks/${await taskOf(reviewer, draft.id)}/reject`,
      { comment: 'Add the DR test date' },
    );
    await post(lead, `/sad/versions/${draft.id}/submit`);
    for (const approver of [reviewer, architect])
      await post(
        approver,
        `/approval-tasks/${await taskOf(approver, draft.id)}/approve`,
        {},
      );

    const { history } = (await get(lead, `/sad/versions/${draft.id}`)).body;
    expect(
      history.map(
        (row: {
          action: string;
          user: { id: string } | null;
          step: string | null;
          comment: string | null;
        }) => [row.action, row.user?.id ?? null, row.step, row.comment],
      ),
    ).toEqual([
      ['started', lead.id, null, null],
      ['submitted', lead.id, null, null],
      ['withdrawn', lead.id, null, null],
      ['submitted', lead.id, null, null],
      ['info_requested', manager.id, 'Application manager', 'Which region?'],
      ['answered', lead.id, 'Application manager', 'Malaysia West'],
      ['approved', manager.id, 'Application manager', 'Fine'],
      ['returned', reviewer.id, 'Reviewer', 'Add the DR test date'],
      ['resubmitted', lead.id, null, null],
      ['approved', reviewer.id, 'Reviewer', null],
      ['approved', architect.id, 'Solution architect', null],
      ['version_approved', null, null, null],
    ]);
    const times = history.map((row: { at: string }) => Date.parse(row.at));
    expect(times).toEqual([...times].sort((x, y) => x - y));
    // The audit trail has each step, before and after.
    const audited = await t.orm.em
      .fork()
      .find(
        AuditLog,
        { resourceId: draft.id, action: { $like: 'sad.%' } },
        { orderBy: { occurredAt: 'asc', id: 'asc' } },
      );
    expect(audited.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'sad.draft.started',
        'sad.version.submitted',
        'sad.version.cancelled',
        'sad.version.returned',
        'sad.version.resubmitted',
        'sad.version.approved',
      ]),
    );
    expect(
      audited.find((row) => row.action === 'sad.version.returned')?.changes,
    ).toMatchObject({
      before: { status: 'in_approval' },
      after: { status: 'draft' },
    });
    // Names follow the reader's personal data access; the rows themselves do not.
    const asVendor = (await get(vendor, `/sad/versions/${draft.id}`)).body
      .history;
    expect(
      asVendor.map((row: { action: string; user: unknown }) => [
        row.action,
        row.user,
      ]),
    ).toEqual(history.map((row: { action: string }) => [row.action, null]));
    await http()
      .get(`/api/v1/sad/versions/${draft.id}/pdf`)
      .set(lead.auth)
      .expect(200);
  });
});

describe('Local authentication', () => {
  it("flags applications doing their own authentication: the approved answer, else the draft's, for section 5 readers only", async () => {
    const hr = (
      await t.orm.em.fork().findOneOrFail(TrmApplication, { name: 'HR Portal' })
    ).id;
    const draft = (await post(admin, `/sad/applications/${hr}/drafts`, {}, 201))
      .body;
    const security = (
      await get(admin, `/sad/versions/${draft.id}`)
    ).body.sections.find((s: { key: string }) => s.key === 'security-design');
    const local = {
      'authentication-method': {
        value: { selected: 'other', other: 'Kerberos on the mainframe' },
      },
      'local-auth-justification': { value: doc('The mainframe has no SSO') },
    };
    await put(admin, `/sad/versions/${draft.id}/sections/security-design`, {
      answers: local,
      version: security.rowVersion,
    });
    // The justification must be written: it cannot be marked Not applicable.
    await put(
      admin,
      `/sad/versions/${draft.id}/sections/security-design`,
      {
        answers: {
          ...local,
          'local-auth-justification': { notApplicable: true, reason: 'Legacy' },
        },
        version: security.rowVersion + 1,
      },
      400,
    );

    const em = t.orm.em.fork();
    const currentId = (await get(lead, `/sad/applications/${app.crm}`)).body
      .current.versionId;
    const row = await em.findOneOrFail(SadSection, {
      sadVersion: currentId,
      section: 'security-design',
    });
    const before = row.answers;
    row.answers = {
      ...before,
      'authentication-method': {
        value: { selected: 'local-custom-authentication' },
      },
    };
    await em.flush();
    try {
      const listed = async (actor: Actor, query = '') =>
        (await get(actor, `/sad/documents?pageSize=100${query}`)).body
          .items as {
          applicationId: string;
          localAuthentication: string | null;
        }[];
      const flagOf = (
        items: { applicationId: string; localAuthentication: string | null }[],
        id: string,
      ) => items.find((item) => item.applicationId === id)?.localAuthentication;
      const forAdmin = await listed(admin);
      expect(flagOf(forAdmin, app.crm)).toBe('approved');
      expect(flagOf(forAdmin, hr)).toBe('draft');
      expect(flagOf(forAdmin, app.billing)).toBeNull();
      expect(
        (await listed(admin, '&authentication=local'))
          .map((item) => item.applicationId)
          .sort(),
      ).toEqual([app.crm, hr].sort());
      // Readers of other sections only get no marker, and the filter leaves the application out.
      expect(flagOf(await listed(vendor), app.crm)).toBeNull();
      expect(await listed(vendor, '&authentication=local')).toEqual([]);

      expect(
        (await get(lead, `/sad/applications/${app.crm}`)).body
          .localAuthentication,
      ).toBe('approved');
      expect(
        (await get(admin, `/sad/applications/${hr}`)).body.localAuthentication,
      ).toBe('draft');
      expect(
        (await get(vendor, `/sad/applications/${app.crm}`)).body
          .localAuthentication,
      ).toBeNull();
      expect(
        (await get(lead, `/sad/versions/${currentId}`)).body
          .localAuthentication,
      ).toBe(true);
      expect(
        (await get(admin, `/sad/versions/${draft.id}`)).body
          .localAuthentication,
      ).toBe(true);
      expect(
        (await get(vendor, `/sad/versions/${currentId}`)).body
          .localAuthentication,
      ).toBeNull();
      await http()
        .get(`/api/v1/sad/versions/${currentId}/pdf`)
        .set(lead.auth)
        .expect(200);
    } finally {
      row.answers = before;
      await em.flush();
      await post(admin, `/sad/versions/${draft.id}/cancel`);
    }
    expect(
      (await get(lead, `/sad/applications/${app.crm}`)).body
        .localAuthentication,
    ).toBeNull();
  });
});

describe('Questions later templates removed', () => {
  it("shows an approved version's answers to them; drafts copied from it, and drafts, leave them out", async () => {
    const currentId = (await get(lead, `/sad/applications/${app.crm}`)).body
      .current.versionId;
    const em = t.orm.em.fork();
    const row = await em.findOneOrFail(SadSection, {
      sadVersion: currentId,
      section: 'solution-integration',
    });
    const before = row.answers;
    row.answers = {
      ...before,
      'communication-matrix': { value: doc('Web to API on 443') },
      'never-asked': { value: 'x' },
    };
    await em.flush();
    try {
      const answersOf = async (versionId: string) =>
        (await get(lead, `/sad/versions/${versionId}`)).body.sections.find(
          (s: { key: string }) => s.key === 'solution-integration',
        ).answers;
      const shown = await answersOf(currentId);
      expect(shown['communication-matrix']).toEqual({
        value: doc('Web to API on 443'),
      });
      expect(shown['never-asked']).toBeUndefined();
      await http()
        .get(`/api/v1/sad/versions/${currentId}/pdf`)
        .set(lead.auth)
        .expect(200);
      const draft = (
        await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
      ).body;
      expect(
        (await answersOf(draft.id))['communication-matrix'],
      ).toBeUndefined();
      await post(lead, `/sad/versions/${draft.id}/cancel`);
    } finally {
      row.answers = before;
      await em.flush();
    }
  });
});

describe('PDF export', () => {
  it('exports a version with only what the reader may see, and audits it', async () => {
    const res = await http()
      .get(`/api/v1/sad/versions/${firstVersion}/pdf`)
      .set(lead.auth)
      .buffer(true)
      .parse((r, done) => {
        const chunks: Buffer[] = [];
        r.on('data', (chunk: Buffer) => chunks.push(chunk));
        r.on('end', () => done(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="SAD-CRM-v1.pdf"',
    );
    expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await http()
      .get(`/api/v1/sad/versions/${firstVersion}/pdf`)
      .set(vendor.auth)
      .expect(200);
    // Version 2 went through a return before approval: its history has both.
    const second = await http()
      .get(`/api/v1/sad/versions/${returnedDraft}/pdf`)
      .set(lead.auth)
      .expect(200);
    expect(second.headers['content-disposition']).toBe(
      'attachment; filename="SAD-CRM-v2.pdf"',
    );
    await get(nobody, `/sad/versions/${firstVersion}/pdf`, 404);
    expect(
      await t.orm.em
        .fork()
        .count(AuditLog, {
          action: 'sad.version.exported',
          resourceId: firstVersion,
        }),
    ).toBe(2);
    const draft = (
      await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
    ).body;
    const draftPdf = await http()
      .get(`/api/v1/sad/versions/${draft.id}/pdf`)
      .set(vendor.auth)
      .expect(200);
    expect(draftPdf.headers['content-disposition']).toBe(
      'attachment; filename="SAD-CRM-draft.pdf"',
    );
    await post(lead, `/sad/versions/${draft.id}/cancel`);
  });
});

describe('Backup retention list', () => {
  it('is read by backup authors and maintained by system admins with row versions', async () => {
    expect(retentionIds).toHaveLength(10);
    await get(nobody, '/sad/retention-standards', 403);
    await post(
      lead,
      '/sad/retention-standards',
      {
        serviceType: 'X',
        dataType: 'Y',
        yearly: '-',
        monthly: '-',
        weekly: '-',
        daily: '-',
      },
      403,
    );
    const created = (
      await post(
        admin,
        '/sad/retention-standards',
        {
          serviceType: 'Cosmos DB',
          dataType: 'Others',
          yearly: '-',
          monthly: '12 months',
          weekly: '5 weeks',
          daily: '7 days',
        },
        201,
      )
    ).body;
    expect(created).toMatchObject({
      position: 11,
      active: true,
      comment: null,
      version: 1,
    });
    await http()
      .patch(`/api/v1/sad/retention-standards/${created.id}`)
      .set(admin.auth)
      .send({ active: false, version: 0 })
      .expect(409);
    const retired = (
      await http()
        .patch(`/api/v1/sad/retention-standards/${created.id}`)
        .set(admin.auth)
        .send({ active: false, comment: 'Retired', version: 1 })
        .expect(200)
    ).body;
    expect(retired).toMatchObject({
      active: false,
      comment: 'Retired',
      version: 2,
    });
    await http()
      .patch(`/api/v1/sad/retention-standards/${randomUUID()}`)
      .set(admin.auth)
      .send({ version: 1 })
      .expect(404);
    expect(
      (await get(lead, '/sad/retention-standards')).body.items.map(
        (r: { id: string }) => r.id,
      ),
    ).not.toContain(created.id);
    expect(
      (await get(admin, '/sad/retention-standards')).body.items.map(
        (r: { id: string }) => r.id,
      ),
    ).toContain(created.id);
    // Vendors without the backup section get none; bodies are checked.
    await get(vendor, '/sad/retention-standards', 403);
    await post(
      admin,
      '/sad/retention-standards',
      {
        serviceType: '',
        dataType: 'Y',
        yearly: '-',
        monthly: '-',
        weekly: '-',
        daily: '-',
      },
      400,
    );
    await post(
      admin,
      '/sad/retention-standards',
      {
        serviceType: 'X',
        dataType: 'Y',
        yearly: '-',
        monthly: '-',
        weekly: '-',
        daily: '-',
        extra: true,
      },
      400,
    );
    await http()
      .patch(`/api/v1/sad/retention-standards/${created.id}`)
      .set(admin.auth)
      .send({ yearly: 'x'.repeat(51), version: 2 })
      .expect(400);
    expect(
      await t.orm.em
        .fork()
        .count(AuditLog, {
          action: { $in: ['sad.retention.created', 'sad.retention.updated'] },
          resourceId: created.id,
        }),
    ).toBe(2);
  });

  it("keeps a version's ticked rows as they were at submit, for every reader of the backup section; drafts show the list now, retired rows too", async () => {
    const currentId = (await get(lead, `/sad/applications/${app.crm}`)).body
      .current.versionId;
    const frozen = (await get(lead, `/sad/versions/${currentId}`)).body
      .retention;
    expect(frozen).toEqual([
      expect.objectContaining({ id: retentionIds[0], active: true }),
    ]);
    // Approvers need no backup permission to read the values.
    expect(
      (await get(reviewer, `/sad/versions/${currentId}`)).body.retention,
    ).toEqual(frozen);
    expect(
      (await get(vendor, `/sad/versions/${currentId}`)).body.retention,
    ).toEqual([]); // cannot read the backup section
    const row = (await get(admin, '/sad/retention-standards')).body.items.find(
      (r: { id: string }) => r.id === retentionIds[0],
    );
    const changed = (
      await http()
        .patch(`/api/v1/sad/retention-standards/${row.id}`)
        .set(admin.auth)
        .send({ yearly: '9 years', active: false, version: row.version })
        .expect(200)
    ).body;
    try {
      expect(
        (await get(lead, `/sad/versions/${currentId}`)).body.retention,
      ).toEqual(frozen);
      const draft = (
        await post(lead, `/sad/applications/${app.crm}/drafts`, {}, 201)
      ).body;
      expect(
        (await get(lead, `/sad/versions/${draft.id}`)).body.retention,
      ).toEqual([
        expect.objectContaining({
          id: row.id,
          yearly: '9 years',
          active: false,
        }),
      ]);
      expect(
        (await get(lead, '/sad/retention-standards')).body.items.map(
          (r: { id: string }) => r.id,
        ),
      ).not.toContain(row.id);
      await post(lead, `/sad/versions/${draft.id}/cancel`);
    } finally {
      await http()
        .patch(`/api/v1/sad/retention-standards/${row.id}`)
        .set(admin.auth)
        .send({ yearly: row.yearly, active: true, version: changed.version })
        .expect(200);
    }
  });
});

describe('Calls between applications', () => {
  it("lists the calls approved SADs describe, with what they call and do only for readers of that SAD's section 2", async () => {
    // CRM's approved solution diagram: its core service calls Billing (two-way), and Billing calls CRM.
    const current = (await get(lead, `/sad/applications/${app.crm}`)).body
      .current as { versionId: string; number: number };
    const gone = randomUUID(); // an application no longer in TRM
    const em = t.orm.em.fork();
    const row = await em.findOneOrFail(SadDiagram, {
      sadVersion: current.versionId,
      slot: 'solution',
    });
    row.content = {
      diagrams: [
        {
          id: 'solution',
          title: 'Solution diagram',
          sizing: 'auto',
          zones: [
            {
              id: 'zone-1',
              label: 'CRM',
              kind: 'This application',
              x: 0,
              y: 0,
              width: 300,
              height: 200,
            },
          ],
          boxes: [
            {
              id: 'core',
              label: 'Core services',
              type: 'part',
              parentId: 'zone-1',
              x: 20,
              y: 40,
            },
            {
              id: 'billing',
              label: 'Billing (as picked)',
              type: 'business',
              application: { id: app.billing, number: 'APM-Billing' },
              x: 500,
              y: 0,
            },
            { id: 'bank', label: 'Bank', type: 'external', x: 500, y: 200 },
            {
              id: 'ghost',
              label: 'Old Billing',
              type: 'business',
              application: { id: gone, number: 'APM-GONE' },
              x: 500,
              y: 400,
            },
          ],
          lines: [
            {
              id: 'l1',
              from: 'core',
              to: 'billing',
              calls: 'Billing API: create invoice',
              does: 'Bills premiums',
              twoWay: true,
            },
            {
              id: 'l2',
              from: 'billing',
              to: 'zone-1',
              calls: 'CRM Customer API',
            },
            { id: 'l3', from: 'core', to: 'bank', calls: 'Payment API' },
            { id: 'l4', from: 'core', to: 'ghost', calls: 'Old invoices' },
          ],
        },
      ],
    };
    await em.flush();
    const version = await em.findOneOrFail(SadVersion, current.versionId);
    const source = {
      applicationId: app.crm,
      applicationName: 'CRM',
      versionId: current.versionId,
      number: current.number,
      approvedAt: version.approvedAt!.toISOString(),
    };
    const crm = { id: app.crm, name: 'CRM', number: 'APM-CRM' };
    const billing = { id: app.billing, name: 'Billing', number: 'APM-Billing' };

    const forLead = (await get(lead, `/sad/applications/${app.crm}/calls`)).body
      .items;
    expect(forLead).toEqual([
      {
        caller: crm,
        callee: billing,
        calls: 'Billing API: create invoice',
        does: 'Bills premiums',
        restricted: false,
        twoWay: true,
        source,
      },
      {
        caller: billing,
        callee: crm,
        calls: 'CRM Customer API',
        does: null,
        restricted: false,
        twoWay: false,
        source,
      },
      // An application gone from TRM shows as its block was picked.
      {
        caller: crm,
        callee: { id: gone, name: 'Old Billing', number: 'APM-GONE' },
        calls: 'Old invoices',
        does: null,
        restricted: false,
        twoWay: false,
        source,
      },
    ]);
    // Billing's lead sees CRM's statements about Billing, but cannot read CRM's section 2.
    const forBilling = (
      await get(billingLead, `/sad/applications/${app.billing}/calls`)
    ).body.items;
    expect(forBilling).toEqual([
      {
        caller: crm,
        callee: billing,
        calls: null,
        does: null,
        restricted: true,
        twoWay: true,
        source,
      },
      {
        caller: billing,
        callee: crm,
        calls: null,
        does: null,
        restricted: true,
        twoWay: false,
        source,
      },
    ]);
    // Section 2 readers of CRM's SAD without TRM access (the vendor) see CRM's calls too.
    expect(
      (await get(vendor, `/sad/applications/${app.crm}/calls`)).body.items,
    ).toHaveLength(3);
    await get(billingLead, `/sad/applications/${app.crm}/calls`, 404);
    await get(nobody, `/sad/applications/${app.crm}/calls`, 404);
    await get(lead, `/sad/applications/${randomUUID()}/calls`, 404);
    // An application no approved SAD mentions has no calls.
    const hr = (
      await t.orm.em.fork().findOneOrFail(TrmApplication, { name: 'HR Portal' })
    ).id;
    expect(
      (await get(admin, `/sad/applications/${hr}/calls`)).body.items,
    ).toEqual([]);
  });
});
