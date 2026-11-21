import { LockMode } from '@mikro-orm/core';
import { EntityManager } from '@mikro-orm/postgresql';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Principal } from '../access/principal.js';
import { AuditService } from '../audit/audit.service.js';
import { ApprovalRuleSet } from './approval.entities.js';
import { ApprovalWorkflowRegistry } from './approval-workflow.registry.js';
import { unknownContextFields, type RuleSetDefinition } from './domain/rule-set.schema.js';

@Injectable()
export class ApprovalRuleSetService {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: ApprovalWorkflowRegistry,
    private readonly audit: AuditService,
  ) {}

  private assertFields(workflowCode: string, definition: RuleSetDefinition): void {
    const unknown = unknownContextFields(definition, this.registry.contextFields(workflowCode));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Conditions use fields that "${workflowCode}" does not provide: ${unknown.join(', ')}`,
      );
    }
  }

  list(workflowCode?: string): Promise<ApprovalRuleSet[]> {
    return this.em.find(ApprovalRuleSet, workflowCode ? { workflowCode } : {}, {
      orderBy: { workflowCode: 'asc', ruleVersion: 'desc' },
    });
  }

  async get(id: string): Promise<ApprovalRuleSet> {
    const ruleSet = await this.em.findOne(ApprovalRuleSet, id);
    if (!ruleSet) throw new NotFoundException('Rule set not found');
    return ruleSet;
  }

  async createDraft(principal: Principal, workflowCode: string, definition: RuleSetDefinition): Promise<ApprovalRuleSet> {
    this.registry.get(workflowCode);
    this.assertFields(workflowCode, definition);
    const latest = await this.em.findOne(ApprovalRuleSet, { workflowCode }, { orderBy: { ruleVersion: 'desc' } });
    const ruleSet = this.em.create(ApprovalRuleSet, {
      workflowCode,
      ruleVersion: (latest?.ruleVersion ?? 0) + 1,
      status: 'draft',
      definition,
      createdBy: principal.user.id,
      updatedBy: principal.user.id,
    });
    await this.em.flush();
    await this.audit.recordChange(principal, 'approval-rule-set.created', 'approval-rule-set', ruleSet.id, {
      before: null,
      after: { workflowCode, ruleVersion: ruleSet.ruleVersion, definition },
    });
    return ruleSet;
  }

  async updateDraft(principal: Principal, id: string, definition: RuleSetDefinition, version: number): Promise<ApprovalRuleSet> {
    const ruleSet = await this.get(id);
    if (ruleSet.status !== 'draft') throw new ConflictException('Only draft rule sets can be edited');
    await this.em.lock(ruleSet, LockMode.OPTIMISTIC, version);
    this.assertFields(ruleSet.workflowCode, definition);
    const before = ruleSet.definition;
    ruleSet.definition = definition;
    ruleSet.updatedBy = principal.user.id;
    await this.em.flush();
    await this.audit.recordChange(principal, 'approval-rule-set.updated', 'approval-rule-set', id, { before: { definition: before }, after: { definition } });
    return ruleSet;
  }

  /** Publishes a draft and retires the currently published version, atomically. */
  async publish(principal: Principal, id: string): Promise<ApprovalRuleSet> {
    const ruleSet = await this.get(id);
    if (ruleSet.status !== 'draft') throw new ConflictException('Only draft rule sets can be published');
    this.assertFields(ruleSet.workflowCode, ruleSet.definition);
    await this.em.transactional(async (em) => {
      await em.nativeUpdate(
        ApprovalRuleSet,
        { workflowCode: ruleSet.workflowCode, status: 'published' },
        { status: 'retired', updatedBy: principal.user.id, updatedAt: new Date() },
      );
      const fresh = await em.findOneOrFail(ApprovalRuleSet, id);
      fresh.status = 'published';
      fresh.publishedAt = new Date();
      fresh.publishedBy = principal.user.id;
      fresh.updatedBy = principal.user.id;
    });
    const published = await this.em.fork().findOneOrFail(ApprovalRuleSet, id);
    await this.audit.recordChange(principal, 'approval-rule-set.published', 'approval-rule-set', id, {
      before: null,
      after: { workflowCode: published.workflowCode, ruleVersion: published.ruleVersion },
    });
    return published;
  }
}
