import { z } from 'zod'

export const NOTIFICATION_TYPES = [
  'approval.task.assigned',
  'approval.task.review-again',
  'approval.task.reassigned',
  'approval.task.escalated',
  'approval.task.info-answered',
  'approval.task.sla-reminder',
  'approval.request.approved',
  'approval.request.returned',
  'approval.request.info-requested',
  'approval.request.cancelled',
  'sad.upload.malicious',
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

export const NotificationSchema = z.object({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
})
export type Notification = z.infer<typeof NotificationSchema>

export const NotificationPageSchema = z.object({
  items: z.array(NotificationSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  unread: z.number().int(),
})
export const UnreadCountSchema = z.object({ unread: z.number().int() })
