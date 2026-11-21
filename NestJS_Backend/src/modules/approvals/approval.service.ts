import { randomUUID } from 'node:crypto';
import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  type HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { maskClassified } from '../access/data-visibility.js';
import { FieldClassService, type FieldClasses } from '../access/field-classes.js';
import { type DataClass, type Principal, type ResourceScope, scopeContains } from '../access/principal.js';
import { RoleAssignment } from '../access/role-assignment.entity.js';
import { actingForStaff } from '../access/acting-for-staff.js';
import { AuditService } from '../audit/audit.service.js';
import { User } from '../identity/user.entity.js';
import { NotificationService } from '../notifications/notification.service.js';
import { ApprovalDelegation, ApprovalEvent, ApprovalInstance, ApprovalRuleSet, ApprovalTask, ApprovalWorkflowSetting } from './approval.entities.js';
import { ApprovalWorkflowRegistry, contextFieldKey, type ApprovalWorkflowType } from './approval-workflow.registry.js';
import {
  act,
  activateStep,
  ApprovalEngineError,
  cancel,
  type ApprovalEventAction,
  type Decision,
  type EngineErrorCode,
  type InstanceState,
  type InstanceStatus,
  newInstanceState,
  openGate,
  reassign,
  type ResolvedGroup,
  respondInfo,
  resubmit,
} from './domain/engine.js';
import { approvalNotifications, type ChangeInfo, type InstanceSnapshot } from './domain/notifications.js';
import type { ApproverSpec, StepDefinition } from './domain/rule-set.schema.js';
import { selectRule } from './domain/rule-selection.js';
import { personName } from '../identity/person-name.js';

export interface SubmitInput {
  workflowCode: string;
  subjectType: string;
  subjectId: string;
  subjectTitle: string;
  context: Record<string, unknown>;
  /** Where the record lives (drives scoped approvers and who may watch it). */
  scope: ResourceScope;
  submittedBy: string;
}

const ACTIVE_STATUSES: InstanceStatus[] = ['in_progress', 'returned', 'awaiting_info'];

/** An action's change to an instance's state, made inside the action's transaction. */
type InstanceChange = (ctx: { em: EntityManager; instance: ApprovalInstance; state: InstanceState; now: Date }) => Promise<InstanceState>;

/** What the event log keeps of an action by a person (see ApprovalEvent). */
interface EventOf {
  action: ApprovalEventAction;
  comment?: string | null;
}

const DECIDED: Record<Decision, ApprovalEventAction> = { approve: 'approved', reject: 'returned', request_info: 'info_requested' };

/** A submission or action made inside the caller's transaction, and what to run once that transaction commits. */
export interface ApprovalChange {
  instanceId: string;
  /** The audit row, the workflow type's status callback and the notifications. */
  afterCommit: () => Promise<void>;
}

export const ENGINE_ERRORS: Record<EngineErrorCode, (message: string) => HttpException> = {
  no_approvers: (m) => new UnprocessableEntityException(m),
  task_not_found: (m) => new NotFoundException(m),
  task_not_pending: (m) => new ConflictException(m),
  not_assignee: (m) => new ForbiddenException(m),
  instance_not_active: (m) => new ConflictException(m),
  comment_required: (m) => new BadRequestException(m),
  not_submitter: (m) => new ForbiddenException(m),
  invalid_state: (m) => new ConflictException(m),
};

/** Runs a pure engine call, translating domain errors into HTTP errors. */
export function engine<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (error instanceof ApprovalEngineError) throw ENGINE_ERRORS[error.code](error.message);
    throw error;
  }
}

function scopeOf(instance: ApprovalInstance): ResourceScope {
  return {
    departmentId: instance.departmentId ?? null,
    portfolioId: instance.portfolioId ?? null,
    portfolioIds: instance.portfolioIds,
    streamId: instance.streamId ?? null,
    applicationId: instance.applicationId ?? null,
  };
}

function person(user: User | null | undefined) {
  return user ? { id: user.id, name: personName(user) } : null;
}

interface Pending {
  instanceId: string;
  before: InstanceSnapshot | null;
}

@Injectable()
export class ApprovalService {
  private readonly logger = new Logger(ApprovalService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly registry: ApprovalWorkflowRegistry,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly fieldClasses: FieldClassService,
  ) {}

  // ----- Notifications -----------------------------------------------------

  private snapshot(instance: ApprovalInstance, tasks: ApprovalTask[]): InstanceSnapshot {
    const names: Record<string, string> = {};
    for (const user of [instance.submittedBy, ...tasks.flatMap((t) => [t.assignee, t.originalAssignee])]) {
      if (user?.firstName !== undefined) names[user.id] = personName(user);
    }
    return {
      id: instance.id,
      status: instance.status,
      submittedBy: instance.submittedBy.id,
      subjectTitle: instance.subjectTitle,
      workflowName: this.typeOf(instance.workflowCode)?.name ?? instance.workflowCode,
      stepNames: instance.steps.map((step) => step.name),
      tasks: tasks.map((t) => ({
        id: t.id,
        stepIndex: t.stepIndex,
        status: t.status,
        assigneeId: t.assignee.id,
        originalAssigneeId: t.originalAssignee?.id ?? null,
        round: t.round,
        comment: t.comment ?? null,
        response: t.response ?? null,
      })),
      names,
    };
  }

  /** After the commit: tell people what changed for them (never fails the action). */
  private async sendNotifications(changes: Pending[], change: ChangeInfo): Promise<void> {
    try {
      const em = this.em.fork();
      for (const { instanceId, before } of changes) {
        const instance = await em.findOneOrFail(ApprovalInstance, instanceId, { populate: ['submittedBy'] });
        const tasks = await em.find(ApprovalTask, { instance: instanceId }, { populate: ['assignee', 'originalAssignee'], orderBy: { createdAt: 'asc', id: 'asc' } });
        await this.notifications.send(approvalNotifications(before, this.snapshot(instance, tasks), change));
      }
    } catch (error) {
      this.logger.error(`Could not work out approval notifications: ${String(error)}`);
    }
  }

  // ----- Persistence mapping -----------------------------------------------

  private toState(instance: ApprovalInstance, tasks: ApprovalTask[]): InstanceState {
    return {
      status: instance.status,
      currentStepIndex: instance.currentStepIndex,
      round: instance.round,
      steps: instance.steps,
      submittedBy: instance.submittedBy.id,
      tasks: tasks.map((task) => ({
        id: task.id,
        stepIndex: task.stepIndex,
        groupIndex: task.groupIndex,
        assigneeId: task.assignee.id,
        originalAssigneeId: task.originalAssignee?.id ?? null,
        status: task.status,
        round: task.round,
        comment: task.comment ?? null,
        response: task.response ?? null,
        actedAt: task.actedAt ?? null,
        activatedAt: task.activatedAt ?? null,
        createdAt: task.createdAt,
      })),
    };
  }

  private applyState(em: EntityManager, instance: ApprovalInstance, tasks: ApprovalTask[], state: InstanceState, actorId: string | null): void {
    instance.status = state.status;
    instance.currentStepIndex = state.currentStepIndex;
    instance.round = state.round;
    instance.updatedBy = actorId;
    if (state.status === 'approved' || state.status === 'cancelled') {
      instance.completedAt ??= new Date();
    }
    const byId = new Map(tasks.map((task) => [task.id, task]));
    for (const next of state.tasks) {
      const existing = byId.get(next.id);
      const data = {
        status: next.status,
        assignee: em.getReference(User, next.assigneeId),
        originalAssignee: next.originalAssigneeId ? em.getReference(User, next.originalAssigneeId) : null,
        comment: next.comment,
        response: next.response,
        actedAt: next.actedAt,
        activatedAt: next.activatedAt,
        updatedBy: actorId,
      };
      if (existing) {
        Object.assign(existing, data);
      } else {
        em.create(ApprovalTask, {
          ...data,
          id: next.id,
          instance,
          stepIndex: next.stepIndex,
          stepKey: state.steps[next.stepIndex].key,
          groupIndex: next.groupIndex,
          round: next.round,
          createdBy: actorId,
        });
      }
    }
  }

  private async loadForUpdate(em: EntityManager, instanceId: string) {
    const instance = await em.findOne(ApprovalInstance, instanceId, { lockMode: LockMode.PESSIMISTIC_WRITE });
    if (!instance) throw new NotFoundException('Approval not found');
    await em.populate(instance, ['submittedBy']);
    const tasks = await em.find(ApprovalTask, { instance: instanceId }, { orderBy: { createdAt: 'asc', id: 'asc' } });
    return { instance, tasks };
  }

  // ----- Approver resolution -----------------------------------------------

  private async usersFor(em: EntityManager, spec: ApproverSpec, scope: ResourceScope, now: Date): Promise<string[]> {
    if (spec.kind === 'user') {
      const user = await em.findOne(User, { id: spec.userId, status: 'active' });
      return user ? [user.id] : [];
    }
    const assignments = await em.find(
      RoleAssignment,
      {
        role: { code: spec.roleCode },
        user: { status: 'active' },
        validFrom: { $lte: now },
        $or: [{ validTo: null }, { validTo: { $gt: now } }],
      },
      { populate: ['user'] },
    );
    return [
      ...new Set(
        assignments
          .filter((a) => spec.scope !== 'subject' || scopeContains({ scopeType: a.scopeType, scopeId: a.scopeId ?? null }, scope))
          .map((a) => a.user.id),
      ),
    ].sort();
  }

  /** Resolves each approver group, excluding the submitter (segregation of duties) and applying delegations. */
  private async resolveGroups(em: EntityManager, step: StepDefinition, scope: ResourceScope, submittedBy: string, now: Date): Promise<ResolvedGroup[]> {
    const groups: ResolvedGroup[] = [];
    for (const [groupIndex, spec] of step.approvers.entries()) {
      const assignees = [];
      for (const userId of await this.usersFor(em, spec, scope, now)) {
        if (userId === submittedBy) continue;
        const delegation = await em.findOne(
          ApprovalDelegation,
          { fromUser: userId, cancelledAt: null, startsAt: { $lte: now }, endsAt: { $gt: now } },
          { populate: ['toUser'] },
        );
        const delegate = delegation?.toUser;
        if (delegate && delegate.status === 'active' && delegate.id !== submittedBy) {
          assignees.push({ userId: delegate.id, originalUserId: userId });
        } else {
          assignees.push({ userId, originalUserId: null });
        }
      }
      groups.push({ groupIndex, assignees });
    }
    return groups;
  }

  private async gateOpen(em: EntityManager, step: StepDefinition, subjectType: string, subjectId: string): Promise<boolean> {
    if (!step.gate) return true;
    const approved = await em.count(ApprovalInstance, {
      workflowCode: step.gate.requiresApproved,
      subjectType,
      subjectId,
      status: 'approved',
    });
    return approved > 0;
  }

  /** Activates the next step when the engine reports step_completed. */
  private async advance(em: EntityManager, instance: ApprovalInstance, state: InstanceState, now: Date): Promise<InstanceState> {
    const next = state.currentStepIndex + 1;
    const step = state.steps[next];
    const groups = await this.resolveGroups(em, step, scopeOf(instance), instance.submittedBy.id, now);
    const open = await this.gateOpen(em, step, instance.subjectType, instance.subjectId);
    return engine(() => activateStep(state, next, groups, open, now, randomUUID));
  }

  /** When an instance is approved, unblock other approvals for the same record that wait on it. */
  private async openDependentGates(em: EntityManager, approved: ApprovalInstance, now: Date): Promise<Pending[]> {
    const opened: Pending[] = [];
    const waiting = await em.find(ApprovalInstance, {
      subjectType: approved.subjectType,
      subjectId: approved.subjectId,
      status: 'in_progress',
      id: { $ne: approved.id },
    });
    for (const instance of waiting) {
      if (instance.steps[instance.currentStepIndex].gate?.requiresApproved !== approved.workflowCode) continue;
      await em.populate(instance, ['submittedBy']);
      const tasks = await em.find(ApprovalTask, { instance: instance.id });
      opened.push({ instanceId: instance.id, before: this.snapshot(instance, tasks) });
      this.applyState(em, instance, tasks, openGate(this.toState(instance, tasks), now), null);
    }
    return opened;
  }

  private async notify(instance: ApprovalInstance): Promise<void> {
    const type = this.registry.list().find((t) => t.code === instance.workflowCode);
    try {
      await type?.onStatusChange?.({
        instanceId: instance.id,
        workflowCode: instance.workflowCode,
        subjectType: instance.subjectType,
        subjectId: instance.subjectId,
        status: instance.status,
      });
    } catch (error) {
      this.logger.error(`onStatusChange failed for ${instance.workflowCode}/${instance.subjectId}: ${String(error)}`);
    }
  }

  // ----- Submission --------------------------------------------------------

  private parseContext(workflowCode: string, context: Record<string, unknown>): Record<string, unknown> {
    const parsed = this.registry.get(workflowCode).contextSchema.safeParse(context);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        `Invalid approval context: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
    }
    return parsed.data as Record<string, unknown>;
  }

  /**
   * Dry run before submitting: the first step of the matching rule that no one could approve (the submitter
   * excluded; onlySubmitter when they were its only approver), or null. Lets a module refuse a submission up
   * front instead of failing when a later step activates. Null too when submit would refuse for another reason.
   */
  async missingApproverStep(
    input: Pick<SubmitInput, 'workflowCode' | 'context' | 'scope' | 'submittedBy'>,
    now = new Date(),
  ): Promise<{ step: string; onlySubmitter: boolean } | null> {
    const context = this.parseContext(input.workflowCode, input.context);
    const em = this.em.fork();
    const ruleSet = await em.findOne(ApprovalRuleSet, { workflowCode: input.workflowCode, status: 'published' });
    const rule = ruleSet ? selectRule(ruleSet.definition, context) : null;
    for (const step of rule?.steps ?? []) {
      for (const spec of step.approvers) {
        const users = await this.usersFor(em, spec, input.scope, now);
        if (!users.some((id) => id !== input.submittedBy)) return { step: step.name, onlySubmitter: users.length > 0 };
      }
    }
    return null;
  }

  async submit(input: SubmitInput, now = new Date()): Promise<string> {
    const { instanceId, afterCommit } = await this.em.fork().transactional((tx) => this.submitIn(tx, input, now));
    await afterCommit();
    return instanceId;
  }

  /**
   * Submits inside the caller's transaction, for a module whose record changes with the submission: both happen or
   * neither does. The caller runs afterCommit once its transaction commits.
   */
  async submitIn(tx: EntityManager, input: SubmitInput, now = new Date()): Promise<ApprovalChange> {
    const context = this.parseContext(input.workflowCode, input.context);
    const ruleSet = await tx.findOne(ApprovalRuleSet, { workflowCode: input.workflowCode, status: 'published' });
    if (!ruleSet) throw new UnprocessableEntityException(`No published approval rules for "${input.workflowCode}"`);
    const rule = selectRule(ruleSet.definition, context);
    if (!rule) throw new UnprocessableEntityException('No approval rule matches this request');
    const subject = { workflowCode: input.workflowCode, subjectType: input.subjectType, subjectId: input.subjectId };
    if ((await tx.count(ApprovalInstance, { ...subject, status: { $in: ACTIVE_STATUSES } })) > 0) {
      throw new ConflictException('This record already has an approval in progress');
    }

    const created = tx.create(ApprovalInstance, {
      ...subject,
      subjectTitle: input.subjectTitle,
      ruleSet,
      ruleKey: rule.key,
      steps: rule.steps,
      context,
      status: 'in_progress',
      currentStepIndex: 0,
      round: 1,
      submittedBy: tx.getReference(User, input.submittedBy),
      departmentId: input.scope.departmentId ?? null,
      portfolioId: input.scope.portfolioId ?? null,
      portfolioIds: [...(input.scope.portfolioIds ?? [])],
      streamId: input.scope.streamId ?? null,
      applicationId: input.scope.applicationId ?? null,
      createdBy: input.submittedBy,
      updatedBy: input.submittedBy,
    });
    const groups = await this.resolveGroups(tx, rule.steps[0], input.scope, input.submittedBy, now);
    const open = await this.gateOpen(tx, rule.steps[0], input.subjectType, input.subjectId);
    const state = engine(() => activateStep(newInstanceState(rule.steps, input.submittedBy), 0, groups, open, now, randomUUID));
    this.applyState(tx, created, [], state, input.submittedBy);
    tx.create(ApprovalEvent, { instance: created, action: 'submitted', actor: tx.getReference(User, input.submittedBy), stepKey: rule.steps[0].key, round: 1, at: now });
    // Two submissions at once: the database keeps one approval in progress per record (409).
    await tx.flush();
    return {
      instanceId: created.id,
      afterCommit: async () => {
        await this.audit.recordChange(null, 'approval.submitted', 'approval-instance', created.id, {
          before: null,
          after: { ...subject, ruleKey: created.ruleKey },
        }, { submittedBy: input.submittedBy });
        await this.notify(created);
        await this.sendNotifications([{ instanceId: created.id, before: null }], { actorId: input.submittedBy });
      },
    };
  }

  // ----- Actions -----------------------------------------------------------

  private async mutate(
    principal: Principal | null,
    instanceId: string,
    action: string,
    change: InstanceChange,
    event?: EventOf,
    metadata: Record<string, unknown> = {},
    reassignment?: ChangeInfo['reassignment'],
  ): Promise<string> {
    const { afterCommit } = await this.em.fork().transactional((tx) => this.mutateIn(tx, principal, instanceId, action, change, event, metadata, reassignment));
    await afterCommit();
    return instanceId;
  }

  private async mutateIn(
    tx: EntityManager,
    principal: Principal | null,
    instanceId: string,
    action: string,
    change: InstanceChange,
    event?: EventOf,
    metadata: Record<string, unknown> = {},
    reassignment?: ChangeInfo['reassignment'],
  ): Promise<ApprovalChange> {
    const now = new Date();
    const { instance, tasks } = await this.loadForUpdate(tx, instanceId);
    const before = instance.status;
    const step = instance.steps[instance.currentStepIndex].key;
    const changed: Pending[] = [{ instanceId, before: this.snapshot(instance, tasks) }];
    const next = await change({ em: tx, instance, state: this.toState(instance, tasks), now });
    this.applyState(tx, instance, tasks, next, principal?.user.id ?? null);
    // Events are actions by people (escalations have none).
    if (event) tx.create(ApprovalEvent, { instance, action: event.action, actor: tx.getReference(User, principal!.user.id), stepKey: step, round: next.round, comment: event.comment ?? null, at: now });
    if (next.status === 'approved' && before !== 'approved') {
      await tx.flush();
      changed.push(...(await this.openDependentGates(tx, instance, now)));
    }
    return {
      instanceId: instance.id,
      afterCommit: async () => {
        await this.audit.recordChange(principal, action, 'approval-instance', instance.id, {
          before: { status: before },
          after: { status: instance.status, step: instance.steps[instance.currentStepIndex].key },
        }, metadata);
        if (instance.status !== before) await this.notify(instance);
        await this.sendNotifications(changed, { actorId: principal?.user.id ?? null, reassignment });
      },
    };
  }

  async act(principal: Principal, taskId: string, decision: Decision, comment?: string): Promise<string> {
    const task = await this.em.fork().findOne(ApprovalTask, taskId);
    if (!task) throw new NotFoundException('Approval task not found');
    return this.mutate(principal, task.instance.id, `approval.task.${decision}`, async ({ em, instance, state, now }) => {
      const result = engine(() => act(state, { taskId, actorId: principal.user.id, decision, comment }, now));
      return result.outcome === 'step_completed' ? this.advance(em, instance, result.state, now) : result.state;
    }, { action: DECIDED[decision], comment: comment?.trim() || null }, { taskId });
  }

  /**
   * Whom the caller acts as on a submitter's action (answer, resubmit, cancel): themselves, or the
   * submitter for holders of "Act for submitters" in the record's scope. The audit names the caller.
   */
  private actingAs(principal: Principal, instance: ApprovalInstance): string {
    return instance.submittedBy.id !== principal.user.id && principal.can('approvals:instance:manage', scopeOf(instance)) ? instance.submittedBy.id : principal.user.id;
  }

  respondInfo(principal: Principal, instanceId: string, answer: string): Promise<string> {
    return this.mutate(principal, instanceId, 'approval.info.responded', async ({ instance, state, now }) =>
      engine(() => respondInfo(state, this.actingAs(principal, instance), answer, now)),
    { action: 'answered', comment: answer.trim() },
    );
  }

  async resubmit(principal: Principal, instanceId: string): Promise<string> {
    const instance = await this.em.fork().findOne(ApprovalInstance, instanceId);
    const throughModule = instance ? this.typeOf(instance.workflowCode)?.resubmit : undefined;
    if (throughModule) {
      await throughModule(principal, instance!.subjectId);
      return instanceId;
    }
    return this.mutate(principal, instanceId, 'approval.resubmitted', this.resubmitting(principal), { action: 'resubmitted' });
  }

  /** Resubmits inside the caller's transaction (see submitIn). */
  resubmitIn(tx: EntityManager, principal: Principal, instanceId: string): Promise<ApprovalChange> {
    return this.mutateIn(tx, principal, instanceId, 'approval.resubmitted', this.resubmitting(principal), { action: 'resubmitted' });
  }

  private resubmitting(principal: Principal): InstanceChange {
    return async ({ instance, state, now }) => engine(() => resubmit(state, this.actingAs(principal, instance), now, randomUUID));
  }

  cancel(principal: Principal, instanceId: string): Promise<string> {
    return this.mutate(principal, instanceId, 'approval.cancelled', this.cancelling(principal), { action: 'cancelled' });
  }

  /** Cancels inside the caller's transaction (see submitIn). */
  cancelIn(tx: EntityManager, principal: Principal, instanceId: string): Promise<ApprovalChange> {
    return this.mutateIn(tx, principal, instanceId, 'approval.cancelled', this.cancelling(principal), { action: 'cancelled' });
  }

  private cancelling(principal: Principal): InstanceChange {
    return async ({ instance, state }) => engine(() => cancel(state, this.actingAs(principal, instance)));
  }

  // ----- Workflow type settings ------------------------------------------

  /** Whether approvers of a workflow type see the financial data they approve: the setting, else the type's default. */
  async approversSeeFinancials(code: string, em: EntityManager = this.em.fork()): Promise<boolean> {
    const setting = await em.findOne(ApprovalWorkflowSetting, { workflowCode: code });
    return setting ? setting.approversSeeFinancials : (this.typeOf(code)?.approversSeeFinancials ?? false);
  }

  async setApproversSeeFinancials(principal: Principal, code: string, value: boolean): Promise<boolean> {
    this.registry.get(code);
    const em = this.em.fork();
    const before = await this.approversSeeFinancials(code, em);
    const setting = (await em.findOne(ApprovalWorkflowSetting, { workflowCode: code })) ?? em.create(ApprovalWorkflowSetting, { workflowCode: code, approversSeeFinancials: value, createdBy: principal.user.id });
    setting.approversSeeFinancials = value;
    setting.updatedBy = principal.user.id;
    await em.flush();
    await this.audit.recordChange(principal, 'approval.workflow.updated', 'approval-workflow', code, { before: { approversSeeFinancials: before }, after: { approversSeeFinancials: value } });
    return value;
  }

  async reassignTask(principal: Principal | null, taskId: string, toUserId: string, reason: string, escalation = false): Promise<string> {
    const task = await this.em.fork().findOne(ApprovalTask, taskId);
    if (!task) throw new NotFoundException('Approval task not found');
    return this.mutate(principal, task.instance.id, escalation ? 'approval.task.escalated' : 'approval.task.reassigned', async ({ em, instance, state, now }) => {
      const target = await em.findOne(User, { id: toUserId, status: 'active' });
      if (!target) throw new UnprocessableEntityException('The new approver must be an active user');
      if (toUserId === instance.submittedBy.id) {
        throw new UnprocessableEntityException('The submitter cannot approve their own request');
      }
      const next = engine(() => reassign(state, taskId, toUserId, now));
      const entity = await em.findOneOrFail(ApprovalTask, taskId);
      entity.reassignReason = reason;
      // The SLA clock restarts for the new approver, so they get their own reminder.
      entity.reminderSentAt = null;
      if (escalation) entity.escalatedAt = now;
      return next;
    }, undefined, { taskId, toUserId, reason }, { kind: escalation ? 'escalated' : 'reassigned', reason });
  }

  /** First eligible user for an escalation spec, or null. */
  async escalationTarget(instanceId: string, spec: ApproverSpec, exclude: string[], now = new Date()): Promise<string | null> {
    const em = this.em.fork();
    const instance = await em.findOneOrFail(ApprovalInstance, instanceId, { populate: ['submittedBy'] });
    const users = await this.usersFor(em, spec, scopeOf(instance), now);
    return users.find((id) => id !== instance.submittedBy.id && !exclude.includes(id)) ?? null;
  }

  // ----- Delegations -------------------------------------------------------

  /** Current and upcoming delegations of a user (their own, or for holders of "Manage others' delegations"). */
  listDelegations(fromUserId: string): Promise<ApprovalDelegation[]> {
    return this.em.find(
      ApprovalDelegation,
      { fromUser: fromUserId, cancelledAt: null, endsAt: { $gt: new Date() } },
      { populate: ['toUser'], orderBy: { startsAt: 'asc' } },
    );
  }

  async createDelegation(
    principal: Principal,
    fromUserId: string,
    input: { toUserId: string; startsAt: Date; endsAt: Date; reason?: string },
  ): Promise<ApprovalDelegation> {
    if (input.toUserId === fromUserId) throw new BadRequestException('Nobody can delegate to themselves');
    if (fromUserId !== principal.user.id && !(await this.em.count(User, { id: fromUserId, status: 'active' }))) throw new NotFoundException('User not found');
    const delegate = await this.em.findOne(User, { id: input.toUserId, status: 'active' });
    if (!delegate) throw new NotFoundException('Delegate not found');
    // The delegate's role must allow acting for staff (configurable per role; vendors' roles do not by default).
    if (!(await actingForStaff(this.em, [delegate.id])).has(delegate.id)) {
      throw new UnprocessableEntityException("The delegate's role does not allow acting for staff");
    }
    const overlapping = await this.em.count(ApprovalDelegation, {
      fromUser: fromUserId,
      cancelledAt: null,
      startsAt: { $lt: input.endsAt },
      endsAt: { $gt: input.startsAt },
    });
    if (overlapping > 0) throw new ConflictException('There is already a delegation in this period');
    const delegation = this.em.create(ApprovalDelegation, {
      fromUser: this.em.getReference(User, fromUserId),
      toUser: delegate,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      reason: input.reason ?? null,
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await this.em.flush();
    await this.audit.recordChange(principal, 'approval.delegation.created', 'approval-delegation', delegation.id, {
      before: null,
      after: { fromUserId, toUserId: delegate.id, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() },
    });
    return delegation;
  }

  /** Cancels one of `fromUserId`'s delegations (null: anyone's, for holders of "Manage others' delegations"). */
  async cancelDelegation(principal: Principal, id: string, fromUserId: string | null): Promise<ApprovalDelegation> {
    const delegation = await this.em.findOne(ApprovalDelegation, { id, ...(fromUserId ? { fromUser: fromUserId } : {}) }, { populate: ['toUser'] });
    if (!delegation) throw new NotFoundException('Delegation not found');
    if (!delegation.cancelledAt) {
      delegation.cancelledAt = new Date();
      delegation.updatedBy = principal.user.id;
      await this.em.flush();
      await this.audit.recordChange(principal, 'approval.delegation.cancelled', 'approval-delegation', id, { before: null, after: { cancelled: true } });
    }
    return delegation;
  }

  // ----- Reading -----------------------------------------------------------

  private involvement(principal: Principal, tasks: ApprovalTask[]) {
    const mine = tasks.filter((t) => t.assignee.id === principal.user.id || t.originalAssignee?.id === principal.user.id);
    return { onChain: mine.length > 0, activeApprover: mine.some((t) => t.status !== 'blocked') };
  }

  private canRead(principal: Principal, instance: ApprovalInstance, tasks: ApprovalTask[]): boolean {
    return (
      instance.submittedBy.id === principal.user.id ||
      this.involvement(principal, tasks).onChain ||
      principal.can('approvals:instance:read', scopeOf(instance))
    );
  }

  private typeOf(code: string): ApprovalWorkflowType | undefined {
    return this.registry.list().find((t) => t.code === code);
  }

  private maskedContext(principal: Principal, instance: ApprovalInstance, tasks: ApprovalTask[], seeFinancials: boolean, classes: FieldClasses): Record<string, unknown> {
    // Classes come from field classification; a field of an unregistered type is financial.
    const classification: Record<string, DataClass> = {};
    for (const key of Object.keys(instance.context)) {
      const dataClass = classes.of(contextFieldKey(instance.workflowCode, key));
      if (dataClass !== 'internal') classification[key] = dataClass;
    }
    return maskClassified(instance.context, classification, principal, {
      ownerId: instance.submittedBy.id,
      scope: scopeOf(instance),
      approverOf: this.involvement(principal, tasks).activeApprover,
      approversSeeFinancials: seeFinancials,
    });
  }

  private stepStatus(instance: ApprovalInstance, tasks: ApprovalTask[], index: number): string {
    if (instance.status === 'approved' || index < instance.currentStepIndex) return 'approved';
    if (index > instance.currentStepIndex) return instance.status === 'cancelled' ? 'cancelled' : 'waiting';
    if (instance.status !== 'in_progress') return instance.status;
    const current = tasks.filter((t) => t.stepIndex === index && t.status !== 'superseded');
    return current.length > 0 && current.every((t) => t.status === 'blocked' || t.status === 'approved') && current.some((t) => t.status === 'blocked')
      ? 'blocked'
      : 'active';
  }

  private view(principal: Principal, instance: ApprovalInstance, tasks: ApprovalTask[], seeFinancials: boolean, classes: FieldClasses) {
    const current = instance.steps[instance.currentStepIndex];
    const open = instance.status === 'approved' || instance.status === 'cancelled' ? [] : tasks.filter((t) => t.stepIndex === instance.currentStepIndex && (t.status === 'pending' || t.status === 'blocked' || t.status === 'info_requested'));
    return {
      id: instance.id,
      workflowCode: instance.workflowCode,
      workflowName: this.registry.nameOf(instance.workflowCode),
      subjectType: instance.subjectType,
      subjectId: instance.subjectId,
      subjectTitle: instance.subjectTitle,
      status: instance.status,
      round: instance.round,
      ruleKey: instance.ruleKey,
      submittedBy: person(instance.submittedBy)!,
      context: this.maskedContext(principal, instance, tasks, seeFinancials, classes),
      canActForSubmitter: instance.submittedBy.id === principal.user.id || principal.can('approvals:instance:manage', scopeOf(instance)),
      currentStep: instance.status === 'approved' || !current ? null : { index: instance.currentStepIndex, key: current.key, name: current.name },
      steps: instance.steps.map((step, index) => ({ index, key: step.key, name: step.name, status: this.stepStatus(instance, tasks, index) })),
      tasks: tasks.map((task) => ({
        id: task.id,
        stepKey: task.stepKey,
        round: task.round,
        status: task.status,
        assignee: person(task.assignee)!,
        originalAssignee: person(task.originalAssignee),
        comment: task.comment ?? null,
        response: task.response ?? null,
        actedAt: task.actedAt ?? null,
        reassignReason: task.reassignReason ?? null,
      })),
      waitingOn: [...new Map(open.map((t) => [t.assignee.id, person(t.assignee)!])).values()],
      createdAt: instance.createdAt,
      completedAt: instance.completedAt ?? null,
    };
  }

  async getView(principal: Principal, instanceId: string) {
    const em = this.em.fork();
    const instance = await em.findOne(ApprovalInstance, instanceId, { populate: ['submittedBy'] });
    if (!instance) throw new NotFoundException('Approval not found');
    const tasks = await em.find(ApprovalTask, { instance: instanceId }, { populate: ['assignee', 'originalAssignee'], orderBy: { createdAt: 'asc', id: 'asc' } });
    // Not visible → 404, so the existence of other portfolios' approvals is not revealed.
    if (!this.canRead(principal, instance, tasks)) throw new NotFoundException('Approval not found');
    return this.view(principal, instance, tasks, await this.approversSeeFinancials(instance.workflowCode, em), await this.fieldClasses.classes(em));
  }

  async myTasks(principal: Principal) {
    const tasks = await this.em.find(
      ApprovalTask,
      { assignee: principal.user.id, status: { $in: ['pending', 'blocked'] } },
      { populate: ['instance', 'instance.submittedBy'], orderBy: { createdAt: 'asc' } },
    );
    return tasks.map((task) => ({
      taskId: task.id,
      status: task.status,
      stepKey: task.stepKey,
      stepName: task.instance.steps[task.stepIndex].name,
      round: task.round,
      createdAt: task.createdAt,
      instance: {
        id: task.instance.id,
        workflowCode: task.instance.workflowCode,
        workflowName: this.registry.nameOf(task.instance.workflowCode),
        subjectType: task.instance.subjectType,
        subjectId: task.instance.subjectId,
        subjectTitle: task.instance.subjectTitle,
        status: task.instance.status,
        submittedBy: person(task.instance.submittedBy)!,
      },
    }));
  }

  /** Decisions the caller made (approved or rejected), newest first: "Done by me". */
  async myDecisions(principal: Principal, query: { page: number; pageSize: number }) {
    const [tasks, total] = await this.em.fork().findAndCount(
      ApprovalTask,
      { assignee: principal.user.id, status: { $in: ['approved', 'rejected'] }, actedAt: { $ne: null } },
      {
        populate: ['instance', 'instance.submittedBy'],
        orderBy: { actedAt: 'desc', id: 'desc' },
        limit: query.pageSize,
        offset: (query.page - 1) * query.pageSize,
      },
    );
    return {
      items: tasks.map((task) => ({
        taskId: task.id,
        decision: task.status as 'approved' | 'rejected',
        comment: task.comment ?? null,
        actedAt: task.actedAt!,
        stepName: task.instance.steps[task.stepIndex].name,
        round: task.round,
        instance: {
          id: task.instance.id,
          workflowCode: task.instance.workflowCode,
          workflowName: this.registry.nameOf(task.instance.workflowCode),
          subjectTitle: task.instance.subjectTitle,
          status: task.instance.status,
          submittedBy: person(task.instance.submittedBy)!,
        },
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async listInstances(
    principal: Principal,
    query: { status?: InstanceStatus; workflowCode?: string; mine?: boolean; page: number; pageSize: number },
  ) {
    const em = this.em.fork();
    const filters: Record<string, unknown> = {};
    if (query.status) filters.status = query.status;
    if (query.workflowCode) filters.workflowCode = query.workflowCode;
    if (query.mine) filters.submittedBy = principal.user.id;

    // Same rule as getView: own submissions, approvals I am on, or instance:read in the record's scope.
    const grants = principal.grants.filter((g) => g.permissions.has('approvals:instance:read'));
    const seesAll = principal.isSystemAdmin || grants.some((g) => g.scope.scopeType === 'global');
    let visibility: Record<string, unknown> = {};
    if (!seesAll) {
      const mine = await em.find(ApprovalTask, { $or: [{ assignee: principal.user.id }, { originalAssignee: principal.user.id }] }, { fields: ['instance'] });
      const field = { department: 'departmentId', portfolio: 'portfolioId', stream: 'streamId', application: 'applicationId' } as const;
      visibility = {
        $or: [
          { submittedBy: principal.user.id },
          { id: { $in: [...new Set(mine.map((t) => t.instance.id))] } },
          ...grants
            .filter((g) => g.scope.scopeType in field)
            .map((g) => ({ [field[g.scope.scopeType as keyof typeof field]]: g.scope.scopeId })),
          // A record in several portfolios is read through any of them.
          ...grants.filter((g) => g.scope.scopeType === 'portfolio').map((g) => ({ portfolioIds: { $contains: [g.scope.scopeId!] } })),
        ],
      };
    }
    const [items, total] = await em.findAndCount(
      ApprovalInstance,
      { ...filters, ...visibility },
      { populate: ['submittedBy'], orderBy: { createdAt: 'desc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize },
    );
    return {
      items: items.map((instance) => ({
        id: instance.id,
        workflowCode: instance.workflowCode,
        workflowName: this.registry.nameOf(instance.workflowCode),
        subjectType: instance.subjectType,
        subjectId: instance.subjectId,
        subjectTitle: instance.subjectTitle,
        status: instance.status,
        currentStepKey: instance.status === 'approved' ? null : instance.steps[instance.currentStepIndex].key,
        submittedBy: person(instance.submittedBy)!,
        createdAt: instance.createdAt,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
