import { Module } from '@nestjs/common';
import { AnyDelegationController, ApprovalCentreController, ApprovalRuleSetController, DelegationController } from './approval.controllers.js';
import { ApprovalService } from './approval.service.js';
import { ApprovalEscalationService } from './approval-escalation.service.js';
import { ApprovalRuleSetService } from './approval-rule-set.service.js';
import { ApprovalWorkflowRegistry } from './approval-workflow.registry.js';

/**
 * Configurable approval engine. Business modules import this module, register their
 * workflow type with ApprovalWorkflowRegistry and submit records via ApprovalService.
 */
@Module({
  controllers: [ApprovalRuleSetController, ApprovalCentreController, DelegationController, AnyDelegationController],
  providers: [ApprovalWorkflowRegistry, ApprovalRuleSetService, ApprovalService, ApprovalEscalationService],
  exports: [ApprovalWorkflowRegistry, ApprovalService],
})
export class ApprovalsModule {}
