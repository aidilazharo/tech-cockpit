import { Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PageQuerySchema } from '../../common/http/pagination.js';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../common/zod/index.js';
import { AccessService } from '../access/access.service.js';
import { AuditResource, CurrentPrincipal, RequirePermission } from '../access/decorators.js';
import type { Principal } from '../access/principal.js';
import type { ApprovalDelegation, ApprovalRuleSet } from './approval.entities.js';
import {
  ApproveSchema,
  CommentRequiredSchema,
  CreateDelegationForSchema,
  CreateDelegationSchema,
  CreateRuleSetSchema,
  DecisionPageSchema,
  DelegationQuerySchema,
  DelegationSchemaOut,
  InstancePageSchema,
  InstanceQuerySchema,
  InstanceViewSchema,
  MyTaskListSchema,
  ReassignSchema,
  RespondInfoSchema,
  RuleOptionsSchema,
  RuleSetQuerySchema,
  RuleSetSchemaOut,
  UpdateRuleSetSchema,
  WorkflowListSchema,
} from './approval.schemas.js';
import { ApprovalService } from './approval.service.js';
import { ApprovalRuleSetService } from './approval-rule-set.service.js';
import { ApprovalWorkflowRegistry } from './approval-workflow.registry.js';

const IdParam = z.uuid();
const WorkflowCodeParam = z.string().regex(/^[a-z][a-z0-9-]{0,62}$/);
const WorkflowSettingInputSchema = z
  .object({ approversSeeFinancials: z.boolean().describe('Approvers see the financial data of what they approve') })
  .strict()
  .meta({ id: 'UpdateApprovalWorkflow' });
const WorkflowSettingSchema = z.object({ code: z.string(), approversSeeFinancials: z.boolean() }).meta({ id: 'ApprovalWorkflowSetting' });

function ruleSetView(ruleSet: ApprovalRuleSet) {
  return {
    id: ruleSet.id,
    workflowCode: ruleSet.workflowCode,
    ruleVersion: ruleSet.ruleVersion,
    status: ruleSet.status,
    definition: ruleSet.definition,
    publishedAt: ruleSet.publishedAt ?? null,
    publishedBy: ruleSet.publishedBy ?? null,
    version: ruleSet.version,
    createdAt: ruleSet.createdAt,
  };
}

function delegationView(delegation: ApprovalDelegation) {
  return {
    id: delegation.id,
    toUser: { id: delegation.toUser.id, name: `${delegation.toUser.firstName} ${delegation.toUser.lastName}` },
    startsAt: delegation.startsAt,
    endsAt: delegation.endsAt,
    reason: delegation.reason ?? null,
    cancelledAt: delegation.cancelledAt ?? null,
  };
}

@ApiTags('Approval rules (maintenance)')
@AuditResource('approval-rule-set')
@Controller({ version: '1' })
export class ApprovalRuleSetController {
  constructor(
    private readonly ruleSets: ApprovalRuleSetService,
    private readonly registry: ApprovalWorkflowRegistry,
    private readonly access: AccessService,
    private readonly approvals: ApprovalService,
  ) {}

  @Get('approval-workflows')
  @RequirePermission('approvals:rule-set:read')
  @ZodResponse({ status: 200, schema: WorkflowListSchema, description: 'Approvable workflow types and the fields rules may use' })
  async workflows() {
    const items = [];
    for (const type of this.registry.list()) {
      items.push({
        code: type.code,
        name: type.name,
        description: type.description ?? null,
        contextFields: this.registry.contextFields(type.code),
        fields: this.registry.contextFieldTypes(type.code),
        approversSeeFinancials: await this.approvals.approversSeeFinancials(type.code),
      });
    }
    return { items };
  }

  @Patch('approval-workflows/:code')
  @RequirePermission('approvals:rule-set:manage')
  @ZodResponse({ status: 200, schema: WorkflowSettingSchema, description: 'Setting changed (applies to approvals at once)' })
  async updateWorkflow(@CurrentPrincipal() principal: Principal, @ZodParam('code', WorkflowCodeParam) code: string, @ZodBody(WorkflowSettingInputSchema) body: z.infer<typeof WorkflowSettingInputSchema>) {
    return { code, approversSeeFinancials: await this.approvals.setApproversSeeFinancials(principal, code, body.approversSeeFinancials) };
  }

  @Get('approval-rule-options')
  @RequirePermission('approvals:rule-set:read')
  @ZodResponse({ status: 200, schema: RuleOptionsSchema, description: 'Choices for building rules (approver roles)' })
  async options() {
    return { roles: (await this.access.listRoles()).map((role) => ({ code: role.code, name: role.name })) };
  }

  @Get('approval-rule-sets')
  @RequirePermission('approvals:rule-set:read')
  @ZodResponse({ status: 200, schema: z.object({ items: z.array(RuleSetSchemaOut) }), description: 'Rule sets, newest version first' })
  async list(@ZodQuery(RuleSetQuerySchema) query: z.infer<typeof RuleSetQuerySchema>) {
    return { items: (await this.ruleSets.list(query.workflowCode)).map(ruleSetView) };
  }

  @Get('approval-rule-sets/:id')
  @RequirePermission('approvals:rule-set:read')
  @ZodResponse({ status: 200, schema: RuleSetSchemaOut, description: 'The rule set' })
  async get(@ZodParam('id', IdParam) id: string) {
    return ruleSetView(await this.ruleSets.get(id));
  }

  @Post('approval-rule-sets')
  @RequirePermission('approvals:rule-set:manage')
  @ZodResponse({ status: 201, schema: RuleSetSchemaOut, description: 'New draft version' })
  async create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateRuleSetSchema) body: z.infer<typeof CreateRuleSetSchema>) {
    return ruleSetView(await this.ruleSets.createDraft(principal, body.workflowCode, body.definition));
  }

  @Patch('approval-rule-sets/:id')
  @RequirePermission('approvals:rule-set:manage')
  @ZodResponse({ status: 200, schema: RuleSetSchemaOut, description: 'Updated draft' })
  async update(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(UpdateRuleSetSchema) body: z.infer<typeof UpdateRuleSetSchema>) {
    return ruleSetView(await this.ruleSets.updateDraft(principal, id, body.definition, body.version));
  }

  @Post('approval-rule-sets/:id/publish')
  @HttpCode(200)
  @RequirePermission('approvals:rule-set:manage')
  @ZodResponse({ status: 200, schema: RuleSetSchemaOut, description: 'Published; the previous version is retired' })
  async publish(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return ruleSetView(await this.ruleSets.publish(principal, id));
  }
}

@ApiTags('Approval centre')
@AuditResource('approval-instance')
@Controller({ version: '1' })
export class ApprovalCentreController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get('approval-tasks')
  @RequirePermission('approvals:task:act')
  @ZodResponse({ status: 200, schema: MyTaskListSchema, description: 'Your open approval tasks (pending, or blocked behind a gate)' })
  async myTasks(@CurrentPrincipal() principal: Principal) {
    return { items: await this.approvals.myTasks(principal) };
  }

  @Post('approval-tasks/:id/approve')
  @HttpCode(200)
  @RequirePermission('approvals:task:act')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Approval after your decision' })
  async approve(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(ApproveSchema) body: z.infer<typeof ApproveSchema>) {
    return this.approvals.getView(principal, await this.approvals.act(principal, id, 'approve', body.comment));
  }

  @Post('approval-tasks/:id/reject')
  @HttpCode(200)
  @RequirePermission('approvals:task:act')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Returned to the submitter' })
  async reject(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(CommentRequiredSchema) body: z.infer<typeof CommentRequiredSchema>) {
    return this.approvals.getView(principal, await this.approvals.act(principal, id, 'reject', body.comment));
  }

  @Post('approval-tasks/:id/request-info')
  @HttpCode(200)
  @RequirePermission('approvals:task:act')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Waiting for the submitter to answer' })
  async requestInfo(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(CommentRequiredSchema) body: z.infer<typeof CommentRequiredSchema>) {
    return this.approvals.getView(principal, await this.approvals.act(principal, id, 'request_info', body.comment));
  }

  @Post('approval-tasks/:id/reassign')
  @HttpCode(200)
  @RequirePermission('approvals:task:reassign')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Task moved to another approver' })
  async reassign(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(ReassignSchema) body: z.infer<typeof ReassignSchema>) {
    return this.approvals.getView(principal, await this.approvals.reassignTask(principal, id, body.toUserId, body.reason));
  }

  @Get('me/approval-decisions')
  @RequirePermission('approvals:task:act')
  @ZodResponse({ status: 200, schema: DecisionPageSchema, description: 'Decisions you made (approved or rejected), newest first' })
  myDecisions(@CurrentPrincipal() principal: Principal, @ZodQuery(PageQuerySchema) query: z.infer<typeof PageQuerySchema>) {
    return this.approvals.myDecisions(principal, query);
  }

  @Get('approval-instances')
  @RequirePermission('approvals:instance:read')
  @ZodResponse({ status: 200, schema: InstancePageSchema, description: 'Approvals you may see' })
  list(@CurrentPrincipal() principal: Principal, @ZodQuery(InstanceQuerySchema) query: z.infer<typeof InstanceQuerySchema>) {
    return this.approvals.listInstances(principal, query);
  }

  @Get('approval-instances/:id')
  @RequirePermission('approvals:instance:read')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Timeline: steps, tasks and who it is waiting on' })
  get(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.approvals.getView(principal, id);
  }

  @Post('approval-instances/:id/respond-info')
  @HttpCode(200)
  @RequirePermission('approvals:instance:read')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Answer sent; the approver can continue' })
  async respondInfo(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string, @ZodBody(RespondInfoSchema) body: z.infer<typeof RespondInfoSchema>) {
    return this.approvals.getView(principal, await this.approvals.respondInfo(principal, id, body.answer));
  }

  @Post('approval-instances/:id/resubmit')
  @HttpCode(200)
  @RequirePermission('approvals:instance:read')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Resumed at the step that returned it' })
  async resubmit(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.approvals.getView(principal, await this.approvals.resubmit(principal, id));
  }

  @Post('approval-instances/:id/cancel')
  @HttpCode(200)
  @RequirePermission('approvals:instance:read')
  @ZodResponse({ status: 200, schema: InstanceViewSchema, description: 'Cancelled by the submitter' })
  async cancel(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return this.approvals.getView(principal, await this.approvals.cancel(principal, id));
  }
}

@ApiTags('Approval centre')
@AuditResource('approval-delegation')
@Controller({ path: 'me/delegations', version: '1' })
export class DelegationController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get()
  @RequirePermission('approvals:delegation:manage')
  @ZodResponse({ status: 200, schema: z.object({ items: z.array(DelegationSchemaOut) }), description: 'Your current and upcoming delegations' })
  async list(@CurrentPrincipal() principal: Principal) {
    return { items: (await this.approvals.listDelegations(principal.user.id)).map(delegationView) };
  }

  @Post()
  @RequirePermission('approvals:delegation:manage')
  @ZodResponse({ status: 201, schema: DelegationSchemaOut, description: 'Created delegation' })
  async create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateDelegationSchema) body: z.infer<typeof CreateDelegationSchema>) {
    return delegationView(await this.approvals.createDelegation(principal, principal.user.id, body));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('approvals:delegation:manage')
  @ZodResponse({ status: 200, schema: DelegationSchemaOut, description: 'Cancelled delegation' })
  async cancel(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return delegationView(await this.approvals.cancelDelegation(principal, id, principal.user.id));
  }
}

/** Out-of-office for someone else (e.g. a person who forgot before leave). */
@ApiTags('Approval centre')
@AuditResource('approval-delegation')
@Controller({ path: 'approval-delegations', version: '1' })
export class AnyDelegationController {
  constructor(private readonly approvals: ApprovalService) {}

  @Get()
  @RequirePermission('approvals:any-delegation:manage')
  @ZodResponse({ status: 200, schema: z.object({ items: z.array(DelegationSchemaOut) }), description: "A person's current and upcoming delegations" })
  async list(@ZodQuery(DelegationQuerySchema) query: z.infer<typeof DelegationQuerySchema>) {
    return { items: (await this.approvals.listDelegations(query.userId)).map(delegationView) };
  }

  @Post()
  @RequirePermission('approvals:any-delegation:manage')
  @ZodResponse({ status: 201, schema: DelegationSchemaOut, description: 'Created delegation' })
  async create(@CurrentPrincipal() principal: Principal, @ZodBody(CreateDelegationForSchema) body: z.infer<typeof CreateDelegationForSchema>) {
    const { fromUserId, ...input } = body;
    return delegationView(await this.approvals.createDelegation(principal, fromUserId, input));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('approvals:any-delegation:manage')
  @ZodResponse({ status: 200, schema: DelegationSchemaOut, description: 'Cancelled delegation' })
  async cancel(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return delegationView(await this.approvals.cancelDelegation(principal, id, null));
  }
}
