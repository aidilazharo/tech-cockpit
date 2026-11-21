/** Every kind of in-app notification. The web app has a text for each (i18n). */
export const NOTIFICATION_TYPES = [
  // To an approver
  'approval.task.assigned',
  'approval.task.review-again',
  'approval.task.reassigned',
  'approval.task.escalated',
  'approval.task.info-answered',
  'approval.task.sla-reminder',
  // To the requester
  'approval.request.approved',
  'approval.request.returned',
  'approval.request.info-requested',
  'approval.request.cancelled',
  // To the uploader and every system administrator: Defender for Storage found malware in a SAD upload
  'sad.upload.malicious',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Values the text needs (titles, names, reasons). Plain values only. */
export type NotificationParams = Record<string, string | number | null>;

export interface NewNotification {
  recipientId: string;
  type: NotificationType;
  params: NotificationParams;
  link: string | null;
}
