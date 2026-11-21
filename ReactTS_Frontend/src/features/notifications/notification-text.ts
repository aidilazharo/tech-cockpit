import type { TFunction } from 'i18next'
import { formatDateTime } from '../../lib/format'
import type { Notification } from './schemas'

export interface NotificationText {
  title: string
  /** Reason, question or answer quoted under the title */
  detail: string | null
}

/** The words for a notification, built from its type and values (i18n). */
export function notificationText(t: TFunction, notification: Notification): NotificationText {
  const { params } = notification
  const key = `notifications.types.${notification.type.replaceAll('.', '-')}`
  const title = t(key, {
    ...params,
    due: typeof params.dueAt === 'string' ? formatDateTime(params.dueAt) : '',
    context:
      notification.type === 'approval.task.assigned' && params.onBehalfOf
        ? 'delegate'
        : notification.type === 'sad.upload.malicious' && !params.application
          ? 'unnamed'
          : undefined,
  })
  const quote = (label: 'reason' | 'question' | 'answer', value: unknown) =>
    typeof value === 'string' && value ? t(`notifications.detail.${label}`, { text: value }) : null
  const detail =
    notification.type === 'approval.request.returned' || notification.type === 'approval.task.reassigned'
      ? quote('reason', params.reason)
      : notification.type === 'approval.request.info-requested'
        ? quote('question', params.question)
        : notification.type === 'approval.task.info-answered'
          ? quote('answer', params.answer)
          : null
  return { title, detail }
}
