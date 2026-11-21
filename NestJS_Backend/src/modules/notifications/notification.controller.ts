import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PageQuerySchema, pageOf } from '../../common/http/pagination.js';
import { ZodParam, ZodQuery, ZodResponse } from '../../common/zod/index.js';
import { AuditResource, Authenticated, CurrentPrincipal, SkipRequestAudit } from '../access/decorators.js';
import type { Principal } from '../access/principal.js';
import { NOTIFICATION_TYPES } from './notification-types.js';
import type { Notification } from './notification.entity.js';
import { NotificationService } from './notification.service.js';

const NotificationSchemaOut = z
  .object({
    id: z.uuid(),
    type: z.enum(NOTIFICATION_TYPES),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
    link: z.string().nullable(),
    readAt: z.date().nullable(),
    createdAt: z.date(),
  })
  .meta({ id: 'Notification' });

const NotificationPageSchema = pageOf(NotificationSchemaOut).extend({ unread: z.number().int() }).meta({ id: 'NotificationPage' });
const NotificationQuerySchema = PageQuerySchema.extend({
  unread: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true')
    .describe('Only unread notifications'),
});
const UnreadCountSchema = z.object({ unread: z.number().int() }).meta({ id: 'UnreadCount' });
const IdParam = z.uuid();

function view(notification: Notification) {
  return {
    id: notification.id,
    type: notification.type,
    params: notification.params,
    link: notification.link ?? null,
    readAt: notification.readAt ?? null,
    createdAt: notification.createdAt,
  };
}

@ApiTags('Notifications')
@AuditResource('notification')
@Controller({ path: 'me/notifications', version: '1' })
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @Authenticated('Everyone reads their own notifications')
  @ZodResponse({ status: 200, schema: NotificationPageSchema, description: 'Your notifications, newest first, with the unread count' })
  async list(@CurrentPrincipal() principal: Principal, @ZodQuery(NotificationQuerySchema) query: z.infer<typeof NotificationQuerySchema>) {
    const { items, total, unread } = await this.notifications.list(principal, {
      unreadOnly: query.unread,
      page: query.page,
      pageSize: query.pageSize,
    });
    return { items: items.map(view), page: query.page, pageSize: query.pageSize, total, unread };
  }

  @Get('unread-count')
  @Authenticated('Everyone sees their own unread count')
  @SkipRequestAudit('Polled every minute for the header badge; returns only a number')
  @ZodResponse({ status: 200, schema: UnreadCountSchema, description: 'How many notifications you have not read' })
  async unreadCount(@CurrentPrincipal() principal: Principal) {
    return { unread: await this.notifications.unreadCount(principal) };
  }

  @Post(':id/read')
  @HttpCode(200)
  @Authenticated('Everyone marks their own notifications read')
  @ZodResponse({ status: 200, schema: NotificationSchemaOut, description: 'The notification, now read' })
  async markRead(@CurrentPrincipal() principal: Principal, @ZodParam('id', IdParam) id: string) {
    return view(await this.notifications.markRead(principal, id));
  }

  @Post('read-all')
  @HttpCode(200)
  @Authenticated('Everyone marks their own notifications read')
  @ZodResponse({ status: 200, schema: z.object({ updated: z.number().int() }), description: 'How many were marked read' })
  async markAllRead(@CurrentPrincipal() principal: Principal) {
    return { updated: await this.notifications.markAllRead(principal) };
  }
}
