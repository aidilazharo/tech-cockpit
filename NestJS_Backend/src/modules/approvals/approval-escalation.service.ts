import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from '../notifications/notification.service.js';
import { ApprovalTask } from './approval.entities.js';
import { ApprovalWorkflowRegistry } from './approval-workflow.registry.js';
import { ApprovalService } from './approval.service.js';

/** Share of a step's SLA after which the approver is reminded (decided 2026-10-21). */
export const SLA_REMINDER_SHARE = 0.75;

/**
 * Every 10 minutes: reminds approvers once 75% of their step's SLA has passed, and
 * reassigns tasks whose SLA has passed to the step's escalation approver.
 */
@Injectable()
export class ApprovalEscalationService {
  private readonly logger = new Logger(ApprovalEscalationService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly approvals: ApprovalService,
    private readonly notifications: NotificationService,
    private readonly registry: ApprovalWorkflowRegistry,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'approval-sla-escalation' })
  async run(): Promise<void> {
    const now = new Date();
    const reminded = await this.remindDueSoon(now);
    const escalated = await this.escalateOverdue(now);
    if (reminded + escalated > 0) this.logger.log(`Sent ${reminded} SLA reminder(s), escalated ${escalated} overdue task(s)`);
  }

  /** Returns how many reminders were sent. Each task is reminded at most once per SLA clock. */
  async remindDueSoon(now: Date): Promise<number> {
    const em = this.em.fork();
    const candidates = await em.find(
      ApprovalTask,
      { status: 'pending', reminderSentAt: null, escalatedAt: null, activatedAt: { $ne: null }, instance: { status: 'in_progress' } },
      { populate: ['instance'] },
    );
    let reminded = 0;
    for (const task of candidates) {
      const step = task.instance.steps[task.stepIndex];
      if (!step.slaHours) continue;
      const slaMs = step.slaHours * 3_600_000;
      if (task.activatedAt!.getTime() + SLA_REMINDER_SHARE * slaMs > now.getTime()) continue;
      task.reminderSentAt = now;
      await this.notifications.send([
        {
          recipientId: task.assignee.id,
          type: 'approval.task.sla-reminder',
          params: {
            subjectTitle: task.instance.subjectTitle,
            workflow: this.registry.list().find((type) => type.code === task.instance.workflowCode)?.name ?? task.instance.workflowCode,
            step: step.name,
            dueAt: new Date(task.activatedAt!.getTime() + slaMs).toISOString(),
          },
          link: `/approvals/${task.instance.id}`,
        },
      ]);
      reminded++;
    }
    await em.flush();
    return reminded;
  }

  /** Returns how many tasks were escalated. Each task is escalated at most once. */
  async escalateOverdue(now: Date): Promise<number> {
    const candidates = await this.em.fork().find(
      ApprovalTask,
      { status: 'pending', escalatedAt: null, activatedAt: { $ne: null }, instance: { status: 'in_progress' } },
      { populate: ['instance'] },
    );
    let escalated = 0;
    for (const task of candidates) {
      const step = task.instance.steps[task.stepIndex];
      if (!step.slaHours || !step.escalateTo) continue;
      if (task.activatedAt!.getTime() + step.slaHours * 3_600_000 > now.getTime()) continue;
      const target = await this.approvals.escalationTarget(task.instance.id, step.escalateTo, [task.assignee.id], now);
      if (!target) {
        this.logger.warn(`No escalation approver available for task ${task.id} (step ${step.key})`);
        continue;
      }
      await this.approvals.reassignTask(null, task.id, target, 'sla-escalation', true);
      escalated++;
    }
    return escalated;
  }
}
