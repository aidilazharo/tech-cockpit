import { Popover } from '@base-ui/react/popover'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '../../components/qi'
import { BellIcon } from '../../components/qi/icons'
import { NotificationList } from './NotificationList'
import { useMarkAllRead, useNotifications, useUnreadCount } from './queries'

const RECENT = 8

/** Header bell: unread count (checked every minute) and the latest notifications. */
export function NotificationBell() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const unread = useUnreadCount().data?.unread ?? 0
  const recent = useNotifications(false, 1, RECENT, open)
  const markAllRead = useMarkAllRead()

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')}
        className="relative inline-flex size-10 items-center justify-center rounded-button text-icon-default hover:bg-surface-hover-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus data-popup-open:bg-surface-hover-1"
      >
        <BellIcon className="size-5" />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 min-w-5 rounded-full bg-button-primary-surface px-1 text-center text-xs leading-5 font-semibold text-button-primary-text"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="z-50 outline-none" sideOffset={4} align="end">
          <Popover.Popup className="flex max-h-(--available-height) w-96 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-overlay border border-border-subdued bg-surface-overlay text-text-default shadow-md outline-none">
            <div className="flex items-center justify-between gap-2 border-b border-divider-default px-4 py-2">
              <Popover.Title className="font-semibold">{t('notifications.title')}</Popover.Title>
              {unread > 0 && (
                <Button variant="tertiary" onClick={() => markAllRead.mutate()}>
                  {t('notifications.markAllRead')}
                </Button>
              )}
            </div>
            <div className="overflow-y-auto">
              {recent.data && recent.data.items.length > 0 ? (
                <NotificationList items={recent.data.items} onOpen={() => setOpen(false)} compact />
              ) : (
                <p className="px-4 py-6 text-center text-sm text-text-subdued">{t('notifications.none')}</p>
              )}
            </div>
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="border-t border-divider-default px-4 py-3 text-center text-sm font-semibold text-text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-border-focus"
            >
              {t('notifications.seeAll')}
            </Link>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
