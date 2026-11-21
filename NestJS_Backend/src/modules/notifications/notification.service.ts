import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Principal } from '../access/principal.js';
import { User } from '../identity/user.entity.js';
import type { NewNotification } from './notification-types.js';
import { Notification } from './notification.entity.js';

/** Notifications older than this are deleted (decided 2026-10-21). */
export const NOTIFICATION_RETENTION_DAYS = 90;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly em: EntityManager) {}

  /**
   * Stores notifications. Never throws: a failed notification must not undo or fail
   * the business action that caused it (it is logged instead).
   */
  async send(notifications: readonly NewNotification[]): Promise<void> {
    if (notifications.length === 0) return;
    try {
      const em = this.em.fork();
      for (const notification of notifications) {
        em.create(Notification, {
          recipient: em.getReference(User, notification.recipientId),
          type: notification.type,
          params: notification.params,
          link: notification.link,
        });
      }
      await em.flush();
    } catch (error) {
      this.logger.error(`Could not store ${notifications.length} notification(s): ${String(error)}`);
    }
  }

  async list(principal: Principal, query: { unreadOnly: boolean; page: number; pageSize: number }) {
    const em = this.em.fork();
    const where = { recipient: principal.user.id, ...(query.unreadOnly && { readAt: null }) };
    const [items, total] = await em.findAndCount(Notification, where, {
      orderBy: { createdAt: 'desc', id: 'desc' },
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    });
    return { items, total, unread: await this.unreadCount(principal) };
  }

  unreadCount(principal: Principal): Promise<number> {
    return this.em.fork().count(Notification, { recipient: principal.user.id, readAt: null });
  }

  /** Marks one of the caller's notifications read (404 for anyone else's: no leak). */
  async markRead(principal: Principal, id: string, now = new Date()): Promise<Notification> {
    const em = this.em.fork();
    const notification = await em.findOne(Notification, { id, recipient: principal.user.id });
    if (!notification) throw new NotFoundException('Notification not found');
    notification.readAt ??= now;
    await em.flush();
    return notification;
  }

  markAllRead(principal: Principal, now = new Date()): Promise<number> {
    return this.em.fork().nativeUpdate(Notification, { recipient: principal.user.id, readAt: null }, { readAt: now });
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'notification-housekeeping' })
  async purgeOld(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_DAYS * 24 * 3600_000);
    const removed = await this.em.fork().nativeDelete(Notification, { createdAt: { $lt: cutoff } });
    if (removed > 0) this.logger.log(`Removed ${removed} notification(s) older than ${NOTIFICATION_RETENTION_DAYS} days`);
    return removed;
  }
}
