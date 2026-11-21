import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApprovalTask } from '../../src/modules/approvals/approval.entities.js';
import { ApprovalEscalationService } from '../../src/modules/approvals/approval-escalation.service.js';
import { ApprovalWorkflowRegistry } from '../../src/modules/approvals/approval-workflow.registry.js';
import { ApprovalService, type SubmitInput } from '../../src/modules/approvals/approval.service.js';
import { createActor, createRole, type Actor } from './support/actors.js';
import { createTestApp, type TestApp } from './support/app.js';

let t: TestApp;
let approvals: ApprovalService;
let ruleAdmin: Actor;
let submitter: Actor;
let otherSubmitter: Actor;
let techExco: Actor;
let financeExco: Actor;
let arb1: Actor;
let arb2: Actor;
let arbChair: Actor;
let observerPortfolioA: Actor;
let observerPortfolioB: Actor;
let reassigner: Actor;
let vendor: Actor;
let vendorNoFinance: Actor;

const PORTFOLIO_A = randomUUID();
const PORTFOLIO_B = randomUUID();
const statusEvents: string[] = [];

// Unique workflow codes per run: rule sets persist in the test schema.
const BC = `bc-${randomUUID().slice(0, 6)}`;
const ARB = `arb-${randomUUID().slice(0, 6)}`;

const step = (key: string, roleCode: string, extra: Record<string, unknown> = {}) => ({
  key,
  name: key,
  approvers: [{ kind: 'role', roleCode, scope: 'global' }],
  quorum: 'any',
  reReview: 'rejecters',
  ...extra,
});

async function publish(actor: Actor, workflowCode: string, definition: unknown): Promise<string> {
  const draft = await t.http().post('/api/v1/approval-rule-sets').set(actor.auth).send({ workflowCode, definition }).expect(201);
  await t.http().post(`/api/v1/approval-rule-sets/${draft.body.id}/publish`).set(actor.auth).expect(200);
  return draft.body.id;
}

function submit(overrides: Partial<SubmitInput> = {}): Promise<string> {
  return approvals.submit({
    workflowCode: BC,
    subjectType: 'business-case',
    subjectId: randomUUID(),
    subjectTitle: 'New CRM platform',
    context: { tco: 120000 },
    scope: { portfolioId: PORTFOLIO_A },
    submittedBy: submitter.id,
    ...overrides,
  });
}

async function pendingTaskOf(actor: Actor, instanceId: string): Promise<string> {
  const res = await t.http().get('/api/v1/approval-tasks').set(actor.auth).expect(200);
  const task = res.body.items.find((item: { instance: { id: string } }) => item.instance.id === instanceId);
  expect(task, `pending task for ${actor.email}`).toBeDefined();
  return task.taskId;
}

beforeAll(async () => {
  t = await createTestApp();
  approvals = t.app.get(ApprovalService);
  const registry = t.app.get(ApprovalWorkflowRegistry);
  registry.register({
    code: BC,
    name: 'Business case (test)',
    contextSchema: z.object({ tco: z.number().nonnegative() }),
    contextClassification: { tco: 'financial' },
    approversSeeFinancials: true,
    onStatusChange: (event) => {
      statusEvents.push(`${event.subjectId}:${event.status}`);
    },
  });
  registry.register({
    code: ARB,
    name: 'ARB review (test)',
    contextSchema: z.object({ internetFacing: z.boolean() }),
    approversSeeFinancials: false,
  });

  const base = ['approvals:task:act', 'approvals:instance:read', 'approvals:delegation:manage'];
  // Approver roles can act for staff (delegates); submitter roles cannot.
  const approverRole = (name: string) => createRole(t.orm, base, {}, { canActForStaff: true }).then((code) => ({ name, code }));
  const roles = await Promise.all(['tech', 'finance', 'arbm', 'arbc'].map(approverRole));
  const [tech, finance, arbm, arbc] = roles.map((role) => role.code);

  ruleAdmin = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:rule-set:read', 'approvals:rule-set:manage']) }], { label: 'ruleadmin' });
  submitter = await createActor(t.orm, [{ code: await createRole(t.orm, base, { financial: 'own' }) }], { label: 'pm' });
  otherSubmitter = await createActor(t.orm, [{ code: await createRole(t.orm, base, { financial: 'own' }) }], { label: 'pm2' });
  techExco = await createActor(t.orm, [{ code: tech }], { label: 'tech' });
  financeExco = await createActor(t.orm, [{ code: finance }], { label: 'finance' });
  arb1 = await createActor(t.orm, [{ code: arbm }], { label: 'arb1' });
  arb2 = await createActor(t.orm, [{ code: arbm }], { label: 'arb2' });
  arbChair = await createActor(t.orm, [{ code: arbc }], { label: 'chair' });
  const observerRole = await createRole(t.orm, ['approvals:instance:read'], { financial: 'scope' });
  observerPortfolioA = await createActor(t.orm, [{ code: observerRole, scopeType: 'portfolio', scopeId: PORTFOLIO_A }], { label: 'leadA' });
  observerPortfolioB = await createActor(t.orm, [{ code: observerRole, scopeType: 'portfolio', scopeId: PORTFOLIO_B }], { label: 'leadB' });
  reassigner = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:task:reassign', 'approvals:instance:read']) }], { label: 'pmo' });
  vendor = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:instance:read'], { financial: 'all' }) }], { isExternal: true, label: 'vendor' });
  vendorNoFinance = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:instance:read']) }], { isExternal: true, label: 'vendor-nofin' });

  await publish(ruleAdmin, BC, {
    rules: [
      { key: 'tech-band', name: 'Below RM250k', priority: 10, when: { all: [{ field: 'tco', op: 'lt', value: 250000 }] }, steps: [step('tech-exco', tech)] },
      {
        key: 'finance-band',
        name: 'RM250k to below RM1M',
        priority: 20,
        when: { all: [{ field: 'tco', op: 'gte', value: 250000 }, { field: 'tco', op: 'lt', value: 1000000 }] },
        steps: [step('tech-review', tech), step('finance-exco', finance, { gate: { requiresApproved: ARB }, slaHours: 24, escalateTo: { kind: 'user', userId: reassigner.id } })],
      },
    ],
  });
  await publish(ruleAdmin, ARB, {
    rules: [{ key: 'arb', name: 'ARB', priority: 10, when: null, steps: [step('members', arbm, { quorum: 'all' }), step('chair', arbc)] }],
  });
});

afterAll(async () => {
  await t.close();
});

describe('rule-set maintenance', () => {
  it('lists registered workflow types with their routing fields', async () => {
    const res = await t.http().get('/api/v1/approval-workflows').set(ruleAdmin.auth).expect(200);
    expect(res.body.items).toContainEqual(expect.objectContaining({ code: BC, contextFields: ['tco'], approversSeeFinancials: true }));
  });

  it('versions rule sets and retires the previous published version on publish (R4)', async () => {
    const before = await t.http().get('/api/v1/approval-rule-sets').query({ workflowCode: ARB }).set(ruleAdmin.auth).expect(200);
    const published = before.body.items.find((r: { status: string }) => r.status === 'published');
    const id = await publish(ruleAdmin, ARB, {
      rules: [{ key: 'arb', name: 'ARB v2', priority: 10, when: null, steps: [step('members', 'arb-member', { quorum: 'all' })] }],
    });
    const after = await t.http().get('/api/v1/approval-rule-sets').query({ workflowCode: ARB }).set(ruleAdmin.auth).expect(200);
    expect(after.body.items.filter((r: { status: string }) => r.status === 'published').map((r: { id: string }) => r.id)).toEqual([id]);
    expect(after.body.items.find((r: { id: string }) => r.id === published.id).status).toBe('retired');
    // restore the ARB rules used by the other tests
    await publish(ruleAdmin, ARB, published.definition);
  });

  it('rejects conditions on fields the workflow does not provide (R3)', async () => {
    const res = await t
      .http()
      .post('/api/v1/approval-rule-sets')
      .set(ruleAdmin.auth)
      .send({ workflowCode: BC, definition: { rules: [{ key: 'r', name: 'R', priority: 1, when: { all: [{ field: 'region', op: 'eq', value: 'MY' }] }, steps: [step('s', 'pmo')] }] } })
      .expect(400);
    expect(res.body.detail).toMatch(/region/);
  });

  it('rejects an unknown workflow type and invalid definitions', async () => {
    await t.http().post('/api/v1/approval-rule-sets').set(ruleAdmin.auth).send({ workflowCode: 'nope', definition: { rules: [{ key: 'r', name: 'R', priority: 1, when: null, steps: [step('s', 'pmo')] }] } }).expect(404);
    await t.http().post('/api/v1/approval-rule-sets').set(ruleAdmin.auth).send({ workflowCode: BC, definition: { rules: [] } }).expect(400);
  });

  it('edits drafts only', async () => {
    const draft = await t.http().post('/api/v1/approval-rule-sets').set(ruleAdmin.auth).send({ workflowCode: ARB, definition: { rules: [{ key: 'x', name: 'X', priority: 1, when: null, steps: [step('s', 'pmo')] }] } }).expect(201);
    const updated = await t.http().patch(`/api/v1/approval-rule-sets/${draft.body.id}`).set(ruleAdmin.auth).send({ definition: { rules: [{ key: 'y', name: 'Y', priority: 1, when: null, steps: [step('s', 'pmo')] }] }, version: draft.body.version }).expect(200);
    expect(updated.body.definition.rules[0].key).toBe('y');
    const list = await t.http().get('/api/v1/approval-rule-sets').query({ workflowCode: BC }).set(ruleAdmin.auth).expect(200);
    const published = list.body.items.find((r: { status: string }) => r.status === 'published');
    await t.http().patch(`/api/v1/approval-rule-sets/${published.id}`).set(ruleAdmin.auth).send({ definition: published.definition, version: published.version }).expect(409);
    await t.http().post(`/api/v1/approval-rule-sets/${published.id}/publish`).set(ruleAdmin.auth).expect(409);
  });

  it('requires approvals:rule-set:manage (P2)', async () => {
    await t.http().post('/api/v1/approval-rule-sets').set(techExco.auth).send({ workflowCode: BC, definition: {} }).expect(403);
    await t.http().get('/api/v1/approval-rule-sets').set(techExco.auth).expect(403);
  });
});

describe('submission and routing', () => {
  it.each([
    [249999.99, 'tech-exco'],
    [250000, 'tech-review'],
  ])('TCO RM%s starts at step %s (R1)', async (tco, firstStep) => {
    const id = await submit({ context: { tco } });
    const view = await t.http().get(`/api/v1/approval-instances/${id}`).set(submitter.auth).expect(200);
    expect(view.body.currentStep.key).toBe(firstStep);
  });

  it('refuses submission when no rule matches (R2) and persists nothing', async () => {
    const subjectId = randomUUID();
    await expect(submit({ subjectId, context: { tco: 5000000 } })).rejects.toThrow(/No approval rule matches/);
    await expect(submit({ subjectId, context: { tco: 'lots' as never } })).rejects.toThrow(/context/i);
  });

  it('refuses a second active approval for the same record', async () => {
    const subjectId = randomUUID();
    await submit({ subjectId });
    await expect(submit({ subjectId })).rejects.toThrow(/already/);
  });

  it('names, before submitting, the first step no one could approve (dry run of L13)', async () => {
    const dryRun = (overrides: Partial<SubmitInput>) =>
      approvals.missingApproverStep({ workflowCode: BC, context: { tco: 120000 }, scope: { portfolioId: PORTFOLIO_A }, submittedBy: submitter.id, ...overrides });
    await expect(dryRun({})).resolves.toBeNull();
    // The only Tech EXCO member cannot approve their own request.
    await expect(dryRun({ submittedBy: techExco.id })).resolves.toEqual({ step: 'tech-exco', onlySubmitter: true });
    // Later steps are checked too: the finance band's second step has one holder.
    await expect(dryRun({ context: { tco: 300000 }, submittedBy: financeExco.id })).resolves.toEqual({ step: 'finance-exco', onlySubmitter: true });
    // Nothing to report when submit itself would refuse for another reason.
    await expect(dryRun({ context: { tco: 5000000 } })).resolves.toBeNull();
    await expect(dryRun({ workflowCode: ARB, context: { internetFacing: true } })).resolves.toBeNull();
    await expect(dryRun({ context: { tco: 'lots' as never } })).rejects.toThrow(/context/i);
  });

  it('never assigns the submitter as their own approver (segregation of duties, L13)', async () => {
    await expect(submit({ submittedBy: techExco.id })).rejects.toThrow(/No approver/);
  });
});

describe('approval centre: acting on tasks', () => {
  it('approves end to end and notifies the subject module (L1)', async () => {
    const subjectId = randomUUID();
    const id = await submit({ subjectId });
    const task = await pendingTaskOf(techExco, id);
    const res = await t.http().post(`/api/v1/approval-tasks/${task}/approve`).set(techExco.auth).send({ comment: 'OK' }).expect(200);
    expect(res.body.status).toBe('approved');
    expect(statusEvents).toContain(`${subjectId}:approved`);
  });

  it('rejects, then resumes at the rejecting step after resubmission (L5, L6)', async () => {
    const id = await submit();
    const task = await pendingTaskOf(techExco, id);
    await t.http().post(`/api/v1/approval-tasks/${task}/reject`).set(techExco.auth).send({}).expect(400);
    const returned = await t.http().post(`/api/v1/approval-tasks/${task}/reject`).set(techExco.auth).send({ comment: 'Add costing' }).expect(200);
    expect(returned.body.status).toBe('returned');

    await t.http().post(`/api/v1/approval-instances/${id}/resubmit`).set(otherSubmitter.auth).expect(403);
    const resumed = await t.http().post(`/api/v1/approval-instances/${id}/resubmit`).set(submitter.auth).expect(200);
    expect(resumed.body).toMatchObject({ status: 'in_progress', round: 2 });
    await pendingTaskOf(techExco, id);
  });

  it('asks the submitter for information and continues after the answer (L8)', async () => {
    const id = await submit();
    const task = await pendingTaskOf(techExco, id);
    await t.http().post(`/api/v1/approval-tasks/${task}/request-info`).set(techExco.auth).send({ comment: 'Which vendor?' }).expect(200);
    const answered = await t.http().post(`/api/v1/approval-instances/${id}/respond-info`).set(submitter.auth).send({ answer: 'Vendor X' }).expect(200);
    expect(answered.body.status).toBe('in_progress');
    expect(answered.body.tasks.find((x: { id: string }) => x.id === task).response).toBe('Vendor X');
  });

  it('forbids acting on someone else\'s task (L9) and acting twice (L10)', async () => {
    const id = await submit();
    const task = await pendingTaskOf(techExco, id);
    await t.http().post(`/api/v1/approval-tasks/${task}/approve`).set(financeExco.auth).send({}).expect(403);
    await t.http().post(`/api/v1/approval-tasks/${task}/approve`).set(techExco.auth).send({}).expect(200);
    await t.http().post(`/api/v1/approval-tasks/${task}/approve`).set(techExco.auth).send({}).expect(409);
    await t.http().post(`/api/v1/approval-tasks/${randomUUID()}/approve`).set(techExco.auth).send({}).expect(404);
  });

  it('lets holders of "Act for submitters" resubmit, answer and cancel for the submitter, within their scope', async () => {
    const actForA = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:instance:read', 'approvals:instance:manage']), scopeType: 'portfolio', scopeId: PORTFOLIO_A }], { label: 'actfor-a' });
    const actForB = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:instance:read', 'approvals:instance:manage']), scopeType: 'portfolio', scopeId: PORTFOLIO_B }], { label: 'actfor-b' });
    const id = await submit();
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(techExco, id)}/reject`).set(techExco.auth).send({ comment: 'Add costing' }).expect(200);
    expect((await t.http().get(`/api/v1/approval-instances/${id}`).set(actForA.auth).expect(200)).body.canActForSubmitter).toBe(true);
    expect((await t.http().get(`/api/v1/approval-instances/${id}`).set(observerPortfolioA.auth).expect(200)).body.canActForSubmitter).toBe(false);
    await t.http().post(`/api/v1/approval-instances/${id}/resubmit`).set(actForB.auth).expect(403);
    expect((await t.http().post(`/api/v1/approval-instances/${id}/resubmit`).set(actForA.auth).expect(200)).body).toMatchObject({ status: 'in_progress', round: 2 });
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(techExco, id)}/request-info`).set(techExco.auth).send({ comment: 'Which vendor?' }).expect(200);
    expect((await t.http().post(`/api/v1/approval-instances/${id}/respond-info`).set(actForA.auth).send({ answer: 'Vendor Y' }).expect(200)).body.status).toBe('in_progress');
    expect((await t.http().post(`/api/v1/approval-instances/${id}/cancel`).set(actForA.auth).expect(200)).body.status).toBe('cancelled');
  });

  it('lets the submitter cancel (L11)', async () => {
    const id = await submit();
    await t.http().post(`/api/v1/approval-instances/${id}/cancel`).set(otherSubmitter.auth).expect(403);
    const res = await t.http().post(`/api/v1/approval-instances/${id}/cancel`).set(submitter.auth).expect(200);
    expect(res.body.status).toBe('cancelled');
    expect(res.body.waitingOn).toEqual([]);
  });
});

describe('ARB gate before final approval (L12, L3, L7)', () => {
  it('blocks the final step until ARB approves, with ARB members re-reviewing only after rejection', async () => {
    const subjectId = randomUUID();
    const bc = await submit({ subjectId, context: { tco: 600000 } });
    const arb = await submit({ workflowCode: ARB, subjectId, context: { internetFacing: true } });

    // Business case: tech review first, then finance step is blocked by the gate.
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(techExco, bc)}/approve`).set(techExco.auth).send({}).expect(200);
    const blocked = await t.http().get(`/api/v1/approval-instances/${bc}`).set(submitter.auth).expect(200);
    expect(blocked.body.currentStep.key).toBe('finance-exco');
    expect(blocked.body.steps.find((s: { key: string }) => s.key === 'finance-exco').status).toBe('blocked');
    const financeInbox = await t.http().get('/api/v1/approval-tasks').set(financeExco.auth).expect(200);
    const financeTask = financeInbox.body.items.find((item: { instance: { id: string } }) => item.instance.id === bc);
    expect(financeTask.status).toBe('blocked');
    await t.http().post(`/api/v1/approval-tasks/${financeTask.taskId}/approve`).set(financeExco.auth).send({}).expect(409);

    // ARB: both members must approve; arb2 rejects first, then only arb2 re-reviews.
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(arb1, arb)}/approve`).set(arb1.auth).send({}).expect(200);
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(arb2, arb)}/reject`).set(arb2.auth).send({ comment: 'DR design missing' }).expect(200);
    await t.http().post(`/api/v1/approval-instances/${arb}/resubmit`).set(submitter.auth).expect(200);
    const arb1Inbox = await t.http().get('/api/v1/approval-tasks').set(arb1.auth).expect(200);
    expect(arb1Inbox.body.items.find((item: { instance: { id: string } }) => item.instance.id === arb)).toBeUndefined();
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(arb2, arb)}/approve`).set(arb2.auth).send({}).expect(200);
    const chair = await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(arbChair, arb)}/approve`).set(arbChair.auth).send({}).expect(200);
    expect(chair.body.status).toBe('approved');

    // Gate opens: finance can now approve the business case.
    const done = await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(financeExco, bc)}/approve`).set(financeExco.auth).send({}).expect(200);
    expect(done.body.status).toBe('approved');
  });

  it('lets one person review as an ARB member and then give the chair approval (the enterprise architect holds both roles)', async () => {
    const code = `arb-ea-${randomUUID().slice(0, 6)}`;
    t.app.get(ApprovalWorkflowRegistry).register({ code, name: 'ARB review, EA chairs (test)', contextSchema: z.object({}), approversSeeFinancials: false });
    const base = ['approvals:task:act', 'approvals:instance:read'];
    const [memberRole, chairRole] = await Promise.all([createRole(t.orm, base), createRole(t.orm, base)]);
    const reviewer = await createActor(t.orm, [{ code: memberRole }], { label: 'arb-reviewer' });
    const architect = await createActor(t.orm, [{ code: memberRole }, { code: chairRole }], { label: 'ea' });
    await publish(ruleAdmin, code, {
      rules: [{ key: 'arb', name: 'ARB', priority: 10, when: null, steps: [step('members', memberRole, { quorum: 'all' }), step('chair', chairRole, { reReview: 'all' })] }],
    });
    const id = await submit({ workflowCode: code, context: {} });
    const inbox = async (actor: Actor) => (await t.http().get('/api/v1/approval-tasks').set(actor.auth).expect(200)).body.items.filter((item: { instance: { id: string } }) => item.instance.id === id);

    // As a member: the architect approves; the other reviewer returns it, and after resubmission only they review again.
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(architect, id)}/approve`).set(architect.auth).send({}).expect(200);
    expect(await inbox(architect)).toEqual([]);
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(reviewer, id)}/reject`).set(reviewer.auth).send({ comment: 'Add the DR design' }).expect(200);
    await t.http().post(`/api/v1/approval-instances/${id}/resubmit`).set(submitter.auth).expect(200);
    expect(await inbox(architect)).toEqual([]);
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(reviewer, id)}/approve`).set(reviewer.auth).send({}).expect(200);

    // As chair: the same person now gets the final approval.
    const waiting = await t.http().get(`/api/v1/approval-instances/${id}`).set(submitter.auth).expect(200);
    expect(waiting.body.currentStep.key).toBe('chair');
    expect(waiting.body.waitingOn.map((person: { id: string }) => person.id)).toEqual([architect.id]);
    const done = await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(architect, id)}/approve`).set(architect.auth).send({}).expect(200);
    expect(done.body.status).toBe('approved');
    const approvedSteps = done.body.tasks
      .filter((task: { assignee: { id: string }; status: string }) => task.assignee.id === architect.id && task.status === 'approved')
      .map((task: { stepKey: string }) => task.stepKey);
    expect(approvedSteps.sort()).toEqual(['chair', 'members']);
  });
});

describe('who can see what', () => {
  it('shows financial context to the submitter (own) and masks it for other product managers (V2, V3)', async () => {
    const id = await submit({ context: { tco: 120000 } });
    const own = await t.http().get(`/api/v1/approval-instances/${id}`).set(submitter.auth).expect(200);
    expect(own.body.context.tco).toBe(120000);
    // Global instance:read: may follow where it is stuck, but not see someone else's figures.
    const other = await t.http().get(`/api/v1/approval-instances/${id}`).set(otherSubmitter.auth).expect(200);
    expect(other.body.context.tco).toBeNull();
    expect(other.body.waitingOn).toHaveLength(1);
  });

  it('lets rule maintainers switch, per approval type, whether approvers see financials (V6)', async () => {
    await t.http().patch(`/api/v1/approval-workflows/${BC}`).set(submitter.auth).send({ approversSeeFinancials: false }).expect(403);
    expect((await t.http().patch(`/api/v1/approval-workflows/${BC}`).set(ruleAdmin.auth).send({ approversSeeFinancials: false }).expect(200)).body).toMatchObject({ code: BC, approversSeeFinancials: false });
    const id = await submit({ context: { tco: 90000 } });
    expect((await t.http().get(`/api/v1/approval-instances/${id}`).set(techExco.auth).expect(200)).body.context.tco).toBeNull();
    expect((await t.http().get('/api/v1/approval-workflows').set(ruleAdmin.auth).expect(200)).body.items).toContainEqual(expect.objectContaining({ code: BC, approversSeeFinancials: false }));
    await t.http().patch(`/api/v1/approval-workflows/${BC}`).set(ruleAdmin.auth).send({ approversSeeFinancials: true }).expect(200);
    expect((await t.http().get(`/api/v1/approval-instances/${id}`).set(techExco.auth).expect(200)).body.context.tco).toBe(90000);
    await t.http().patch('/api/v1/approval-workflows/no-such-type').set(ruleAdmin.auth).send({ approversSeeFinancials: true }).expect(404);
    await t.http().patch(`/api/v1/approval-workflows/${BC}`).set(ruleAdmin.auth).send({}).expect(400);
  });

  it('approver sees financials once the task is active (V5), not when blocked; workflow flag respected (V6)', async () => {
    const subjectId = randomUUID();
    const bc = await submit({ subjectId, context: { tco: 700000 } });
    const tech = await t.http().get(`/api/v1/approval-instances/${bc}`).set(techExco.auth).expect(200);
    expect(tech.body.context.tco).toBe(700000);
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(techExco, bc)}/approve`).set(techExco.auth).send({}).expect(200);
    const afterActing = await t.http().get(`/api/v1/approval-instances/${bc}`).set(techExco.auth).expect(200);
    expect(afterActing.body.context.tco).toBe(700000);
    const finance = await t.http().get(`/api/v1/approval-instances/${bc}`).set(financeExco.auth).expect(200);
    expect(finance.body.context.tco).toBeNull(); // finance task is blocked by the ARB gate
  });

  it('portfolio-scoped observers see their portfolio only (P3, V4)', async () => {
    const id = await submit({ scope: { portfolioId: PORTFOLIO_A }, context: { tco: 50000 } });
    const inScope = await t.http().get(`/api/v1/approval-instances/${id}`).set(observerPortfolioA.auth).expect(200);
    expect(inScope.body.context.tco).toBe(50000);
    expect(inScope.body.waitingOn.map((u: { id: string }) => u.id)).toEqual([techExco.id]);
    await t.http().get(`/api/v1/approval-instances/${id}`).set(observerPortfolioB.auth).expect(404);
    const listA = await t.http().get('/api/v1/approval-instances').set(observerPortfolioA.auth).expect(200);
    expect(listA.body.items.map((i: { id: string }) => i.id)).toContain(id);
    const listB = await t.http().get('/api/v1/approval-instances').set(observerPortfolioB.auth).expect(200);
    expect(listB.body.items.map((i: { id: string }) => i.id)).not.toContain(id);
  });

  it('masks each context field by its field classification, which administrators can change', async () => {
    const classifier = await createActor(t.orm, [{ code: await createRole(t.orm, ['access:field-class:manage']) }], { label: 'classifier' });
    const fields = (await t.http().get('/api/v1/field-classes').set(classifier.auth).expect(200)).body.items as { key: string; dataClass: string }[];
    expect(fields).toContainEqual(expect.objectContaining({ key: `approvals.${BC}.tco`, dataClass: 'financial' }));
    expect(fields).toContainEqual(expect.objectContaining({ key: `approvals.${ARB}.internetFacing`, dataClass: 'financial' })); // no classification in code: all financial
    const id = await submit({ context: { tco: 60000 } });
    const seen = async () => (await t.http().get(`/api/v1/approval-instances/${id}`).set(otherSubmitter.auth).expect(200)).body.context.tco;
    expect(await seen()).toBeNull();
    await t.http().put(`/api/v1/field-classes/approvals.${BC}.tco`).set(classifier.auth).send({ dataClass: 'internal' }).expect(200);
    expect(await seen()).toBe(60000);
    await t.http().put(`/api/v1/field-classes/approvals.${BC}.tco`).set(classifier.auth).send({ dataClass: null }).expect(200);
    expect(await seen()).toBeNull();
  });

  it("shows financials to vendors only when their role grants it, like anyone else (V1)", async () => {
    const id = await submit({ context: { tco: 80000 } });
    expect((await t.http().get(`/api/v1/approval-instances/${id}`).set(vendor.auth).expect(200)).body.context.tco).toBe(80000);
    expect((await t.http().get(`/api/v1/approval-instances/${id}`).set(vendorNoFinance.auth).expect(200)).body.context.tco).toBeNull();
  });
});

describe('delegation, escalation and reassignment', () => {
  it('routes new tasks to the out-of-office delegate and records the original approver (D1)', async () => {
    const delegation = await t
      .http()
      .post('/api/v1/me/delegations')
      .set(techExco.auth)
      .send({ toUserId: financeExco.id, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(), reason: 'Annual leave' })
      .expect(201);
    const id = await submit();
    const view = await t.http().get(`/api/v1/approval-instances/${id}`).set(submitter.auth).expect(200);
    expect(view.body.tasks[0]).toMatchObject({ assignee: { id: financeExco.id }, originalAssignee: { id: techExco.id } });
    await t.http().post(`/api/v1/me/delegations/${delegation.body.id}/cancel`).set(techExco.auth).expect(200);
    const after = await submit();
    const afterView = await t.http().get(`/api/v1/approval-instances/${after}`).set(submitter.auth).expect(200);
    expect(afterView.body.tasks[0].assignee.id).toBe(techExco.id); // D2
  });

  it('validates delegations (D3)', async () => {
    const window = { startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString() };
    await t.http().post('/api/v1/me/delegations').set(arb1.auth).send({ toUserId: arb1.id, ...window }).expect(400);
    await t.http().post('/api/v1/me/delegations').set(arb1.auth).send({ toUserId: arb2.id, startsAt: window.endsAt, endsAt: window.startsAt }).expect(400);
    await t.http().post('/api/v1/me/delegations').set(arb1.auth).send({ toUserId: vendor.id, ...window }).expect(422);
    // Staff too: the delegate's role must allow acting for staff.
    await t.http().post('/api/v1/me/delegations').set(arb1.auth).send({ toUserId: submitter.id, ...window }).expect(422);
    await t.http().post('/api/v1/me/delegations').set(arb1.auth).send({ toUserId: arb2.id, ...window }).expect(201);
    await t.http().post('/api/v1/me/delegations').set(arb1.auth).send({ toUserId: arbChair.id, ...window }).expect(409);
    const mine = await t.http().get('/api/v1/me/delegations').set(arb1.auth).expect(200);
    expect(mine.body.items).toHaveLength(1);
  });

  it("lets holders of \"Manage others' delegations\" set, list and cancel out-of-office for someone else", async () => {
    const delegationAdmin = await createActor(t.orm, [{ code: await createRole(t.orm, ['approvals:any-delegation:manage']) }], { label: 'ooo-admin' });
    const window = { startsAt: new Date(Date.now() + 86_400_000).toISOString(), endsAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
    await t.http().post('/api/v1/approval-delegations').set(arb1.auth).send({ fromUserId: arb2.id, toUserId: arbChair.id, ...window }).expect(403);
    const created = await t.http().post('/api/v1/approval-delegations').set(delegationAdmin.auth).send({ fromUserId: arb2.id, toUserId: arbChair.id, reason: 'Medical leave', ...window }).expect(201);
    expect(created.body).toMatchObject({ toUser: { id: arbChair.id }, reason: 'Medical leave' });
    const listed = await t.http().get('/api/v1/approval-delegations').query({ userId: arb2.id }).set(delegationAdmin.auth).expect(200);
    expect(listed.body.items.map((d: { id: string }) => d.id)).toContain(created.body.id);
    await t.http().post('/api/v1/approval-delegations').set(delegationAdmin.auth).send({ fromUserId: arb2.id, toUserId: arb2.id, ...window }).expect(400);
    await t.http().post('/api/v1/approval-delegations').set(delegationAdmin.auth).send({ fromUserId: arb2.id, toUserId: submitter.id, ...window }).expect(422);
    await t.http().post('/api/v1/approval-delegations').set(delegationAdmin.auth).send({ fromUserId: randomUUID(), toUserId: arbChair.id, ...window }).expect(404);
    await t.http().post(`/api/v1/approval-delegations/${created.body.id}/cancel`).set(delegationAdmin.auth).expect(200);
    await t.http().post(`/api/v1/approval-delegations/${randomUUID()}/cancel`).set(delegationAdmin.auth).expect(404);
    await t.http().get('/api/v1/approval-delegations').query({ userId: arb2.id }).set(arb1.auth).expect(403);
  });

  it('escalates overdue tasks to the step\'s escalation approver (D4)', async () => {
    const subjectId = randomUUID();
    const bc = await submit({ subjectId, context: { tco: 300000 } });
    await submit({ workflowCode: ARB, subjectId, context: { internetFacing: false } });
    await t.http().post(`/api/v1/approval-tasks/${await pendingTaskOf(techExco, bc)}/approve`).set(techExco.auth).send({}).expect(200);
    const escalation = t.app.get(ApprovalEscalationService);
    expect(await escalation.escalateOverdue(new Date())).toBe(0);
    // finance step (blocked) is not escalated while waiting for ARB; open it by checking a later time is irrelevant
    const em = t.orm.em.fork();
    const task = await em.findOneOrFail(ApprovalTask, { instance: bc, stepKey: 'finance-exco' });
    task.status = 'pending'; // simulate the ARB gate opening now
    task.activatedAt = new Date();
    await em.flush();
    expect(await escalation.escalateOverdue(new Date(Date.now() + 25 * 3600_000))).toBeGreaterThanOrEqual(1);
    const view = await t.http().get(`/api/v1/approval-instances/${bc}`).set(submitter.auth).expect(200);
    const escalated = view.body.tasks.find((x: { stepKey: string }) => x.stepKey === 'finance-exco');
    expect(escalated).toMatchObject({ assignee: { id: reassigner.id }, originalAssignee: { id: financeExco.id }, reassignReason: 'sla-escalation' });
  });

  it('lets an authorised admin reassign with a reason (D5)', async () => {
    const id = await submit();
    const task = await pendingTaskOf(techExco, id);
    await t.http().post(`/api/v1/approval-tasks/${task}/reassign`).set(techExco.auth).send({ toUserId: financeExco.id, reason: 'On leave' }).expect(403);
    await t.http().post(`/api/v1/approval-tasks/${task}/reassign`).set(reassigner.auth).send({ toUserId: financeExco.id }).expect(400);
    const res = await t.http().post(`/api/v1/approval-tasks/${task}/reassign`).set(reassigner.auth).send({ toUserId: financeExco.id, reason: 'On leave' }).expect(200);
    expect(res.body.tasks.find((x: { id: string }) => x.id === task).assignee.id).toBe(financeExco.id);
    await t.http().post(`/api/v1/approval-tasks/${task}/reassign`).set(reassigner.auth).send({ toUserId: submitter.id, reason: 'Wrong' }).expect(422);
  });
});
