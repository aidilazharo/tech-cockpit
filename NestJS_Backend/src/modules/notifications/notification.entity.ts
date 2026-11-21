import { randomUUID } from 'node:crypto';
import { defineEntity, p } from '@mikro-orm/core';
import { WILDCARD_SCHEMA } from '../../database/base-properties.js';
import { User } from '../identity/user.entity.js';
import { NOTIFICATION_TYPES, type NotificationParams } from './notification-types.js';

/**
 * In-app notification for one person. The text is built in the browser from `type`
 * and `params` (i18n), so stored notifications follow later wording changes.
 * Deleted after 90 days; the audit log is the permanent record.
 */
export const NotificationSchema = defineEntity({
  name: 'Notification',
  tableName: 'notification',
  schema: WILDCARD_SCHEMA,
  indexes: [{ properties: ['recipient', 'readAt'] }],
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => randomUUID()),
    createdAt: p
      .datetime()
      .onCreate(() => new Date())
      .index(),
    recipient: () => p.manyToOne(User),
    type: p.enum(NOTIFICATION_TYPES),
    params: p.json<NotificationParams>(),
    /** In-app path to open, e.g. /approvals/<id> */
    link: p.string().length(500).nullable(),
    readAt: p.datetime().nullable(),
  },
});

export class Notification extends NotificationSchema.class {}
NotificationSchema.setClass(Notification);
