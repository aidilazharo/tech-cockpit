import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Tag } from '../../components/qi'
import { cn } from '../../lib/cn'
import { formatDateTime } from '../../lib/format'
import { notificationText } from './notification-text'
import { useMarkRead } from './queries'
import type { Notification } from './schemas'

/** Notifications as a list of buttons: opening one marks it read and goes to its page. */
export function NotificationList({ items, onOpen, compact = false }: { items: Notification[]; onOpen?: () => void; compact?: boolean }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const markRead = useMarkRead()

  const open = (notification: Notification) => {
    if (!notification.readAt) markRead.mutate(notification.id)
    onOpen?.()
    if (notification.link) void navigate(notification.link)
  }

  return (
    <ul className="flex flex-col">
      {items.map((notification) => {
        const { title, detail } = notificationText(t, notification)
        const unread = !notification.readAt
        return (
          <li key={notification.id} className="border-b border-divider-default last:border-b-0">
            <button
              type="button"
              onClick={() => open(notification)}
              className={cn(
                'flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-surface-hover-1',
                'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus',
                unread && 'border-l-4 border-button-primary-border',
              )}
            >
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn('text-sm', unread ? 'font-semibold' : 'text-text-default')}>{title}</span>
                {unread && <Tag emphasis="new">{t('notifications.unread')}</Tag>}
              </span>
              {detail && <span className={cn('text-sm text-text-subdued', compact && 'line-clamp-2')}>{detail}</span>}
              <span className="text-xs text-text-subdued">{formatDateTime(notification.createdAt)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
